import json

import httpx
import keyring
import respx
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker

from kurorelay.core.exceptions import DatabaseError
from kurorelay.database import models  # noqa: F401
from kurorelay.database.base import Base
from kurorelay.database.models.environment import EnvironmentVariable
from kurorelay.database.repositories.collections import CollectionRepository
from kurorelay.database.repositories.environments import EnvironmentRepository
from kurorelay.database.repositories.requests import RequestRepository
from kurorelay.database.repositories.workspaces import WorkspaceRepository


class MemorySecretStore:
    def __init__(self):
        self.values = {}

    def get(self, environment_id, variable_id):
        return self.values.get((environment_id, variable_id))

    def set(self, environment_id, variable_id, value):
        self.values[(environment_id, variable_id)] = value

    def delete(self, environment_id, variable_id):
        self.values.pop((environment_id, variable_id), None)


def test_workspace_collection_and_saved_request_round_trip(database_session_scope):
    with database_session_scope() as session:
        workspaces = WorkspaceRepository(session)
        workspace = workspaces.create("  Workspace A  ", "local APIs")
        assert workspace.name == "Workspace A"

        collections = CollectionRepository(session)
        collection = collections.create(workspace.id, "  Smoke Tests  ")
        request = RequestRepository(session).create(
            collection.id,
            "Read item",
            "get",
            "https://api.example.test/items?api_key=never-store-this",
            {
                "headers": {
                    "Authorization": "Bearer never-store-this",
                    "Accept": "application/json",
                },
                "auth": {"type": "bearer", "configuration": {"token": "{{API_TOKEN}}"}},
            },
        )

        assert [item.name for item in workspaces.list_all()] == ["Workspace A"]
        assert collections.list_for_workspace(workspace.id)[0].id == collection.id
        assert RequestRepository(session).get_by_id(request.id) is request
        stored_config = RequestRepository.configuration(request)
        assert stored_config["headers"]["Authorization"] == "[REDACTED]"
        assert stored_config["auth"]["configuration"]["token"] == "{{API_TOKEN}}"
        assert request.url.endswith("api_key=%5BREDACTED%5D")


def test_environment_secrets_use_keyring_store_and_activate_one_per_workspace(
    database_session_scope,
):
    secret_store = MemorySecretStore()
    with database_session_scope() as session:
        workspace = WorkspaceRepository(session).create("Environment Workspace")
        repository = EnvironmentRepository(session, secret_store)
        development = repository.create(workspace.id, "Development", is_active=True)
        production = repository.create(workspace.id, "Production", is_active=True)

        secret = repository.set_variable(
            development.id, "API_TOKEN", "secret-value", is_secret=True
        )
        repository.set_variable(development.id, "BASE_URL", "https://dev.example.test")
        assert secret.value == ""
        assert repository.values_for_resolution(development.id) == {
            "API_TOKEN": "secret-value",
            "BASE_URL": "https://dev.example.test",
        }
        assert not development.is_active
        assert production.is_active

        repository.set_variable(
            development.id, "API_TOKEN", "rotated-value", is_secret=True
        )
        assert repository.values_for_resolution(development.id)["API_TOKEN"] == "rotated-value"
        repository.set_variable(
            development.id, "API_TOKEN", "now-plain", is_secret=False
        )
        assert repository.values_for_resolution(development.id)["API_TOKEN"] == "now-plain"
        assert not secret_store.values

        stored = session.get(EnvironmentVariable, secret.id)
        assert stored is not None
        assert not stored.is_secret
        assert stored.value == "now-plain"


