"""Request model."""
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kurorelay.database.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class Request(Base):
    __tablename__ = "requests"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    collection_id: Mapped[str] = mapped_column(
        String, ForeignKey("collections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    folder_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("collection_folders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="New Request")
    method: Mapped[str] = mapped_column(String(16), nullable=False, default="GET")
    url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Full request config stored as JSON (headers, params, body, auth, settings)
    configuration_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    collection: Mapped["Collection"] = relationship(back_populates="requests")  # noqa: F821
    folder: Mapped["CollectionFolder | None"] = relationship(back_populates="requests")  # noqa: F821
