"""Database engine, session factory, and base model."""
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from kurorelay.core.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
    echo=settings.debug,
)


# Enable foreign key enforcement on every connection
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_conn, _connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


@contextmanager
def get_session() -> Session:
    """Provide a transactional database session."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db() -> None:
    """Run Alembic migrations to bring schema up to date.

    If database tables already exist without an alembic_version (e.g. from an
    initial Base.metadata.create_all development run), stamps the database at
    head revision so subsequent migrations apply cleanly.
    """
    settings.data_dir.mkdir(parents=True, exist_ok=True)

    # Migrate legacy database from ~/.kurorelay/kurorelay.db if present
    legacy_db = Path.home() / ".kurorelay" / "kurorelay.db"
    if legacy_db.is_file() and not settings.database_path.exists():
        try:
            import shutil
            shutil.copy2(legacy_db, settings.database_path)
        except Exception:
            pass

    from alembic.config import Config
    from alembic import command
    from alembic.migration import MigrationContext
    from alembic.script import ScriptDirectory
    from sqlalchemy import inspect

    alembic_cfg_path = Path(__file__).resolve().parents[3] / "alembic.ini"

    if alembic_cfg_path.exists():
        cfg = Config(str(alembic_cfg_path))
        cfg.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))

        # Inspect current database state
        with engine.connect() as conn:
            migration_context = MigrationContext.configure(conn)
            current_rev = migration_context.get_current_revision()
            inspector = inspect(conn)
            existing_tables = set(inspector.get_table_names())

        # If core application tables exist but alembic_version is unset, stamp head
        if current_rev is None and "application_settings" in existing_tables:
            script_dir = ScriptDirectory.from_config(cfg)
            head_rev = script_dir.get_current_head()
            if head_rev:
                command.stamp(cfg, head_rev)

        command.upgrade(cfg, "head")
        from kurorelay.database import models  # noqa: F401
        Base.metadata.create_all(bind=engine)
    else:
        # Dev fallback: create tables directly when alembic isn't set up yet
        from kurorelay.database import models  # noqa: F401 — registers all models
        Base.metadata.create_all(bind=engine)
