"""Workflow engine — executes multi-step request chains with variable extraction."""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from contextlib import contextmanager
from typing import Any

from kurorelay.core.logging import get_logger
from kurorelay.database.base import get_session
from kurorelay.database.models.workflow import Workflow, WorkflowStep, WorkflowRun

logger = get_logger(__name__)


def _resolve_json_path(data: Any, path: str) -> str:
    """
    Resolve a simple dot-notation JSON path like "data.token" or "id".
    Returns empty string if path not found.
    """
    try:
        parts = path.strip().split(".")
        node = data
        for part in parts:
            if part == "":
                continue
            if isinstance(node, dict):
                node = node.get(part)
            elif isinstance(node, list):
                idx = int(part)
                node = node[idx]
            else:
                return ""
        return str(node) if node is not None else ""
    except Exception:
        return ""


def _evaluate_assertion(assertion: dict, resp: dict, duration_ms: float) -> dict:
    atype = assertion.get("type", "status_code")
    operator = assertion.get("operator", "equals")
    target = assertion.get("target", "")
    expected = str(assertion.get("value", "")).strip()
    passed = False
    actual_val = ""

    try:
        if atype == "status_code":
            actual = resp.get("status_code", 0)
            actual_val = str(actual)
            try:
                exp_int = int(expected)
                passed = (actual == exp_int) if operator == "equals" else (actual != exp_int)
            except ValueError:
                passed = False
        elif atype == "response_time":
            actual_val = f"{round(duration_ms)}ms"
            try:
                exp_time = float(expected.replace("ms", "").strip())
                passed = (duration_ms < exp_time) if operator == "less_than" else (duration_ms > exp_time)
            except ValueError:
                passed = False
        elif atype == "json_path":
            body = resp.get("body")
            # If body is dict with "data", unwrap if needed
            if isinstance(body, dict) and "data" in body and isinstance(body.get("data"), (dict, list)):
                body_content = body.get("data")
            elif isinstance(body, dict) and "content" in body and isinstance(body.get("content"), (dict, list)):
                body_content = body.get("content")
            else:
                body_content = body
            actual_val = _resolve_json_path(body_content, target)
            if operator == "equals":
                passed = (actual_val == expected)
            elif operator == "not_equals":
                passed = (actual_val != expected)
            elif operator == "contains":
                passed = (expected in actual_val)
            elif operator == "is_not_empty":
                passed = bool(actual_val)
        elif atype == "header":
            headers = {k.lower(): str(v) for k, v in (resp.get("headers") or {}).items()}
            actual_val = headers.get(target.lower(), "")
            if operator == "equals":
                passed = (actual_val.lower() == expected.lower())
            elif operator == "contains":
                passed = (expected.lower() in actual_val.lower())
            elif operator == "exists":
                passed = (target.lower() in headers)
    except Exception as exc:
        passed = False
        actual_val = f"<eval error: {exc}>"

    return {
        "type": atype,
        "target": target,
        "operator": operator,
        "expected": expected,
        "actual": actual_val,
        "passed": passed,
    }


def _serialize_step(step: WorkflowStep) -> dict:
    return {
        "id": step.id,
        "workflow_id": step.workflow_id,
        "order_index": step.order_index,
        "name": step.name,
        "method": step.method,
        "url": step.url,
        "configuration": json.loads(step.configuration_json or "{}"),
        "extract_vars": json.loads(step.extract_vars_json or "[]"),
        "created_at": step.created_at.isoformat(),
        "updated_at": step.updated_at.isoformat(),
    }


def _serialize_workflow(wf: Workflow, include_steps: bool = True) -> dict:
    result: dict = {
        "id": wf.id,
        "workspace_id": wf.workspace_id,
        "name": wf.name,
        "description": wf.description,
        "step_count": len(wf.steps),
        "created_at": wf.created_at.isoformat(),
        "updated_at": wf.updated_at.isoformat(),
    }
    if include_steps:
        result["steps"] = [_serialize_step(s) for s in wf.steps]
    return result


