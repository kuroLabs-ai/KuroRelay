"""Validate request inputs and prepare HTTPX-compatible request data."""
from __future__ import annotations

import json
from dataclasses import dataclass

import httpx
from pydantic import ValidationError as PydanticValidationError

from kurorelay.bridge.schemas.request import RequestBody, RequestPayload
from kurorelay.core.exceptions import ValidationError
from kurorelay.engines.authentication.engine import AuthenticationEngine
from kurorelay.engines.environments.engine import EnvironmentEngine


@dataclass(frozen=True)
class PreparedRequest:
    method: str
    url: str
    headers: dict[str, str]
    params: dict[str, str]
    content: bytes | None
    auth: httpx.Auth | None
    timeout_seconds: float
    verify_tls: bool
    follow_redirects: bool
    allow_private_network: bool


class RequestEngine:
    def __init__(
        self,
        authentication: AuthenticationEngine | None = None,
        environments: EnvironmentEngine | None = None,
    ) -> None:
        self._authentication = authentication or AuthenticationEngine()
        self._environments = environments or EnvironmentEngine()

    def prepare(self, payload: dict | RequestPayload) -> PreparedRequest:
        request = self.validate(payload)

        scopes = request.variable_scopes
        url = self._environments.resolve(request.url, scopes)
        self._validate_url(url)
        headers = {
            key: self._environments.resolve(value, scopes)
            for key, value in request.headers.items()
        }
        auth = request.auth
        if auth is not None:
            auth = auth.model_copy(
                update={
                    "configuration": self._environments.resolve(
                        auth.configuration, scopes
                    )
                }
            )
        auth_headers, auth = self._authentication.apply(auth, headers)
        params = {
            key: self._environments.resolve(value, scopes)
            for key, value in request.params.items()
        }
        request_body = request.body
        if request_body is not None:
            request_body = request_body.model_copy(
                update={
                    "content": self._environments.resolve(
                        request_body.content, scopes
                    )
                }
            )
        content, content_type = self._build_content_and_headers(request_body)

        if not any(name.lower() == "content-type" for name in auth_headers):
            if content_type:
                auth_headers["Content-Type"] = content_type

        return PreparedRequest(
            method=request.method,
            url=url,
            headers=auth_headers,
            params=params,
            content=content,
            auth=auth,
            timeout_seconds=request.timeout_ms / 1000,
            verify_tls=request.verify_tls,
            follow_redirects=request.follow_redirects,
            allow_private_network=request.allow_private_network,
        )

    @staticmethod
    def validate(payload: dict | RequestPayload) -> RequestPayload:
        try:
            return (
                payload
                if isinstance(payload, RequestPayload)
                else RequestPayload.model_validate(payload)
            )
        except PydanticValidationError as exc:
            fields = sorted(
                {".".join(str(part) for part in error["loc"]) for error in exc.errors()}
            )
            raise ValidationError(
                "Invalid request payload",
                details={"fields": fields},
            ) from None

    @staticmethod
    def _validate_url(url: str) -> None:
        try:
            parsed_url = httpx.URL(url)
        except httpx.InvalidURL:
            raise ValidationError("Request URL is invalid") from None

        if parsed_url.scheme not in {"http", "https"} or not parsed_url.host:
            raise ValidationError("Request URL must use HTTP or HTTPS")
        if parsed_url.username or parsed_url.password:
            raise ValidationError(
                "Configure credentials in the Auth tab instead of the URL"
            )

    @staticmethod
    def _build_content(body: RequestBody | None) -> bytes | None:
        content, _ = RequestEngine._build_content_and_headers(body)
        return content

    @staticmethod
    def _build_content_and_headers(
        body: RequestBody | None,
    ) -> tuple[bytes | None, str | None]:
        if body is None or body.type == "none":
            return None, None
        if body.type == "json":
            try:
                data = json.dumps(body.content, allow_nan=False).encode("utf-8")
                return data, "application/json"
            except (TypeError, ValueError):
                raise ValidationError(
                    "JSON request body must contain JSON-serializable data"
                ) from None

        if body.type == "form":
            import urllib.parse

            if isinstance(body.content, dict):
                return urllib.parse.urlencode(body.content).encode("utf-8"), "application/x-www-form-urlencoded"
            if isinstance(body.content, list):
                pairs: list[tuple[str, str]] = []
                for item in body.content:
                    if isinstance(item, dict):
                        if item.get("enabled", True) and item.get("key"):
                            pairs.append((str(item["key"]), str(item.get("value", ""))))
                    elif isinstance(item, (list, tuple)) and len(item) >= 2:
                        pairs.append((str(item[0]), str(item[1])))
                return urllib.parse.urlencode(pairs).encode("utf-8"), "application/x-www-form-urlencoded"
            if isinstance(body.content, str):
                try:
                    parsed = json.loads(body.content)
                    if isinstance(parsed, (dict, list)):
                        return RequestEngine._build_content_and_headers(
                            RequestBody(type="form", content=parsed)
                        )
                except Exception:
                    pass
                return body.content.encode("utf-8"), "application/x-www-form-urlencoded"
            if isinstance(body.content, bytes):
                return body.content, "application/x-www-form-urlencoded"
            return b"", "application/x-www-form-urlencoded"

        if body.type == "multipart":
            import base64
            import mimetypes
            import os
            from pathlib import Path

            raw_items = body.content
            if isinstance(raw_items, str):
                try:
                    raw_items = json.loads(raw_items)
                except Exception:
                    raw_items = []

            data_dict: dict[str, list[str]] = {}
            files_dict: dict[str, tuple[str, bytes, str]] = {}

            if isinstance(raw_items, dict):
                for k, v in raw_items.items():
                    data_dict.setdefault(str(k), []).append(str(v))
            elif isinstance(raw_items, list):
                for item in raw_items:
                    if not isinstance(item, dict):
                        continue
                    if not item.get("enabled", True):
                        continue
                    key = str(item.get("key", "")).strip()
                    if not key:
                        continue
                    item_type = str(item.get("type", "text")).lower()
                    val = item.get("value", "")

                    if item_type == "file":
                        file_data_b64 = item.get("fileData")
                        filename = item.get("filename") or (
                            Path(val).name if val else f"{key}.bin"
                        )
                        mime_type = (
                            item.get("mimeType")
                            or mimetypes.guess_type(filename)[0]
                            or "application/octet-stream"
                        )

                        val_clean = str(val).strip().strip('"').strip("'")
                        file_bytes = b""
                        if file_data_b64 and isinstance(file_data_b64, str):
                            try:
                                b64_clean = file_data_b64.split(",", 1)[-1]
                                file_bytes = base64.b64decode(b64_clean)
                            except Exception:
                                file_bytes = str(file_data_b64).encode("utf-8")
                        elif val_clean and os.path.isfile(val_clean):
                            try:
                                file_bytes = Path(val_clean).read_bytes()
                                filename = item.get("filename") or Path(val_clean).name
                                mime_type = (
                                    item.get("mimeType")
                                    or mimetypes.guess_type(filename)[0]
                                    or mime_type
                                )
                            except Exception:
                                file_bytes = val_clean.encode("utf-8")
                        else:
                            file_bytes = str(val).encode("utf-8")

                        files_dict[key] = (filename, file_bytes, mime_type)
                    else:
                        data_dict.setdefault(key, []).append(str(val))

            data_flat = {
                k: v[0] if len(v) == 1 else v for k, v in data_dict.items()
            }

            if not data_flat and not files_dict:
                return b"", "multipart/form-data; boundary=---------------------------kurorelay"

            req = httpx.Request(
                method="POST",
                url="http://placeholder",
                data=data_flat if data_flat else None,
                files=files_dict if files_dict else None,
            )
            req.read()
            return req.content, req.headers.get("content-type")

        if isinstance(body.content, str):
            return body.content.encode("utf-8"), None
        if isinstance(body.content, bytes):
            return body.content, None
        raise ValidationError("Raw request body must be text or bytes")
