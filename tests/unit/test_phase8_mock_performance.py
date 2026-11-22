"""Unit tests for Phase 8: Mock Server & Performance Testing."""
import asyncio
import socket
import time

import httpx
import pytest
import websockets

from kurorelay.bridge.api import KuroRelayAPI
from kurorelay.core.exceptions import ValidationError
from kurorelay.engines.mock_server import MockRoute, MockServerManager
from kurorelay.engines.performance import PerformanceEngine
from kurorelay.engines.performance.engine import _percentile


def _available_mock_port_pair():
    for _ in range(10):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        if port >= 65535:
            continue
        try:
            with socket.socket() as sock:
                sock.bind(("127.0.0.1", port + 1))
            return port
        except OSError:
            continue
    raise RuntimeError("Could not find a free pair of local ports")


def test_mock_route_matching():
    r1 = MockRoute(route_id="r1", method="GET", path="/api/users", status_code=200)
    assert r1.matches("GET", "/api/users") is True
    assert r1.matches("POST", "/api/users") is False
    assert r1.matches("GET", "/api/other") is False

    # Wildcard route
    r2 = MockRoute(route_id="r2", method="ANY", path="/items/*", status_code=200)
    assert r2.matches("GET", "/items/123") is True
    assert r2.matches("DELETE", "/items/abc") is True
    assert r2.matches("GET", "/other/123") is False

    # Disabled route
    r3 = MockRoute(route_id="r3", method="GET", path="/test", enabled=False)
    assert r3.matches("GET", "/test") is False


def test_mock_protocol_endpoints_and_path_parameters():
    port = _available_mock_port_pair()
    mgr = MockServerManager(default_port=port)
    mgr.set_routes([
        {
            "id": "rest-param",
            "protocol": "rest",
            "method": "GET",
            "path": "/api/users/{user_id}",
            "body": '{"id": "matched"}',
        },
        {
            "id": "graphql",
            "protocol": "graphql",
            "method": "POST",
            "path": "/graphql",
            "body": '{"data": {"hello": "world"}}',
        },
        {
            "id": "sse",
            "protocol": "sse",
            "method": "GET",
            "path": "/events",
            "events": [
                {"id": "1", "event": "update", "data": '{"ready": true}', "retry": 1000},
            ],
        },
        {
            "id": "websocket",
            "protocol": "websocket",
            "method": "GET",
            "path": "/socket",
            "messages": ["welcome"],
            "echo_messages": True,
        },
    ])
    mgr.start(port=port)

    try:
        rest_response = httpx.get(f"http://127.0.0.1:{port}/api/users/42", timeout=5.0)
        assert rest_response.status_code == 200
        assert rest_response.json() == {"id": "matched"}

        graphql_response = httpx.post(
            f"http://127.0.0.1:{port}/graphql",
            json={"query": "{ hello }"},
            timeout=5.0,
        )
        assert graphql_response.status_code == 200
        assert graphql_response.json() == {"data": {"hello": "world"}}
        assert graphql_response.headers["content-type"].startswith("application/json")

        sse_response = httpx.get(f"http://127.0.0.1:{port}/events", timeout=5.0)
        assert sse_response.headers["content-type"].startswith("text/event-stream")
        assert "event: update" in sse_response.text
        assert "data: {\"ready\": true}" in sse_response.text

        async def verify_websocket():
            async with websockets.connect(f"ws://127.0.0.1:{port + 1}/socket") as websocket:
                assert await websocket.recv() == "welcome"
                await websocket.send("hello")
                assert await websocket.recv() == "hello"

        asyncio.run(verify_websocket())
        logs = mgr.get_status()["requests_log"]
        assert {entry["protocol"] for entry in logs} >= {"rest", "graphql", "sse", "websocket"}
    finally:
        mgr.stop()


def test_mock_server_cleans_up_http_listener_when_websocket_port_is_busy():
    port = _available_mock_port_pair()
    mgr = MockServerManager(default_port=port)
    with socket.socket() as blocker:
        blocker.bind(("127.0.0.1", port + 1))
        blocker.listen()
        with pytest.raises(ValidationError, match="WebSocket mock listener"):
            mgr.start(port=port)

    assert mgr.get_status()["is_running"] is False
    with socket.socket() as probe:
        assert probe.connect_ex(("127.0.0.1", port)) != 0


def test_mock_routes_validate_before_replacing_existing_routes():
    mgr = MockServerManager()
    original_routes = mgr.get_status()["routes"]

    with pytest.raises(ValidationError):
        mgr.set_routes([{"method": "GET", "path": "/invalid", "status_code": 99}])
    with pytest.raises(ValidationError):
        mgr.set_routes([{
            "method": "GET",
            "path": "/invalid",
            "headers": {"X-Test": "safe\r\nInjected: true"},
        }])
    with pytest.raises(ValidationError):
        mgr.set_routes([{"protocol": "graphql", "method": "POST", "path": "/graphql", "body": "not-json"}])
    with pytest.raises(ValidationError):
        mgr.set_routes([{"method": "GET", "path": "/users/{invalid-name}"}])

    assert mgr.get_status()["routes"] == original_routes
    assert mgr.set_routes([])["routes"] == []
    assert mgr.get_status()["routes"] == []