class WorkflowEngine:
    """Manages workflow CRUD and step-chain execution."""

    def __init__(self, session_scope=None, request_service=None, history_engine=None):
        self._session_scope = session_scope or get_session
        self._request_service = request_service
        self._history_engine = history_engine

    # ─────────────────────────── CRUD ───────────────────────────

    def list_workflows(self, workspace_id: str) -> list[dict]:
        with self._session_scope() as session:
            workflows = (
                session.query(Workflow)
                .filter(Workflow.workspace_id == workspace_id)
                .order_by(Workflow.created_at.desc())
                .all()
            )
            return [_serialize_workflow(wf, include_steps=False) for wf in workflows]

    def create_workflow(self, workspace_id: str, name: str, description: str = "") -> dict:
        with self._session_scope() as session:
            wf = Workflow(
                workspace_id=workspace_id,
                name=name.strip() or "New Workflow",
                description=description.strip(),
            )
            session.add(wf)
            session.flush()
            session.refresh(wf)
            return _serialize_workflow(wf)

    def get_workflow(self, workflow_id: str) -> dict | None:
        with self._session_scope() as session:
            wf = session.get(Workflow, workflow_id)
            if wf is None:
                return None
            return _serialize_workflow(wf)

    def update_workflow(
        self,
        workflow_id: str,
        name: str | None = None,
        description: str | None = None,
        steps: list[dict] | None = None,
    ) -> dict | None:
        with self._session_scope() as session:
            wf = session.get(Workflow, workflow_id)
            if wf is None:
                return None
            if name is not None:
                wf.name = name.strip() or wf.name
            if description is not None:
                wf.description = description.strip()
            if steps is not None:
                # Delete existing steps
                for step in list(wf.steps):
                    session.delete(step)
                session.flush()
                # Recreate from provided list
                for idx, step_data in enumerate(steps):
                    cfg = step_data.get("configuration")
                    if not isinstance(cfg, dict):
                        cfg = {}
                    # Copy top-level configuration fields if not in cfg
                    for key in ("headers", "params", "body", "auth", "assertions", "timeout_ms", "wait_seconds", "execution_mode"):
                        if key in step_data and key not in cfg:
                            cfg[key] = step_data[key]

                    url = step_data.get("url") or cfg.get("url", "")
                    method = step_data.get("method") or cfg.get("method", "GET")

                    # If step references a saved request by ID, resolve defaults from it
                    req_id = step_data.get("request_id") or cfg.get("request_id")
                    if req_id and not url:
                        try:
                            from kurorelay.database.models.collection import SavedRequest
                            sr = session.get(SavedRequest, req_id)
                            if sr:
                                url = sr.url
                                method = sr.method
                                if sr.configuration_json:
                                    sc = json.loads(sr.configuration_json)
                                    if isinstance(sc, dict):
                                        for k, v in sc.items():
                                            if k not in cfg:
                                                cfg[k] = v
                        except Exception:
                            pass

                    new_step = WorkflowStep(
                        workflow_id=wf.id,
                        order_index=step_data.get("order_index", idx),
                        name=step_data.get("name", f"Step {idx + 1}"),
                        method=method,
                        url=url,
                        configuration_json=json.dumps(cfg),
                        extract_vars_json=json.dumps(step_data.get("extract_vars", [])),
                    )
                    session.add(new_step)
            session.flush()
            session.refresh(wf)
            return _serialize_workflow(wf)

    def delete_workflow(self, workflow_id: str) -> bool:
        with self._session_scope() as session:
            wf = session.get(Workflow, workflow_id)
            if wf is None:
                return False
            session.delete(wf)
            return True

    # ─────────────────────────── RUN ───────────────────────────

    async def _execute_step_async(
        self,
        step: dict,
        idx: int,
        workspace_id: str,
        scopes: dict,
        environment_id: str | None,
    ) -> tuple[dict, dict]:
        """
        Execute an individual step asynchronously and evaluate variable extractions & assertions.
        Returns (step_result_dict, newly_extracted_vars_dict).
        """
        step_config = step.get("configuration", {})
        extract_defs: list[dict] = step.get("extract_vars", [])

        # Check if step is explicitly disabled
        is_disabled = (
            step_config.get("is_enabled") is False
            or step_config.get("enabled") is False
            or step.get("is_enabled") is False
        )
        if is_disabled:
            return {
                "step_id": step.get("id"),
                "step_name": step.get("name"),
                "order_index": step.get("order_index", idx),
                "status": "skipped",
                "response": None,
                "error": None,
                "extracted_vars": {},
                "duration_ms": 0.0,
            }, {}

        # If step method is WAIT or DELAY
        method_upper = str(step.get("method", "GET")).strip().upper()
        if method_upper in ("WAIT", "DELAY"):
            wait_sec = float(step_config.get("wait_seconds") or 1.0)
            await asyncio.sleep(wait_sec)
            return {
                "step_id": step.get("id"),
                "step_name": step.get("name"),
                "order_index": step.get("order_index", idx),
                "status": "completed",
                "response": {"status_code": 200, "status_text": "OK", "body": {"message": f"Waited {wait_sec}s"}},
                "error": None,
                "extracted_vars": {},
                "duration_ms": round(wait_sec * 1000, 2),
            }, {}

        url = step.get("url") or step_config.get("url", "")
        method = step.get("method") or step_config.get("method", "GET")

        # Resolve request_id if url is empty
        req_id = step.get("request_id") or step_config.get("request_id")
        if req_id and not url:
            try:
                with self._session_scope() as session:
                    from kurorelay.database.models.collection import SavedRequest
                    sr = session.get(SavedRequest, req_id)
                    if sr:
                        url = sr.url
                        method = sr.method
                        if sr.configuration_json:
                            sc = json.loads(sr.configuration_json)
                            if isinstance(sc, dict):
                                for k, v in sc.items():
                                    if k not in step_config:
                                        step_config[k] = v
            except Exception:
                pass

        # Normalize headers to dict[str, str]
        headers_raw = step_config.get("headers") or step.get("headers") or {}
        if isinstance(headers_raw, list):
            headers = {
                str(item["key"]): str(item.get("value", ""))
                for item in headers_raw
                if isinstance(item, dict) and item.get("key") and item.get("enabled", True) is not False
            }
        elif isinstance(headers_raw, dict):
            headers = {str(k): str(v) for k, v in headers_raw.items()}
        else:
            headers = {}

        # Normalize params to dict[str, str]
        params_raw = step_config.get("params") or step.get("params") or {}
        if isinstance(params_raw, list):
            params = {
                str(item["key"]): str(item.get("value", ""))
                for item in params_raw
                if isinstance(item, dict) and item.get("key") and item.get("enabled", True) is not False
            }
        elif isinstance(params_raw, dict):
            params = {str(k): str(v) for k, v in params_raw.items()}
        else:
            params = {}

        # Normalize auth to conform to AuthConfig {type, configuration}
        auth_raw = step_config.get("auth") or step.get("auth")
        auth_payload = None
        if isinstance(auth_raw, dict):
            atype = auth_raw.get("type", "none")
            if atype and atype != "none":
                if "configuration" in auth_raw and isinstance(auth_raw.get("configuration"), dict):
                    auth_payload = {"type": atype, "configuration": auth_raw["configuration"]}
                elif atype == "bearer":
                    token = auth_raw.get("token") or auth_raw.get("bearerToken") or ""
                    auth_payload = {"type": "bearer", "configuration": {"token": str(token)}}
                elif atype == "basic":
                    auth_payload = {
                        "type": "basic",
                        "configuration": {
                            "username": str(auth_raw.get("username", "")),
                            "password": str(auth_raw.get("password", "")),
                        },
                    }
                elif atype == "api_key":
                    auth_payload = {
                        "type": "api_key",
                        "configuration": {
                            "key": str(auth_raw.get("key", "")),
                            "value": str(auth_raw.get("value", "")),
                            "add_to": str(auth_raw.get("add_to", "header")),
                        },
                    }

        # Normalize body
        body_val = step_config.get("body") or step.get("body")
        if body_val is not None:
            if isinstance(body_val, dict) and "type" in body_val:
                body_payload = body_val
            elif isinstance(body_val, (dict, list)):
                body_payload = {"type": "json", "content": body_val}
            elif isinstance(body_val, str) and body_val.strip():
                try:
                    parsed_json = json.loads(body_val)
                    body_payload = {"type": "json", "content": parsed_json}
                except Exception:
                    body_payload = {"type": "raw", "content": body_val}
            else:
                body_payload = {"type": "none"}
        else:
            body_payload = {"type": "none"}

        ws_id = workspace_id.strip() if isinstance(workspace_id, str) and workspace_id.strip() else None
        env_id = environment_id.strip() if isinstance(environment_id, str) and environment_id.strip() else None

        task_id = str(uuid.uuid4())
        payload = {
            "workspace_id": ws_id,
            "method": method,
            "url": url,
            "headers": headers,
            "params": params,
            "body": body_payload,
            "auth": auth_payload,
            "environment_id": env_id,
            "variable_scopes": scopes,
            "allow_private_network": True,
            "timeout_ms": 30000,
        }
        payload = {k: v for k, v in payload.items() if v is not None}

        step_result: dict = {
            "step_id": step.get("id"),
            "step_name": step.get("name"),
            "order_index": step.get("order_index", idx),
            "status": "failed",
            "response": None,
            "error": None,
            "extracted_vars": {},
            "duration_ms": 0.0,
        }
        new_extracted: dict[str, str] = {}
        start = time.monotonic()

        try:
            if self._request_service is not None:
                raw = await self._request_service.execute(task_id, payload)
                duration_ms = (time.monotonic() - start) * 1000
                step_result["duration_ms"] = round(duration_ms, 2)

                if raw.get("status") in ("completed",):
                    resp = raw.get("response", {})
                    step_result["response"] = {
                        "status_code": resp.get("status_code"),
                        "status_text": resp.get("status_text"),
                        "duration_ms": resp.get("duration_ms"),
                        "size_bytes": resp.get("size_bytes"),
                        "headers": resp.get("headers", {}),
                        "body": resp.get("body", {}),
                    }
                    status_code = resp.get("status_code")
                    if isinstance(status_code, int) and status_code >= 400:
                        step_result["status"] = "failed"
                        step_result["error"] = (
                            f"HTTP {status_code} {resp.get('status_text', '')}".strip()
                        )
                    else:
                        step_result["status"] = "completed"
                        body_dict = resp.get("body") or {}
                        if isinstance(body_dict, dict) and "data" in body_dict and isinstance(body_dict.get("data"), (dict, list)):
                            body_data = body_dict.get("data")
                        elif isinstance(body_dict, dict) and "content" in body_dict and isinstance(body_dict.get("content"), (dict, list)):
                            body_data = body_dict.get("content")
                        else:
                            body_data = body_dict

                        if isinstance(body_data, str) and body_data.strip().startswith(("{", "[")):
                            try:
                                body_data = json.loads(body_data)
                            except Exception:
                                pass
                        if extract_defs and body_data is not None:
                            for ext in extract_defs:
                                var_name = ext.get("var_name", "")
                                json_path = ext.get("json_path", "")
                                if var_name and json_path:
                                    value = _resolve_json_path(body_data, json_path)
                                    new_extracted[var_name] = value
                                    step_result["extracted_vars"][var_name] = value

                    # Evaluate assertions
                    assertions = step_config.get("assertions", [])
                    if assertions and step_result.get("response"):
                        eval_results = [
                            _evaluate_assertion(a, step_result["response"], step_result["duration_ms"])
                            for a in assertions
                        ]
                        step_result["assertion_results"] = eval_results
                        failed_assertions = [a for a in eval_results if not a["passed"]]
                        if failed_assertions:
                            step_result["status"] = "failed"
                            failure_msgs = [
                                f"{a['type']} {a['operator']} {a['expected']} (got {a['actual']})"
                                for a in failed_assertions
                            ]
                            step_result["error"] = f"Assertion failed: {'; '.join(failure_msgs)}"
                else:
                    step_result["status"] = "failed"
                    err = raw.get("error", {})
                    step_result["error"] = err.get("message", "Request failed")
            else:
                # Dry run mode
                duration_ms = (time.monotonic() - start) * 1000
                step_result["status"] = "completed"
                step_result["duration_ms"] = round(duration_ms, 2)
        except Exception as exc:
            duration_ms = (time.monotonic() - start) * 1000
            step_result["duration_ms"] = round(duration_ms, 2)
            step_result["status"] = "failed"
            step_result["error"] = str(exc)
            logger.error("Workflow step failed", step_id=step.get("id"), error=str(exc))

        return step_result, new_extracted

    async def _run_workflow_async(
        self,
        steps_data: list[dict],
        workspace_id: str,
        initial_scopes: dict,
        options: dict,
        environment_id: str | None,
    ) -> tuple[list[dict], bool]:
        stop_on_failure = bool(options.get("stop_on_failure", False))
        delay_ms = int(options.get("delay_ms", 0) or 0)

        # Partition steps into sequential or parallel batches
        batches: list[list[tuple[int, dict]]] = []
        current_parallel_batch: list[tuple[int, dict]] = []

        for idx, step in enumerate(steps_data):
            cfg = step.get("configuration") or {}
            mode = cfg.get("execution_mode") or step.get("execution_mode") or "sequential"
            if mode == "parallel":
                current_parallel_batch.append((idx, step))
            else:
                if current_parallel_batch:
                    batches.append(current_parallel_batch)
                    current_parallel_batch = []
                batches.append([(idx, step)])

        if current_parallel_batch:
            batches.append(current_parallel_batch)

        results: list[dict] = []
        overall_failed = False
        working_vars: dict[str, str] = {}
        scopes = dict(initial_scopes)

        for batch_idx, batch in enumerate(batches):
            if delay_ms > 0 and batch_idx > 0:
                await asyncio.sleep(delay_ms / 1000.0)

            # Update scopes with workflow working_vars
            current_scopes = dict(scopes)
            if working_vars:
                current_scopes["workflow"] = {**current_scopes.get("workflow", {}), **working_vars}

            if len(batch) == 1:
                idx, step = batch[0]
                step_res, extracted = await self._execute_step_async(
                    step, idx, workspace_id, current_scopes, environment_id
                )
                results.append(step_res)
                working_vars.update(extracted)
                if step_res["status"] == "failed":
                    overall_failed = True
                    if stop_on_failure:
                        break
            else:
                # Parallel batch: run concurrently via asyncio.gather
                batch_tasks = [
                    self._execute_step_async(step, idx, workspace_id, current_scopes, environment_id)
                    for idx, step in batch
                ]
                batch_results = await asyncio.gather(*batch_tasks)
                batch_failed = False
                for step_res, extracted in batch_results:
                    results.append(step_res)
                    working_vars.update(extracted)
                    if step_res["status"] == "failed":
                        batch_failed = True
                        overall_failed = True
                if batch_failed and stop_on_failure:
                    break

        return results, overall_failed

    def run_workflow(
        self,
        workflow_id: str,
        variable_scopes: dict | None = None,
        options: dict | None = None,
        environment_id: str | None = None,
    ) -> dict:
        """
        Execute all steps in order, supporting sequential steps and parallel batches.
        Extracted variables are accumulated and injected as a 'workflow' scope.
        Options: {delay_ms: int, stop_on_failure: bool}
        Returns: {status, results: [...]}
        """
        options = options or {}

        with self._session_scope() as session:
            wf = session.get(Workflow, workflow_id)
            if wf is None:
                return {"status": "failed", "error": "Workflow not found", "results": []}

            workspace_id = wf.workspace_id
            steps_data = [_serialize_step(s) for s in wf.steps]

            # If environment_id not specified, find active environment in workspace
            if not environment_id:
                try:
                    from kurorelay.database.models.environment import Environment
                    active_env = (
                        session.query(Environment)
                        .filter(Environment.workspace_id == workspace_id, Environment.is_active == True)
                        .first()
                    )
                    if active_env:
                        environment_id = active_env.id
                except Exception:
                    pass

            scopes = dict(variable_scopes or {})
            if environment_id:
                try:
                    from kurorelay.database.models.environment import EnvironmentVariable
                    env_vars = (
                        session.query(EnvironmentVariable)
                        .filter(EnvironmentVariable.environment_id == environment_id, EnvironmentVariable.is_enabled == True)
                        .all()
                    )
                    if "environment" not in scopes:
                        scopes["environment"] = {v.key: v.value for v in env_vars}
                    else:
                        for v in env_vars:
                            if v.key not in scopes["environment"]:
                                scopes["environment"][v.key] = v.value
                except Exception:
                    pass

        loop = asyncio.new_event_loop()
        try:
            results, overall_failed = loop.run_until_complete(
                self._run_workflow_async(steps_data, workspace_id, scopes, options, environment_id)
            )
        finally:
            loop.close()

        overall_status = "failed" if overall_failed else "completed"
        if overall_failed and any(r["status"] == "completed" for r in results):
            overall_status = "partial"

        total_duration = sum(r.get("duration_ms", 0.0) for r in results)
        passed_steps = sum(1 for r in results if r.get("status") == "completed")
        failed_steps = sum(1 for r in results if r.get("status") == "failed")
        total_steps = len(results)

        # Persist run to SQLite history
        try:
            with self._session_scope() as session:
                run_rec = WorkflowRun(
                    workflow_id=workflow_id,
                    workspace_id=workspace_id,
                    status=overall_status,
                    total_steps=total_steps,
                    passed_steps=passed_steps,
                    failed_steps=failed_steps,
                    duration_ms=int(round(total_duration)),
                    results_json=json.dumps(results),
                )
                session.add(run_rec)
                session.commit()
        except Exception as exc:
            logger.warning("Could not persist workflow run record", error=str(exc))

        return {"status": overall_status, "results": results}

    def get_workflow_runs(self, workflow_id: str, limit: int = 30) -> list[dict]:
        with self._session_scope() as session:
            runs = (
                session.query(WorkflowRun)
                .filter(WorkflowRun.workflow_id == workflow_id)
                .order_by(WorkflowRun.created_at.desc())
                .limit(limit)
                .all()
            )
            return [
                {
                    "id": r.id,
                    "workflow_id": r.workflow_id,
                    "workspace_id": r.workspace_id,
                    "status": r.status,
                    "total_steps": r.total_steps,
                    "passed_steps": r.passed_steps,
                    "failed_steps": r.failed_steps,
                    "duration_ms": r.duration_ms,
                    "results": json.loads(r.results_json or "[]"),
                    "created_at": r.created_at.isoformat(),
                }
                for r in runs
            ]

    def delete_workflow_run(self, run_id: str) -> bool:
        with self._session_scope() as session:
            r = session.get(WorkflowRun, run_id)
            if r:
                session.delete(r)
                session.commit()
                return True
            return False

    def clear_workflow_runs(self, workflow_id: str) -> bool:
        with self._session_scope() as session:
            session.query(WorkflowRun).filter(WorkflowRun.workflow_id == workflow_id).delete()
            session.commit()
            return True

    def run_single_step(
        self,
        step_data: dict,
        workspace_id: str,
        variable_scopes: dict | None = None,
        environment_id: str | None = None,
    ) -> dict:
        """Run just a single workflow step and evaluate its extractions and assertions."""
        scopes = dict(variable_scopes or {})
        loop = asyncio.new_event_loop()
        try:
            step_result, _ = loop.run_until_complete(
                self._execute_step_async(step_data, 0, workspace_id, scopes, environment_id)
            )
            return step_result
        finally:
            loop.close()
