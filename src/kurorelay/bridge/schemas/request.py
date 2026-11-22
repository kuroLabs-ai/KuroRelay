"""Validated request payloads accepted by the desktop bridge."""
import re
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictStr,
    field_validator,
)

_HTTP_METHOD_TOKEN = re.compile(r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+\Z")


class RequestBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["none", "json", "raw", "form", "multipart"] = "none"
    content: Any = None


class AuthConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["none", "basic", "bearer", "api_key"] = "none"
    configuration: dict[str, Any] = Field(default_factory=dict)


class RequestPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: str = Field(min_length=1, max_length=32)
    url: str = Field(min_length=1)
    headers: dict[str, str] = Field(default_factory=dict)
    params: dict[str, str] = Field(default_factory=dict)
    body: RequestBody | None = None
    auth: AuthConfig | None = None
    workspace_id: StrictStr | None = None
    environment_id: StrictStr | None = None
    variable_scopes: dict[str, dict[str, str]] = Field(default_factory=dict)
    allow_private_network: StrictBool = False
    timeout_ms: int = Field(default=30_000, gt=0, le=300_000)
    verify_tls: StrictBool = True
    follow_redirects: StrictBool = True

    @field_validator("method")
    @classmethod
    def normalize_method(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not _HTTP_METHOD_TOKEN.fullmatch(normalized):
            raise ValueError("method must contain only valid HTTP token characters")
        return normalized

    @field_validator("workspace_id", "environment_id")
    @classmethod
    def validate_optional_ids(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("ID must not be empty")
        return normalized

    @field_validator("variable_scopes")
    @classmethod
    def validate_variable_scopes(
        cls, value: dict[str, dict[str, str]]
    ) -> dict[str, dict[str, str]]:
        allowed_scopes = {"request", "workflow", "collection", "environment", "global"}
        unsupported_scopes = sorted(set(value) - allowed_scopes)
        if unsupported_scopes:
            raise ValueError("variable scopes contain unsupported scope names")
        return value
