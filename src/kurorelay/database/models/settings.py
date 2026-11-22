"""ApplicationSettings key-value store."""
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from kurorelay.database.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ApplicationSettings(Base):
    __tablename__ = "application_settings"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )
