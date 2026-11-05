"""Alembic environment for the ADDITIVE intelligence schema.

The Next.js runtime owns the base 42-table schema (SCHEMA_VERSION 3). This
migration only creates intelligence-owned tables that are missing; it never
drops or alters an existing table, so no working functionality is removed.
"""
from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Honour TD_DB_URL over the ini default so both runtimes always share one DB.
URL = os.getenv("TD_DB_URL") or config.get_main_option("sqlalchemy.url")
target_metadata = None


def run_migrations_offline() -> None:
    context.configure(url=URL, target_metadata=target_metadata, literal_binds=True,
                      dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(URL, poolclass=pool.NullPool,
                           connect_args={"check_same_thread": False} if URL.startswith("sqlite") else {})
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
