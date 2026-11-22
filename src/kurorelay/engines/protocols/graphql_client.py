"""GraphQL client and introspection engine."""
from __future__ import annotations

import json
import time
from typing import Any

import httpx

from kurorelay.core.exceptions import ValidationError
from kurorelay.core.logging import get_logger

logger = get_logger(__name__)

try:
    from graphql import parse, Source, GraphQLError
except ImportError:
    parse = None
    Source = None
    GraphQLError = None


INTROSPECTION_QUERY = """
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind
      name
      description
      fields(includeDeprecated: true) {
        name
        description
        args {
          name
          description
          type {
            kind
            name
            ofType {
              kind
              name
            }
          }
        }
        type {
          kind
          name
          ofType {
            kind
            name
          }
        }
      }
    }
  }
}
"""


class GraphQLClient:
    """Handles GraphQL query execution, validation, and introspection."""

    def validate_query(self, query: str) -> dict[str, Any]:
        """Validate query syntax using graphql-core."""
        if not query.strip():
            return {"valid": False, "errors": ["Query cannot be empty"]}

        if parse is not None:
            try:
                parse(query)
                return {"valid": True, "errors": []}
            except Exception as exc:
                return {"valid": False, "errors": [str(exc)]}
        return {"valid": True, "errors": []}

    def execute(
        self,
        url: str,
        query: str,
        variables: dict[str, Any] | None = None,
        operation_name: str | None = None,
        headers: dict[str, str] | None = None,
        timeout_seconds: float = 30.0,
    ) -> dict[str, Any]:
        """Execute a GraphQL query/mutation against an endpoint."""
        url = url.strip()
        if not (url.startswith("http://") or url.startswith("https://")):
            raise ValidationError("GraphQL URL must begin with http:// or https://")

        val_res = self.validate_query(query)
        if not val_res["valid"]:
            return {
                "status": "failed",
                "validation_errors": val_res["errors"],
                "data": None,
                "errors": [{"message": err} for err in val_res["errors"]],
                "duration_ms": 0.0,
                "status_code": 400,
            }

        req_headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if headers:
            req_headers.update(headers)

        payload: dict[str, Any] = {"query": query}
        if variables is not None:
            payload["variables"] = variables
        if operation_name:
            payload["operationName"] = operation_name

        start_time = time.monotonic()
        try:
            with httpx.Client(timeout=timeout_seconds, follow_redirects=True) as client:
                resp = client.post(url, json=payload, headers=req_headers)
                duration_ms = (time.monotonic() - start_time) * 1000

                try:
                    res_json = resp.json()
                except Exception:
                    res_json = {"data": None, "errors": [{"message": resp.text}]}

                return {
                    "status": "completed" if resp.is_success and "errors" not in res_json else "completed_with_errors",
                    "status_code": resp.status_code,
                    "duration_ms": round(duration_ms, 2),
                    "size_bytes": len(resp.content),
                    "data": res_json.get("data"),
                    "errors": res_json.get("errors"),
                }
        except Exception as exc:
            duration_ms = (time.monotonic() - start_time) * 1000
            return {
                "status": "failed",
                "status_code": 0,
                "duration_ms": round(duration_ms, 2),
                "size_bytes": 0,
                "data": None,
                "errors": [{"message": str(exc)}],
            }

    def introspect(
        self,
        url: str,
        headers: dict[str, str] | None = None,
        timeout_seconds: float = 30.0,
    ) -> dict[str, Any]:
        """Introspect a GraphQL endpoint and return structured types and schema."""
        result = self.execute(
            url=url,
            query=INTROSPECTION_QUERY,
            operation_name="IntrospectionQuery",
            headers=headers,
            timeout_seconds=timeout_seconds,
        )

        if result.get("status") == "failed" or not result.get("data"):
            return {
                "status": "failed",
                "errors": result.get("errors", [{"message": "Introspection query failed"}]),
                "schema": None,
            }

        schema_data = (result["data"] or {}).get("__schema") or {}
        raw_types = schema_data.get("types") or []

        # Filter out built-in __ types for clean UI browsing
        user_types = [t for t in raw_types if not t.get("name", "").startswith("__")]

        query_type_name = (schema_data.get("queryType") or {}).get("name")
        mutation_type_name = (schema_data.get("mutationType") or {}).get("name")

        queries = []
        mutations = []
        custom_types = []

        for t in user_types:
            name = t.get("name")
            if name == query_type_name:
                queries = t.get("fields") or []
            elif name == mutation_type_name:
                mutations = t.get("fields") or []
            else:
                custom_types.append(t)

        return {
            "status": "ok",
            "query_type": query_type_name,
            "mutation_type": mutation_type_name,
            "queries": queries,
            "mutations": mutations,
            "types": custom_types,
        }
