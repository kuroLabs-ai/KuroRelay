"""Collection and CollectionFolder models."""
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kurorelay.database.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    workspace_id: Mapped[str] = mapped_column(
        String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    workspace: Mapped["Workspace"] = relationship(back_populates="collections")  # noqa: F821
    folders: Mapped[list["CollectionFolder"]] = relationship(
        back_populates="collection", cascade="all, delete-orphan"
    )
    requests: Mapped[list["Request"]] = relationship(  # noqa: F821
        back_populates="collection", cascade="all, delete-orphan"
    )


class CollectionFolder(Base):
    __tablename__ = "collection_folders"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    collection_id: Mapped[str] = mapped_column(
        String, ForeignKey("collections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("collection_folders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    collection: Mapped["Collection"] = relationship(back_populates="folders")
    children: Mapped[list["CollectionFolder"]] = relationship(
        back_populates="parent", cascade="all, delete-orphan"
    )
    parent: Mapped["CollectionFolder | None"] = relationship(
        back_populates="children", remote_side="CollectionFolder.id"
    )
    requests: Mapped[list["Request"]] = relationship(  # noqa: F821
        back_populates="folder", cascade="all, delete-orphan"
    )
