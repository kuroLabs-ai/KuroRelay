"""Testing Engine — Assertion evaluation and test execution."""
from __future__ import annotations

import re
from typing import Any

import jsonschema


def extract_json_path(data: Any, path: str) -> tuple[bool, Any]:
    """Extract a value from nested dicts/lists using simplified JSONPath syntax.

    Supports:
      - $.foo.bar or foo.bar
      - $.items[0].id
      - $.users[1].name
    Returns:
      (exists: bool, value: Any)
    """
    if path.startswith("$."):
        path = path[2:]
    elif path.startswith("$"):
        path = path[1:]

    path = path.strip()
    if not path:
        return True, data

    tokens: list[str | int] = []
    for part in path.split("."):
        if not part:
            continue
        for match in re.finditer(r"([a-zA-Z0-9_\-]+)|\[(\d+)\]", part):
            if match.group(1):
                tokens.append(match.group(1))
            elif match.group(2):
                tokens.append(int(match.group(2)))

    curr = data
    for token in tokens:
        if isinstance(token, int):
            if not isinstance(curr, (list, tuple)) or token < 0 or token >= len(curr):
                return False, None
            curr = curr[token]
        else:
            if not isinstance(curr, dict) or token not in curr:
                return False, None
            curr = curr[token]

    return True, curr


class TestingEngine:
    """Evaluates HTTP response assertions and compiles test reports."""
    __test__ = False

    def evaluate_one(self, response: dict[str, Any], assertion: dict[str, Any]) -> dict[str, Any]:
        """Evaluate a single assertion against a normalized response dictionary."""
        assertion_id = assertion.get("id")
        assertion_type = assertion.get("type", "")
        description = assertion.get("description", f"Assertion {assertion_type}")

        passed = False
        expected_value: Any = None
        actual_value: Any = None
        error_message: str | None = None

        try:
            status_code = response.get("status_code", 0)
            duration_ms = response.get("duration_ms", 0.0)
            headers = {str(k).lower(): str(v) for k, v in response.get("headers", {}).items()}
            body_dict = response.get("body", {})
            body_data = body_dict.get("data") if isinstance(body_dict, dict) else body_dict

            if assertion_type == "status_eq":
                expected_value = int(assertion["value"])
                actual_value = int(status_code)
                passed = actual_value == expected_value

            elif assertion_type == "status_in":
                expected_value = [int(v) for v in assertion["values"]]
                actual_value = int(status_code)
                passed = actual_value in expected_value

            elif assertion_type == "response_time_lt":
                expected_value = f"< {assertion['value_ms']}ms"
                actual_value = f"{duration_ms}ms"
                passed = duration_ms < float(assertion["value_ms"])

            elif assertion_type == "header_eq":
                name = str(assertion.get("name", "")).lower()
                expected_value = str(assertion.get("value", ""))
                actual_value = headers.get(name)
                passed = actual_value == expected_value

            elif assertion_type == "header_exists":
                name = str(assertion.get("name", "")).lower()
                expected_value = f"header '{name}' exists"
                actual_value = "present" if name in headers else "missing"
                passed = name in headers

            elif assertion_type == "json_exists":
                path = str(assertion.get("path", "$"))
                expected_value = f"path '{path}' exists"
                exists, _ = extract_json_path(body_data, path)
                actual_value = "exists" if exists else "not found"
                passed = exists

            elif assertion_type == "json_eq":
                path = str(assertion.get("path", "$"))
                expected_value = assertion.get("value")
                exists, val = extract_json_path(body_data, path)
                if not exists:
                    actual_value = "path not found"
                    passed = False
                else:
                    actual_value = val
                    passed = val == expected_value

            elif assertion_type == "cookie_exists":
                name = str(assertion.get("name", ""))
                expected_value = f"cookie '{name}' exists"
                set_cookie = headers.get("set-cookie", "")
                actual_value = "present" if name in set_cookie else "missing"
                passed = name in set_cookie

            elif assertion_type == "cookie_eq":
                name = str(assertion.get("name", ""))
                expected_val = str(assertion.get("value", ""))
                expected_value = f"{name}={expected_val}"
                set_cookie = headers.get("set-cookie", "")
                passed = f"{name}={expected_val}" in set_cookie
                actual_value = set_cookie if passed else "cookie mismatch"

            elif assertion_type == "json_schema":
                schema = assertion.get("schema", {})
                expected_value = "valid schema"
                try:
                    jsonschema.validate(instance=body_data, schema=schema)
                    passed = True
                    actual_value = "valid"
                except jsonschema.ValidationError as err:
                    passed = False
                    actual_value = f"invalid: {err.message}"
                    error_message = err.message

            else:
                error_message = f"Unsupported assertion type: {assertion_type}"
                passed = False

        except Exception as exc:  # noqa: BLE001
            passed = False
            error_message = str(exc)

        return {
            "id": assertion_id,
            "type": assertion_type,
            "description": description,
            "expected_value": expected_value,
            "actual_value": actual_value,
            "passed": passed,
            "error": error_message,
        }

    def evaluate_all(
        self, response: dict[str, Any], assertions: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """Evaluate a list of assertions against a normalized response."""
        results = [self.evaluate_one(response, a) for a in assertions]
        passed_count = sum(1 for r in results if r["passed"])
        failed_count = sum(1 for r in results if not r["passed"])

        return {
            "total": len(results),
            "passed": passed_count,
            "failed": failed_count,
            "results": results,
        }
