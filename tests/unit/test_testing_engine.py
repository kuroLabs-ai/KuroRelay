from kurorelay.engines.testing.engine import TestingEngine, extract_json_path


def test_extract_json_path():
    data = {
        "user": {
            "id": 101,
            "name": "Kuro",
            "roles": ["admin", "tester"],
            "profile": {"nested": {"status": "active"}},
        }
    }

    exists, val = extract_json_path(data, "$.user.id")
    assert exists is True
    assert val == 101

    exists, val = extract_json_path(data, "user.name")
    assert exists is True
    assert val == "Kuro"

    exists, val = extract_json_path(data, "$.user.roles[0]")
    assert exists is True
    assert val == "admin"

    exists, val = extract_json_path(data, "$.user.roles[5]")
    assert exists is False
    assert val is None

    exists, val = extract_json_path(data, "$.user.profile.nested.status")
    assert exists is True
    assert val == "active"

    exists, val = extract_json_path(data, "$.user.non_existent")
    assert exists is False


def test_status_eq_assertion():
    engine = TestingEngine()
    resp = {"status_code": 200, "duration_ms": 120.0, "headers": {}, "body": {}}

    res = engine.evaluate_one(resp, {"type": "status_eq", "value": 200})
    assert res["passed"] is True
    assert res["actual_value"] == 200

    res2 = engine.evaluate_one(resp, {"type": "status_eq", "value": 404})
    assert res2["passed"] is False
    assert res2["expected_value"] == 404
    assert res2["actual_value"] == 200


def test_status_in_assertion():
    engine = TestingEngine()
    resp = {"status_code": 201, "duration_ms": 50.0, "headers": {}, "body": {}}

    res = engine.evaluate_one(resp, {"type": "status_in", "values": [200, 201, 204]})
    assert res["passed"] is True

    res2 = engine.evaluate_one(resp, {"type": "status_in", "values": [400, 404]})
    assert res2["passed"] is False


def test_response_time_lt_assertion():
    engine = TestingEngine()
    resp = {"status_code": 200, "duration_ms": 145.2, "headers": {}, "body": {}}

    res = engine.evaluate_one(resp, {"type": "response_time_lt", "value_ms": 300})
    assert res["passed"] is True

    res2 = engine.evaluate_one(resp, {"type": "response_time_lt", "value_ms": 100})
    assert res2["passed"] is False


def test_header_assertions():
    engine = TestingEngine()
    resp = {
        "status_code": 200,
        "duration_ms": 80.0,
        "headers": {"Content-Type": "application/json", "X-Custom": "kuro"},
        "body": {},
    }

    res = engine.evaluate_one(
        resp, {"type": "header_eq", "name": "content-type", "value": "application/json"}
    )
    assert res["passed"] is True

    res_exist = engine.evaluate_one(resp, {"type": "header_exists", "name": "x-custom"})
    assert res_exist["passed"] is True

    res_missing = engine.evaluate_one(resp, {"type": "header_exists", "name": "x-missing"})
    assert res_missing["passed"] is False


def test_json_property_assertions():
    engine = TestingEngine()
    resp = {
        "status_code": 200,
        "duration_ms": 90.0,
        "headers": {"content-type": "application/json"},
        "body": {"type": "json", "data": {"user": {"id": 42, "role": "admin"}}},
    }

    res = engine.evaluate_one(resp, {"type": "json_eq", "path": "$.user.id", "value": 42})
    assert res["passed"] is True

    res_exists = engine.evaluate_one(resp, {"type": "json_exists", "path": "$.user.role"})
    assert res_exists["passed"] is True

    res_missing = engine.evaluate_one(resp, {"type": "json_exists", "path": "$.user.token"})
    assert res_missing["passed"] is False


def test_json_schema_assertion():
    engine = TestingEngine()
    schema = {
        "type": "object",
        "properties": {
            "id": {"type": "integer"},
            "name": {"type": "string"},
        },
        "required": ["id", "name"],
    }

    valid_resp = {
        "status_code": 200,
        "body": {"type": "json", "data": {"id": 1, "name": "Relay"}},
    }
    invalid_resp = {
        "status_code": 200,
        "body": {"type": "json", "data": {"id": "not-an-int"}},
    }

    res_valid = engine.evaluate_one(valid_resp, {"type": "json_schema", "schema": schema})
    assert res_valid["passed"] is True

    res_invalid = engine.evaluate_one(invalid_resp, {"type": "json_schema", "schema": schema})
    assert res_invalid["passed"] is False
    assert res_invalid["error"] is not None


def test_evaluate_all():
    engine = TestingEngine()
    resp = {
        "status_code": 200,
        "duration_ms": 110.0,
        "headers": {"content-type": "application/json"},
        "body": {"type": "json", "data": {"ok": True}},
    }
    assertions = [
        {"id": "a1", "type": "status_eq", "value": 200},
        {"id": "a2", "type": "response_time_lt", "value_ms": 200},
        {"id": "a3", "type": "status_eq", "value": 500},
    ]

    report = engine.evaluate_all(resp, assertions)
    assert report["total"] == 3
    assert report["passed"] == 2
    assert report["failed"] == 1
    assert len(report["results"]) == 3