def test_history_is_persisted_redacted_and_paginated(api, history_engine):
    url = "https://api.example.test/items?access_token=url-secret&key=query-secret&page=1"
    snapshots = [
        {
            "method": "GET",
            "url": url,
            "headers": {
                "Authorization": "Bearer header-secret",
                "X-API-Key": "header-key",
                "Accept": "application/json",
            },
            "auth": {"type": "bearer", "configuration": {"token": "auth-secret"}},
            "body": {"password": "body-secret"},
            "variable_scopes": {"environment": {"API_TOKEN": "scope-secret"}},
        }
        for _ in range(3)
    ]
    for snapshot in snapshots:
        history_engine.record(
            snapshot,
            {
                "status": "completed",
                "status_code": 200,
                "headers": {"Set-Cookie": "session=response-secret"},
            },
            12.5,
        )

    first_page = api.get_request_history(page=1, page_size=2)
    second_page = api.get_request_history(page=2, page_size=2)

    assert first_page["status"] == "ok"
    assert first_page["total"] == 3
    assert len(first_page["items"]) == 2
    assert len(second_page["items"]) == 1
    stored = first_page["items"][0]
    request_snapshot = stored["request_snapshot"]
    assert "variable_scopes" not in request_snapshot
    assert request_snapshot["headers"]["Authorization"] == "[REDACTED]"
    assert request_snapshot["headers"]["X-API-Key"] == "[REDACTED]"
    assert request_snapshot["auth"]["configuration"]["token"] == "[REDACTED]"
    assert request_snapshot["body"]["password"] == "[REDACTED]"
    assert "url-secret" not in json.dumps(request_snapshot)
    assert "query-secret" not in json.dumps(request_snapshot)
    assert stored["response_metadata"]["headers"]["Set-Cookie"] == "[REDACTED]"
    assert api.delete_history_item(stored["id"]) == {"status": "ok", "deleted": True}
    assert api.clear_request_history() == {"status": "ok", "deleted_count": 2}


def test_workspace_and_history_bridge_validation(api):
    assert api.create_workspace({"name": "  "})["status"] == "failed"
    assert api.get_request_history(page=0)["error"]["code"] == "VALIDATION_ERROR"
    assert api.get_collections("missing")["error"]["code"] == "VALIDATION_ERROR"
    assert api.get_environments("missing")["error"]["code"] == "VALIDATION_ERROR"


def test_failed_transport_is_recorded_without_transport_secret_details(api):
    url = "https://api.example.test/private"
    with respx.mock(assert_all_called=True) as router:
        router.get(url).mock(side_effect=httpx.ReadTimeout("private transport detail"))
        result = api.send_request(
            {
                "method": "GET",
                "url": url,
                "allow_private_network": True,
            }
        )

    history = api.get_request_history()
    assert result["status"] == "failed"
    assert history["total"] == 1
    assert history["items"][0]["response_metadata"] == {
        "status": "failed",
        "error_code": "TIMEOUT",
    }


def test_bridge_exposes_collection_saved_request_and_environment_crud(api):
    workspace = api.create_workspace({"name": "Persistence workspace"})["workspace"]
    assert api.get_workspace(workspace["id"])["workspace"]["name"] == "Persistence workspace"
    collection = api.create_collection(
        {
            "workspace_id": workspace["id"],
            "name": "API checks",
            "description": "Smoke requests",
        }
    )["collection"]
    folder = api.create_collection_folder(
        {"collection_id": collection["id"], "name": "Users"}
    )["folder"]
    saved_request = api.save_request(
        {
            "collection_id": collection["id"],
            "folder_id": folder["id"],
            "name": "List users",
            "method": "get",
            "url": "https://api.example.test/users",
            "configuration": {"headers": {"Accept": "application/json"}},
        }
    )["request"]
    saved_request = api.update_saved_request(
        saved_request["id"],
        {
            "name": "List users updated",
            "configuration": {"headers": {"Accept": "application/json"}},
            "folder_id": None,
        },
    )["request"]
    environment = api.create_environment(
        {
            "workspace_id": workspace["id"],
            "name": "Development",
            "is_active": True,
        }
    )["environment"]
    variable = api.set_environment_variable(
        {
            "environment_id": environment["id"],
            "key": "BASE_URL",
            "value": "https://dev.example.test",
        }
    )["variable"]

    assert api.get_collections(workspace["id"])["collections"][0]["id"] == collection["id"]
    assert api.get_collection_requests(collection["id"])["requests"][0]["id"] == saved_request["id"]
    assert api.get_saved_request(saved_request["id"])["request"]["folder_id"] is None
    assert api.get_saved_request(saved_request["id"])["request"]["method"] == "GET"
    assert api.get_environments(workspace["id"])["environments"][0]["variables"][0]["value"] == "https://dev.example.test"
    assert api.delete_environment_variable(environment["id"], variable["id"]) == {
        "status": "ok"
    }

    updated = api.update_collection(
        collection["id"], {"name": "Updated API checks"}
    )["collection"]
    assert updated["name"] == "Updated API checks"
    updated_environment = api.update_environment(
        environment["id"], {"name": "Development updated", "is_active": False}
    )["environment"]
    assert updated_environment["name"] == "Development updated"
    assert api.delete_saved_request(saved_request["id"]) == {"status": "ok"}
    assert api.delete_environment(environment["id"]) == {"status": "ok"}
    assert api.delete_collection(collection["id"]) == {"status": "ok"}


