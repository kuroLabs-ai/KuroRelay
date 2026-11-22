"""Resolve request variables with explicit scope precedence."""
from __future__ import annotations

import re
from typing import Any

from kurorelay.core.exceptions import ValidationError

_VARIABLE_PATTERN = re.compile(r"\{\{\s*([\$A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}")
_SCOPE_PRECEDENCE = ("request", "workflow", "collection", "environment", "global")


class EnvironmentEngine:
    def resolve(self, value: Any, scopes: dict[str, dict[str, str]]) -> Any:
        unresolved: set[str] = set()
        resolved = self._resolve_value(value, self._merge_scopes(scopes), unresolved)
        if unresolved:
            raise ValidationError(
                "Request contains unresolved variables",
                details={"variables": sorted(unresolved)},
            )
        return resolved

    @staticmethod
    def _merge_scopes(scopes: dict[str, dict[str, str]]) -> dict[str, str]:
        merged: dict[str, str] = {}
        for scope in reversed(_SCOPE_PRECEDENCE):
            merged.update(scopes.get(scope, {}))
        return merged

    def _resolve_value(
        self, value: Any, variables: dict[str, str], unresolved: set[str]
    ) -> Any:
        if isinstance(value, str):
            return _VARIABLE_PATTERN.sub(
                lambda match: self._resolve_match(match, variables, unresolved),
                value,
            )
        if isinstance(value, list):
            return [self._resolve_value(item, variables, unresolved) for item in value]
        if isinstance(value, dict):
            return {
                self._resolve_value(key, variables, unresolved)
                if isinstance(key, str)
                else key: self._resolve_value(item, variables, unresolved)
                for key, item in value.items()
            }
        return value

    @staticmethod
    def _resolve_dynamic(name: str) -> str | None:
        import random
        import string
        import time
        import uuid
        from datetime import UTC, datetime

        clean = name.lower()
        if clean in ("$guid", "$uuid"):
            return str(uuid.uuid4())
        if clean in ("$timestamp",):
            return str(int(time.time()))
        if clean in ("$isotimestamp",):
            return datetime.now(UTC).isoformat()
        if clean in ("$randomint",):
            return str(random.randint(1, 1000))
        if clean in ("$randomemail",):
            suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
            return f"user_{suffix}@example.com"
        if clean in ("$randomfirstname",):
            names = ["Alex", "Sam", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Avery"]
            return random.choice(names)
        if clean in ("$randomalphanumeric",):
            return "".join(random.choices(string.ascii_letters + string.digits, k=12))
        return None

    @classmethod
    def _resolve_match(cls, match, variables: dict[str, str], unresolved: set[str]) -> str:
        name = match.group(1)
        if name in variables:
            return variables[name]
        dynamic_val = cls._resolve_dynamic(name)
        if dynamic_val is not None:
            return dynamic_val
        unresolved.add(name)
        return match.group(0)
