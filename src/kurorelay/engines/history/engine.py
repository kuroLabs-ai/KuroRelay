"""Store sanitized request history and expose paginated records."""
from __future__ import annotations

import json
from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import UTC

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from kurorelay.core.exceptions import DatabaseError, ValidationError
from kurorelay.database.base import get_session
from kurorelay.database.models.history import RequestHistory
from kurorelay.database.repositories.history import HistoryRepository
from kurorelay.database.repositories.workspaces import WorkspaceRepository
from kurorelay.engines.history.redaction import redact_sensitive_data


class HistoryEngine:
    def __init__(
        self,
        session_scope: Callable[[], AbstractContextManager[Session]] = get_session,
    ) -> None:
        self._session_scope = session_scope

    def record(
        self,
        request_snapshot: dict,
        response_metadata: dict,
        duration_ms: float,
        workspace_id: str | None = None,
    ) -> None:
        if not isinstance(request_snapshot, dict) or not isinstance(response_metadata, dict):
            raise ValidationError("History snapshots must be objects")
        workspace_id = self._normalize_workspace_id(workspace_id)
        if (
            isinstance(duration_ms, bool)
            or not isinstance(duration_ms, (int, float))
            or not 0 <= duration_ms < float("inf")
        ):
            raise ValidationError("History duration must be a finite non-negative number")

        snapshot = {
            key: value
            for key, value in request_snapshot.items()
            if key not in {"task_id", "variable_scopes"}
        }
        clean_snapshot = redact_sensitive_data(snapshot)
        clean_metadata = redact_sensitive_data(response_metadata)

        try:
            with self._session_scope() as session:
                workspaces = WorkspaceRepository(session)
                workspace = (
                    workspaces.get_by_id(workspace_id)
                    if workspace_id is not None
                    else workspaces.get_or_create_default()
                )
                if workspace is None:
                    raise ValidationError("Workspace does not exist")
                HistoryRepository(session).create(
                    workspace_id=workspace.id,
                    request_snapshot=clean_snapshot,
                    response_metadata=clean_metadata,
                    duration_ms=float(duration_ms),
                )
        except SQLAlchemyError as exc:
            raise DatabaseError("Could not save request history") from exc

    def list(
        self,
        *,
        workspace_id: str | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> dict:
        workspace_id = self._normalize_workspace_id(workspace_id)
        if isinstance(page, bool) or not isinstance(page, int) or page < 1:
            raise ValidationError("History page must be a positive integer")
        if (
            isinstance(page_size, bool)
            or not isinstance(page_size, int)
            or not 1 <= page_size <= 100
        ):
            raise ValidationError("History page size must be between 1 and 100")

        try:
            with self._session_scope() as session:
                workspaces = WorkspaceRepository(session)
                workspace = (
                    workspaces.get_by_id(workspace_id)
                    if workspace_id is not None
                    else workspaces.get_or_create_default()
                )
                if workspace is None:
                    raise ValidationError("Workspace does not exist")
                records, total = HistoryRepository(session).list_for_workspace(
                    workspace.id,
                    limit=page_size,
                    offset=(page - 1) * page_size,
                )
                return {
                    "workspace_id": workspace.id,
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                    "items": [self._serialize(record) for record in records],
                }
        except SQLAlchemyError as exc:
            raise DatabaseError("Could not read request history") from exc

    def delete(self, record_id: str, workspace_id: str | None = None) -> bool:
        if not isinstance(record_id, str) or not record_id.strip():
            raise ValidationError("History ID must be a non-empty string")
        workspace_id = self._normalize_workspace_id(workspace_id)
        try:
            with self._session_scope() as session:
                workspaces = WorkspaceRepository(session)
                workspace = (
                    workspaces.get_by_id(workspace_id)
                    if workspace_id is not None
                    else workspaces.get_or_create_default()
                )
                if workspace is None:
                    raise ValidationError("Workspace does not exist")
                repository = HistoryRepository(session)
                record = repository.get_by_id(workspace.id, record_id)
                if record is None:
                    return False
                repository.delete(record)
                return True
        except SQLAlchemyError as exc:
            raise DatabaseError("Could not delete request history") from exc

    def clear(self, workspace_id: str | None = None) -> int:
        workspace_id = self._normalize_workspace_id(workspace_id)
        try:
            with self._session_scope() as session:
                workspaces = WorkspaceRepository(session)
                workspace = (
                    workspaces.get_by_id(workspace_id)
                    if workspace_id is not None
                    else workspaces.get_or_create_default()
                )
                if workspace is None:
                    raise ValidationError("Workspace does not exist")
                return HistoryRepository(session).clear_for_workspace(workspace.id)
        except SQLAlchemyError as exc:
            raise DatabaseError("Could not clear request history") from exc

    @staticmethod
    def _serialize(record: RequestHistory) -> dict:
        dt = record.executed_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        iso_str = dt.isoformat()
        if not iso_str.endswith("Z") and not ("+" in iso_str or "-" in iso_str[10:]):
            iso_str += "Z"
        return {
            "id": record.id,
            "request_snapshot": json.loads(record.request_snapshot),
            "response_metadata": json.loads(record.response_metadata),
            "executed_at": iso_str,
            "duration_ms": record.duration_ms,
        }

    @staticmethod
    def _normalize_workspace_id(workspace_id: str | None) -> str | None:
        if workspace_id is None:
            return None
        if not isinstance(workspace_id, str) or not workspace_id.strip():
            raise ValidationError("Workspace ID must be a non-empty string")
        return workspace_id.strip()
