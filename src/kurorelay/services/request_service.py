"""Application service coordinating request preparation, transport, and response."""
from __future__ import annotations

import asyncio
import time
from collections.abc import Callable

from kurorelay.core.exceptions import KuroRelayError, ValidationError
from kurorelay.core.logging import get_logger
from kurorelay.database.base import get_session
from kurorelay.database.repositories.environments import EnvironmentRepository
from kurorelay.engines.history.engine import HistoryEngine
from kurorelay.engines.http.client import HTTPEngine
from kurorelay.engines.requests.engine import RequestEngine
from kurorelay.engines.responses.engine import ResponseEngine

logger = get_logger(__name__)


class RequestService:
    def __init__(
        self,
        request_engine: RequestEngine | None = None,
        http_engine: HTTPEngine | None = None,
        response_engine: ResponseEngine | None = None,
        history_engine: HistoryEngine | None = None,
        environment_loader: Callable[[str, str | None], dict[str, str]] | None = None,
    ) -> None:
        self._request_engine = request_engine or RequestEngine()
        self._http_engine = http_engine or HTTPEngine()
        self._response_engine = response_engine or ResponseEngine()
        self._history_engine = history_engine or HistoryEngine()
        self._environment_loader = environment_loader or self._load_environment

    async def execute(self, task_id: str, payload: dict) -> dict:
        request = self._request_engine.validate(payload)
        environment_id = request.environment_id
        if environment_id is not None:
            scopes = {
                name: dict(values)
                for name, values in request.variable_scopes.items()
            }
            environment_values = self._environment_loader(
                environment_id, request.workspace_id
            )
            scopes["environment"] = {
                **scopes.get("environment", {}),
                **environment_values,
            }
            request = request.model_copy(update={"variable_scopes": scopes})

        prepared_request = self._request_engine.prepare(request)
        request_snapshot = {
            key: value
            for key, value in payload.items()
            if key not in {"task_id", "variable_scopes"}
        }
        start = time.monotonic()
        try:
            response = await self._http_engine.execute(prepared_request)
        except asyncio.CancelledError:
            duration_ms = (time.monotonic() - start) * 1000
            try:
                self._history_engine.record(
                    request_snapshot,
                    {"status": "cancelled"},
                    duration_ms,
                    workspace_id=request.workspace_id,
                )
            except KuroRelayError as history_error:
                logger.error(
                    "Could not store cancelled request history",
                    task_id=task_id,
                    error_type=type(history_error).__name__,
                )
            raise
        except KuroRelayError as exc:
            duration_ms = round((time.monotonic() - start) * 1000, 2)
            try:
                self._history_engine.record(
                    request_snapshot,
                    {"status": "failed", "error_code": exc.code},
                    duration_ms,
                    workspace_id=request.workspace_id,
                )
            except KuroRelayError as history_error:
                exc.details["history_warning"] = (
                    "The failed request could not be added to history."
                )
                logger.error(
                    "Could not store failed request history",
                    task_id=task_id,
                    error_type=type(history_error).__name__,
                )
            raise

        duration_ms = round((time.monotonic() - start) * 1000, 2)
        result = self._response_engine.normalize(task_id, response, duration_ms)
        try:
            resp_body = result["response"].get("body")
            if isinstance(resp_body, dict):
                body_data = resp_body.get("data")
                if isinstance(body_data, str) and len(body_data) > 500_000:
                    resp_body = {
                        "type": resp_body.get("type", "text"),
                        "data": body_data[:500_000] + "\n... [Truncated in history]",
                    }
            elif isinstance(resp_body, str) and len(resp_body) > 500_000:
                resp_body = resp_body[:500_000] + "\n... [Truncated in history]"

            self._history_engine.record(
                request_snapshot,
                {
                    "status": "completed",
                    "status_code": result["response"]["status_code"],
                    "status_text": result["response"]["status_text"],
                    "headers": result["response"]["headers"],
                    "size_bytes": result["response"].get("size_bytes", 0),
                    "body": resp_body,
                },
                duration_ms,
                workspace_id=request.workspace_id,
            )
        except KuroRelayError as history_error:
            result["history_warning"] = {
                "code": "HISTORY_PERSISTENCE_FAILED",
                "message": "Request completed, but history could not be saved.",
            }
            logger.error(
                "Could not store completed request history",
                task_id=task_id,
                error_type=type(history_error).__name__,
            )
        return result

    @staticmethod
    def _load_environment(
        environment_id: str, workspace_id: str | None
    ) -> dict[str, str]:
        with get_session() as session:
            repository = EnvironmentRepository(session)
            environment = repository.get_by_id(environment_id)
            if environment is None:
                raise ValidationError(
                    "The selected environment does not exist",
                    details={"environment_id": environment_id},
                )
            if workspace_id is not None and environment.workspace_id != workspace_id:
                raise ValidationError(
                    "The selected environment does not belong to this workspace"
                )
            return repository.values_for_resolution(environment_id)
