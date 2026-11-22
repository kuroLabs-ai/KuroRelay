"""Environment and EnvironmentVariable models."""
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kurorelay.database.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class Environment(Base):
    __tablename__ = "environments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(
        String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    workspace: Mapped["Workspace"] = relationship(back_populates="environments")  # noqa: F821
    variables: Mapped[list["EnvironmentVariable"]] = relationship(
        back_populates="environment", cascade="all, delete-orphan"
    )


class EnvironmentVariable(Base):
    __tablename__ = "environment_variables"
    __table_args__ = (
        UniqueConstraint(
            "environment_id", "key", name="uq_environment_variables_environment_key"
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    environment_id: Mapped[str] = mapped_column(
        String, ForeignKey("environments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(255), nullable=False)
    # For non-secret variables only. Secrets stored via keyring — this field is empty for them.
    value: Mapped[str] = mapped_column(Text, default="")
    is_secret: Mapped[bool] = mapped_column(Boolean, default=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    environment: Mapped["Environment"] = relationship(back_populates="variables")
