import json
import httpx
from kurorelay.engines.mock_server.server import MockServerManager, interpolate_mock_body, MockRoute


def test_interpolate_mock_body():
    body = '{"id": "{{params.id}}", "uuid": "{{$guid}}", "time": "{{$timestamp}}"}'
    res = interpolate_mock_body(body, {"id": "42"})
    data = json.loads(res)
    assert data["id"] == "42"
    assert len(data["uuid"]) == 36
    assert isinstance(int(data["time"]), int)


def test_mock_route_extract_params():
    route = MockRoute(
        route_id="r1",
        method="GET",
        path="/api/users/{userId}/posts/{postId}",
    )
    params = route.extract_params("/api/users/99/posts/abc")
    assert params == {"userId": "99", "postId": "abc"}


def test_mock_server_dynamic_path_response():
    mgr = MockServerManager(default_port=4895)
    mgr.set_routes([
        {
            "id": "r-dyn",
            "method": "GET",
            "path": "/users/{id}",
            "status_code": 200,
            "headers": {"Content-Type": "application/json"},
            "body": '{"user_id": "{{params.id}}", "token": "{{$uuid}}"}',
            "delay_ms": 0,
            "enabled": True,
        }
    ])
    start_res = mgr.start(port=4895)
    assert start_res["status"] == "ok"
    try:
        resp = httpx.get("http://127.0.0.1:4895/users/12345", timeout=5.0)
        assert resp.status_code == 200
        data = resp.json()
        assert data["user_id"] == "12345"
        assert len(data["token"]) == 36
    finally:
        mgr.stop()
