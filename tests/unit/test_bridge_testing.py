

def test_bridge_evaluate_assertions(api):
    payload = {
        "response": {
            "status_code": 200,
            "duration_ms": 95.0,
            "headers": {"content-type": "application/json"},
            "body": {"type": "json", "data": {"items": [1, 2, 3]}},
        },
        "assertions": [
            {"type": "status_eq", "value": 200},
            {"type": "response_time_lt", "value_ms": 200},
            {"type": "json_exists", "path": "$.items"},
        ],
    }

    res = api.evaluate_assertions(payload)
    assert res["status"] == "ok"
    assert res["total"] == 3
    assert res["passed"] == 3
    assert res["failed"] == 0


def test_bridge_test_suite_and_case_lifecycle(api):
    # Get or create workspace
    workspaces_res = api.get_workspaces()
    assert workspaces_res["status"] == "ok"
    ws_id = workspaces_res["workspaces"][0]["id"]

    # Create test suite
    suite_res = api.create_test_suite(
        {"workspace_id": ws_id, "name": "Payment Gateway Suite", "description": "Checkout tests"}
    )
    assert suite_res["status"] == "ok"
    suite_id = suite_res["suite"]["id"]

    # List test suites
    suites_list = api.get_test_suites(ws_id)
    assert suites_list["status"] == "ok"
    assert any(s["id"] == suite_id for s in suites_list["suites"])

    # Create test case
    case_res = api.create_test_case(
        {
            "suite_id": suite_id,
            "name": "Check Status 200",
            "assertion_type": "status_eq",
            "assertion_config": {"value": 200},
        }
    )
    assert case_res["status"] == "ok"
    case_id = case_res["case"]["id"]

    # List test cases
    cases_list = api.get_test_cases(suite_id)
    assert cases_list["status"] == "ok"
    assert len(cases_list["cases"]) == 1

    # Run test suite
    run_res = api.run_test_suite(suite_id)
    assert run_res["status"] == "ok"
    assert run_res["total"] == 1
    assert run_res["passed"] == 1

    # Delete test case
    del_case = api.delete_test_case(case_id)
    assert del_case["status"] == "ok"

    # Delete test suite
    del_suite = api.delete_test_suite(suite_id)
    assert del_suite["status"] == "ok"
