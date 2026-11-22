"""Local multi-protocol mock server with route matching and request logging."""
from __future__ import annotations

import asyncio
import fnmatch
import json
import random
import re
import socket
import threading
import time
import uuid
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

from kurorelay.core.exceptions import ValidationError
from kurorelay.core.logging import get_logger

try:
    from websockets.asyncio.server import serve as websocket_serve
except ImportError:
    try:
        from websockets.server import serve as websocket_serve
    except ImportError:
        websocket_serve = None

logger = get_logger(__name__)

_ALLOWED_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ANY"}
_ALLOWED_PROTOCOLS = {"rest", "graphql", "sse", "websocket"}
_HEADER_NAME_RE = re.compile(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+\Z")
_PATH_PARAMETER_RE = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")
_MAX_DELAY_MS = 300_000
_MAX_REQUEST_BODY_BYTES = 1_048_576


def _is_port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) == 0


class MockRoute:
    def __init__(
        self,
        route_id: str,
        method: str,
        path: str,
        status_code: int = 200,
        headers: dict[str, str] | None = None,
        body: str = "",
        delay_ms: int = 0,
        enabled: bool = True,
        protocol: str = "rest",
        events: list[dict[str, Any]] | None = None,
        messages: list[str] | None = None,
        echo_messages: bool = False,
    ):
        self.id = route_id
        self.method = method.strip().upper()
        self.path = path.strip()
        self.protocol = protocol.strip().lower()
        self.status_code = status_code
        self.headers = dict(headers) if headers is not None else {"Content-Type": "application/json"}
        self.body = body
        self.delay_ms = max(0, delay_ms)
        self.enabled = enabled
        self.events = list(events or [])
        self.messages = list(messages or [])
        self.echo_messages = echo_messages

    def matches(self, req_method: str, req_path: str, protocol: str | None = None) -> bool:
        if not self.enabled:
            return False
        if protocol is not None and self.protocol != protocol:
            return False
        if self.method != "ANY" and self.method != req_method.upper():
            return False

        norm_route_path = self.path if self.path.startswith("/") else f"/{self.path}"
        norm_req_path = req_path if req_path.startswith("/") else f"/{req_path}"
        if norm_route_path == norm_req_path:
            return True
        if "{" in norm_route_path or "}" in norm_route_path:
            parts: list[str] = []
            last = 0
            for match in _PATH_PARAMETER_RE.finditer(norm_route_path):
                parts.append(re.escape(norm_route_path[last:match.start()]))
                parts.append(r"[^/]+")
                last = match.end()
            parts.append(re.escape(norm_route_path[last:]))
            if re.fullmatch("".join(parts), norm_req_path):
                return True
        return "*" in norm_route_path and fnmatch.fnmatchcase(norm_req_path, norm_route_path)

    def extract_params(self, req_path: str) -> dict[str, str]:
        norm_route_path = self.path if self.path.startswith("/") else f"/{self.path}"
        norm_req_path = req_path if req_path.startswith("/") else f"/{req_path}"
        if "{" not in norm_route_path or "}" not in norm_route_path:
            return {}
        parts: list[str] = []
        last = 0
        for match in _PATH_PARAMETER_RE.finditer(norm_route_path):
            parts.append(re.escape(norm_route_path[last:match.start()]))
            param_name = match.group(1)
            parts.append(f"(?P<{param_name}>[^/]+)")
            last = match.end()
        parts.append(re.escape(norm_route_path[last:]))
        try:
            m = re.fullmatch("".join(parts), norm_req_path)
            return m.groupdict() if m else {}
        except re.error:
            return {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "method": self.method,
            "protocol": self.protocol,
            "path": self.path,
            "status_code": self.status_code,
            "headers": self.headers,
            "body": self.body,
            "delay_ms": self.delay_ms,
            "enabled": self.enabled,
            "events": self.events,
            "messages": self.messages,
            "echo_messages": self.echo_messages,
        }