def test_percentile_calculation():
    vals = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]
    p50 = _percentile(vals, 50)
    p90 = _percentile(vals, 90)
    p99 = _percentile(vals, 99)

    assert p50 == 55.0
    assert p90 == 91.0
    assert p99 > 90.0
    assert _percentile([], 50) == 0.0


def test_mock_server_start_request_and_stop():
    mgr = MockServerManager(default_port=4891)
    mgr.set_routes([
        {
            "id": "custom-1",
            "method": "GET",
            "path": "/mock/ping",
            "status_code": 200,
            "headers": {"Content-Type": "application/json"},
            "body": '{"pong": true}',
            "delay_ms": 0,
            "enabled": True,
        }
    ])

    start_res = mgr.start(port=4891)
    assert start_res["status"] == "ok"
    assert start_res["is_running"] is True

    try:
        # Send HTTP request to local mock server
        resp = httpx.request(
            "GET",
            "http://127.0.0.1:4891/mock/ping?token=query-secret",
            headers={"Authorization": "Bearer header-secret", "Cookie": "session=cookie-secret"},
            content="body-secret",
            timeout=5.0,
        )
        assert resp.status_code == 200
        assert resp.json() == {"pong": True}

        # Check request logging
        status = mgr.get_status()
        assert len(status["requests_log"]) >= 1
        log_entry = status["requests_log"][0]
        assert log_entry["path"] == "/mock/ping"
        assert log_entry["method"] == "GET"
        assert log_entry["status_code"] == 200
        assert "headers" not in log_entry
        assert "body" not in log_entry
        assert "query" not in log_entry
        assert "secret" not in repr(log_entry)
        assert "duration_ms" in log_entry
    finally:
        stop_res = mgr.stop()
        assert stop_res["status"] == "ok"
        assert stop_res["is_running"] is False


def test_bridge_applies_empty_and_live_mock_routes():
    mgr = MockServerManager(default_port=4893)
    api = KuroRelayAPI(mock_server=mgr)
    start_res = api.start_mock_server({"port": 4893, "routes": []})
    assert start_res["status"] == "ok"
    assert mgr.get_status()["routes"] == []

    try:
        update_res = api.update_mock_routes({
            "routes": [{
                "id": "live-route",
                "method": "POST",
                "path": "/mock/live",
                "status_code": 201,
                "headers": {"Content-Type": "application/json"},
                "body": '{"live": true}',
                "delay_ms": 0,
                "enabled": True,
            }]
        })
        assert update_res["status"] == "ok"
        response = httpx.post("http://127.0.0.1:4893/mock/live", timeout=5.0)
        assert response.status_code == 201
        assert response.json() == {"live": True}
    finally:
        mgr.stop()


def test_close_window_stops_mock_server_before_destroying_window():
    class FakeWindow:
        destroyed = False

        def destroy(self):
            self.destroyed = True

    mgr = MockServerManager(default_port=4894)
    mgr.start(port=4894)
    api = KuroRelayAPI(mock_server=mgr)
    window = FakeWindow()
    api.set_window(window)

    result = api.close_window()

    assert result["status"] == "ok"
    assert window.destroyed is True
    assert mgr.get_status()["is_running"] is False


def test_performance_engine_run():
    # Start a quick mock server to load test against
    mock_mgr = MockServerManager(default_port=4892)
    mock_mgr.set_routes([
        {
            "id": "load-route",
            "method": "GET",
            "path": "/test/perf",
            "status_code": 200,
            "body": "OK",
            "delay_ms": 5,
        }
    ])
    mock_mgr.start(port=4892)

    perf = PerformanceEngine()
    try:
        # Run a 2-second load test with 2 virtual users
        res = perf.start_test(
            request_config={"method": "GET", "url": "http://127.0.0.1:4892/test/perf"},
            concurrency=2,
            duration_seconds=2,
        )
        assert res["status"] == "ok"
        test_id = res["test_id"]

        # Wait for test to complete
        time.sleep(3.5)

        status = perf.get_status(test_id)
        assert status["status"] == "ok"
        metrics = status["metrics"]
        assert metrics["is_completed"] is True
        assert metrics["total_requests"] > 0
        assert metrics["throughput_rps"] > 0
        assert metrics["latency_ms"]["p50"] > 0
        assert metrics["status_breakdown"]["2xx"] > 0
    finally:
        mock_mgr.stop()


def test_bridge_mock_and_performance_endpoints():
    api = KuroRelayAPI()

    # Mock server status
    st = api.get_mock_server_status()
    assert st["status"] == "ok"
    assert "routes" in st

    # Update routes via bridge
    up = api.update_mock_routes({
        "routes": [{"method": "POST", "path": "/api/v1/data", "status_code": 201, "body": "{}"}]
    })
    assert up["status"] == "ok"
    assert len(up["routes"]) == 1

    # Clear logs
    cl = api.clear_mock_requests_log()
    assert cl["status"] == "ok"

    # Start performance with invalid URL
    bad_perf = api.start_performance_test({"request": {"url": "invalid-url"}})
    assert bad_perf["status"] == "failed"