def test_environment_selection_loads_database_values_without_trusting_frontend_scope(
    database_session_scope,
    history_engine,
):
    with database_session_scope() as session:
        workspace = WorkspaceRepository(session).create("Service workspace")
        environment = EnvironmentRepository(session, MemorySecretStore()).create(
            workspace.id, "Development"
        )
        EnvironmentRepository(session, MemorySecretStore()).set_variable(
            environment.id, "BASE_URL", "https://stored.example.test"
        )

    loaded_values = []

    def load_environment(environment_id, workspace_id):
        loaded_values.append((environment_id, workspace_id))
        return {"BASE_URL": "https://stored.example.test", "TOKEN": "stored-token"}

    import asyncio

    import httpx

    from kurorelay.services.request_service import RequestService

    class CapturingHTTPEngine:
        async def execute(self, request):
            assert request.url == "https://stored.example.test/resource"
            assert request.headers["Authorization"] == "Bearer stored-token"
            return httpx.Response(
                200,
                json={"ok": True},
                request=httpx.Request("GET", request.url),
            )

    service = RequestService(
        http_engine=CapturingHTTPEngine(),
        history_engine=history_engine,
        environment_loader=load_environment,
    )
    result = asyncio.run(
        service.execute(
            "environment-request",
            {
                "workspace_id": workspace.id,
                "environment_id": environment.id,
                "method": "GET",
                "url": "{{BASE_URL}}/resource",
                "auth": {
                    "type": "bearer",
                    "configuration": {"token": "{{TOKEN}}"},
                },
                "variable_scopes": {
                    "environment": {"BASE_URL": "https://untrusted.example.test"}
                },
            },
        )
    )

    assert loaded_values == [(environment.id, workspace.id)]
    assert result["status"] == "completed"


def test_completed_response_is_returned_when_history_persistence_fails():
    import asyncio

    import httpx

    from kurorelay.services.request_service import RequestService

    class FailingHistoryEngine:
        def record(self, *_args, **_kwargs):
            raise DatabaseError("database unavailable")

    class CapturingHTTPEngine:
        async def execute(self, request):
            return httpx.Response(
                200,
                json={"saved": True},
                request=httpx.Request("GET", request.url),
            )

    service = RequestService(
        http_engine=CapturingHTTPEngine(),
        history_engine=FailingHistoryEngine(),
    )
    result = asyncio.run(
        service.execute(
            "history-failure-request",
            {"method": "GET", "url": "https://api.example.test/resource"},
        )
    )

    assert result["status"] == "completed"
    assert result["response"]["body"]["data"] == {"saved": True}
    assert result["history_warning"]["code"] == "HISTORY_PERSISTENCE_FAILED"
    assert "could not be saved" in result["history_warning"]["message"]