def interpolate_mock_body(body: str, params: dict[str, str] | None = None) -> str:
    if not body:
        return body
    interpolated = body
    if params:
        for k, v in params.items():
            interpolated = interpolated.replace(f"{{{{params.{k}}}}}", v)
            interpolated = interpolated.replace(f"{{{{{k}}}}}", v)
    if "{{$guid}}" in interpolated:
        while "{{$guid}}" in interpolated:
            interpolated = interpolated.replace("{{$guid}}", str(uuid.uuid4()), 1)
    if "{{$uuid}}" in interpolated:
        while "{{$uuid}}" in interpolated:
            interpolated = interpolated.replace("{{$uuid}}", str(uuid.uuid4()), 1)
    if "{{$timestamp}}" in interpolated:
        interpolated = interpolated.replace("{{$timestamp}}", str(int(time.time())))
    if "{{$isoTimestamp}}" in interpolated:
        interpolated = interpolated.replace("{{$isoTimestamp}}", datetime.now(UTC).isoformat())
    if "{{$randomInt}}" in interpolated:
        while "{{$randomInt}}" in interpolated:
            interpolated = interpolated.replace("{{$randomInt}}", str(random.randint(1, 1000)), 1)
    if "{{$randomEmail}}" in interpolated:
        while "{{$randomEmail}}" in interpolated:
            rnd = random.randint(100, 999)
            interpolated = interpolated.replace("{{$randomEmail}}", f"user{rnd}@example.com", 1)
    return interpolated


def _make_handler(manager: MockServerManager):
    class MockHandler(BaseHTTPRequestHandler):
        def _handle_request(self):
            started_at = time.perf_counter()
            parsed_url = urlparse(self.path)
            req_path = parsed_url.path

            # Read body
            try:
                content_length = int(self.headers.get("Content-Length", 0))
            except ValueError:
                self.send_error(400, "Invalid Content-Length")
                return
            if content_length < 0:
                self.send_error(400, "Invalid Content-Length")
                return
            if content_length > _MAX_REQUEST_BODY_BYTES:
                self.send_error(413, "Request body is too large")
                return
            req_body_text = ""
            if content_length:
                raw_req_bytes = self.rfile.read(content_length)
                try:
                    req_body_text = raw_req_bytes.decode("utf-8")
                except UnicodeDecodeError:
                    req_body_text = f"<binary {len(raw_req_bytes)} bytes>"

            # Match route
            route = manager.match_route(self.command, req_path, {"rest", "graphql", "sse"})
            params = route.extract_params(req_path) if route else {}

            status_code = route.status_code if route else 404
            resp_body = interpolate_mock_body(route.body, params) if route else json.dumps({
                "error": "No matching mock route found",
                "method": self.command,
                "path": req_path,
            })
            resp_headers = dict(route.headers) if route else {"Content-Type": "application/json"}


            # SSE routes produce a finite stream so they work with the app's polling client.
            if route and route.protocol == "sse":
                self.send_response(status_code)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "close")
                for name, value in route.headers.items():
                    if name.lower() not in {"content-type", "cache-control", "connection", "content-length"}:
                        self.send_header(name, value)
                self.end_headers()
                try:
                    for event in route.events:
                        if route.delay_ms:
                            time.sleep(route.delay_ms / 1000.0)
                        chunks = []
                        if event.get("id") is not None:
                            chunks.append(f"id: {event['id']}")
                        if event.get("event"):
                            chunks.append(f"event: {event['event']}")
                        if event.get("retry") is not None:
                            chunks.append(f"retry: {event['retry']}")
                        data = str(event.get("data", ""))
                        chunks.extend(f"data: {line}" for line in data.splitlines() or [""])
                        self.wfile.write(("\n".join(chunks) + "\n\n").encode("utf-8"))
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    pass
                manager.record_request({
                    "id": str(uuid.uuid4()),
                    "method": self.command,
                    "protocol": "sse",
                    "path": req_path,
                    "matched_route_id": route.id,
                    "status_code": status_code,
                    "timestamp": datetime.now(UTC).isoformat(),
                    "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
                })
                return

            if route and route.delay_ms > 0:
                time.sleep(route.delay_ms / 1000.0)

            if route and route.protocol == "graphql" and not any(
                name.lower() == "content-type" for name in resp_headers
            ):
                resp_headers["Content-Type"] = "application/json"

            manager.record_request({
                "id": str(uuid.uuid4()),
                "method": self.command,
                "protocol": route.protocol if route else "rest",
                "path": req_path,
                "matched_route_id": route.id if route else None,
                "status_code": status_code,
                "timestamp": datetime.now(UTC).isoformat(),
                "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
            })

            # Send response
            self.send_response(status_code)
            for k, v in resp_headers.items():
                self.send_header(k, v)
            body_bytes = resp_body.encode("utf-8")
            if status_code not in (204, 304) and not 100 <= status_code < 200:
                self.send_header("Content-Length", str(len(body_bytes)))
            self.end_headers()
            if self.command != "HEAD" and status_code not in (204, 304) and not 100 <= status_code < 200:
                self.wfile.write(body_bytes)

        def do_GET(self):
            self._handle_request()

        def do_POST(self):
            self._handle_request()

        def do_PUT(self):
            self._handle_request()

        def do_PATCH(self):
            self._handle_request()

        def do_DELETE(self):
            self._handle_request()

        def do_HEAD(self):
            self._handle_request()

        def do_OPTIONS(self):
            self._handle_request()

        def do_TRACE(self):
            self._handle_request()

        def log_message(self, format, *args):
            # Suppress default noisy stderr HTTP logging
            pass

    return MockHandler


