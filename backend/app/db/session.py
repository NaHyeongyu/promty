from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def _engine_options(database_url: str) -> dict[str, object]:
    options: dict[str, object] = {"pool_pre_ping": True}
    backend_name = make_url(database_url).get_backend_name()
    if backend_name == "sqlite":
        return options

    options.update(
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        pool_timeout=settings.database_pool_timeout_seconds,
        pool_recycle=settings.database_pool_recycle_seconds,
    )
    if backend_name == "postgresql":
        server_options = []
        statement_timeout_ms = getattr(settings, "database_statement_timeout_ms", 0)
        lock_timeout_ms = getattr(settings, "database_lock_timeout_ms", 0)
        if statement_timeout_ms > 0:
            server_options.append(f"-c statement_timeout={statement_timeout_ms}")
        if lock_timeout_ms > 0:
            server_options.append(f"-c lock_timeout={lock_timeout_ms}")
        if server_options:
            options["connect_args"] = {"options": " ".join(server_options)}
    return options


engine = create_engine(settings.database_url, **_engine_options(settings.database_url))
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
