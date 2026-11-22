"""Server-Sent Events (SSE) client manager using `httpx-sse`."""
from __future__ import annotations

import threading
import time
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx
from kurorelay.core.exceptions import ValidationError
from kurorelay.core.logging import get_logger

logger = get_logger(__name__)

try:
    from httpx_sse import connect_sse
except ImportError:
    connect_sse = None


class SSESession:
    def __init__(self, session_id: str, url: str, headers: dict[str, str] | None = None):
        self.session_id = session_id
        self.url = url
        self.headers = headers or {}
        self.status: str = "connecting"
        self.error: str | None = None
        self.events: list[dict[str, Any]] = []
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run_stream, daemon=True)
        self._thread.start()

    def _run_stream(self) -> None:
        req_headers = {"Accept": "text/event-stream", "Cache-Control": "no-cache"}
        if self.headers:
            req_headers.update(self.headers)

        try:
            with httpx.Client(timeout=httpx.Timeout(connect=15.0, read=None, write=15.0, pool=None)) as client:
                if connect_sse is not None:
                    with connect_sse(client, "GET", self.url, headers=req_headers) as event_source:
                        self.status = "connected"
                        logger.info("SSE connected", session_id=self.session_id, url=self.url)

                        for sse in event_source.iter_sse():
                            if self._stop_event.is_set():
                                break
                            self.events.append({
                                "id": sse.id or str(uuid.uuid4()),
                                "event": sse.event or "message",
                                "data": sse.data,
                                "retry": sse.retry,
                                "timestamp": datetime.now(UTC).isoformat(),
                            })
                else:
                    # Fallback line-by-line event stream parser
                    with client.stream("GET", self.url, headers=req_headers) as response:
                        self.status = "connected"
                        event_name = "message"
                        event_data: list[str] = []
                        event_id = None

                        for line in response.iter_lines():
                            if self._stop_event.is_set():
                                break
                            if not line:
                                if event_data:
                                    self.events.append({
                                        "id": event_id or str(uuid.uuid4()),
                                        "event": event_name,
                                        "data": "\n".join(event_data),
                                        "timestamp": datetime.now(UTC).isoformat(),
                                    })
                                    event_name = "message"
                                    event_data = []
                                    event_id = None
                                continue

                            if line.startswith("event:"):
                                event_name = line[6:].strip()
                            elif line.startswith("data:"):
                                event_data.append(line[5:].strip())
                            elif line.startswith("id:"):
                                event_id = line[3:].strip()

        except Exception as exc:
            if not self._stop_event.is_set():
                self.status = "error"
                self.error = str(exc)
                logger.error("SSE stream error", session_id=self.session_id, error=str(exc))
        finally:
            self.status = "disconnected"

    def close(self) -> None:
        self._stop_event.set()
        self.status = "disconnected"


class SSEManager:
    """Manages active Server-Sent Events sessions."""

    def __init__(self) -> None:
        self._sessions: dict[str, SSESession] = {}
        self._lock = threading.Lock()

    def connect(self, url: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
        url = url.strip()
        if not (url.startswith("http://") or url.startswith("https://")):
            raise ValidationError("SSE URL must begin with http:// or https://")

        session_id = f"sse-{uuid.uuid4()}"
        session = SSESession(session_id, url, headers)
        with self._lock:
            self._sessions[session_id] = session
        session.start()

        time.sleep(0.05)
        return {
            "status": "ok",
            "session_id": session_id,
            "connection_status": session.status,
            "url": url,
        }

    def poll(self, session_id: str, since_index: int = 0) -> dict[str, Any]:
        with self._lock:
            session = self._sessions.get(session_id)
        if not session:
            return {
                "status": "error",
                "error": "Session not found",
                "is_connected": False,
                "events": [],
            }

        total = len(session.events)
        new_events = session.events[since_index:] if since_index < total else []
        return {
            "status": "ok",
            "session_id": session_id,
            "connection_status": session.status,
            "error": session.error,
            "is_connected": session.status == "connected",
            "events": new_events,
            "next_index": total,
        }

    def disconnect(self, session_id: str) -> dict[str, Any]:
        with self._lock:
            session = self._sessions.pop(session_id, None)
        if session:
            session.close()
        return {"status": "ok"}