class MockServerManager:
    """Controls the local mock server instance."""

    def __init__(self, default_host: str = "127.0.0.1", default_port: int = 4010):
        # Bound explicitly to local interface — no 0.0.0.0 exposure
        self._host = default_host
        self._port = default_port
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self._ws_loop: asyncio.AbstractEventLoop | None = None
        self._ws_server: Any = None
        self._ws_thread: threading.Thread | None = None
        self._ws_ready = threading.Event()
        self._ws_error: str | None = None
        self._routes: list[MockRoute] = []
        self._requests_log: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._is_running = False

        # Seed initial sample routes
        self._routes = [
            MockRoute(
                route_id="sample-1",
                method="GET",
                path="/api/health",
                status_code=200,
                headers={"Content-Type": "application/json"},
                body=json.dumps({"status": "ok", "mock": True, "service": "KuroRelay Mock Server"}),
                delay_ms=0,
            ),
            MockRoute(
                route_id="sample-2",
                method="GET",
                path="/api/users",
                status_code=200,
                headers={"Content-Type": "application/json"},
                body=json.dumps([
                    {"id": 1, "name": "Alice Kuro", "role": "admin"},
                    {"id": 2, "name": "Bob Relay", "role": "developer"},
                ]),
                delay_ms=40,
            ),
            MockRoute(
                route_id="sample-3",
                method="POST",
                path="/api/users",
                status_code=201,
                headers={"Content-Type": "application/json"},
                body=json.dumps({"id": 3, "message": "User created in mock"}),
                delay_ms=20,
            ),
        ]

    def match_route(
        self,
        method: str,
        path: str,
        protocols: set[str] | None = None,
    ) -> MockRoute | None:
        with self._lock:
            for route in self._routes:
                if protocols is not None and route.protocol not in protocols:
                    continue
                if route.matches(method, path):
                    return route
        return None

    def record_request(self, entry: dict[str, Any]) -> None:
        with self._lock:
            self._requests_log.insert(0, entry)
            # Retain last 100 requests
            if len(self._requests_log) > 100:
                self._requests_log = self._requests_log[:100]

    def start(self, host: str | None = None, port: int | None = None) -> dict[str, Any]:
        with self._lock:
            if self._is_running:
                return {
                    "status": "ok",
                    "is_running": True,
                    "host": self._host,
                    "port": self._port,
                    "url": f"http://{self._host}:{self._port}",
                    "websocket_port": self._port + 1,
                    "websocket_url": f"ws://{self._host}:{self._port + 1}",
                    "message": "Mock server is already running",
                }

            target_host = (host or self._host).strip()
            # Enforce non-wildcard local binding for safety
            if target_host in ("0.0.0.0", ""):
                target_host = "127.0.0.1"

            target_port = port if port is not None else self._port
            if isinstance(target_port, bool) or not isinstance(target_port, int) or not 1 <= target_port <= 65534:
                raise ValidationError("Mock server port must be an integer between 1 and 65534")

            if _is_port_in_use(target_host, target_port):
                raise ValidationError(f"Port {target_port} on {target_host} is already in use")

            handler_class = _make_handler(self)
            try:
                server = ThreadingHTTPServer((target_host, target_port), handler_class)
            except OSError as exc:
                raise ValidationError(f"Failed to bind mock server to {target_host}:{target_port}: {exc}")

            self._server = server
            self._host = target_host
            self._port = target_port
            self._is_running = True

            self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
            self._thread.start()

            self._ws_ready.clear()
            self._ws_error = None
            self._ws_thread = threading.Thread(
                target=self._run_websocket_server,
                args=(target_host, target_port + 1),
                daemon=True,
            )
            self._ws_thread.start()
            if not self._ws_ready.wait(timeout=5):
                self._server.shutdown()
                self._server.server_close()
                self._server = None
                self._is_running = False
                raise ValidationError("WebSocket mock listener did not become ready")
            if self._ws_error:
                self._server.shutdown()
                self._server.server_close()
                self._server = None
                self._is_running = False
                raise ValidationError(f"Could not start WebSocket mock listener: {self._ws_error}")

            logger.info("Mock server started", host=self._host, port=self._port)
            return {
                "status": "ok",
                "is_running": True,
                "host": self._host,
                "port": self._port,
                "url": f"http://{self._host}:{self._port}",
                "websocket_port": self._port + 1,
                "websocket_url": f"ws://{self._host}:{self._port + 1}",
            }

    def _run_websocket_server(self, host: str, port: int) -> None:
        if websocket_serve is None:
            self._ws_error = "The websockets package is not installed."
            self._ws_ready.set()
            return

        loop = asyncio.new_event_loop()
        self._ws_loop = loop
        asyncio.set_event_loop(loop)

        async def serve_forever() -> None:
            try:
                self._ws_server = await websocket_serve(self._handle_websocket, host, port)
                self._ws_ready.set()
                await self._ws_server.wait_closed()
            except (OSError, RuntimeError) as exc:
                self._ws_error = str(exc)
                self._ws_ready.set()

        try:
            loop.run_until_complete(serve_forever())
        finally:
            loop.close()
            self._ws_loop = None

    async def _handle_websocket(self, connection: Any, path: str | None = None) -> None:
        request = getattr(connection, "request", None)
        request_path = path or getattr(request, "path", None) or getattr(connection, "path", "/")
        request_path = urlparse(request_path).path
        started_at = time.perf_counter()
        route = self.match_route("GET", request_path, {"websocket"})
        if route is None:
            await connection.close(code=1008, reason="No matching mock route found")
            self.record_request({
                "id": str(uuid.uuid4()),
                "method": "WEBSOCKET",
                "protocol": "websocket",
                "path": request_path,
                "matched_route_id": None,
                "status_code": 404,
                "timestamp": datetime.now(UTC).isoformat(),
                "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
            })
            return

        try:
            if route.delay_ms:
                await asyncio.sleep(route.delay_ms / 1000.0)
            for message in route.messages:
                await connection.send(message)
            if route.echo_messages:
                async for message in connection:
                    await connection.send(message)
            else:
                async for _ in connection:
                    pass
        finally:
            self.record_request({
                "id": str(uuid.uuid4()),
                "method": "WEBSOCKET",
                "protocol": "websocket",
                "path": request_path,
                "matched_route_id": route.id,
                "status_code": 101,
                "timestamp": datetime.now(UTC).isoformat(),
                "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
            })

    def stop(self) -> dict[str, Any]:
        with self._lock:
            if not self._is_running or self._server is None:
                return {"status": "ok", "is_running": False}

            server = self._server
            ws_server = self._ws_server
            ws_loop = self._ws_loop
            ws_thread = self._ws_thread
            self._server = None
            self._ws_server = None
            self._ws_thread = None
            self._is_running = False

        try:
            server.shutdown()
            server.server_close()
            if ws_server is not None and ws_loop is not None and ws_loop.is_running():
                ws_loop.call_soon_threadsafe(ws_server.close)
            if ws_thread is not None:
                ws_thread.join(timeout=5)
        except (OSError, RuntimeError) as exc:
            logger.error("Error stopping mock server", error=str(exc))
        finally:
            logger.info("Mock server stopped")

        return {"status": "ok", "is_running": False}

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "status": "ok",
                "is_running": self._is_running,
                "host": self._host,
                "port": self._port,
                "url": f"http://{self._host}:{self._port}",
                "websocket_port": self._port + 1,
                "websocket_url": f"ws://{self._host}:{self._port + 1}",
                "routes": [r.to_dict() for r in self._routes],
                "requests_log": list(self._requests_log),
            }

    def set_routes(self, routes_data: list[dict[str, Any]]) -> dict[str, Any]:
        if not isinstance(routes_data, list):
            raise ValidationError("Mock routes must be provided as a list")

        new_routes: list[MockRoute] = []
        for index, route_data in enumerate(routes_data):
            if not isinstance(route_data, dict):
                raise ValidationError(f"Mock route {index + 1} must be an object")

            method = route_data.get("method", "GET")
            protocol = route_data.get("protocol", "rest")
            if not isinstance(protocol, str) or protocol.strip().lower() not in _ALLOWED_PROTOCOLS:
                raise ValidationError(f"Mock route {index + 1} has an unsupported protocol")
            protocol = protocol.strip().lower()
            if not isinstance(method, str) or method.strip().upper() not in _ALLOWED_METHODS:
                raise ValidationError(f"Mock route {index + 1} has an unsupported HTTP method")
            method = method.strip().upper()
            if protocol == "graphql" and method not in {"POST", "ANY"}:
                raise ValidationError(f"Mock route {index + 1} GraphQL method must be POST or ANY")
            if protocol in {"sse", "websocket"} and method not in {"GET", "ANY"}:
                raise ValidationError(f"Mock route {index + 1} {protocol.upper()} method must be GET or ANY")

            path = route_data.get("path", "/")
            if not isinstance(path, str) or not path.strip() or "?" in path or "#" in path:
                raise ValidationError(f"Mock route {index + 1} must have a path without query or fragment")
            remaining_path = _PATH_PARAMETER_RE.sub("", path)
            if "{" in remaining_path or "}" in remaining_path:
                raise ValidationError(f"Mock route {index + 1} has an invalid path parameter")

            try:
                status_code = int(route_data.get("status_code", 200))
                delay_ms = int(route_data.get("delay_ms", 0))
            except (TypeError, ValueError) as exc:
                raise ValidationError(f"Mock route {index + 1} has an invalid status or delay") from exc
            if not 100 <= status_code <= 599:
                raise ValidationError(f"Mock route {index + 1} status must be between 100 and 599")
            if not 0 <= delay_ms <= _MAX_DELAY_MS:
                raise ValidationError(f"Mock route {index + 1} delay must be between 0 and {_MAX_DELAY_MS} ms")

            headers = route_data.get("headers")
            if headers is not None:
                if not isinstance(headers, dict):
                    raise ValidationError(f"Mock route {index + 1} headers must be an object")
                for name, value in headers.items():
                    if (
                        not isinstance(name, str)
                        or not _HEADER_NAME_RE.fullmatch(name)
                        or not isinstance(value, str)
                        or "\r" in value
                        or "\n" in value
                    ):
                        raise ValidationError(f"Mock route {index + 1} contains an invalid response header")

            body = route_data.get("body", route_data.get("response_body", ""))
            if body is None:
                body = ""
            elif not isinstance(body, str):
                body = json.dumps(body)
            if protocol == "graphql":
                try:
                    graphql_response = json.loads(body)
                except json.JSONDecodeError as exc:
                    raise ValidationError(f"Mock route {index + 1} GraphQL response must be valid JSON") from exc
                if not isinstance(graphql_response, dict):
                    raise ValidationError(f"Mock route {index + 1} GraphQL response must be a JSON object")

            enabled = route_data.get("enabled", route_data.get("is_active", True))
            if not isinstance(enabled, bool):
                raise ValidationError(f"Mock route {index + 1} enabled must be a boolean")

            events = route_data.get("events", [])
            if not isinstance(events, list):
                raise ValidationError(f"Mock route {index + 1} events must be a list")
            validated_events: list[dict[str, Any]] = []
            for event_index, event in enumerate(events):
                if not isinstance(event, dict):
                    raise ValidationError(f"Mock route {index + 1} event {event_index + 1} must be an object")
                event_name = event.get("event", "message")
                event_id = event.get("id")
                event_data = event.get("data", "")
                retry = event.get("retry")
                if not isinstance(event_name, str) or any(c in event_name for c in "\r\n"):
                    raise ValidationError(f"Mock route {index + 1} contains an invalid SSE event name")
                if event_id is not None and (
                    not isinstance(event_id, str) or any(c in event_id for c in "\r\n")
                ):
                    raise ValidationError(f"Mock route {index + 1} contains an invalid SSE event id")
                if not isinstance(event_data, (str, int, float, bool, dict, list)) and event_data is not None:
                    raise ValidationError(f"Mock route {index + 1} contains invalid SSE event data")
                if retry is not None and (
                    isinstance(retry, bool) or not isinstance(retry, int) or retry < 0
                ):
                    raise ValidationError(f"Mock route {index + 1} contains an invalid SSE retry value")
                validated_events.append({
                    "event": event_name,
                    "id": event_id,
                    "data": event_data if isinstance(event_data, str) else json.dumps(event_data),
                    "retry": retry,
                })

            messages = route_data.get("messages", [])
            if not isinstance(messages, list) or any(not isinstance(message, str) for message in messages):
                raise ValidationError(f"Mock route {index + 1} WebSocket messages must be a list of strings")
            echo_messages = route_data.get("echo_messages", False)
            if not isinstance(echo_messages, bool):
                raise ValidationError(f"Mock route {index + 1} echo_messages must be a boolean")

            route_id = route_data.get("id")
            if route_id is not None and (not isinstance(route_id, str) or not route_id.strip()):
                raise ValidationError(f"Mock route {index + 1} has an invalid id")

            new_routes.append(
                MockRoute(
                    route_id=route_id or str(uuid.uuid4()),
                    method=method,
                    path=path,
                    status_code=status_code,
                    headers=headers,
                    body=body,
                    delay_ms=delay_ms,
                    enabled=enabled,
                    protocol=protocol,
                    events=validated_events,
                    messages=messages,
                    echo_messages=echo_messages,
                )
            )

        with self._lock:
            self._routes = new_routes
            return {"status": "ok", "routes": [r.to_dict() for r in self._routes]}

    def clear_requests_log(self) -> dict[str, Any]:
        with self._lock:
            self._requests_log.clear()
            return {"status": "ok"}
