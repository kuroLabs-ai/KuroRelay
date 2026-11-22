import json
from kurorelay.engines.workflows.engine import WorkflowEngine, _evaluate_assertion
from kurorelay.database.base import get_session, engine, Base
from kurorelay.database import models  # noqa
from kurorelay.database.models.workspace import Workspace
from kurorelay.database.models.workflow import Workflow, WorkflowRun


def test_evaluate_assertion():
    resp = {"status_code": 200, "headers": {"Content-Type": "application/json"}, "body": {"user": {"id": 123, "name": "Kuro"}}}
    
    # Status code assertion
    r1 = _evaluate_assertion({"type": "status_code", "operator": "equals", "value": "200"}, resp, 150)
    assert r1["passed"] is True
    r2 = _evaluate_assertion({"type": "status_code", "operator": "equals", "value": "404"}, resp, 150)
    assert r2["passed"] is False

    # Response time assertion
    r3 = _evaluate_assertion({"type": "response_time", "operator": "less_than", "value": "200"}, resp, 150)
    assert r3["passed"] is True
    r4 = _evaluate_assertion({"type": "response_time", "operator": "less_than", "value": "100"}, resp, 150)
    assert r4["passed"] is False

    # JSON path assertion
    r5 = _evaluate_assertion({"type": "json_path", "target": "user.name", "operator": "equals", "value": "Kuro"}, resp, 150)
    assert r5["passed"] is True


def test_workflow_run_history_persistence():
    Base.metadata.create_all(bind=engine)
    with get_session() as session:
        ws = Workspace(name="Test WS Workflow")
        session.add(ws)
        session.commit()
        ws_id = ws.id

    wf_engine = WorkflowEngine()
    wf = wf_engine.create_workflow(workspace_id=ws_id, name="Test Flow")
    wf_id = wf["id"]

    # Update with 1 wait step
    wf_engine.update_workflow(
        wf_id,
        steps=[
            {
                "name": "Wait Step",
                "method": "WAIT",
                "url": "",
                "configuration": {"wait_seconds": 0.05},
            }
        ]
    )

    # Run workflow
    res = wf_engine.run_workflow(wf_id)
    assert res["status"] == "completed"
    assert len(res["results"]) == 1

    # Check history
    runs = wf_engine.get_workflow_runs(wf_id)
    assert len(runs) >= 1
    latest = runs[0]
    assert latest["workflow_id"] == wf_id
    assert latest["status"] == "completed"
    assert latest["total_steps"] == 1

    # Clear history
    wf_engine.clear_workflow_runs(wf_id)
    runs_after = wf_engine.get_workflow_runs(wf_id)
    assert len(runs_after) == 0


def test_parallel_workflow_execution():
    Base.metadata.create_all(bind=engine)
    with get_session() as session:
        ws = Workspace(name="Test WS Parallel")
        session.add(ws)
        session.commit()
        ws_id = ws.id

    wf_engine = WorkflowEngine()
    wf = wf_engine.create_workflow(workspace_id=ws_id, name="Parallel Flow")
    wf_id = wf["id"]

    # 2 parallel wait steps of 0.06s each. In parallel, total duration should be < 0.10s
    wf_engine.update_workflow(
        wf_id,
        steps=[
            {
                "name": "Parallel 1",
                "method": "WAIT",
                "url": "",
                "configuration": {"wait_seconds": 0.06, "execution_mode": "parallel"},
            },
            {
                "name": "Parallel 2",
                "method": "WAIT",
                "url": "",
                "configuration": {"wait_seconds": 0.06, "execution_mode": "parallel"},
            },
        ]
    )

    import time
    start = time.monotonic()
    res = wf_engine.run_workflow(wf_id)
    total_time = time.monotonic() - start

    assert res["status"] == "completed"
    assert len(res["results"]) == 2
    assert res["results"][0]["status"] == "completed"
    assert res["results"][1]["status"] == "completed"
    # Both waited 0.06s concurrently -> total real time is around ~0.06s-0.09s, definitely under sequential (0.12s)
    assert total_time < 0.11


def test_parallel_step_variable_extraction_and_merging(database_session_scope):
    class MockService:
        def __init__(self):
            self.calls = []

        async def execute(self, task_id, payload):
            self.calls.append(payload)
            url = payload.get("url", "")
            if "auth" in url:
                return {
                    "status": "completed",
                    "response": {
                        "status_code": 200,
                        "status_text": "OK",
                        "headers": {},
                        "body": {"token": "secret_token_123"},
                    },
                }
            elif "profile" in url:
                return {
                    "status": "completed",
                    "response": {
                        "status_code": 200,
                        "status_text": "OK",
                        "headers": {},
                        "body": {"role": "admin"},
                    },
                }
            else:
                # Step 3 receives merged workflow vars
                scopes = payload.get("variable_scopes", {})
                wf_scope = scopes.get("workflow", {})
                return {
                    "status": "completed",
                    "response": {
                        "status_code": 200,
                        "status_text": "OK",
                        "headers": {},
                        "body": {"received": wf_scope},
                    },
                }

    from kurorelay.database.models.workspace import Workspace
    with database_session_scope() as session:
        ws = Workspace(name="Test WS Merge")
        session.add(ws)
        session.commit()
        ws_id = ws.id

    service = MockService()
    wf_engine = WorkflowEngine(session_scope=database_session_scope, request_service=service)
    wf = wf_engine.create_workflow(workspace_id=ws_id, name="Parallel Var Merge")
    wf_id = wf["id"]

    wf_engine.update_workflow(
        wf_id,
        steps=[
            {
                "name": "Auth Step (Parallel)",
                "method": "POST",
                "url": "https://api.test/auth",
                "configuration": {"execution_mode": "parallel"},
                "extract_vars": [{"var_name": "token", "json_path": "token"}],
            },
            {
                "name": "Profile Step (Parallel)",
                "method": "GET",
                "url": "https://api.test/profile",
                "configuration": {"execution_mode": "parallel"},
                "extract_vars": [{"var_name": "user_role", "json_path": "role"}],
            },
            {
                "name": "Final Step (Sequential)",
                "method": "GET",
                "url": "https://api.test/final",
                "configuration": {"execution_mode": "sequential"},
                "extract_vars": [],
            },
        ],
    )

    res = wf_engine.run_workflow(wf_id)
    assert res["status"] == "completed"
    assert len(res["results"]) == 3
    assert res["results"][0]["extracted_vars"] == {"token": "secret_token_123"}
    assert res["results"][1]["extracted_vars"] == {"user_role": "admin"}

    # Verify Final Step received both variables in workflow scope
    final_call_payload = service.calls[2]
    received_wf_scope = final_call_payload["variable_scopes"]["workflow"]
    assert received_wf_scope.get("token") == "secret_token_123"
    assert received_wf_scope.get("user_role") == "admin"
