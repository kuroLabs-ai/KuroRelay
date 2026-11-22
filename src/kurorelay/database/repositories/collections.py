"""Collection persistence operations."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from kurorelay.core.exceptions import ValidationError
from kurorelay.database.models.collection import Collection, CollectionFolder
from kurorelay.database.models.workspace import Workspace


class CollectionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self, workspace_id: str, name: str, description: str = ""
    ) -> Collection:
        workspace = self._session.get(Workspace, workspace_id)
        if workspace is None:
            raise ValidationError("Workspace does not exist")
        name = name.strip() if isinstance(name, str) else ""
        if not name or len(name) > 255:
            raise ValidationError("Collection name must be between 1 and 255 characters")
        if not isinstance(description, str):
            raise ValidationError("Collection description must be text")

        collection = Collection(
            workspace_id=workspace_id,
            name=name,
            description=description,
        )
        self._session.add(collection)
        self._session.flush()
        return collection

    def list_for_workspace(self, workspace_id: str) -> list[Collection]:
        return list(
            self._session.scalars(
                select(Collection)
                .where(Collection.workspace_id == workspace_id)
                .order_by(Collection.created_at, Collection.id)
            )
        )

    def get_by_id(self, collection_id: str) -> Collection | None:
        return self._session.get(Collection, collection_id)

    def update(
        self,
        collection: Collection,
        *,
        name: str | None = None,
        description: str | None = None,
    ) -> Collection:
        if name is not None:
            name = name.strip() if isinstance(name, str) else ""
            if not name or len(name) > 255:
                raise ValidationError(
                    "Collection name must be between 1 and 255 characters"
                )
            collection.name = name
        if description is not None:
            if not isinstance(description, str):
                raise ValidationError("Collection description must be text")
            collection.description = description
        self._session.flush()
        return collection

    def delete(self, collection: Collection) -> None:
        self._session.delete(collection)

    def create_folder(
        self, collection_id: str, name: str, parent_id: str | None = None
    ) -> CollectionFolder:
        collection = self.get_by_id(collection_id)
        if collection is None:
            raise ValidationError("Collection does not exist")
        name = name.strip() if isinstance(name, str) else ""
        if not name or len(name) > 255:
            raise ValidationError("Folder name must be between 1 and 255 characters")
        if parent_id is not None and self.get_folder(parent_id) is None:
            raise ValidationError("Parent folder does not exist")

        folder = CollectionFolder(
            collection_id=collection_id,
            name=name,
            parent_id=parent_id,
        )
        self._session.add(folder)
        self._session.flush()
        return folder

    def list_folders(self, collection_id: str) -> list[CollectionFolder]:
        return list(
            self._session.scalars(
                select(CollectionFolder)
                .where(CollectionFolder.collection_id == collection_id)
                .order_by(CollectionFolder.sort_order, CollectionFolder.name)
            )
        )

    def get_folder(self, folder_id: str) -> CollectionFolder | None:
        return self._session.get(CollectionFolder, folder_id)

    def update_folder(self, folder: CollectionFolder, name: str) -> CollectionFolder:
        name = name.strip() if isinstance(name, str) else ""
        if not name or len(name) > 255:
            raise ValidationError("Folder name must be between 1 and 255 characters")
        folder.name = name
        self._session.flush()
        return folder

    def delete_folder(self, folder: CollectionFolder) -> None:
        self._session.delete(folder)
