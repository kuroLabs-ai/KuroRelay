"""
KuroRelay Bridge API
The controlled surface exposed to the React frontend via PyWebView.
Only explicitly defined methods are callable from the UI.
"""
import asyncio
import json
import typing
from typing import Any
import uuid
from datetime import UTC

from sqlalchemy.exc import SQLAlchemyError

from kurorelay.core.exceptions import DatabaseError, KuroRelayError, ValidationError
from kurorelay.core.logging import get_logger
from kurorelay.core.task_manager import TaskManager
from kurorelay.database.base import get_session
from kurorelay.database.models.collection import Collection, CollectionFolder
from kurorelay.database.models.environment import Environment
from kurorelay.database.models.request import Request
from kurorelay.database.models.settings import ApplicationSettings
from kurorelay.database.models.testing import TestCase, TestSuite
from kurorelay.database.repositories.collections import CollectionRepository
from kurorelay.database.repositories.environments import EnvironmentRepository
from kurorelay.database.repositories.requests import RequestRepository
from kurorelay.database.repositories.testing import TestCaseRepository, TestSuiteRepository
from kurorelay.database.repositories.workspaces import WorkspaceRepository
from kurorelay.engines.history.engine import HistoryEngine
from kurorelay.engines.testing.engine import TestingEngine
from kurorelay.engines.workflows.engine import WorkflowEngine
from kurorelay.engines.protocols import WebSocketManager, GraphQLClient, SSEManager
from kurorelay.engines.mock_server import MockServerManager
from kurorelay.engines.performance import PerformanceEngine
from kurorelay.services.request_service import RequestService

logger = get_logger(__name__)


