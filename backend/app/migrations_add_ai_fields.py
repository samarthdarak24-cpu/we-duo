"""Additive, idempotent schema migrations for the AI/damage/OCR columns.

These run at startup (see ``main.lifespan``) so the shared database always has
the columns the new CV/OCR endpoints need. Every statement is guarded by a
PRAGMA column check (the codebase's established idempotent pattern) and uses
plain ``ALTER TABLE ... ADD COLUMN`` -- never ``DROP``/``RENAME`` -- so it is
safe to run on every boot and on the production DB. Missing columns are added;
existing data is untouched.
"""
from __future__ import annotations

from sqlalchemy import text

from . import db
from .logging import emit

# table -> list of (column, sql_type). Order is irrelevant; each is independent.
_ADDITIONS = {
    "damage_records": [
        ("detection_confidence", "REAL"),
        ("detection_box", "TEXT"),
        ("provenance", "TEXT"),
    ],
    "documents": [
        ("ocr_text", "TEXT"),
        ("ocr_extracted", "TEXT"),
        ("ocr_confidence", "REAL"),
        ("ocr_status", "TEXT"),
    ],
}


def _add_column(table: str, column: str, sql_type: str) -> bool:
    """Add a column if absent. Returns True if it was created, False if present."""
    if not db.has_table(table):
        emit("migration.skipped_missing_table", table=table)
        return False
    rows = db.engine().connect().execute(text(f'PRAGMA table_info("{table}")')).mappings().all()
    if any(r["name"] == column for r in rows):
        return False
    with db.engine().begin() as conn:
        conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN "{column}" {sql_type}'))
    emit("migration.column_added", table=table, column=column, type=sql_type)
    return True


def ensure_ai_columns() -> dict[str, list[str]]:
    """Run all additive migrations. Returns the columns created per table."""
    created: dict[str, list[str]] = {}
    for table, columns in _ADDITIONS.items():
        for column, sql_type in columns:
            if _add_column(table, column, sql_type):
                created.setdefault(table, []).append(column)
    return created


# Backwards-friendly alias used by callers/tests.
def run() -> dict[str, list[str]]:
    return ensure_ai_columns()
