"""
OpenAPI & Swagger specification parser and generator engine for KuroRelay.
Supports OpenAPI 3.0.x, 3.1.x, and Swagger 2.0 in both JSON and YAML formats.
"""
from __future__ import annotations

import json
from typing import Any
import yaml

from kurorelay.core.exceptions import ValidationError
from kurorelay.core.logging import get_logger

logger = get_logger(__name__)


class OpenAPIParser:
    """Parses OpenAPI and Swagger specifications into structured, standardized models."""

    def parse(self, content: str) -> dict[str, Any]:
        """Parse raw JSON or YAML OpenAPI/Swagger text into a normalized spec dictionary."""
        if not content or not isinstance(content, str) or not content.strip():
            raise ValidationError("OpenAPI specification content cannot be empty")

        raw_data = self._load_data(content.strip())
        if not isinstance(raw_data, dict):
            raise ValidationError("Specification must be a JSON or YAML object")

        is_swagger_2 = "swagger" in raw_data and str(raw_data["swagger"]).startswith("2")
        is_openapi_3 = "openapi" in raw_data and str(raw_data["openapi"]).startswith("3")

        if not is_swagger_2 and not is_openapi_3:
            raise ValidationError(
                "Unsupported specification format. Must be OpenAPI 3.x ('openapi': '3.x') or Swagger 2.0 ('swagger': '2.0')"
            )

        info = raw_data.get("info", {})
        title = str(info.get("title", "Untitled API"))
        version = str(info.get("version", "1.0.0"))
        description = str(info.get("description", ""))

        servers = self._extract_servers(raw_data, is_swagger_2)
        endpoints = self._extract_endpoints(raw_data, is_swagger_2)
        tags = self._extract_tags(raw_data, endpoints)

        return {
            "title": title,
            "version": version,
            "description": description,
            "format": "swagger_2" if is_swagger_2 else "openapi_3",
            "servers": servers,
            "tags": tags,
            "endpoints": endpoints,
        }

    @staticmethod
    def _load_data(content: str) -> Any:
        # First try fast JSON
        if content.startswith("{") or content.startswith("["):
            try:
                return json.loads(content)
            except Exception:
                pass
        # Fallback to YAML
        try:
            return yaml.safe_load(content)
        except Exception as exc:
            raise ValidationError(f"Failed to parse specification as JSON or YAML: {exc}") from exc

    @staticmethod
    def _extract_servers(raw_data: dict[str, Any], is_swagger_2: bool) -> list[str]:
        servers: list[str] = []
        if is_swagger_2:
            host = raw_data.get("host", "")
            base_path = raw_data.get("basePath", "")
            schemes = raw_data.get("schemes", ["https"])
            scheme = schemes[0] if schemes else "https"
            if host:
                servers.append(f"{scheme}://{host}{base_path}".rstrip("/"))
            elif base_path:
                servers.append(base_path.rstrip("/"))
        else:
            raw_servers = raw_data.get("servers", [])
            if isinstance(raw_servers, list):
                for s in raw_servers:
                    if isinstance(s, dict) and "url" in s:
                        servers.append(str(s["url"]).rstrip("/"))

        if not servers:
            servers.append("https://api.example.com")
        return servers

    def _extract_tags(self, raw_data: dict[str, Any], endpoints: list[dict[str, Any]]) -> list[str]:
        tag_set: set[str] = set()
        for t in raw_data.get("tags", []):
            if isinstance(t, dict) and "name" in t:
                tag_set.add(str(t["name"]))
        for ep in endpoints:
            for t in ep.get("tags", []):
                tag_set.add(str(t))
        if not tag_set:
            tag_set.add("Default")
        return sorted(tag_set)

    def _extract_endpoints(self, raw_data: dict[str, Any], is_swagger_2: bool) -> list[dict[str, Any]]:
        endpoints: list[dict[str, Any]] = []
        paths = raw_data.get("paths", {})
        if not isinstance(paths, dict):
            return endpoints

        http_methods = {"get", "post", "put", "delete", "patch", "options", "head"}

        for path, path_item in paths.items():
            if not isinstance(path_item, dict):
                continue

            common_params = path_item.get("parameters", [])

            for method_name, op in path_item.items():
                if method_name.lower() not in http_methods or not isinstance(op, dict):
                    continue

                method = method_name.upper()
                summary = str(op.get("summary", path))
                description = str(op.get("description", ""))
                operation_id = str(op.get("operationId", f"{method}_{path}"))
                tags = [str(t) for t in op.get("tags", ["Default"])]
                if not tags:
                    tags = ["Default"]

                # Merge parameters
                op_params = op.get("parameters", [])
                all_params = list(common_params) + list(op_params)
                parsed_params = self._parse_parameters(all_params, raw_data)

                # Request body
                request_body = self._parse_request_body(op, raw_data, is_swagger_2)

                # Responses
                responses = self._parse_responses(op.get("responses", {}), raw_data)

                endpoints.append({
                    "id": f"{method}:{path}",
                    "path": path,
                    "method": method,
                    "summary": summary,
                    "description": description,
                    "operation_id": operation_id,
                    "tags": tags,
                    "parameters": parsed_params,
                    "request_body": request_body,
                    "responses": responses,
                })

        return endpoints

    def _resolve_ref(self, ref: str, raw_data: dict[str, Any]) -> dict[str, Any]:
        """Resolves local JSON pointers like #/components/schemas/User."""
        if not ref.startswith("#/"):
            return {}
        parts = ref[2:].split("/")
        curr = raw_data
        for part in parts:
            if isinstance(curr, dict) and part in curr:
                curr = curr[part]
            else:
                return {}
        return curr if isinstance(curr, dict) else {}

    def _parse_parameters(self, raw_params: list[Any], raw_data: dict[str, Any]) -> list[dict[str, Any]]:
        params: list[dict[str, Any]] = []
        for p in raw_params:
            if not isinstance(p, dict):
                continue
            if "$ref" in p:
                p = self._resolve_ref(p["$ref"], raw_data)
            name = str(p.get("name", ""))
            param_in = str(p.get("in", "query"))
            required = bool(p.get("required", False)) or param_in == "path"
            description = str(p.get("description", ""))
            schema = p.get("schema", {})
            param_type = str(p.get("type", schema.get("type", "string")))

            params.append({
                "name": name,
                "in": param_in,
                "required": required,
                "description": description,
                "type": param_type,
                "default": p.get("default", schema.get("default")),
            })
        return params

    def _parse_request_body(self, op: dict[str, Any], raw_data: dict[str, Any], is_swagger_2: bool) -> dict[str, Any] | None:
        if is_swagger_2:
            # In Swagger 2.0, body parameters are in parameters with in: "body"
            for p in op.get("parameters", []):
                if isinstance(p, dict) and p.get("in") == "body":
                    schema = p.get("schema", {})
                    if "$ref" in schema:
                        schema = self._resolve_ref(schema["$ref"], raw_data)
                    sample = self.generate_sample_from_schema(schema, raw_data)
                    return {
                        "required": bool(p.get("required", False)),
                        "content_type": "application/json",
                        "schema": schema,
                        "sample_payload": sample,
                    }
            return None

        # OpenAPI 3.x
        rb = op.get("requestBody")
        if not isinstance(rb, dict):
            return None

        if "$ref" in rb:
            rb = self._resolve_ref(rb["$ref"], raw_data)

        content = rb.get("content", {})
        content_type = "application/json"
        media_type = content.get("application/json") or next(iter(content.values()), None)
        schema = {}
        sample = None

        if isinstance(media_type, dict):
            schema = media_type.get("schema", {})
            if "$ref" in schema:
                schema = self._resolve_ref(schema["$ref"], raw_data)
            sample = self.generate_sample_from_schema(schema, raw_data)

        return {
            "required": bool(rb.get("required", False)),
            "content_type": content_type,
            "description": str(rb.get("description", "")),
            "schema": schema,
            "sample_payload": sample,
        }

    def _parse_responses(self, raw_responses: dict[str, Any], raw_data: dict[str, Any]) -> list[dict[str, Any]]:
        responses: list[dict[str, Any]] = []
        if not isinstance(raw_responses, dict):
            return responses

        for status_code, resp in raw_responses.items():
            if not isinstance(resp, dict):
                continue
            if "$ref" in resp:
                resp = self._resolve_ref(resp["$ref"], raw_data)

            description = str(resp.get("description", ""))
            content = resp.get("content", {})
            schema = {}

            if "schema" in resp:  # Swagger 2
                schema = resp["schema"]
            elif isinstance(content, dict) and content:
                first_media = next(iter(content.values()), {})
                if isinstance(first_media, dict):
                    schema = first_media.get("schema", {})

            if "$ref" in schema:
                schema = self._resolve_ref(schema["$ref"], raw_data)

            sample = self.generate_sample_from_schema(schema, raw_data) if schema else None

            responses.append({
                "status_code": str(status_code),
                "description": description,
                "schema": schema,
                "sample": sample,
            })
        return responses

    def generate_sample_from_schema(
        self, schema: dict[str, Any], raw_data: dict[str, Any], depth: int = 0
    ) -> Any:
        """Recursively generates a clean example JSON value from an OpenAPI schema."""
        if depth > 5 or not isinstance(schema, dict):
            return {}

        if "$ref" in schema:
            resolved = self._resolve_ref(schema["$ref"], raw_data)
            return self.generate_sample_from_schema(resolved, raw_data, depth + 1)

        if "example" in schema:
            return schema["example"]
        if "default" in schema:
            return schema["default"]

        schema_type = schema.get("type", "object")

        if schema_type == "object" or "properties" in schema:
            props = schema.get("properties", {})
            res: dict[str, Any] = {}
            for prop_name, prop_schema in props.items():
                if isinstance(prop_schema, dict):
                    res[prop_name] = self.generate_sample_from_schema(prop_schema, raw_data, depth + 1)
            return res

        if schema_type == "array":
            items = schema.get("items", {})
            if isinstance(items, dict):
                return [self.generate_sample_from_schema(items, raw_data, depth + 1)]
            return []

        if schema_type == "string":
            fmt = schema.get("format", "")
            if fmt == "date-time":
                return "2026-01-01T12:00:00Z"
            if fmt == "date":
                return "2026-01-01"
            if fmt == "email":
                return "user@example.com"
            if fmt == "uri":
                return "https://example.com"
            return "string"

        if schema_type == "integer":
            return 1

        if schema_type == "number":
            return 1.5

        if schema_type == "boolean":
            return True

        return None
