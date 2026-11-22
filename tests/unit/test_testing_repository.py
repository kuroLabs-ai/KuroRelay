import pytest

from kurorelay.core.exceptions import ValidationError
from kurorelay.database.repositories.testing import TestCaseRepository, TestSuiteRepository
from kurorelay.database.repositories.workspaces import WorkspaceRepository


def test_test_suite_and_case_crud(database_session_scope):
    with database_session_scope() as session:
        workspaces = WorkspaceRepository(session)
        ws = workspaces.create("Testing Workspace", "Suite tests")

        suites_repo = TestSuiteRepository(session)
        suite = suites_repo.create(ws.id, "Auth Suite", "Tests login and tokens")
        assert suite.id is not None
        assert suite.name == "Auth Suite"
        assert suite.workspace_id == ws.id

        # List suites
        suites = suites_repo.list_for_workspace(ws.id)
        assert len(suites) == 1
        assert suites[0].id == suite.id

        # Update suite
        updated = suites_repo.update(suite, name="Authentication Regression")
        assert updated.name == "Authentication Regression"

        # Create test case
        cases_repo = TestCaseRepository(session)
        case = cases_repo.create(
            suite_id=suite.id,
            name="Verify 200 OK",
            assertion_type="status_eq",
            assertion_config={"value": 200},
        )
        assert case.id is not None
        assert case.assertion_type == "status_eq"

        # List cases
        cases = cases_repo.list_for_suite(suite.id)
        assert len(cases) == 1
        assert cases[0].id == case.id

        # Delete case
        cases_repo.delete(case)
        assert len(cases_repo.list_for_suite(suite.id)) == 0

        # Delete suite
        suites_repo.delete(suite)
        assert suites_repo.get_by_id(suite.id) is None


def test_test_suite_validation(database_session_scope):
    with database_session_scope() as session:
        suites_repo = TestSuiteRepository(session)
        with pytest.raises(ValidationError):
            suites_repo.create("non-existent-workspace", "Invalid Suite")
