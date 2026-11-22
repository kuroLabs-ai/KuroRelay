"""Apply supported request authentication without persisting credentials."""
import httpx

from kurorelay.bridge.schemas.request import AuthConfig
from kurorelay.core.exceptions import ValidationError


class AuthenticationEngine:
    def apply(
        self, auth: AuthConfig | None, headers: dict[str, str]
    ) -> tuple[dict[str, str], httpx.Auth | None]:
        request_headers = dict(headers)
        if auth is None or auth.type == "none":
            return request_headers, None

        if auth.type == "bearer":
            token = auth.configuration.get("token")
            if not isinstance(token, str) or not token.strip():
                raise ValidationError("A bearer token is required")
            self._set_header(request_headers, "Authorization", f"Bearer {token.strip()}")
            return request_headers, None

        if auth.type == "api_key":
            key = auth.configuration.get("key") or auth.configuration.get("header") or auth.configuration.get("name")
            value = auth.configuration.get("value") or auth.configuration.get("token") or ""
            if not isinstance(key, str) or not key.strip():
                raise ValidationError("A header name is required for API key authentication")
            self._set_header(request_headers, key.strip(), str(value))
            return request_headers, None

        username = auth.configuration.get("username")
        password = auth.configuration.get("password")
        if not isinstance(username, str) or not username:
            raise ValidationError("A username is required for basic authentication")
        if not isinstance(password, str) or not password:
            raise ValidationError("A password is required for basic authentication")
        return request_headers, httpx.BasicAuth(username, password)

    @staticmethod
    def _set_header(headers: dict[str, str], name: str, value: str) -> None:
        for existing_name in list(headers):
            if existing_name.lower() == name.lower():
                del headers[existing_name]
        headers[name] = value
