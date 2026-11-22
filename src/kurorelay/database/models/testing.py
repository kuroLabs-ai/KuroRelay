"""Testing models — TestSuite and TestCase."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kurorelay.database.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class TestSuite(Base):
    __test__ = False
    __tablename__ = "test_suites"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(
        String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )

    test_cases: Mapped[list[TestCase]] = relationship(
        back_populates="suite", cascade="all, delete-orphan", order_by="TestCase.created_at"
    )


class TestCase(Base):
    __test__ = False
    __tablename__ = "test_cases"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    suite_id: Mapped[str] = mapped_column(
        String, ForeignKey("test_suites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    request_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("requests.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    assertion_type: Mapped[str] = mapped_column(String(64), nullable=False)
    assertion_config_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )

    suite: Mapped[TestSuite] = relationship(back_populates="test_cases")
