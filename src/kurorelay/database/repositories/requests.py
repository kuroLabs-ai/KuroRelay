"""Saved request persistence operations."""
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from kurorelay.core.exceptions import ValidationError
from kurorelay.database.models.collection import Collection, CollectionFolder
from kurorelay.database.models.request import Request
from kurorelay.engines.history.redaction import redact_sensitive_data


class RequestRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self,
        collection_id: str,
        name: str,
        method: str,
        url: str,
        configuration: dict,
        folder_id: str | None = None,
    ) -> Request:
        collection = self._session.get(Collection, collection_id)
        if collection is None:
            raise ValidationError("Collection does not exist")
        name = name.strip() if isinstance(name, str) else ""
        if not name or len(name) > 255:
            raise ValidationError("Request name must be between 1 and 255 characters")
        method = method.strip().upper() if isinstance(method, str) else ""
        if not method or len(method) > 16:
            raise ValidationError("Request method is invalid")
        if not isinstance(url, str):
            raise ValidationError("Request URL must be text")
        if not isinstance(configuration, dict):
            raise ValidationError("Request configuration must be an object")

        if folder_id is not None:
            folder = self._session.get(CollectionFolder, folder_id)
            if folder is None or folder.collection_id != collection_id:
                raise ValidationError("Folder does not belong to this collection")

        try:
            config_json = json.dumps(
                redact_sensitive_data(configuration), allow_nan=False
            )
        except (TypeError, ValueError):
            raise ValidationError(
                "Request configuration must contain JSON-compatible values"
            ) from None

        request = Request(
            collection_id=collection_id,
            folder_id=folder_id,
            name=name,
            method=method,
            url=redact_sensitive_data({"url": url})["url"],
            configuration_json=config_json,
        )
        self._session.add(request)
        self._session.flush()
        return request

    def list_for_collection(self, collection_id: str) -> list[Request]:
        return list(
            self._session.scalars(
                select(Request)
                .where(Request.collection_id == collection_id)
                .order_by(Request.created_at, Request.id)
            )
        )

    def get_by_id(self, request_id: str) -> Request | None:
        return self._session.get(Request, request_id)

    @staticmethod
    def configuration(request: Request) -> dict:
        return json.loads(request.configuration_json)

    def update(
        self,
        request: Request,
        *,
        name: str | None = None,
        method: str | None = None,
        url: str | None = None,
        configuration: dict | None = None,
        folder_id: str | None = None,
        update_folder: bool = False,
    ) -> Request:
        if name is not None:
            name = name.strip() if isinstance(name, str) else ""
            if not name or len(name) > 255:
                raise ValidationError("Request name must be between 1 and 255 characters")
            request.name = name
        if method is not None:
            method = method.strip().upper() if isinstance(method, str) else ""
            if not method or len(method) > 16:
                raise ValidationError("Request method is invalid")
            request.method = method
        if url is not None:
            if not isinstance(url, str):
                raise ValidationError("Request URL must be text")
            request.url = redact_sensitive_data({"url": url})["url"]
        if configuration is not None:
            if not isinstance(configuration, dict):
                raise ValidationError("Request configuration must be an object")
            try:
                request.configuration_json = json.dumps(
                    redact_sensitive_data(configuration), allow_nan=False
                )
            except (TypeError, ValueError):
                raise ValidationError(
                    "Request configuration must contain JSON-compatible values"
                ) from None
        if update_folder:
            if folder_id is None:
                request.folder_id = None
            else:
                folder = self._session.get(CollectionFolder, folder_id)
                if folder is None or folder.collection_id != request.collection_id:
                    raise ValidationError("Folder does not belong to this collection")
                request.folder_id = folder_id
        self._session.flush()
        return request

    def delete(self, request: Request) -> None:
        self._session.delete(request)
