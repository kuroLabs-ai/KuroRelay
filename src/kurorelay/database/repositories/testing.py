"""Testing repositories for TestSuite and TestCase entities."""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from kurorelay.core.exceptions import ValidationError
from kurorelay.database.models.request import Request
from kurorelay.database.models.testing import TestCase, TestSuite
from kurorelay.database.models.workspace import Workspace


class TestSuiteRepository:
    __test__ = False

    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, workspace_id: str, name: str, description: str = "") -> TestSuite:
        workspace = self._session.get(Workspace, workspace_id)
        if workspace is None:
            raise ValidationError("Workspace does not exist")
        name = name.strip() if isinstance(name, str) else ""
        if not name or len(name) > 255:
            raise ValidationError("Test suite name must be between 1 and 255 characters")
        if not isinstance(description, str):
            raise ValidationError("Test suite description must be text")

        suite = TestSuite(
            workspace_id=workspace_id,
            name=name,
            description=description,
        )
        self._session.add(suite)
        self._session.flush()
        return suite

    def list_for_workspace(self, workspace_id: str) -> list[TestSuite]:
        return list(
            self._session.scalars(
                select(TestSuite)
                .where(TestSuite.workspace_id == workspace_id)
                .order_by(TestSuite.created_at, TestSuite.id)
            )
        )

    def get_by_id(self, suite_id: str) -> TestSuite | None:
        return self._session.get(TestSuite, suite_id)

    def update(
        self,
        suite: TestSuite,
        *,
        name: str | None = None,
        description: str | None = None,
    ) -> TestSuite:
        if name is not None:
            name = name.strip() if isinstance(name, str) else ""
            if not name or len(name) > 255:
                raise ValidationError("Test suite name must be between 1 and 255 characters")
            suite.name = name
        if description is not None:
            if not isinstance(description, str):
                raise ValidationError("Test suite description must be text")
            suite.description = description
        self._session.flush()
        return suite

    def delete(self, suite: TestSuite) -> None:
        self._session.delete(suite)
        self._session.flush()


class TestCaseRepository:
    __test__ = False

    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self,
        suite_id: str,
        name: str,
        assertion_type: str,
        assertion_config: dict[str, Any],
        request_id: str | None = None,
    ) -> TestCase:
        suite = self._session.get(TestSuite, suite_id)
        if suite is None:
            raise ValidationError("Test suite does not exist")

        name = name.strip() if isinstance(name, str) else ""
        if not name or len(name) > 255:
            raise ValidationError("Test case name must be between 1 and 255 characters")

        if not isinstance(assertion_type, str) or not assertion_type.strip():
            raise ValidationError("Assertion type must be specified")

        if not isinstance(assertion_config, dict):
            raise ValidationError("Assertion config must be an object")

        if request_id is not None:
            req = self._session.get(Request, request_id)
            if req is None:
                raise ValidationError("Referenced request does not exist")

        case = TestCase(
            suite_id=suite_id,
            request_id=request_id,
            name=name,
            assertion_type=assertion_type.strip(),
            assertion_config_json=json.dumps(assertion_config),
        )
        self._session.add(case)
        self._session.flush()
        return case

    def list_for_suite(self, suite_id: str) -> list[TestCase]:
        return list(
            self._session.scalars(
                select(TestCase)
                .where(TestCase.suite_id == suite_id)
                .order_by(TestCase.created_at, TestCase.id)
            )
        )

    def get_by_id(self, case_id: str) -> TestCase | None:
        return self._session.get(TestCase, case_id)

    def delete(self, case: TestCase) -> None:
        self._session.delete(case)
        self._session.flush()
