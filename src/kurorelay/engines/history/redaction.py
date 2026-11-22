"""Secret redaction for persisted request data."""
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from kurorelay.core.exceptions import ValidationError

_VARIABLE_REFERENCE = re.compile(r"\{\{\s*[A-Za-z_][A-Za-z0-9_.-]*\s*\}\}")
_SENSITIVE_PARTS = (
    "authorization",
    "apikey",
    "cookie",
    "credential",
    "password",
    "passwd",
    "secret",
    "token",
)
_REDACTED = "[REDACTED]"


def redact_sensitive_data(value):
    if isinstance(value, dict):
        redacted = {}
        for key, item in value.items():
            if isinstance(key, str) and _is_sensitive_name(key):
                redacted[key] = (
                    item
                    if isinstance(item, str) and _VARIABLE_REFERENCE.fullmatch(item)
                    else _REDACTED
                )
            elif isinstance(key, str) and key.casefold() == "url" and isinstance(item, str):
                redacted[key] = _redact_url(item)
            else:
                redacted[key] = redact_sensitive_data(item)
        return redacted
    if isinstance(value, list):
        return [redact_sensitive_data(item) for item in value]
    if isinstance(value, tuple):
        return [redact_sensitive_data(item) for item in value]
    return value


def _is_sensitive_name(name: str) -> bool:
    normalized = re.sub(r"[^a-z0-9]", "", name.casefold())
    return normalized in {"key", "sig", "signature"} or any(
        part in normalized for part in _SENSITIVE_PARTS
    )


def _redact_url(url: str) -> str:
    try:
        parts = urlsplit(url)
        query = [
            (
                key,
                _REDACTED
                if _is_sensitive_name(key)
                or re.sub(r"[^a-z0-9]", "", key.casefold())
                in {"key", "sig", "signature"}
                else value,
            )
            for key, value in parse_qsl(parts.query, keep_blank_values=True)
        ]
        return urlunsplit(
            (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
        )
    except ValueError:
        raise ValidationError("History contains an invalid request URL") from None
