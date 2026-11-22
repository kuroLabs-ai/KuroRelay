"""RequestHistory and ApplicationSettings models."""
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kurorelay.database.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class RequestHistory(Base):
    __tablename__ = "request_history"
    __table_args__ = (
        Index(
            "ix_request_history_workspace_executed_at",
            "workspace_id",
            "executed_at",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(
        String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    # Sanitized snapshot — credentials stripped before storage
    request_snapshot: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    # Metadata only — large bodies stored separately or omitted
    response_metadata: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    duration_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    workspace: Mapped["Workspace"] = relationship(back_populates="history")  # noqa: F821