def test_keyring_environment_secret_stays_private_and_resolves_in_request(
    api,
    database_session_scope,
    monkeypatch,
):
    credentials = {}
    monkeypatch.setattr(
        keyring,
        "set_password",
        lambda service, username, password: credentials.__setitem__(
            (service, username), password
        ),
    )
    monkeypatch.setattr(
        keyring,
        "get_password",
        lambda service, username: credentials.get((service, username)),
    )
    monkeypatch.setattr("kurorelay.bridge.api.get_session", database_session_scope)
    monkeypatch.setattr(
        "kurorelay.services.request_service.get_session",
        database_session_scope,
    )

    workspace = api.create_workspace({"name": "Secrets workspace"})["workspace"]
    environment = api.create_environment(
        {"workspace_id": workspace["id"], "name": "Development"}
    )["environment"]
    api.set_environment_variable(
        {
            "environment_id": environment["id"],
            "key": "TOKEN",
            "value": "credential-value",
            "is_secret": True,
        }
    )
    api.set_environment_variable(
        {
            "environment_id": environment["id"],
            "key": "BASE_URL",
            "value": "https://api.example.test",
        }
    )

    visible_environment = api.get_environments(workspace["id"])["environments"][0]
    assert {
        variable["key"]: variable["value"]
        for variable in visible_environment["variables"]
    } == {"TOKEN": "", "BASE_URL": "https://api.example.test"}

    url = "https://api.example.test/resource"
    with respx.mock(assert_all_called=True) as router:
        route = router.get(url).mock(return_value=httpx.Response(200, json={"ok": True}))
        result = api.send_request(
            {
                "workspace_id": workspace["id"],
                "environment_id": environment["id"],
                "method": "GET",
                "url": "{{BASE_URL}}/resource",
                "allow_private_network": True,
                "auth": {
                    "type": "bearer",
                    "configuration": {"token": "{{TOKEN}}"},
                },
            }
        )

    assert result["status"] == "completed"
    assert route.calls.last.request.headers["Authorization"] == "Bearer credential-value"
    assert "credential-value" not in json.dumps(api.get_request_history())


def test_workspace_data_survives_database_engine_restart(tmp_path):
    database_url = URL.create(
        "sqlite",
        database=str(tmp_path / "restart-check.sqlite"),
    )
    first_engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(first_engine)
    first_sessions = sessionmaker(bind=first_engine, expire_on_commit=False)

    with first_sessions.begin() as session:
        workspace = WorkspaceRepository(session).create(
            "Persistent workspace", "survives engine replacement"
        )
        workspace_id = workspace.id

    first_engine.dispose()

    reopened_engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
    )
    reopened_sessions = sessionmaker(bind=reopened_engine, expire_on_commit=False)
    with reopened_sessions() as session:
        workspace = WorkspaceRepository(session).get_by_id(workspace_id)
        assert workspace is not None
        assert workspace.description == "survives engine replacement"
    reopened_engine.dispose()


def test_duplicate_environment_and_secret_retrieval(database_session_scope):
    secret_store = MemorySecretStore()
    with database_session_scope() as session:
        workspace = WorkspaceRepository(session).create("Env workspace")
        repo = EnvironmentRepository(session, secret_store)
        src_env = repo.create(workspace.id, "Staging")
        repo.set_variable(src_env.id, "API_KEY", "secret-token-123", is_secret=True)
        repo.set_variable(src_env.id, "BASE_URL", "https://staging.api", is_secret=False)

        # Verify get_secret_value
        var_secret = [v for v in src_env.variables if v.key == "API_KEY"][0]
        assert repo.get_secret_value(src_env.id, var_secret.id) == "secret-token-123"

        # Duplicate environment
        clone = repo.create(workspace.id, f"{src_env.name} (Copy)")
        for v in src_env.variables:
            val = repo.get_secret_value(src_env.id, v.id) if v.is_secret else v.value
            repo.set_variable(
                clone.id,
                v.key,
                val,
                is_secret=v.is_secret,
                is_enabled=v.is_enabled,
            )

        assert clone.name == "Staging (Copy)"
        assert len(clone.variables) == 2
        clone_secret = [v for v in clone.variables if v.key == "API_KEY"][0]
        assert clone_secret.is_secret is True
        assert repo.get_secret_value(clone.id, clone_secret.id) == "secret-token-123"

