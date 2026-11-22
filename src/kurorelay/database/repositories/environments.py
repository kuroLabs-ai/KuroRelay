"""Environment persistence with secrets kept in the operating-system keyring."""
from __future__ import annotations

import uuid
from typing import Protocol

import keyring
from sqlalchemy import select
from sqlalchemy.orm import Session

from kurorelay.core.exceptions import DatabaseError, ValidationError
from kurorelay.database.models.environment import Environment, EnvironmentVariable
from kurorelay.database.models.workspace import Workspace

_KEYRING_SERVICE = "KuroRelay.Environment"


class SecretStore(Protocol):
    def get(self, environment_id: str, variable_id: str) -> str | None: ...

    def set(self, environment_id: str, variable_id: str, value: str) -> None: ...

    def delete(self, environment_id: str, variable_id: str) -> None: ...


class KeyringSecretStore:
    def get(self, environment_id: str, variable_id: str) -> str | None:
        try:
            return keyring.get_password(
                _KEYRING_SERVICE, self._credential_name(environment_id, variable_id)
            )
        except keyring.errors.KeyringError as exc:
            raise DatabaseError("Secure credential storage is unavailable") from exc

    def set(self, environment_id: str, variable_id: str, value: str) -> None:
        try:
            keyring.set_password(
                _KEYRING_SERVICE,
                self._credential_name(environment_id, variable_id),
                value,
            )
        except keyring.errors.KeyringError as exc:
            raise DatabaseError("Secure credential storage is unavailable") from exc

    def delete(self, environment_id: str, variable_id: str) -> None:
        try:
            keyring.delete_password(
                _KEYRING_SERVICE,
                self._credential_name(environment_id, variable_id),
            )
        except keyring.errors.PasswordDeleteError:
            pass
        except keyring.errors.KeyringError as exc:
            raise DatabaseError("Secure credential storage is unavailable") from exc

    @staticmethod
    def _credential_name(environment_id: str, variable_id: str) -> str:
        return f"{environment_id}:{variable_id}"


class EnvironmentRepository:
    def __init__(
        self, session: Session, secret_store: SecretStore | None = None
    ) -> None:
        self._session = session
        self._secret_store = secret_store or KeyringSecretStore()

    def create(
        self, workspace_id: str, name: str, *, is_active: bool = False
    ) -> Environment:
        if self._session.get(Workspace, workspace_id) is None:
            raise ValidationError("Workspace does not exist")
        if not isinstance(is_active, bool):
            raise ValidationError("Environment active state must be a boolean")
        name = name.strip() if isinstance(name, str) else ""
        if not name or len(name) > 255:
            raise ValidationError("Environment name must be between 1 and 255 characters")
        if is_active:
            self._deactivate_workspace_environments(workspace_id)
        environment = Environment(
            workspace_id=workspace_id,
            name=name,
            is_active=is_active,
        )
        self._session.add(environment)
        self._session.flush()
        return environment

    def list_for_workspace(self, workspace_id: str) -> list[Environment]:
        return list(
            self._session.scalars(
                select(Environment)
                .where(Environment.workspace_id == workspace_id)
                .order_by(Environment.created_at, Environment.id)
            )
        )

    def get_by_id(self, environment_id: str) -> Environment | None:
        return self._session.get(Environment, environment_id)

    def update(
        self,
        environment: Environment,
        *,
        name: str | None = None,
        is_active: bool | None = None,
    ) -> Environment:
        if name is not None:
            name = name.strip() if isinstance(name, str) else ""
            if not name or len(name) > 255:
                raise ValidationError(
                    "Environment name must be between 1 and 255 characters"
                )
            environment.name = name
        if is_active is not None:
            if not isinstance(is_active, bool):
                raise ValidationError("Environment active state must be a boolean")
            if is_active:
                self._deactivate_workspace_environments(environment.workspace_id)
            environment.is_active = is_active
        self._session.flush()
        return environment

    def set_variable(
        self,
        environment_id: str,
        key: str,
        value: str,
        *,
        is_secret: bool = False,
        is_enabled: bool = True,
    ) -> EnvironmentVariable:
        environment = self._session.get(Environment, environment_id)
        if environment is None:
            raise ValidationError("Environment does not exist")
        key = key.strip() if isinstance(key, str) else ""
        if not key or len(key) > 255:
            raise ValidationError("Variable name must be between 1 and 255 characters")
        if not isinstance(value, str):
            raise ValidationError("Variable value must be text")
        if not isinstance(is_secret, bool) or not isinstance(is_enabled, bool):
            raise ValidationError("Variable flags must be booleans")

        variable = self._session.scalar(
            select(EnvironmentVariable).where(
                EnvironmentVariable.environment_id == environment_id,
                EnvironmentVariable.key == key,
            )
        )
        if is_secret and not value:
            if variable is None or not variable.is_secret:
                raise ValidationError("Secret variable value cannot be empty")

        if variable is None:
            variable = EnvironmentVariable(
                id=str(uuid.uuid4()),
                environment_id=environment_id,
                key=key,
            )
            self._session.add(variable)
        self._session.flush()

        if is_secret:
            if value:
                self._secret_store.set(environment_id, variable.id, value)
            variable.value = ""
        else:
            if variable.is_secret:
                self._secret_store.delete(environment_id, variable.id)
            variable.value = value
        variable.is_secret = is_secret
        variable.is_enabled = is_enabled
        self._session.flush()
        return variable

    def get_secret_value(self, environment_id: str, variable_id: str) -> str | None:
        return self._secret_store.get(environment_id, variable_id)

    def values_for_resolution(self, environment_id: str) -> dict[str, str]:
        environment = self._session.get(Environment, environment_id)
        if environment is None:
            raise ValidationError("Environment does not exist")
        values: dict[str, str] = {}
        for variable in environment.variables:
            if not variable.is_enabled:
                continue
            if variable.is_secret:
                value = self._secret_store.get(environment_id, variable.id)
                if value is None:
                    raise ValidationError(
                        "A secret environment variable is missing from the credential store",
                        details={"variable": variable.key},
                    )
                values[variable.key] = value
            else:
                values[variable.key] = variable.value
        return values

    def delete(self, environment: Environment) -> None:
        for variable in environment.variables:
            if variable.is_secret:
                self._secret_store.delete(environment.id, variable.id)
        self._session.delete(environment)

    def delete_variable(self, environment_id: str, variable_id: str) -> None:
        variable = self._session.get(EnvironmentVariable, variable_id)
        if variable is None or variable.environment_id != environment_id:
            raise ValidationError("Environment variable does not exist")
        if variable.is_secret:
            self._secret_store.delete(environment_id, variable.id)
        self._session.delete(variable)

    def _deactivate_workspace_environments(self, workspace_id: str) -> None:
        environments = self._session.scalars(
            select(Environment).where(
                Environment.workspace_id == workspace_id,
                Environment.is_active.is_(True),
            )
        )
        for environment in environments:
            environment.is_active = False
