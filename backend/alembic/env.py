from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.db.session import Base
from app.db import base  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

LEGACY_PUBLISHED_PROMPT_TABLES = {
    "published_prompt_comments",
    "published_prompt_files",
    "published_prompt_reactions",
    "published_prompts",
}


def include_object(object_, name: str | None, type_: str, reflected: bool, compare_to) -> bool:
    """Keep retired prompt publishing data without treating it as active model drift."""

    if type_ == "table" and name in LEGACY_PUBLISHED_PROMPT_TABLES:
        return False
    table = getattr(object_, "table", None)
    return getattr(table, "name", None) not in LEGACY_PUBLISHED_PROMPT_TABLES


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        include_object=include_object,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
