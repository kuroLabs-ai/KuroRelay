from kurorelay.core.logging import _redact_sensitive_fields


def test_redaction_recurses_through_nested_dicts_and_sequences():
    result = _redact_sensitive_fields(
        None,
        "info",
        {
            "headers": {
                "Authorization": "Bearer token-value",
                "Accept": "application/json",
            },
            "context": [
                {"access_token": "access-value"},
                {"nested": {"password": "password-value"}},
            ],
        },
    )

    assert result == {
        "headers": {
            "Authorization": "[REDACTED]",
            "Accept": "application/json",
        },
        "context": [
            {"access_token": "[REDACTED]"},
            {"nested": {"password": "[REDACTED]"}},
        ],
    }
