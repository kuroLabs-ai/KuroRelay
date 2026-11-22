from contextlib import contextmanager

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from kurorelay.bridge.api import KuroRelayAPI
from kurorelay.database import models  # noqa: F401
from kurorelay.database.base import Base
from kurorelay.engines.history.engine import HistoryEngine
from kurorelay.services.request_service import RequestService


@pytest.fixture
def database_session_scope():
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(test_engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=test_engine)
    test_sessions = sessionmaker(bind=test_engine, expire_on_commit=False)

    @contextmanager
    def session_scope():
        session = test_sessions()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    yield session_scope
    test_engine.dispose()


@pytest.fixture
def history_engine(database_session_scope):
    return HistoryEngine(session_scope=database_session_scope)


@pytest.fixture
def api(history_engine):
    return KuroRelayAPI(
        request_service=RequestService(history_engine=history_engine),
        history_engine=history_engine,
    )
