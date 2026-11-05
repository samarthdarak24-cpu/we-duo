"""SQLAlchemy 2.x access to the SHARED database.

The Next.js runtime owns the schema (42 tables, SCHEMA_VERSION 3). This module
reflects the live schema instead of re-declaring it, so the two runtimes can
never drift. Writes are restricted to the intelligence-owned tables and always
use dynamic column discovery: if a column is absent the write degrades with an
explicit warning rather than claiming success.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Iterable

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

from .config import settings
from .logging import emit

_engine: Engine | None = None


def engine() -> Engine:
    global _engine
    if _engine is None:
        kwargs: dict[str, Any] = {"future": True, "pool_pre_ping": True}
        if settings.local_sqlite:
            kwargs["connect_args"] = {"check_same_thread": False, "timeout": 15}
        _engine = create_engine(settings.db_url, **kwargs)
    return _engine


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def columns(table: str) -> list[str]:
    try:
        return [c["name"] for c in inspect(engine()).get_columns(table)]
    except Exception:
        return []


def has_table(table: str) -> bool:
    try:
        return inspect(engine()).has_table(table)
    except Exception:
        return False


def ensure_soft_delete_columns() -> None:
    """Additive `deleted_at` columns for users/documents.

    Guarded by PRAGMA so it is safe to run on every start and never rewrites or
    drops existing rows.
    """
    with engine().begin() as conn:
        for table in ("users", "documents"):
            rows = conn.execute(text(f'PRAGMA table_info("{table}")')).mappings().all()
            if rows and not any(r["name"] == "deleted_at" for r in rows):
                conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN deleted_at TEXT'))
                emit("db.column_added", table=table, column="deleted_at")


def read(table: str, where: str = "", params: dict | None = None, limit: int = 500) -> list[dict]:
    """Reflective read. Returns plain dicts so callers never depend on an ORM model."""
    if not has_table(table):
        emit("db.table_missing", table=table)
        return []
    p = dict(params or {})
    p["_limit"] = limit
    sql = f'SELECT * FROM "{table}"'
    if where:
        sql += f" WHERE {where}"
    sql += " LIMIT :_limit"
    with engine().connect() as conn:
        return [dict(r) for r in conn.execute(text(sql), p).mappings().all()]


def scalar(sql: str, params: dict | None = None) -> Any:
    with engine().connect() as conn:
        row = conn.execute(text(sql), params or {}).first()
        return row[0] if row else None


def insert(table: str, data: dict) -> tuple[bool, str | None]:
    """Insert only columns that actually exist. Returns (written, reason)."""
    if not has_table(table):
        return False, f"table {table} does not exist"
    cols = columns(table)
    usable = {k: v for k, v in data.items() if k in cols}
    if not usable:
        return False, f"no compatible columns for {table}"
    skipped = sorted(set(data) - set(usable))
    if skipped:
        emit("db.columns_skipped", table=table, skipped=skipped)
    names = ", ".join(f'"{k}"' for k in usable)
    binds = ", ".join(f":{k}" for k in usable)
    sql = f'INSERT INTO "{table}" ({names}) VALUES ({binds})'
    try:
        with engine().begin() as conn:
            conn.execute(text(sql), usable)
        return True, f"skipped={skipped}" if skipped else None
    except Exception as exc:  # pragma: no cover - surfaced to the caller
        return False, f"{type(exc).__name__}: {exc}"


def update(table: str, row_id: str, data: dict, id_column: str = "id") -> bool:
    if not has_table(table) or id_column not in columns(table):
        return False
    cols = columns(table)
    usable = {k: v for k, v in data.items() if k in cols and k != id_column}
    if not usable:
        return False
    sets = ", ".join(f'"{k}" = :{k}' for k in usable)
    usable["_id"] = row_id
    sql = f'UPDATE "{table}" SET {sets} WHERE "{id_column}" = :_id'
    with engine().begin() as conn:
        conn.execute(text(sql), usable)
    return True


def health() -> dict:
    try:
        with engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "database": "connected",
            "dialect": engine().dialect.name,
            "tables": len(inspect(engine()).get_table_names()),
            "shared_with_nextjs": True,
        }
    except Exception as exc:
        return {"database": "unavailable", "error": str(exc)}


def table_summary(tables: Iterable[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for t in tables:
        try:
            out[t] = int(scalar(f'SELECT COUNT(*) FROM "{t}"') or 0)
        except Exception:
            out[t] = -1
    return out
