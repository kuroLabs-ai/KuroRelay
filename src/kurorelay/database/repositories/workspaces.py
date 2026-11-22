"""Workspace persistence operations."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from kurorelay.core.exceptions import ValidationError
from kurorelay.database.models.workspace import Workspace


class WorkspaceRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, name: str, description: str = "") -> Workspace:
        name = name.strip() if isinstance(name, str) else ""
        if not name or len(name) > 255:
            raise ValidationError("Workspace name must be between 1 and 255 characters")
        if not isinstance(description, str):
            raise ValidationError("Workspace description must be text")

        workspace = Workspace(name=name, description=description)
        self._session.add(workspace)
        self._session.flush()
        return workspace

    def list_all(self) -> list[Workspace]:
        return list(
            self._session.scalars(
                select(Workspace).order_by(Workspace.created_at, Workspace.id)
            )
        )

    def get_by_id(self, workspace_id: str) -> Workspace | None:
        return self._session.get(Workspace, workspace_id)

    def get_or_create_default(self) -> Workspace:
        workspace = self._session.scalar(
            select(Workspace).order_by(Workspace.created_at, Workspace.id).limit(1)
        )
        if workspace is not None:
            return workspace
        return self.create("Default Workspace", "Default local workspace")
