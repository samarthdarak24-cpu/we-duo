"""Add intelligence-owned tables if absent (additive, never destructive).

Revision ID: 0001_intelligence_tables
Revises:
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import inspect, Column, Integer, String, Text, Float

revision = "0001_intelligence_tables"
down_revision = None
branch_labels = None
depends_on = None

# These are created ONLY when missing. In the shipped project the Next.js seed
# already created all of them, so a normal `alembic upgrade head` is a no-op.
SPEC = {
    "ai_analysis": [
        Column("id", String, primary_key=True),
        Column("vehicle_id", String, index=True),
        Column("analysis_type", String),
        Column("method", String),
        Column("engine", String),
        Column("confidence", Float),
        Column("version", String),
        Column("result", Text),
        Column("created_at", String),
    ],
    "trust_scores": [
        Column("id", String, primary_key=True),
        Column("vehicle_id", String, index=True),
        Column("score", Integer),
        Column("band", String),
        Column("version", String),
        Column("method", String),
        Column("explanation", Text),
        Column("created_at", String),
    ],
    "background_jobs": [
        Column("id", String, primary_key=True),
        Column("type", String),
        Column("status", String, index=True),
        Column("vehicle_id", String, index=True),
        Column("payload", Text),
        Column("progress", Integer, default=0),
        Column("attempts", Integer, default=0),
        Column("idempotency_key", String),
        Column("max_attempts", Integer, default=3),
        Column("timeout_seconds", Integer, default=120),
        Column("result", Text),
        Column("last_error", Text),
        Column("created_at", String),
        Column("updated_at", String),
    ],
    "human_review_queue": [
        Column("id", String, primary_key=True),
        Column("document_id", String),
        Column("vehicle_id", String, index=True),
        Column("reason", Text),
        Column("status", String, index=True),
        Column("confidence", Float),
        Column("reviewer", String),
        Column("note", Text),
        Column("created_at", String),
        Column("updated_at", String),
    ],
    "agent_investigations": [
        Column("id", String, primary_key=True),
        Column("vehicle_id", String, index=True),
        Column("question", Text),
        Column("status", String, index=True),
        Column("version", String),
        Column("result", Text),
        Column("created_at", String),
    ],
    "verification_evidence": [
        Column("id", String, primary_key=True),
        Column("vehicle_id", String, index=True),
        Column("source_type", String),
        Column("source_id", String),
        Column("hash", String),
        Column("created_at", String),
    ],
}


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(inspect(bind).get_table_names())
    for name, cols in SPEC.items():
        if name in existing:
            continue
        # `op.create_table` already materialises every `index=True` column as
        # `ix_<table>_<column>`; creating them again here raised
        # "index ... already exists" and aborted the baseline migration.
        op.create_table(name, *cols)


def downgrade() -> None:
    # Deliberately destructive-free: the intelligence tables may contain real
    # evidence, so downgrading never drops them. Reverting is a documented
    # manual operation requiring an explicit backup.
    pass
