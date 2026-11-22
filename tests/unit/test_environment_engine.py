import pytest

from kurorelay.core.exceptions import ValidationError
from kurorelay.engines.environments.engine import EnvironmentEngine
from kurorelay.engines.requests.engine import RequestEngine


def test_environment_engine_applies_documented_scope_precedence():
    result = EnvironmentEngine().resolve(
        "{{endpoint}}/{{version}}/{{global_only}}",
        {
            "request": {"endpoint": "https://request.example.test"},
            "collection": {"endpoint": "https://collection.example.test"},
            "environment": {"endpoint": "https://dev.example.test", "version": "v2"},
            "global": {"endpoint": "https://global.example.test", "version": "v1", "global_only": "shared"},
        },
    )

    assert result == "https://request.example.test/v2/shared"


def test_environment_engine_resolves_nested_values_and_reports_missing_names():
    engine = EnvironmentEngine()
    result = engine.resolve(
        {"url": "{{base}}/items", "body": ["{{item}}"]},
        {"environment": {"base": "https://api.example.test", "item": "book"}},
    )
    assert result == {
        "url": "https://api.example.test/items",
        "body": ["book"],
    }

    with pytest.raises(ValidationError) as error:
        engine.resolve("{{missing_a}}/{{missing_b}}", {})
    assert error.value.details["variables"] == ["missing_a", "missing_b"]


def test_request_engine_resolves_url_headers_params_json_and_auth():
    prepared = RequestEngine().prepare(
        {
            "method": "POST",
            "url": "{{base}}/items",
            "headers": {"X-Workspace": "{{workspace}}"},
            "params": {"page": "{{page}}"},
            "auth": {"type": "bearer", "configuration": {"token": "{{token}}"}},
            "body": {"type": "json", "content": {"item": "{{item}}"}},
            "variable_scopes": {
                "request": {"page": "1"},
                "environment": {
                    "base": "https://api.example.test",
                    "workspace": "development",
                    "token": "test-token",
                    "item": "notebook",
                    "page": "2",
                },
            },
        }
    )

    assert prepared.url == "https://api.example.test/items"
    assert prepared.headers["X-Workspace"] == "development"
    assert prepared.headers["Authorization"] == "Bearer test-token"
    assert prepared.params == {"page": "1"}
    assert prepared.content == b'{"item": "notebook"}'


def test_environment_engine_resolves_dynamic_variables():
    engine = EnvironmentEngine()
    result = engine.resolve(
        {"uuid": "{{$guid}}", "time": "{{$timestamp}}", "email": "{{$randomEmail}}"},
        {},
    )
    assert len(result["uuid"]) == 36
    assert result["time"].isdigit()
    assert "@example.com" in result["email"]

