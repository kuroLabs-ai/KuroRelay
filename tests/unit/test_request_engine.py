import pytest

from kurorelay.core.exceptions import ValidationError
from kurorelay.engines.requests.engine import RequestEngine


def test_prepare_normalizes_method_and_json_body():
    prepared = RequestEngine().prepare(
        {
            "method": " post ",
            "url": "https://api.example.test/items",
            "body": {"type": "json", "content": {"name": "Kuro"}},
        }
    )

    assert prepared.method == "POST"
    assert prepared.content == b'{"name": "Kuro"}'
    assert prepared.headers["Content-Type"] == "application/json"
    assert prepared.timeout_seconds == 30


def test_prepare_preserves_explicit_content_type_case_insensitively():
    prepared = RequestEngine().prepare(
        {
            "method": "POST",
            "url": "https://api.example.test/items",
            "headers": {"content-type": "application/vnd.example+json"},
            "body": {"type": "json", "content": {}},
        }
    )

    assert prepared.headers == {"content-type": "application/vnd.example+json"}


@pytest.mark.parametrize(
    "url",
    ["file:///tmp/request", "ftp://api.example.test/resource", "https://user:pass@example.test"],
)
def test_prepare_rejects_non_http_or_credential_bearing_urls(url):
    with pytest.raises(ValidationError):
        RequestEngine().prepare({"method": "GET", "url": url})


def test_invalid_payload_errors_do_not_echo_secret_values():
    secret = "do-not-include-this-value"
    with pytest.raises(ValidationError) as error:
        RequestEngine().prepare(
            {
                "method": "GET",
                "url": "https://api.example.test",
                "headers": {"Authorization": secret},
                "unexpected": secret,
            }
        )

    assert secret not in str(error.value)
    assert error.value.details["fields"] == ["unexpected"]


def test_prepare_rejects_malformed_http_method():
    with pytest.raises(ValidationError) as error:
        RequestEngine().prepare({"method": "GE\nT", "url": "https://api.example.test"})

    assert error.value.details["fields"] == ["method"]


def test_prepare_rejects_nonstandard_nan_json_values():
    with pytest.raises(ValidationError, match="JSON request body"):
        RequestEngine().prepare(
            {
                "method": "POST",
                "url": "https://api.example.test",
                "body": {"type": "json", "content": float("nan")},
            }
        )


def test_private_network_access_requires_an_explicit_boolean():
    with pytest.raises(ValidationError) as error:
        RequestEngine().prepare(
            {
                "method": "GET",
                "url": "http://127.0.0.1",
                "allow_private_network": 1,
            }
        )

    assert error.value.details["fields"] == ["allow_private_network"]


def test_prepare_form_body_encodes_and_sets_content_type():
    prepared = RequestEngine().prepare(
        {
            "method": "POST",
            "url": "https://api.example.test/login",
            "body": {
                "type": "form",
                "content": [
                    {"key": "username", "value": "akira", "enabled": True},
                    {"key": "password", "value": "secret 123", "enabled": True},
                    {"key": "disabled_field", "value": "ignore", "enabled": False},
                ],
            },
        }
    )

    assert prepared.content == b"username=akira&password=secret+123"
    assert prepared.headers["Content-Type"] == "application/x-www-form-urlencoded"


def test_prepare_api_key_auth_sets_custom_header():
    prepared = RequestEngine().prepare(
        {
            "method": "GET",
            "url": "https://api.example.test/secure",
            "auth": {
                "type": "api_key",
                "configuration": {"key": "X-API-Key", "value": "secret_key_999"},
            },
        }
    )

    assert prepared.headers["X-API-Key"] == "secret_key_999"


def test_prepare_multipart_form_data():
    prepared = RequestEngine().prepare(
        {
            "method": "POST",
            "url": "https://api.example.test/upload",
            "body": {
                "type": "multipart",
                "content": [
                    {"key": "title", "value": "avatar picture", "type": "text", "enabled": True},
                    {
                        "key": "file",
                        "value": "sample.txt",
                        "type": "file",
                        "enabled": True,
                        "filename": "sample.txt",
                        "fileData": "data:text/plain;base64,aGVsbG8gd29ybGQ=",
                    },
                    {"key": "ignored", "value": "nope", "type": "text", "enabled": False},
                ],
            },
        }
    )

    assert "multipart/form-data; boundary=" in prepared.headers["Content-Type"]
    assert b"name=\"title\"" in prepared.content
    assert b"avatar picture" in prepared.content
    assert b"filename=\"sample.txt\"" in prepared.content
    assert b"hello world" in prepared.content
    assert b"ignored" not in prepared.content
