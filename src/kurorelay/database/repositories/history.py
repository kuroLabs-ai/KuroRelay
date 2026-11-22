"""Request history persistence and paginated queries."""
import json

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from kurorelay.core.exceptions import ValidationError
from kurorelay.database.models.history import RequestHistory


class HistoryRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self,
        workspace_id: str,
        request_snapshot: dict,
        response_metadata: dict,
        duration_ms: float,
    ) -> RequestHistory:
        try:
            request_json = json.dumps(request_snapshot, allow_nan=False)
            response_json = json.dumps(response_metadata, allow_nan=False)
        except (TypeError, ValueError):
            raise ValidationError("History records must contain JSON-compatible values") from None
        if duration_ms < 0:
            raise ValidationError("History duration cannot be negative")

        record = RequestHistory(
            workspace_id=workspace_id,
            request_snapshot=request_json,
            response_metadata=response_json,
            duration_ms=duration_ms,
        )
        self._session.add(record)
        self._session.flush()
        return record

    def list_for_workspace(
        self, workspace_id: str, *, limit: int, offset: int = 0
    ) -> tuple[list[RequestHistory], int]:
        if not 1 <= limit <= 100:
            raise ValidationError("History page size must be between 1 and 100")
        if offset < 0:
            raise ValidationError("History offset cannot be negative")

        total = self._session.scalar(
            select(func.count())
            .select_from(RequestHistory)
            .where(RequestHistory.workspace_id == workspace_id)
        )
        records = list(
            self._session.scalars(
                select(RequestHistory)
                .where(RequestHistory.workspace_id == workspace_id)
                .order_by(RequestHistory.executed_at.desc(), RequestHistory.id.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        return records, int(total or 0)

    def delete(self, record: RequestHistory) -> None:
        self._session.delete(record)

    def get_by_id(self, workspace_id: str, record_id: str) -> RequestHistory | None:
        return self._session.scalar(
            select(RequestHistory).where(
                RequestHistory.workspace_id == workspace_id,
                RequestHistory.id == record_id,
            )
        )

    def clear_for_workspace(self, workspace_id: str) -> int:
        records = self._session.scalars(
            select(RequestHistory).where(RequestHistory.workspace_id == workspace_id)
        )
        count = 0
        for record in records:
            self._session.delete(record)
            count += 1
        return count
