"""Track in-flight asyncio operations and allow cross-thread cancellation."""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from threading import Lock

from kurorelay.core.exceptions import ValidationError


@dataclass(frozen=True)
class _ActiveTask:
    loop: asyncio.AbstractEventLoop
    task: asyncio.Task


class TaskManager:
    def __init__(self) -> None:
        self._active_tasks: dict[str, _ActiveTask] = {}
        self._lock = Lock()

    async def execute(
        self, task_id: str, operation: Callable[[], Awaitable[dict]]
    ) -> dict:
        task = asyncio.current_task()
        if task is None:
            raise RuntimeError("TaskManager.execute must run inside an asyncio task")

        with self._lock:
            if task_id in self._active_tasks:
                raise ValidationError("Task ID is already in use")
            self._active_tasks[task_id] = _ActiveTask(asyncio.get_running_loop(), task)

        try:
            return await operation()
        except asyncio.CancelledError:
            return {"task_id": task_id, "status": "cancelled"}
        finally:
            with self._lock:
                self._active_tasks.pop(task_id, None)

    def cancel(self, task_id: str) -> bool:
        with self._lock:
            active = self._active_tasks.get(task_id)
            if active is None or active.loop.is_closed():
                return False
            try:
                active.loop.call_soon_threadsafe(active.task.cancel)
            except RuntimeError:
                return False
            return True
