"""WebSocket client manager using `websockets`."""
from __future__ import annotations

import asyncio
import threading
import time
import uuid
from datetime import UTC, datetime
from typing import Any

from kurorelay.core.exceptions import ValidationError
from kurorelay.core.logging import get_logger

logger = get_logger(__name__)

try:
    import websockets
    from websockets.asyncio.client import connect as ws_connect
except ImportError:
    try:
        import websockets
        from websockets.client import connect as ws_connect
    except Exception:
        websockets = None
        ws_connect = None


class WebSocketSession:
    def __init__(self, session_id: str, url: str, headers: dict[str, str] | None = None):
        self.session_id = session_id
        self.url = url
        self.headers = headers or {}
        self.status: str = "connecting"
        self.error: str | None = None
        self.messages: list[dict[str, Any]] = []
        self._ws: Any = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._outbound_queue: asyncio.Queue | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def _run_loop(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._connect_and_listen())
        except Exception as exc:
            self.status = "error"
            self.error = str(exc)
            logger.error("WebSocket run error", session_id=self.session_id, error=str(exc))
        finally:
            self.status = "disconnected"
            self._loop.close()

    async def _connect_and_listen(self) -> None:
        if ws_connect is None:
            self.status = "error"
            self.error = "websockets package is not installed."
            return

        self._outbound_queue = asyncio.Queue()
        try:
            connect_kwargs: dict[str, Any] = {}
            if self.headers:
                connect_kwargs["additional_headers"] = self.headers

            async with ws_connect(self.url, **connect_kwargs) as ws:
                self._ws = ws
                self.status = "connected"
                logger.info("WebSocket connected", session_id=self.session_id, url=self.url)

                recv_task = asyncio.create_task(self._receiver_loop(ws))
                send_task = asyncio.create_task(self._sender_loop(ws))

                # Wait until one task finishes or stop requested
                done, pending = await asyncio.wait(
                    [recv_task, send_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()
        except Exception as exc:
            self.status = "error"
            self.error = str(exc)
            logger.error("WebSocket connection failed", session_id=self.session_id, error=str(exc))
        finally:
            self.status = "disconnected"

    async def _receiver_loop(self, ws: Any) -> None:
        try:
            async for raw in ws:
                data_str = raw if isinstance(raw, str) else raw.decode("utf-8", errors="replace")
                self.messages.append({
                    "id": str(uuid.uuid4()),
                    "direction": "received",
                    "data": data_str,
                    "timestamp": datetime.now(UTC).isoformat(),
                    "size": len(data_str),
                })
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.debug("WebSocket receiver stopped", session_id=self.session_id, error=str(exc))

    async def _sender_loop(self, ws: Any) -> None:
        if self._outbound_queue is None:
            return
        try:
            while not self._stop_event.is_set():
                try:
                    msg = await asyncio.wait_for(self._outbound_queue.get(), timeout=0.5)
                    await ws.send(msg)
                    self.messages.append({
                        "id": str(uuid.uuid4()),
                        "direction": "sent",
                        "data": msg,
                        "timestamp": datetime.now(UTC).isoformat(),
                        "size": len(msg),
                    })
                    self._outbound_queue.task_done()
                except asyncio.TimeoutError:
                    continue
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.debug("WebSocket sender stopped", session_id=self.session_id, error=str(exc))

    def send_message(self, message: str) -> None:
        if self.status != "connected" or self._loop is None or self._outbound_queue is None:
            raise ValidationError("WebSocket is not connected")
        self._loop.call_soon_threadsafe(self._outbound_queue.put_nowait, message)

    def close(self) -> None:
        self._stop_event.set()
        self.status = "disconnected"
        if self._loop is not None and self._ws is not None:
            try:
                self._loop.call_soon_threadsafe(lambda: asyncio.create_task(self._ws.close()))
            except Exception:
                pass


class WebSocketManager:
    """Manages active WebSocket sessions."""

    def __init__(self) -> None:
        self._sessions: dict[str, WebSocketSession] = {}
        self._lock = threading.Lock()

    def connect(self, url: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
        url = url.strip()
        if not (url.startswith("ws://") or url.startswith("wss://")):
            raise ValidationError("URL must begin with ws:// or wss://")

        session_id = f"ws-{uuid.uuid4()}"
        session = WebSocketSession(session_id, url, headers)
        with self._lock:
            self._sessions[session_id] = session
        session.start()

        # Give it a brief instant to establish connection
        time.sleep(0.05)
        return {
            "status": "ok",
            "session_id": session_id,
            "connection_status": session.status,
            "url": url,
        }

    def send(self, session_id: str, message: str) -> dict[str, Any]:
        with self._lock:
            session = self._sessions.get(session_id)
        if not session:
            raise ValidationError(f"WebSocket session {session_id!r} not found")

        session.send_message(message)
        return {"status": "ok", "session_id": session_id}

    def poll(self, session_id: str, since_index: int = 0) -> dict[str, Any]:
        with self._lock:
            session = self._sessions.get(session_id)
        if not session:
            return {
                "status": "error",
                "error": "Session not found",
                "is_connected": False,
                "messages": [],
            }

        total_msgs = len(session.messages)
        new_msgs = session.messages[since_index:] if since_index < total_msgs else []
        return {
            "status": "ok",
            "session_id": session_id,
            "connection_status": session.status,
            "error": session.error,
            "is_connected": session.status == "connected",
            "messages": new_msgs,
            "next_index": total_msgs,
        }

    def disconnect(self, session_id: str) -> dict[str, Any]:
        with self._lock:
            session = self._sessions.pop(session_id, None)
        if session:
            session.close()
        return {"status": "ok"}