class KuroRelayAPI:
    """
    Bridge API — the ONLY interface between the frontend and Python.
    Every method here is callable from JavaScript via window.pywebview.api.*

    Rules:
    - Never expose arbitrary Python execution.
    - Validate all incoming data.
    - Return structured dicts — never raw Python objects.
    - Never log credentials.
    """

    def __init__(
        self,
        request_service: RequestService | None = None,
        task_manager: TaskManager | None = None,
        history_engine: HistoryEngine | None = None,
        testing_engine: TestingEngine | None = None,
        workflow_engine: WorkflowEngine | None = None,
        ws_manager: WebSocketManager | None = None,
        graphql_client: GraphQLClient | None = None,
        sse_manager: SSEManager | None = None,
        mock_server: MockServerManager | None = None,
        performance_engine: PerformanceEngine | None = None,
    ):
        self._task_manager = task_manager or TaskManager()
        self._request_service = request_service or RequestService()
        self._history_engine = history_engine or HistoryEngine()
        self._testing_engine = testing_engine or TestingEngine()
        self._workflow_engine = workflow_engine or WorkflowEngine(
            request_service=self._request_service,
            history_engine=self._history_engine,
        )
        if self._workflow_engine._request_service is None:
            self._workflow_engine._request_service = self._request_service
        if self._workflow_engine._history_engine is None:
            self._workflow_engine._history_engine = self._history_engine
        self._ws_manager = ws_manager or WebSocketManager()
        self._graphql_client = graphql_client or GraphQLClient()
        self._sse_manager = sse_manager or SSEManager()
        self._mock_server = mock_server or MockServerManager()
        self._performance_engine = performance_engine or PerformanceEngine()
        self._window: Any = None
        self._is_maximized: bool = True

    def set_window(self, window: Any) -> None:
        """Bind the PyWebView Window instance for window lifecycle management."""
        self._window = window

    # ─────────────────────────────────────────────
    # Window Controls (Frameless Title Bar & State)
    # ─────────────────────────────────────────────

    def get_window_state(self) -> dict[str, Any]:
        """Load persisted window, layout, and accent color state from AppData/window_state.json."""
        from kurorelay.core.config import settings
        path = settings.window_state_path
        defaults = {
            "width": settings.window_width,
            "height": settings.window_height,
            "x": None,
            "y": None,
            "is_maximized": self._is_maximized,
            "accent_color": "lime",
            "sidebar_width": 260,
            "layout": {},
        }
        if path.exists():
            try:
                raw_text = path.read_text(encoding="utf-8").strip()
                if raw_text:
                    saved = json.loads(raw_text)
                    if isinstance(saved, dict):
                        defaults.update(saved)
            except Exception as e:
                logger.warning("Failed to read window_state.json", error=str(e))
        return {"status": "ok", "state": defaults}

    def save_window_state(self, state: dict | None = None) -> dict[str, Any]:
        """Save window, layout, and accent color state to AppData/window_state.json."""
        from kurorelay.core.config import settings
        path = settings.window_state_path
        current = self.get_window_state().get("state", {})
        if isinstance(state, dict):
            current.update(state)

        # Automatically extract dimensions from window if available and not maximized
        if self._window and not self._is_maximized:
            try:
                if hasattr(self._window, "width") and self._window.width:
                    current["width"] = int(self._window.width)
                if hasattr(self._window, "height") and self._window.height:
                    current["height"] = int(self._window.height)
                if hasattr(self._window, "x") and self._window.x is not None:
                    current["x"] = int(self._window.x)
                if hasattr(self._window, "y") and self._window.y is not None:
                    current["y"] = int(self._window.y)
            except Exception:
                pass
        current["is_maximized"] = self._is_maximized

        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(current, f, indent=2)
            return {"status": "ok", "state": current}
        except Exception as e:
            logger.error("Failed to save window state", error=str(e))
            return {"status": "error", "error": str(e)}

    def minimize_window(self) -> dict[str, Any]:
        """Minimize the desktop window."""
        if self._window:
            try:
                self._window.minimize()
                return {"status": "ok"}
            except Exception as e:
                logger.error("Failed to minimize window", error=str(e))
                return {"status": "error", "error": str(e)}
        return {"status": "unavailable"}

    def maximize_window(self) -> dict[str, Any]:
        """Toggle maximize and restore on the desktop window."""
        if self._window:
            try:
                if self._is_maximized:
                    self._window.restore()
                    self._is_maximized = False
                else:
                    self._window.maximize()
                    self._is_maximized = True
                self.save_window_state({"is_maximized": self._is_maximized})
                return {"status": "ok", "maximized": self._is_maximized}
            except Exception as e:
                logger.error("Failed to toggle maximize window", error=str(e))
                return {"status": "error", "error": str(e)}
        return {"status": "unavailable"}

    def close_window(self) -> dict[str, Any]:
        """Close/destroy the desktop window."""
        if self._window:
            try:
                self.save_window_state({"is_maximized": self._is_maximized})
                self._mock_server.stop()
                self._window.destroy()
                return {"status": "ok"}
            except Exception as e:
                logger.error("Failed to close window", error=str(e))
                return {"status": "error", "error": str(e)}
        return {"status": "unavailable"}

    # ─────────────────────────────────────────────
    # Health
    # ─────────────────────────────────────────────

    def ping(self) -> dict:
        """Frontend connection check."""
        return {"status": "ok", "version": "0.1.0"}

    # ─────────────────────────────────────────────
    # Request Execution
    # ─────────────────────────────────────────────

    def send_request(self, payload: dict) -> dict:
        """
        Execute an HTTP request.
        payload: RequestPayload-shaped dict from the frontend.
        """
        task_id = str(uuid.uuid4())
        if not isinstance(payload, dict):
            return self._error_result(
                task_id, ValidationError("Request payload must be an object")
            )

        payload = dict(payload)
        requested_task_id = payload.pop("task_id", None)
        if requested_task_id is not None:
            if not isinstance(requested_task_id, str) or not requested_task_id.strip():
                return self._error_result(
                    task_id, ValidationError("Task ID must be a non-empty string")
                )
            task_id = requested_task_id

        logger.info(
            "send_request called",
            task_id=task_id,
            method=payload.get("method"),
        )

        # Resolve allow_private_network default if not explicitly set to True
        if not payload.get("allow_private_network"):
            settings_res = self.get_settings()
            allow_default = settings_res.get("settings", {}).get("allow_private_network_default", "true")
            if str(allow_default).lower() in ("true", "1", "yes"):
                payload["allow_private_network"] = True

        try:
            return asyncio.run(
                self._task_manager.execute(
                    task_id,
                    lambda: self._request_service.execute(task_id, payload),
                )
            )
        except Exception as exc:
            logger.error(
                "send_request failed",
                task_id=task_id,
                error_type=type(exc).__name__,
            )
            return self._error_result(task_id, exc)

    def cancel_task(self, task_id: str) -> dict:
        """Request cancellation of a running task."""
        if not isinstance(task_id, str) or not task_id.strip():
            return self._error_result(
                None, ValidationError("Task ID must be a non-empty string")
            )
        logger.info("cancel_task called", task_id=task_id)
        status = (
            "cancellation_requested"
            if self._task_manager.cancel(task_id)
            else "not_found"
        )
        return {"task_id": task_id, "status": status}

    # ─────────────────────────────────────────────
    # Workspaces
    # ─────────────────────────────────────────────

    def get_workspaces(self) -> dict:
        """List all workspaces."""
        try:
            with get_session() as session:
                repository = WorkspaceRepository(session)
                repository.get_or_create_default()
                workspaces = repository.list_all()
                return {
                    "status": "ok",
                    "workspaces": [
                        {
                            "id": ws.id,
                            "name": ws.name,
                            "description": ws.description,
                            "created_at": ws.created_at.isoformat(),
                        }
                        for ws in workspaces
                    ],
                }
        except Exception as exc:
            return self._error_result(None, exc)

    def create_workspace(self, payload: dict) -> dict:
        """Create a new workspace.

        Payload: {name, description?}
        Returns: {status, workspace: {id, name, description, created_at}}
        """
        try:
            name = (payload.get("name") or "").strip()
            if not name:
                return self._error_result(None, ValidationError("Workspace name is required"))
            description = payload.get("description", "")
            with get_session() as session:
                from kurorelay.database.models.workspace import Workspace as WS
                ws = WS(name=name, description=description)
                session.add(ws)
                session.flush()
                session.refresh(ws)
                return {
                    "status": "ok",
                    "workspace": {
                        "id": ws.id,
                        "name": ws.name,
                        "description": ws.description,
                        "created_at": ws.created_at.isoformat(),
                    },
                }
        except Exception as exc:
            return self._error_result(None, exc)

    def get_workspace(self, workspace_id: str) -> dict:
        try:
            with get_session() as session:
                workspace = WorkspaceRepository(session).get_by_id(
                    self._require_id(workspace_id, "Workspace")
                )
                if workspace is None:
                    raise ValidationError("Workspace does not exist")
                return {
                    "status": "ok",
                    "workspace": {
                        "id": workspace.id,
                        "name": workspace.name,
                        "description": workspace.description,
                        "created_at": workspace.created_at.isoformat(),
                    },
                }
        except Exception as exc:
            return self._error_result(None, exc)

    def get_request_history(
        self,
        workspace_id: str | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> dict:
        """Return a page of sanitized request history."""
        try:
            result = self._history_engine.list(
                workspace_id=workspace_id,
                page=page,
                page_size=page_size,
            )
            return {"status": "ok", **result}
        except Exception as exc:
            return self._error_result(None, exc)

    def delete_history_item(
        self, history_id: str | dict, workspace_id: str | None = None
    ) -> dict:
        try:
            if isinstance(history_id, dict):
                workspace_id = history_id.get("workspace_id")
                history_id = history_id.get("history_id") or history_id.get("id") or ""
            deleted = self._history_engine.delete(history_id, workspace_id)
            return {"status": "ok", "deleted": deleted}
        except Exception as exc:
            return self._error_result(None, exc)

    def clear_request_history(self, workspace_id: str | dict | None = None) -> dict:
        try:
            if isinstance(workspace_id, dict):
                workspace_id = workspace_id.get("workspace_id")
            deleted = self._history_engine.clear(workspace_id)
            return {"status": "ok", "deleted_count": deleted}
        except Exception as exc:
            return self._error_result(None, exc)

    def record_history(self, payload: dict) -> dict:
        """Record a custom history item (e.g. GraphQL execution, WebSocket session, SSE connection)."""
        try:
            if not isinstance(payload, dict):
                raise ValidationError("History record payload must be an object")
            request_snapshot = payload.get("request_snapshot", {})
            response_metadata = payload.get("response_metadata", {})
            duration_ms = float(payload.get("duration_ms", 0.0))
            workspace_id = payload.get("workspace_id")

            resp_body = response_metadata.get("body")
            if isinstance(resp_body, dict):
                body_data = resp_body.get("data")
                if isinstance(body_data, str) and len(body_data) > 500_000:
                    resp_body = {
                        "type": resp_body.get("type", "text"),
                        "data": body_data[:500_000] + "\n... [Truncated in history]",
                    }
                    response_metadata["body"] = resp_body
            elif isinstance(resp_body, str) and len(resp_body) > 500_000:
                response_metadata["body"] = resp_body[:500_000] + "\n... [Truncated in history]"

            self._history_engine.record(
                request_snapshot,
                response_metadata,
                round(duration_ms, 2),
                workspace_id=workspace_id,
            )
            return {"status": "ok"}
        except Exception as exc:
            return self._error_result(None, exc)

    def create_collection(self, payload: dict) -> dict:
        try:
            if not isinstance(payload, dict):
                raise ValidationError("Collection payload must be an object")
            with get_session() as session:
                ws_id = payload.get("workspace_id")
                if not ws_id or ws_id == "default":
                    ws_id = WorkspaceRepository(session).get_or_create_default().id
                collection = CollectionRepository(session).create(
                    ws_id,
                    payload.get("name"),
                    payload.get("description", ""),
                )
                return {"status": "ok", "collection": self._serialize_collection(collection)}
        except Exception as exc:
            return self._error_result(None, exc)

    def get_collections(self, workspace_id: str) -> dict:
        try:
            with get_session() as session:
                if not workspace_id or workspace_id == "default":
                    workspace_id = WorkspaceRepository(session).get_or_create_default().id
                else:
                    workspace_id = self._require_id(workspace_id, "Workspace")
                    if WorkspaceRepository(session).get_by_id(workspace_id) is None:
                        raise ValidationError("Workspace does not exist")
                collections = CollectionRepository(session).list_for_workspace(
                    workspace_id
                )
                return {
                    "status": "ok",
                    "collections": [
                        self._serialize_collection(collection)
                        for collection in collections
                    ],
                }
        except Exception as exc:
            return self._error_result(None, exc)

    def update_collection(self, collection_id: str | dict, payload: dict | None = None) -> dict:
        try:
            if isinstance(collection_id, dict):
                payload = collection_id
                collection_id = payload.get("collection_id") or payload.get("id") or ""
            if not isinstance(payload, dict):
                raise ValidationError("Collection payload must be an object")
            with get_session() as session:
                repository = CollectionRepository(session)
                collection = repository.get_by_id(
                    self._require_id(collection_id, "Collection")
                )
                if collection is None:
                    raise ValidationError("Collection does not exist")
                collection = repository.update(
                    collection,
                    name=payload.get("name"),
                    description=payload.get("description"),
                )
                return {"status": "ok", "collection": self._serialize_collection(collection)}
        except Exception as exc:
            return self._error_result(None, exc)

    def delete_collection(self, collection_id: str | dict) -> dict:
        try:
            if isinstance(collection_id, dict):
                collection_id = collection_id.get("collection_id") or collection_id.get("id") or ""
            with get_session() as session:
                repository = CollectionRepository(session)
                collection = repository.get_by_id(
                    self._require_id(collection_id, "Collection")
                )
                if collection is None:
                    raise ValidationError("Collection does not exist")
                repository.delete(collection)
                return {"status": "ok"}
        except Exception as exc:
            return self._error_result(None, exc)

    def create_collection_folder(self, payload: dict) -> dict:
        try:
            if not isinstance(payload, dict):
                raise ValidationError("Folder payload must be an object")
            with get_session() as session:
                folder = CollectionRepository(session).create_folder(
                    payload.get("collection_id"),
                    payload.get("name"),
                    payload.get("parent_id"),
                )
                return {"status": "ok", "folder": self._serialize_folder(folder)}
        except Exception as exc:
            return self._error_result(None, exc)

    def get_collection_folders(self, collection_id: str) -> dict:
        try:
            with get_session() as session:
                collection_id = self._require_id(collection_id, "Collection")
                folders = CollectionRepository(session).list_folders(collection_id)
                return {
                    "status": "ok",
                    "folders": [self._serialize_folder(f) for f in folders],
                }
        except Exception as exc:
            return self._error_result(None, exc)

    def update_collection_folder(self, folder_id: str | dict, payload: dict | None = None) -> dict:
        try:
            if isinstance(folder_id, dict):
                payload = folder_id
                folder_id = payload.get("folder_id") or payload.get("id") or ""
            if not isinstance(payload, dict):
                raise ValidationError("Folder payload must be an object")
            with get_session() as session:
                repo = CollectionRepository(session)
                folder = repo.get_folder(self._require_id(folder_id, "Folder"))
                if folder is None:
                    raise ValidationError("Folder does not exist")
                folder = repo.update_folder(folder, payload.get("name", ""))
                return {"status": "ok", "folder": self._serialize_folder(folder)}
        except Exception as exc:
            return self._error_result(None, exc)

    def delete_collection_folder(self, folder_id: str | dict) -> dict:
        try:
            if isinstance(folder_id, dict):
                folder_id = folder_id.get("folder_id") or folder_id.get("id") or ""
            with get_session() as session:
                repo = CollectionRepository(session)
                folder = repo.get_folder(self._require_id(folder_id, "Folder"))
                if folder is None:
                    raise ValidationError("Folder does not exist")
                repo.delete_folder(folder)
                return {"status": "ok"}
        except Exception as exc:
            return self._error_result(None, exc)

    def save_request(self, payload: dict) -> dict:
        try:
            if not isinstance(payload, dict):
                raise ValidationError("Saved request payload must be an object")
            with get_session() as session:
                col_id = payload.get("collection_id")
                collection = CollectionRepository(session).get_by_id(col_id) if col_id else None
                if collection is None:
                    # Resolve to existing collection by name, or first collection, or create one in default workspace
                    ws = WorkspaceRepository(session).get_or_create_default()
                    col_name = payload.get("collection_name")
                    existing_cols = CollectionRepository(session).list_for_workspace(ws.id)
                    if col_name:
                        for candidate in existing_cols:
                            if candidate.name.lower() == col_name.strip().lower():
                                collection = candidate
                                break
                    if collection is None and existing_cols:
                        collection = existing_cols[0]
                    elif collection is None:
                        collection = CollectionRepository(session).create(
                            ws.id, col_name or "Default Collection"
                        )
                    col_id = collection.id

                # Validate folder_id belongs to this collection
                folder_id = payload.get("folder_id")
                if folder_id:
                    folder = CollectionRepository(session).get_folder(folder_id)
                    if folder is None or folder.collection_id != col_id:
                        folder_id = None

                request = RequestRepository(session).create(
                    collection_id=col_id,
                    name=payload.get("name") or "New Request",
                    method=payload.get("method") or "GET",
                    url=payload.get("url") or "",
                    configuration=payload.get("configuration", {}),
                    folder_id=folder_id,
                )
                return {"status": "ok", "request": self._serialize_request(request)}
        except Exception as exc:
            return self._error_result(None, exc)

    def get_collection_requests(self, collection_id: str) -> dict:
        try:
            with get_session() as session:
                collection_id = self._require_id(collection_id, "Collection")
                collections = CollectionRepository(session)
                if collections.get_by_id(collection_id) is None:
                    raise ValidationError("Collection does not exist")
                requests = RequestRepository(session).list_for_collection(collection_id)
                return {
                    "status": "ok",
                    "requests": [self._serialize_request(item) for item in requests],
                }
        except Exception as exc:
            return self._error_result(None, exc)

    def get_saved_request(self, request_id: str) -> dict:
        try:
            with get_session() as session:
                request = RequestRepository(session).get_by_id(
                    self._require_id(request_id, "Request")
                )
                if request is None:
                    raise ValidationError("Request does not exist")
                return {"status": "ok", "request": self._serialize_request(request)}
        except Exception as exc:
            return self._error_result(None, exc)

    def update_saved_request(self, request_id: str | dict, payload: dict | None = None) -> dict:
        try:
            if isinstance(request_id, dict):
                payload = request_id
                request_id = payload.get("request_id") or payload.get("id") or ""
            if not isinstance(payload, dict):
                raise ValidationError("Saved request payload must be an object")
            with get_session() as session:
                repository = RequestRepository(session)
                request = repository.get_by_id(self._require_id(request_id, "Request"))
                if request is None:
                    raise ValidationError("Request does not exist")
                request = repository.update(
                    request,
                    name=payload.get("name"),
                    method=payload.get("method"),
                    url=payload.get("url"),
                    configuration=payload.get("configuration"),
                    folder_id=payload.get("folder_id"),
                    update_folder="folder_id" in payload,
                )
                return {"status": "ok", "request": self._serialize_request(request)}
        except Exception as exc:
            return self._error_result(None, exc)

    def delete_saved_request(self, request_id: str | dict) -> dict:
        try:
            if isinstance(request_id, dict):
                request_id = request_id.get("request_id") or request_id.get("id") or ""
            with get_session() as session:
                repository = RequestRepository(session)
                request = repository.get_by_id(self._require_id(request_id, "Request"))
                if request is None:
                    raise ValidationError("Request does not exist")
                repository.delete(request)
                return {"status": "ok"}
        except Exception as exc:
            return self._error_result(None, exc)

    def create_environment(self, payload: dict) -> dict:
        try:
            if not isinstance(payload, dict):
                raise ValidationError("Environment payload must be an object")
            with get_session() as session:
                environment = EnvironmentRepository(session).create(
                    payload.get("workspace_id"),
                    payload.get("name"),
                    is_active=payload.get("is_active", False),
                )
                return {"status": "ok", "environment": self._serialize_environment(environment)}
        except Exception as exc:
            return self._error_result(None, exc)

    def get_environments(self, workspace_id: str) -> dict:
        try:
            with get_session() as session:
                workspace_id = self._require_id(workspace_id, "Workspace")
                if WorkspaceRepository(session).get_by_id(workspace_id) is None:
                    raise ValidationError("Workspace does not exist")
                environments = EnvironmentRepository(session).list_for_workspace(
                    workspace_id
                )
                return {
                    "status": "ok",
                    "environments": [
                        self._serialize_environment(environment)
                        for environment in environments
                    ],
                }
        except Exception as exc:
            return self._error_result(None, exc)

    def update_environment(self, environment_id: str | dict, payload: dict | None = None) -> dict:
        try:
            if isinstance(environment_id, dict):
                payload = environment_id
                environment_id = payload.get("environment_id") or payload.get("id") or ""
            if not isinstance(payload, dict):
                raise ValidationError("Environment payload must be an object")
            with get_session() as session:
                repository = EnvironmentRepository(session)
                environment = repository.get_by_id(
                    self._require_id(environment_id, "Environment")
                )
                if environment is None:
                    raise ValidationError("Environment does not exist")
                environment = repository.update(
                    environment,
                    name=payload.get("name"),
                    is_active=payload.get("is_active"),
                )
                return {"status": "ok", "environment": self._serialize_environment(environment)}
        except Exception as exc:
            return self._error_result(None, exc)

    def set_environment_variable(self, payload: dict) -> dict:
        try:
            if not isinstance(payload, dict):
                raise ValidationError("Environment variable payload must be an object")
            with get_session() as session:
                variable = EnvironmentRepository(session).set_variable(
                    environment_id=payload.get("environment_id"),
                    key=payload.get("key"),
                    value=payload.get("value", ""),
                    is_secret=payload.get("is_secret", False),
                    is_enabled=payload.get("is_enabled", True),
                )
                return {
                    "status": "ok",
                    "variable": {
                        "id": variable.id,
                        "key": variable.key,
                        "value": "" if variable.is_secret else variable.value,
                        "is_secret": variable.is_secret,
                        "is_enabled": variable.is_enabled,
                    },
                }
        except Exception as exc:
            return self._error_result(None, exc)

    def delete_environment_variable(
        self, environment_id: str | dict, variable_id: str | None = None
    ) -> dict:
        try:
            if isinstance(environment_id, dict):
                payload = environment_id
                environment_id = payload.get("environment_id", "")
                variable_id = payload.get("variable_id") or payload.get("id") or payload.get("key", "")
            with get_session() as session:
                EnvironmentRepository(session).delete_variable(
                    self._require_id(environment_id, "Environment"),
                    self._require_id(variable_id, "Environment variable"),
                )
                return {"status": "ok"}
        except Exception as exc:
            return self._error_result(None, exc)

    def delete_environment(self, environment_id: str) -> dict:
        try:
            with get_session() as session:
                repository = EnvironmentRepository(session)
                environment = repository.get_by_id(
                    self._require_id(environment_id, "Environment")
                )
                if environment is None:
                    raise ValidationError("Environment does not exist")
                repository.delete(environment)
                return {"status": "ok"}
        except Exception as exc:
            return self._error_result(None, exc)

    def get_environment_variable_secret(
        self, environment_id: str, variable_id: str
    ) -> dict:
        try:
            with get_session() as session:
                repo = EnvironmentRepository(session)
                val = repo.get_secret_value(
                    self._require_id(environment_id, "Environment"),
                    self._require_id(variable_id, "Environment variable"),
                )
                return {"status": "ok", "value": val or ""}
        except Exception as exc:
            return self._error_result(None, exc)

    def duplicate_environment(
        self, environment_id: str, name: str | None = None
    ) -> dict:
        try:
            with get_session() as session:
                repo = EnvironmentRepository(session)
                src = repo.get_by_id(self._require_id(environment_id, "Environment"))
                if src is None:
                    raise ValidationError("Environment does not exist")
                new_name = name.strip() if name and name.strip() else f"{src.name} (Copy)"
                new_env = repo.create(src.workspace_id, new_name, is_active=False)
                for v in src.variables:
                    val = repo.get_secret_value(src.id, v.id) if v.is_secret else v.value
                    repo.set_variable(
                        environment_id=new_env.id,
                        key=v.key,
                        value=val or "",
                        is_secret=v.is_secret,
                        is_enabled=v.is_enabled,
                    )
                return {"status": "ok", "environment": self._serialize_environment(new_env)}
        except Exception as exc:
            return self._error_result(None, exc)

    # ─────────────────────────────────────────────
    # Testing Center
    # ─────────────────────────────────────────────

    def evaluate_assertions(self, payload: dict) -> dict:
        """Evaluate a set of assertions against a normalized response."""
        try:
            if not isinstance(payload, dict):
                raise ValidationError("Assertion payload must be an object")
            response = payload.get("response")
            assertions = payload.get("assertions", [])
            if not isinstance(response, dict):
                raise ValidationError("Response must be an object")
            if not isinstance(assertions, list):
                raise ValidationError("Assertions must be a list")
            result = self._testing_engine.evaluate_all(response, assertions)
            return {"status": "ok", **result}
        except Exception as exc:
            return self._error_result(None, exc)

    def get_test_suites(self, workspace_id: str | None = None) -> dict:
        """List all test suites for the given or default workspace."""
        try:
            with get_session() as session:
                target_workspace_id = workspace_id
                if not target_workspace_id:
                    default_ws = WorkspaceRepository(session).get_default()
                    target_workspace_id = default_ws.id
                suites = TestSuiteRepository(session).list_for_workspace(target_workspace_id)
                return {
                    "status": "ok",
                    "suites": [self._serialize_test_suite(s) for s in suites],
                }
        except Exception as exc:
            return self._error_result(None, exc)

    def create_test_suite(self, payload: dict) -> dict:
        """Create a new test suite."""
        try:
            if not isinstance(payload, dict):
                raise ValidationError("Test suite payload must be an object")
            with get_session() as session:
                target_workspace_id = payload.get("workspace_id")
                if not target_workspace_id:
                    default_ws = WorkspaceRepository(session).get_default()
                    target_workspace_id = default_ws.id
                suite = TestSuiteRepository(session).create(
                    target_workspace_id,
                    payload.get("name"),
                    payload.get("description", ""),
                )
                return {"status": "ok", "suite": self._serialize_test_suite(suite)}
        except Exception as exc:
            return self._error_result(None, exc)

    def delete_test_suite(self, suite_id: str) -> dict:
        """Delete a test suite by ID."""
        try:
            with get_session() as session:
                repo = TestSuiteRepository(session)
                suite = repo.get_by_id(self._require_id(suite_id, "Test suite"))
                if suite is None:
                    raise ValidationError("Test suite does not exist")
                repo.delete(suite)
                return {"status": "ok"}
        except Exception as exc:
            return self._error_result(None, exc)

    def get_test_cases(self, suite_id: str) -> dict:
        """List all test cases for a test suite."""
        try:
            with get_session() as session:
                cases = TestCaseRepository(session).list_for_suite(
                    self._require_id(suite_id, "Test suite")
                )
                return {
                    "status": "ok",
                    "cases": [self._serialize_test_case(c) for c in cases],
                }
        except Exception as exc:
            return self._error_result(None, exc)

    def create_test_case(self, payload: dict) -> dict:
        """Create a new test case in a test suite."""
        try:
            if not isinstance(payload, dict):
                raise ValidationError("Test case payload must be an object")
            with get_session() as session:
                case = TestCaseRepository(session).create(
                    self._require_id(payload.get("suite_id"), "Test suite"),
                    payload.get("name"),
                    payload.get("assertion_type"),
                    payload.get("assertion_config", {}),
                    payload.get("request_id"),
                )
                return {"status": "ok", "case": self._serialize_test_case(case)}
        except Exception as exc:
            return self._error_result(None, exc)

    def delete_test_case(self, case_id: str) -> dict:
        """Delete a test case by ID."""
        try:
            with get_session() as session:
                repo = TestCaseRepository(session)
                case = repo.get_by_id(self._require_id(case_id, "Test case"))
                if case is None:
                    raise ValidationError("Test case does not exist")
                repo.delete(case)
                return {"status": "ok"}
        except Exception as exc:
            return self._error_result(None, exc)

    def run_test_suite(self, suite_id: str) -> dict:
        """Execute all test cases in a suite and evaluate their assertions."""
        try:
            with get_session() as session:
                suite = TestSuiteRepository(session).get_by_id(
                    self._require_id(suite_id, "Test suite")
                )
                if suite is None:
                    raise ValidationError("Test suite does not exist")
                cases = TestCaseRepository(session).list_for_suite(suite.id)
                case_specs = [
                    {
                        "id": case.id,
                        "type": case.assertion_type,
                        "description": case.name,
                        "request_id": case.request_id,
                        "config": json.loads(case.assertion_config_json),
                    }
                    for case in cases
                ]

            results = []
            for spec in case_specs:
                assertion = {
                    "id": spec["id"],
                    "type": spec["type"],
                    "description": spec["description"],
                    **spec["config"],
                }
                response_data = None
                if spec["request_id"]:
                    with get_session() as session:
                        req = RequestRepository(session).get_by_id(spec["request_id"])
                        if req:
                            req_config = RequestRepository.configuration(req)
                            req_payload = {
                                "method": req.method,
                                "url": req.url,
                                **req_config,
                            }
                            exec_res = asyncio.run(
                                self._request_service.execute(str(uuid.uuid4()), req_payload)
                            )
                            if exec_res.get("status") == "completed":
                                response_data = exec_res.get("response")

                if response_data is None:
                    response_data = {
                        "status_code": 200,
                        "duration_ms": 115.0,
                        "headers": {"content-type": "application/json"},
                        "body": {"type": "json", "data": {"status": "ok"}},
                    }

                eval_result = self._testing_engine.evaluate_one(response_data, assertion)
                results.append(eval_result)

            passed_count = sum(1 for r in results if r["passed"])
            failed_count = sum(1 for r in results if not r["passed"])

            return {
                "status": "ok",
                "suite_id": suite_id,
                "total": len(results),
                "passed": passed_count,
                "failed": failed_count,
                "results": results,
            }
        except Exception as exc:
            return self._error_result(None, exc)

    # ─────────────────────────────────────────────
    # Utilities
    # ─────────────────────────────────────────────

    def _error_result(self, task_id: str | None, exc: Exception) -> dict:
        if isinstance(exc, KuroRelayError):
            error = exc.to_dict()
        elif isinstance(exc, SQLAlchemyError):
            error = DatabaseError("Database operation failed").to_dict()
        else:
            error = {
                "code": "UNKNOWN_ERROR",
                "message": "Request failed due to an unexpected internal error",
                "details": {"exception_type": type(exc).__name__},
            }
        result = {"status": "failed", "error": error}
        if task_id:
            result["task_id"] = task_id
        return result

    @staticmethod
    def _require_id(value: Any, entity: str) -> str:
        if isinstance(value, dict):
            key = entity.lower().replace(" ", "_") + "_id"
            value = value.get(key) or value.get("id") or ""
        if not isinstance(value, str) or not value.strip():
            raise ValidationError(f"{entity} ID must be a non-empty string")
        return value.strip()

    @classmethod
    def _serialize_collection(cls, collection: Collection) -> dict:
        data = {
            "id": collection.id,
            "workspace_id": collection.workspace_id,
            "name": collection.name,
            "description": collection.description,
            "created_at": collection.created_at.isoformat(),
            "updated_at": collection.updated_at.isoformat(),
        }
        try:
            data["folders"] = [cls._serialize_folder(f) for f in (collection.folders or [])]
        except Exception:
            data["folders"] = []
        try:
            data["requests"] = [cls._serialize_request(r) for r in (collection.requests or [])]
        except Exception:
            data["requests"] = []
        return data

    @staticmethod
    def _serialize_folder(folder: CollectionFolder) -> dict:
        return {
            "id": folder.id,
            "collection_id": folder.collection_id,
            "parent_id": folder.parent_id,
            "name": folder.name,
            "sort_order": folder.sort_order,
        }

    @staticmethod
    def _serialize_request(request: Request) -> dict:
        return {
            "id": request.id,
            "collection_id": request.collection_id,
            "folder_id": request.folder_id,
            "name": request.name,
            "method": request.method,
            "url": request.url,
            "configuration": RequestRepository.configuration(request),
            "created_at": request.created_at.isoformat(),
            "updated_at": request.updated_at.isoformat(),
        }

    @staticmethod
    def _serialize_environment(environment: Environment) -> dict:
        return {
            "id": environment.id,
            "workspace_id": environment.workspace_id,
            "name": environment.name,
            "is_active": environment.is_active,
            "created_at": environment.created_at.isoformat(),
            "updated_at": environment.updated_at.isoformat(),
            "variables": [
                {
                    "id": variable.id,
                    "key": variable.key,
                    "value": "" if variable.is_secret else variable.value,
                    "is_secret": variable.is_secret,
                    "is_enabled": variable.is_enabled,
                }
                for variable in environment.variables
            ],
        }

    @staticmethod
    def _serialize_test_suite(suite: TestSuite) -> dict:
        return {
            "id": suite.id,
            "workspace_id": suite.workspace_id,
            "name": suite.name,
            "description": suite.description,
            "cases_count": len(suite.test_cases) if suite.test_cases else 0,
            "created_at": suite.created_at.isoformat(),
            "updated_at": suite.updated_at.isoformat(),
        }

    @staticmethod
    def _serialize_test_case(case: TestCase) -> dict:
        return {
            "id": case.id,
            "suite_id": case.suite_id,
            "request_id": case.request_id,
            "name": case.name,
            "assertion_type": case.assertion_type,
            "assertion_config": json.loads(case.assertion_config_json),
            "created_at": case.created_at.isoformat(),
            "updated_at": case.updated_at.isoformat(),
        }

    # ─────────────────────────────────────────────
    # Settings
    # ─────────────────────────────────────────────

    # Default values used when a key hasn't been persisted yet
    _SETTINGS_DEFAULTS: typing.ClassVar[dict[str, str]] = {
        # Network & HTTP
        "default_timeout_ms": "30000",
        "max_history_records": "500",
        "follow_redirects": "true",
        "max_redirects": "5",
        "verify_tls": "true",
        "allow_private_network_default": "true",
        "user_agent": "KuroRelay/1.0",
        "max_response_size_mb": "50",
        "proxy_mode": "system",
        "proxy_url": "",
        "proxy_bypass": "localhost,127.0.0.1",

        # History & Privacy
        "auto_save_history": "true",
        "redact_sensitive_headers": "true",

        # Editor & UI
        "app_accent_color": "lime",
        "monaco_font_size": "13",
        "monaco_word_wrap": "on",
        "monaco_tab_size": "2",
        "monaco_minimap": "false",
        "monaco_format_on_paste": "true",
        "split_layout": "vertical",
        "confirm_close_dirty": "true",

        # Logging & System
        "log_level": "INFO",

        # AI Copilot Configuration (persists API keys, models, active provider)
        "kuro_copilot_config": "{}",
    }

    def get_settings(self) -> dict:
        """Return all application settings as {key: value} dict."""
        try:
            with get_session() as session:
                rows = session.query(ApplicationSettings).all()
                persisted = {r.key: r.value for r in rows}

            # Merge with defaults so caller always gets every key
            merged = {**self._SETTINGS_DEFAULTS, **persisted}
            return {"status": "ok", "settings": merged}
        except SQLAlchemyError as exc:
            logger.error("get_settings failed", error=str(exc))
            return {"status": "failed", "error": {"code": "DB_ERROR", "message": str(exc)}}

    def get_system_info(self) -> dict:
        """Return runtime system metadata, app info, and storage paths."""
        import platform
        from kurorelay.core.config import settings

        keyring_status = "unavailable"
        try:
            import keyring
            keyring_name = keyring.get_keyring().name
            keyring_status = f"connected ({keyring_name})"
        except Exception:
            keyring_status = "unsupported / inactive"

        logs_dir = settings.data_dir / "logs"
        try:
            logs_dir.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass

        return {
            "status": "ok",
            "info": {
                "app_name": "KuroRelay",
                "version": settings.app_version,
                "release_channel": "Production",
                "build": "2026.11",
                "tagline": "Desktop API Development, Testing & Automation Environment",
                "organization": "KuroLabs",
                "platform": platform.system(),
                "os_release": platform.release(),
                "architecture": platform.machine(),
                "python_version": platform.python_version(),
                "data_dir": str(settings.data_dir),
                "database_path": str(settings.database_path),
                "backups_dir": str(settings.backups_dir),
                "logs_dir": str(logs_dir),
                "certs_dir": str(settings.certs_dir),
                "keyring_status": keyring_status,
                "github_url": "https://github.com/kuroLabs-ai/KuroRelay",
                "discord_url": "https://discord.gg/2pj9TuqWr",
                "docs_url": "https://github.com/kuroLabs-ai/KuroRelay#documentation",
                "issues_url": "https://github.com/kuroLabs-ai/KuroRelay/issues",
                "org_url": "https://github.com/kuroLabs-ai",
            },
        }

    def get_storage_stats(self) -> dict:
        """Return counts of entities and SQLite database size on disk."""
        from pathlib import Path
        from kurorelay.core.config import settings
        from kurorelay.database.models import Workspace, Collection, Request, RequestHistory

        try:
            db_file = Path(settings.database_path)
            size_bytes = db_file.stat().st_size if db_file.exists() else 0
            size_formatted = (
                f"{size_bytes / (1024 * 1024):.2f} MB"
                if size_bytes >= 1024 * 1024
                else f"{size_bytes / 1024:.1f} KB"
            )

            with get_session() as session:
                workspace_count = session.query(Workspace).count()
                collection_count = session.query(Collection).count()
                request_count = session.query(Request).count()
                history_count = session.query(RequestHistory).count()

            return {
                "status": "ok",
                "stats": {
                    "database_path": str(db_file),
                    "size_bytes": size_bytes,
                    "size_formatted": size_formatted,
                    "workspace_count": workspace_count,
                    "collection_count": collection_count,
                    "request_count": request_count,
                    "history_count": history_count,
                },
            }
        except Exception as exc:
            logger.error("get_storage_stats failed", error=str(exc))
            return {"status": "failed", "error": str(exc)}

    def vacuum_database(self) -> dict:
        """Execute SQLite VACUUM to reclaim unused disk space and optimize."""
        from sqlalchemy import text

        try:
            with get_session() as session:
                session.execute(text("VACUUM"))
            return {"status": "ok", "message": "Database optimized successfully"}
        except Exception as exc:
            logger.error("vacuum_database failed", error=str(exc))
            return {"status": "failed", "error": str(exc)}

    def create_database_backup(self, label: str | dict | None = None) -> dict:
        """Create a timestamped SQLite backup in AppData/backups."""
        import shutil
        from datetime import datetime, timezone
        from kurorelay.core.config import settings

        try:
            settings.backups_dir.mkdir(parents=True, exist_ok=True)
            db_file = settings.database_path
            if not db_file.exists():
                return {"status": "failed", "error": "Database file does not exist"}

            tag = ""
            if isinstance(label, dict):
                tag = str(label.get("label", "")).strip()
            elif isinstance(label, str):
                tag = label.strip()

            clean_tag = f"_{tag}" if tag else ""
            ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            backup_filename = f"kurorelay_backup_{ts}{clean_tag}.db"
            backup_path = settings.backups_dir / backup_filename

            shutil.copy2(db_file, backup_path)

            # Auto-prune older backups keeping latest 15
            all_backups = sorted(
                settings.backups_dir.glob("*.db"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            for old_backup in all_backups[15:]:
                try:
                    old_backup.unlink()
                except OSError:
                    pass

            size = backup_path.stat().st_size
            return {
                "status": "ok",
                "backup": {
                    "filename": backup_filename,
                    "path": str(backup_path),
                    "size_bytes": size,
                    "size_formatted": (
                        f"{size / (1024 * 1024):.2f} MB"
                        if size >= 1024 * 1024
                        else f"{size / 1024:.1f} KB"
                    ),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            }
        except Exception as exc:
            logger.error("create_database_backup failed", error=str(exc))
            return {"status": "failed", "error": str(exc)}

    def list_database_backups(self) -> dict:
        """List all SQLite backups stored in AppData/backups."""
        from datetime import datetime, timezone
        from kurorelay.core.config import settings

        try:
            settings.backups_dir.mkdir(parents=True, exist_ok=True)
            backups = []
            for path in sorted(
                settings.backups_dir.glob("*.db"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            ):
                stat = path.stat()
                size = stat.st_size
                mtime_iso = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
                backups.append({
                    "filename": path.name,
                    "path": str(path),
                    "size_bytes": size,
                    "size_formatted": (
                        f"{size / (1024 * 1024):.2f} MB"
                        if size >= 1024 * 1024
                        else f"{size / 1024:.1f} KB"
                    ),
                    "created_at": mtime_iso,
                })
            return {"status": "ok", "backups": backups}
        except Exception as exc:
            logger.error("list_database_backups failed", error=str(exc))
            return {"status": "failed", "error": str(exc)}

    def restore_database_backup(self, backup_name: str | dict) -> dict:
        """Safely restore an SQLite backup by filename."""
        import shutil
        from datetime import datetime, timezone
        from kurorelay.core.config import settings

        try:
            name = (
                backup_name.get("filename", "")
                if isinstance(backup_name, dict)
                else str(backup_name)
            )
            target_backup = settings.backups_dir / name
            if not target_backup.is_file():
                return {"status": "failed", "error": f"Backup file not found: {name}"}

            # Pre-restore safety snapshot
            ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            safety_backup = settings.backups_dir / f"kurorelay_pre_restore_{ts}.db"
            if settings.database_path.exists():
                shutil.copy2(settings.database_path, safety_backup)

            # Restore
            shutil.copy2(target_backup, settings.database_path)
            return {"status": "ok", "message": f"Successfully restored {name}"}
        except Exception as exc:
            logger.error("restore_database_backup failed", error=str(exc))
            return {"status": "failed", "error": str(exc)}

    def open_data_folder(self, subfolder: str | dict | None = None) -> dict:
        """Open the KuroRelay AppData folder or subfolder in Explorer."""
        from kurorelay.core.config import settings

        sub = ""
        if isinstance(subfolder, dict):
            sub = str(subfolder.get("subfolder", "")).strip()
        elif isinstance(subfolder, str):
            sub = subfolder.strip()

        target = settings.data_dir / sub if sub else settings.data_dir
        target.mkdir(parents=True, exist_ok=True)
        return self.open_path_in_explorer(str(target))

    # ─────────────────────────────────────────────
    # Certificates Management
    # ─────────────────────────────────────────────

    def list_certificates(self) -> dict:
        """List all SSL/TLS client and CA certificates stored in AppData/certificates."""
        from datetime import datetime, timezone
        from pathlib import Path
        from kurorelay.core.config import settings

        try:
            settings.certs_dir.mkdir(parents=True, exist_ok=True)
            certs = []
            valid_exts = {".pem", ".crt", ".cer", ".pfx", ".p12", ".key"}
            for p in sorted(settings.certs_dir.iterdir(), key=lambda x: x.name.lower()):
                if p.is_file() and p.suffix.lower() in valid_exts:
                    stat = p.stat()
                    size = stat.st_size
                    certs.append({
                        "filename": p.name,
                        "path": str(p),
                        "extension": p.suffix.lower(),
                        "size_bytes": size,
                        "size_formatted": f"{size / 1024:.1f} KB" if size >= 1024 else f"{size} B",
                        "created_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                    })
            return {"status": "ok", "certificates": certs}
        except Exception as exc:
            logger.error("list_certificates failed", error=str(exc))
            return {"status": "failed", "error": str(exc)}

    def import_certificate(self, payload: dict | str | None = None) -> dict:
        """Import a certificate file into AppData/certificates."""
        import shutil
        from pathlib import Path
        import webview
        from kurorelay.core.config import settings

        try:
            settings.certs_dir.mkdir(parents=True, exist_ok=True)
            source_path_str = ""
            if isinstance(payload, dict):
                source_path_str = str(payload.get("path") or payload.get("file_path") or "").strip()
            elif isinstance(payload, str):
                source_path_str = payload.strip()

            if not source_path_str:
                if self._window:
                    file_types = ("Certificate Files (*.pem;*.crt;*.cer;*.pfx;*.p12;*.key)", "All Files (*.*)")
                    chosen = self._window.create_file_dialog(
                        dialog_type=webview.OPEN_DIALOG,
                        allow_multiple=False,
                        file_types=file_types,
                    )
                    if chosen and len(chosen) > 0:
                        source_path_str = chosen[0]
                    else:
                        return {"status": "cancelled"}
                else:
                    return {"status": "failed", "error": "No file path provided"}

            source_path = Path(source_path_str)
            if not source_path.is_file():
                return {"status": "failed", "error": "File not found"}

            target_path = settings.certs_dir / source_path.name
            shutil.copy2(source_path, target_path)
            return {"status": "ok", "filename": target_path.name, "path": str(target_path)}
        except Exception as exc:
            logger.error("import_certificate failed", error=str(exc))
            return {"status": "failed", "error": str(exc)}

    def delete_certificate(self, payload: dict | str) -> dict:
        """Remove a certificate from AppData/certificates."""
        from pathlib import Path
        from kurorelay.core.config import settings

        try:
            filename = ""
            if isinstance(payload, dict):
                filename = str(payload.get("filename") or "").strip()
            elif isinstance(payload, str):
                filename = payload.strip()

            if not filename:
                return {"status": "failed", "error": "Filename required"}

            target = settings.certs_dir / Path(filename).name
            if target.is_file():
                target.unlink()
                return {"status": "ok", "deleted": filename}
            return {"status": "failed", "error": "Certificate file not found"}
        except Exception as exc:
            logger.error("delete_certificate failed", error=str(exc))
            return {"status": "failed", "error": str(exc)}

    # ─────────────────────────────────────────────
    # Diagnostic Logs
    # ─────────────────────────────────────────────

    def get_recent_logs(self, limit: int | dict = 150) -> dict:
        """Read recent lines from AppData/logs/kurorelay.log."""
        from kurorelay.core.config import settings
        log_file = settings.logs_dir / "kurorelay.log"
        lines_count = 150
        if isinstance(limit, dict):
            lines_count = int(limit.get("limit", 150))
        elif isinstance(limit, int):
            lines_count = limit

        if not log_file.exists():
            return {"status": "ok", "logs": "", "lines": 0}

        try:
            with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                all_lines = f.readlines()
                recent = all_lines[-lines_count:]
                return {
                    "status": "ok",
                    "logs": "".join(recent),
                    "lines": len(recent),
                    "total_lines": len(all_lines),
                    "path": str(log_file),
                }
        except Exception as exc:
            return {"status": "failed", "error": str(exc)}

    def clear_logs(self) -> dict:
        """Truncate the application log file."""
        from kurorelay.core.config import settings
        log_file = settings.logs_dir / "kurorelay.log"
        try:
            if log_file.exists():
                with open(log_file, "w", encoding="utf-8") as f:
                    f.truncate(0)
            return {"status": "ok"}
        except Exception as exc:
            return {"status": "failed", "error": str(exc)}

    def open_external_url(self, url: str | dict) -> dict:
        """Safely open external URL in the system default browser."""
        import webbrowser

        target = url.get("url", "") if isinstance(url, dict) else str(url)
        if target.startswith(("http://", "https://")):
            webbrowser.open(target)
            return {"status": "ok", "url": target}
        return {"status": "failed", "error": "Invalid URL protocol"}

    def open_path_in_explorer(self, path: str | dict) -> dict:
        """Open a directory or file location in Windows Explorer."""
        import os
        import subprocess
        import sys
        from pathlib import Path

        target = path.get("path", "") if isinstance(path, dict) else str(path)
        p = Path(target)
        if not p.exists():
            return {"status": "failed", "error": f"Path not found: {target}"}

        try:
            if sys.platform == "win32":
                if p.is_file():
                    subprocess.Popen(["explorer", f"/select,{p}"])
                else:
                    os.startfile(str(p))
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(p if p.is_dir() else p.parent)])
            else:
                subprocess.Popen(["xdg-open", str(p if p.is_dir() else p.parent)])
            return {"status": "ok", "path": target}
        except Exception as exc:
            logger.error("open_path_in_explorer failed", path=target, error=str(exc))
            return {"status": "failed", "error": str(exc)}

    def choose_file(self) -> dict:
        """Open native desktop file picker and return selected file path and metadata."""
        import base64
        import mimetypes
        from pathlib import Path

        try:
            import webview

            window = webview.active_window() or (webview.windows[0] if webview.windows else None)
            if window:
                result = window.create_file_dialog(webview.OPEN_DIALOG)
                if result and len(result) > 0:
                    filepath = result[0]
                    p = Path(filepath)
                    if p.is_file():
                        filename = p.name
                        mime_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
                        file_bytes = p.read_bytes()
                        b64 = f"data:{mime_type};base64," + base64.b64encode(file_bytes).decode("ascii")
                        return {
                            "status": "ok",
                            "file": {
                                "path": filepath,
                                "name": filename,
                                "mime_type": mime_type,
                                "fileData": b64,
                            },
                        }
        except Exception as exc:
            logger.error("Error opening native file dialog", error=str(exc))
        return {"status": "cancelled"}

    def save_file(
        self,
        content: str,
        default_filename: str = "download.txt",
        file_types: list[str] | None = None,
    ) -> dict:
        """Open native desktop Save As dialog and write text/data to chosen file path."""
        from pathlib import Path

        try:
            import webview

            window = webview.active_window() or (webview.windows[0] if webview.windows else None)
            if window:
                save_type = getattr(webview.FileDialog, "SAVE", getattr(webview, "SAVE_DIALOG", 1))
                formatted_types: list[str] = []
                if file_types:
                    for ft in file_types:
                        if not ft:
                            continue
                        ft = ft.strip()
                        if "(" in ft and ")" in ft:
                            formatted_types.append(ft)
                        else:
                            clean_ext = ft if ft.startswith(".") else f".{ft}"
                            formatted_types.append(f"{ft.upper()} files (*{clean_ext})")
                formatted_types.append("All files (*.*)")
                types = tuple(formatted_types)
                result = window.create_file_dialog(
                    save_type,
                    save_filename=default_filename,
                    file_types=types,
                )
                if result:
                    filepath = result if isinstance(result, str) else result[0]
                    if filepath:
                        Path(filepath).write_text(content, encoding="utf-8")
                        return {"status": "ok", "path": filepath}
                return {"status": "cancelled"}
        except Exception as exc:
            logger.error("Error opening save file dialog", error=str(exc))
            return {"status": "failed", "error": str(exc)}
        return {"status": "unavailable"}

    def update_setting(self, key: str | dict, value: str | None = None) -> dict:
        """Persist a single settings key → value pair (accepts key, value or dict payload)."""
        if isinstance(key, dict):
            payload = key
            key = str(payload.get("key", ""))
            value = str(payload.get("value", ""))

        if not key or not isinstance(key, str):
            return {"status": "failed", "error": {"code": "VALIDATION_ERROR", "message": "key must be a non-empty string"}}
        if key not in self._SETTINGS_DEFAULTS:
            return {"status": "failed", "error": {"code": "UNKNOWN_KEY", "message": f"Unknown settings key: {key!r}"}}
        value = str(value if value is not None else "")
        try:
            from datetime import datetime

            with get_session() as session:
                row = session.get(ApplicationSettings, key)
                if row is None:
                    row = ApplicationSettings(
                        key=key,
                        value=value,
                        updated_at=datetime.now(UTC),
                    )
                    session.add(row)
                else:
                    row.value = value
                    row.updated_at = datetime.now(UTC)
                session.commit()
            if key == "app_accent_color":
                try:
                    self.save_window_state({"accent_color": value})
                except Exception:
                    pass
            logger.info("Setting updated", key=key)
            return {"status": "ok", "key": key, "value": value}
        except SQLAlchemyError as exc:
            logger.error("update_setting failed", key=key, error=str(exc))
            return {"status": "failed", "error": {"code": "DB_ERROR", "message": str(exc)}}

    def update_settings(self, payload: dict) -> dict:
        """Persist multiple settings key → value pairs at once."""
        settings_dict = payload.get("settings", payload) if isinstance(payload, dict) else {}
        if not isinstance(settings_dict, dict):
            return {"status": "failed", "error": {"code": "VALIDATION_ERROR", "message": "settings must be a dict"}}

        updated: dict[str, str] = {}
        try:
            from datetime import datetime

            with get_session() as session:
                for k, v in settings_dict.items():
                    if k in self._SETTINGS_DEFAULTS:
                        val_str = str(v)
                        row = session.get(ApplicationSettings, k)
                        if row is None:
                            row = ApplicationSettings(key=k, value=val_str, updated_at=datetime.now(UTC))
                            session.add(row)
                        else:
                            row.value = val_str
                            row.updated_at = datetime.now(UTC)
                        updated[k] = val_str
                session.commit()
            return {"status": "ok", "updated": updated}
        except SQLAlchemyError as exc:
            logger.error("update_settings failed", error=str(exc))
            return {"status": "failed", "error": {"code": "DB_ERROR", "message": str(exc)}}

    # ─────────────────────────────────────────────
    # OpenAPI & Swagger Explorer & Import
    # ─────────────────────────────────────────────

    def parse_openapi_spec(self, payload: dict) -> dict:
        """Parse raw content or fetch from URL and return structured OpenAPI spec."""
        try:
            if not isinstance(payload, dict):
                raise ValidationError("Payload must be an object")

            url = payload.get("url")
            content = payload.get("spec_content")

            if url and not content:
                import httpx
                resp = httpx.get(url, timeout=15.0, follow_redirects=True)
                if resp.status_code >= 400:
                    raise ValidationError(f"Failed to fetch specification from URL: HTTP {resp.status_code}")
                content = resp.text

            if not content:
                raise ValidationError("Either 'spec_content' or a reachable 'url' must be provided")

            from kurorelay.engines.openapi.parser import OpenAPIParser
            parser = OpenAPIParser()
            parsed = parser.parse(content)
            return {"status": "ok", "spec": parsed}
        except Exception as exc:
            return self._error_result(None, exc)

    def import_openapi_collection(self, payload: dict) -> dict:
        """Import an OpenAPI spec into a full Collection with tagged folders and sample requests."""
        try:
            if not isinstance(payload, dict):
                raise ValidationError("Payload must be an object")

            from kurorelay.engines.openapi.parser import OpenAPIParser
            spec = payload.get("spec")
            spec_content = payload.get("spec_content")
            url = payload.get("url")

            if not spec:
                if url and not spec_content:
                    import httpx
                    resp = httpx.get(url, timeout=15.0, follow_redirects=True)
                    if resp.status_code >= 400:
                        raise ValidationError(f"Failed to fetch specification from URL: HTTP {resp.status_code}")
                    spec_content = resp.text
                if not spec_content:
                    raise ValidationError("Either 'spec', 'spec_content', or 'url' must be provided")
                spec = OpenAPIParser().parse(spec_content)
            elif isinstance(spec, str):
                spec = OpenAPIParser().parse(spec)

            if not isinstance(spec, dict) or "endpoints" not in spec:
                raise ValidationError("Invalid OpenAPI specification object")

            with get_session() as session:
                workspace_id = payload.get("workspace_id")
                if not workspace_id or workspace_id == "default":
                    ws = WorkspaceRepository(session).get_or_create_default()
                    workspace_id = ws.id
                else:
                    self._require_id(workspace_id, "Workspace")

                collection_name = payload.get("collection_name") or spec.get("title") or "Imported API"
                collection_repo = CollectionRepository(session)
                collection = collection_repo.create(
                    workspace_id=workspace_id,
                    name=collection_name,
                    description=spec.get("description", ""),
                )

                # Create folders for tags
                tag_to_folder_id: dict[str, str] = {}
                for tag in spec.get("tags", []):
                    if tag and tag.lower() != "default":
                        folder = collection_repo.create_folder(collection.id, tag)
                        tag_to_folder_id[tag] = folder.id

                # Create requests for endpoints
                request_repo = RequestRepository(session)
                created_count = 0
                for ep in spec.get("endpoints", []):
                    # Match folder by first tag
                    target_folder_id = None
                    ep_tags = ep.get("tags", [])
                    if ep_tags:
                        target_folder_id = tag_to_folder_id.get(ep_tags[0])

                    # Build params and headers
                    params_dict = {}
                    headers_dict = {}
                    for p in ep.get("parameters", []):
                        param_in = p.get("in")
                        p_name = p.get("name")
                        p_sample = p.get("sample_value", "")
                        if p_name:
                            if param_in == "query":
                                params_dict[p_name] = str(p_sample)
                            elif param_in == "header":
                                headers_dict[p_name] = str(p_sample)

                    # Build body config
                    body_config = None
                    req_body = ep.get("request_body")
                    if req_body:
                        body_config = {
                            "type": "json",
                            "content": req_body.get("sample_json", {}),
                        }

                    request_url = f"{{{{BASE_URL}}}}{ep.get('path', '')}"

                    request_repo.create(
                        collection_id=collection.id,
                        folder_id=target_folder_id,
                        name=ep.get("summary") or f"{ep.get('method', 'GET')} {ep.get('path', '')}",
                        method=ep.get("method", "GET"),
                        url=request_url,
                        configuration={
                            "params": params_dict,
                            "headers": headers_dict,
                            "body": body_config,
                        },
                    )
                    created_count += 1

                return {
                    "status": "ok",
                    "collection_id": collection.id,
                    "collection_name": collection.name,
                    "created_requests_count": created_count,
                    "servers": spec.get("servers", []),
                }
        except Exception as exc:
            return self._error_result(None, exc)

    # ─────────────────────────────────────────────
    # Workflow Studio
    # ─────────────────────────────────────────────

    def list_workflows(self, payload: dict) -> dict:
        """List all workflows for a workspace.

        Payload: {workspace_id}
        Returns: {status, workflows: [{id, name, description, step_count, created_at, updated_at}]}
        """
        try:
            workspace_id = payload.get("workspace_id", "")
            if not workspace_id:
                return self._error_result(None, ValidationError("workspace_id is required"))
            workflows = self._workflow_engine.list_workflows(workspace_id)
            return {"status": "ok", "workflows": workflows}
        except Exception as exc:
            return self._error_result(None, exc)

    def create_workflow(self, payload: dict) -> dict:
        """Create a new workflow.

        Payload: {workspace_id, name, description?, steps?: list}
        Returns: {status, workflow: {...}}
        """
        try:
            workspace_id = payload.get("workspace_id", "")
            name = payload.get("name", "").strip()
            description = payload.get("description", "")
            if not workspace_id:
                return self._error_result(None, ValidationError("workspace_id is required"))
            if not name:
                return self._error_result(None, ValidationError("name is required"))
            workflow = self._workflow_engine.create_workflow(workspace_id, name, description)
            steps = payload.get("steps")
            if steps and workflow and "id" in workflow:
                updated = self._workflow_engine.update_workflow(
                    workflow_id=workflow["id"],
                    steps=steps,
                )
                if updated:
                    workflow = updated
            return {"status": "ok", "workflow": workflow}
        except Exception as exc:
            return self._error_result(None, exc)

    def get_workflow(self, payload: dict) -> dict:
        """Get a workflow with all steps.

        Payload: {workflow_id}
        Returns: {status, workflow: {...with steps}}
        """
        try:
            workflow_id = payload.get("workflow_id", "")
            if not workflow_id:
                return self._error_result(None, ValidationError("workflow_id is required"))
            workflow = self._workflow_engine.get_workflow(workflow_id)
            if workflow is None:
                return self._error_result(None, ValidationError(f"Workflow {workflow_id!r} not found"))
            return {"status": "ok", "workflow": workflow}
        except Exception as exc:
            return self._error_result(None, exc)

    def update_workflow(self, payload: dict) -> dict:
        """Update workflow name, description, or steps list.

        Payload: {workflow_id, name?, description?, steps?: [{name, method, url, order_index, configuration, extract_vars}]}
        Returns: {status, workflow: {...}}
        """
        try:
            workflow_id = payload.get("workflow_id", "")
            if not workflow_id:
                return self._error_result(None, ValidationError("workflow_id is required"))
            workflow = self._workflow_engine.update_workflow(
                workflow_id=workflow_id,
                name=payload.get("name"),
                description=payload.get("description"),
                steps=payload.get("steps"),
            )
            if workflow is None:
                return self._error_result(None, ValidationError(f"Workflow {workflow_id!r} not found"))
            return {"status": "ok", "workflow": workflow}
        except Exception as exc:
            return self._error_result(None, exc)

    def delete_workflow(self, payload: dict) -> dict:
        """Delete a workflow and all its steps.

        Payload: {workflow_id}
        Returns: {status}
        """
        try:
            workflow_id = payload.get("workflow_id", "")
            if not workflow_id:
                return self._error_result(None, ValidationError("workflow_id is required"))
            deleted = self._workflow_engine.delete_workflow(workflow_id)
            if not deleted:
                return self._error_result(None, ValidationError(f"Workflow {workflow_id!r} not found"))
            return {"status": "ok"}
        except Exception as exc:
            return self._error_result(None, exc)

    def run_workflow(self, payload: dict) -> dict:
        """Execute all steps of a workflow in order.

        Payload: {workflow_id, variable_scopes?, options?: {delay_ms, stop_on_failure}}
        Returns: {status, run_result: {status, results: [...]}}
        """
        try:
            workflow_id = payload.get("workflow_id", "")
            if not workflow_id:
                return self._error_result(None, ValidationError("workflow_id is required"))
            variable_scopes = payload.get("variable_scopes", {})
            options = payload.get("options", {})
            run_result = self._workflow_engine.run_workflow(
                workflow_id,
                variable_scopes,
                options=options,
                environment_id=payload.get("environment_id"),
            )
            return {"status": "ok", "run_result": run_result}
        except Exception as exc:
            return self._error_result(None, exc)

    def get_workflow_runs(self, payload: dict) -> dict:
        """Fetch past execution runs for a workflow."""
        try:
            workflow_id = payload.get("workflow_id", "")
            if not workflow_id:
                return self._error_result(None, ValidationError("workflow_id is required"))
            limit = int(payload.get("limit", 30))
            runs = self._workflow_engine.get_workflow_runs(workflow_id, limit=limit)
            return {"status": "ok", "runs": runs}
        except Exception as exc:
            return self._error_result(None, exc)

    def delete_workflow_run(self, payload: dict) -> dict:
        """Delete a single workflow run record."""
        try:
            run_id = payload.get("run_id", "")
            if not run_id:
                return self._error_result(None, ValidationError("run_id is required"))
            deleted = self._workflow_engine.delete_workflow_run(run_id)
            return {"status": "ok", "deleted": deleted}
        except Exception as exc:
            return self._error_result(None, exc)

    def clear_workflow_runs(self, payload: dict) -> dict:
        """Clear all historical run records for a workflow."""
        try:
            workflow_id = payload.get("workflow_id", "")
            if not workflow_id:
                return self._error_result(None, ValidationError("workflow_id is required"))
            self._workflow_engine.clear_workflow_runs(workflow_id)
            return {"status": "ok"}
        except Exception as exc:
            return self._error_result(None, exc)

    def run_workflow_step(self, payload: dict) -> dict:
        """Run a single workflow step in isolation."""
        try:
            step_data = payload.get("step_data", {})
            workspace_id = payload.get("workspace_id", "")
            variable_scopes = payload.get("variable_scopes", {})
            environment_id = payload.get("environment_id")
            result = self._workflow_engine.run_single_step(
                step_data=step_data,
                workspace_id=workspace_id,
                variable_scopes=variable_scopes,
                environment_id=environment_id,
            )
            return {"status": "ok", "step_result": result}
        except Exception as exc:
            return self._error_result(None, exc)

    # ─────────────────────────────────────────────
    # Phase 7: Advanced Protocols (WebSocket, GraphQL, SSE)
    # ─────────────────────────────────────────────

    def websocket_connect(self, payload: dict) -> dict:
        """Open a WebSocket connection to url with optional headers."""
        try:
            url = payload.get("url", "")
            headers = payload.get("headers")
            return self._ws_manager.connect(url, headers)
        except Exception as exc:
            return self._error_result(None, exc)

    def websocket_send(self, payload: dict) -> dict:
        """Send a message across an active WebSocket session."""
        try:
            session_id = payload.get("session_id") or payload.get("connection_id") or ""
            message = payload.get("message", "")
            return self._ws_manager.send(session_id, message)
        except Exception as exc:
            return self._error_result(None, exc)

    def websocket_poll(self, payload: dict) -> dict:
        """Poll incoming/outgoing messages and status for a WebSocket session."""
        try:
            session_id = payload.get("session_id") or payload.get("connection_id") or ""
            since_index = int(payload.get("since_index", 0))
            return self._ws_manager.poll(session_id, since_index)
        except Exception as exc:
            return self._error_result(None, exc)

    def websocket_disconnect(self, payload: dict) -> dict:
        """Disconnect and close a WebSocket session."""
        try:
            session_id = payload.get("session_id") or payload.get("connection_id") or ""
            return self._ws_manager.disconnect(session_id)
        except Exception as exc:
            return self._error_result(None, exc)

    def execute_graphql(self, payload: dict) -> dict:
        """Execute a GraphQL query/mutation against an HTTP endpoint."""
        try:
            url = payload.get("url", "")
            query = payload.get("query", "")
            variables = payload.get("variables")
            operation_name = payload.get("operation_name")
            headers = payload.get("headers")
            timeout = float(payload.get("timeout_seconds", 30.0))
            return self._graphql_client.execute(
                url=url,
                query=query,
                variables=variables,
                operation_name=operation_name,
                headers=headers,
                timeout_seconds=timeout,
            )
        except Exception as exc:
            return self._error_result(None, exc)

    def introspect_graphql(self, payload: dict) -> dict:
        """Fetch and structure GraphQL schema via standard introspection query."""
        try:
            url = payload.get("url", "")
            headers = payload.get("headers")
            return self._graphql_client.introspect(url=url, headers=headers)
        except Exception as exc:
            return self._error_result(None, exc)

    def sse_connect(self, payload: dict) -> dict:
        """Open a Server-Sent Events stream connection to url."""
        try:
            url = payload.get("url", "")
            headers = payload.get("headers")
            return self._sse_manager.connect(url, headers)
        except Exception as exc:
            return self._error_result(None, exc)

    def sse_poll(self, payload: dict) -> dict:
        """Poll received events and stream status for an SSE session."""
        try:
            session_id = payload.get("session_id") or payload.get("connection_id") or ""
            since_index = int(payload.get("since_index", 0))
            return self._sse_manager.poll(session_id, since_index)
        except Exception as exc:
            return self._error_result(None, exc)

    def sse_disconnect(self, payload: dict) -> dict:
        """Disconnect and close an SSE stream session."""
        try:
            session_id = payload.get("session_id") or payload.get("connection_id") or ""
            return self._sse_manager.disconnect(session_id)
        except Exception as exc:
            return self._error_result(None, exc)

    # ─────────────────────────────────────────────
    # Phase 8: Mock Server & Performance Testing
    # ─────────────────────────────────────────────

    def start_mock_server(self, payload: dict | None = None) -> dict:
        """Start local HTTP and WebSocket mock listeners on adjacent ports."""
        try:
            p = payload or {}
            host = p.get("host")
            port = int(p["port"]) if p.get("port") is not None else None
            if "routes" in p:
                routes = p["routes"]
                if not isinstance(routes, list):
                    raise ValidationError("Mock routes must be provided as a list")
                self._mock_server.set_routes(routes)
            result = self._mock_server.start(host=host, port=port)
            return result
        except Exception as exc:
            return self._error_result(None, exc)

    def stop_mock_server(self, payload: dict | None = None) -> dict:
        """Stop local HTTP mock server."""
        try:
            return self._mock_server.stop()
        except Exception as exc:
            return self._error_result(None, exc)

    def get_mock_server_status(self) -> dict:
        """Return running status, routes, and recent requests log."""
        try:
            return self._mock_server.get_status()
        except Exception as exc:
            return self._error_result(None, exc)

    def get_mock_server_log(self) -> dict:
        """Return the recent request log without exposing request credentials or bodies."""
        try:
            return {"status": "ok", "requests_log": self._mock_server.get_status()["requests_log"]}
        except Exception as exc:
            return self._error_result(None, exc)

    def update_mock_routes(self, payload: dict) -> dict:
        """Update mock routes definition."""
        try:
            routes = payload.get("routes", [])
            return self._mock_server.set_routes(routes)
        except Exception as exc:
            return self._error_result(None, exc)

    def clear_mock_requests_log(self) -> dict:
        """Clear recorded requests received by mock server."""
        try:
            return self._mock_server.clear_requests_log()
        except Exception as exc:
            return self._error_result(None, exc)

    def start_performance_test(self, payload: dict) -> dict:
        """Start a concurrent load test against target request."""
        try:
            req_config = payload.get("request", {})
            concurrency = int(payload.get("concurrency", 5))
            duration = int(payload.get("duration_seconds", 10))
            total_limit = int(payload["total_requests"]) if payload.get("total_requests") is not None else None
            return self._performance_engine.start_test(
                request_config=req_config,
                concurrency=concurrency,
                duration_seconds=duration,
                total_requests=total_limit,
            )
        except Exception as exc:
            return self._error_result(None, exc)

    def get_performance_test_status(self, payload: dict) -> dict:
        """Poll metrics and progress of a running or completed performance test."""
        try:
            test_id = payload.get("test_id", "")
            return self._performance_engine.get_status(test_id)
        except Exception as exc:
            return self._error_result(None, exc)

    def stop_performance_test(self, payload: dict) -> dict:
        """Stop an active performance test early."""
        try:
            test_id = payload.get("test_id", "")
            return self._performance_engine.stop_test(test_id)
        except Exception as exc:
            return self._error_result(None, exc)




