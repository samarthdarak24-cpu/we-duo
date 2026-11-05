"""Schema-adaptive repository over the shared database.

Column names come from the live schema (never from request input), values are
always bound parameters, and writes only touch columns that exist. Missing
columns are reported rather than silently invented.
"""
from __future__ import annotations

import json
from typing import Any, Iterable

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from . import db

MAX_LIMIT = 100
# Never writable through the generic layer: append-only integrity tables.
IMMUTABLE = {"chain_records", "audit_logs", "trust_scores"}


def _cols(table: str) -> list[str]:
    cols = db.columns(table)
    if not cols:
        raise HTTPException(status_code=404, detail=f"Unknown table: {table}")
    return cols


def _order(table: str, order_by: str | None, order: str) -> str:
    cols = _cols(table)
    col = order_by if order_by in cols else ("created_at" if "created_at" in cols else cols[0])
    direction = "DESC" if str(order).lower() != "asc" else "ASC"
    return f'"{col}" {direction}'


def list_rows(table: str, filters: dict | None = None, limit: int = 50, offset: int = 0,
              order_by: str | None = None, order: str = "desc",
              search: str | None = None, search_cols: Iterable[str] = ()) -> dict:
    cols = _cols(table)
    clauses: list[str] = []
    params: dict[str, Any] = {}
    for key, value in (filters or {}).items():
        if value is None or key not in cols:
            continue
        clauses.append(f'"{key}" = :{key}')
        params[key] = value
    if search:
        scols = [c for c in search_cols if c in cols]
        if scols:
            clauses.append("(" + " OR ".join(f'"{c}" LIKE :_q' for c in scols) + ")")
            params["_q"] = f"%{search}%"
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    limit = max(1, min(int(limit), MAX_LIMIT))
    offset = max(0, int(offset))
    sql = f'SELECT * FROM "{table}"{where} ORDER BY {_order(table, order_by, order)} LIMIT :_limit OFFSET :_offset'
    params.update({"_limit": limit, "_offset": offset})
    with db.engine().connect() as conn:
        rows = [dict(r) for r in conn.execute(text(sql), params).mappings().all()]
        total = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"{where}'),
                             {k: v for k, v in params.items() if not k.startswith("_")}).scalar()
    return {"items": rows, "total": int(total or 0), "limit": limit, "offset": offset}


def get_row(table: str, row_id: str, id_col: str = "id") -> dict:
    cols = _cols(table)
    if id_col not in cols:
        id_col = cols[0]
    rows = db.read(table, where=f'"{id_col}" = :id', params={"id": row_id}, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail=f"{table} record not found")
    return rows[0]


def create_row(table: str, data: dict) -> dict:
    if table in IMMUTABLE:
        raise HTTPException(status_code=405, detail=f"{table} is append-only")
    cols = _cols(table)
    payload = {k: v for k, v in data.items() if k in cols and v is not None}
    if "id" in cols and "id" not in payload:
        payload["id"] = db.new_id(table[:4] if len(table) > 4 else table)
    # NOT NULL timestamp columns are filled centrally rather than per caller.
    now = db.now_iso()
    if "created_at" in cols and "created_at" not in payload:
        payload["created_at"] = now
    if "updated_at" in cols and "updated_at" not in payload:
        payload["updated_at"] = now
    if not payload:
        raise HTTPException(status_code=422, detail=f"No writable columns supplied for {table}")
    try:
        ok, reason = db.insert(table, payload)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=f"Constraint failed: {exc.orig}") from exc
    if not ok:
        raise HTTPException(status_code=422, detail=f"Insert failed: {reason}")
    return get_row(table, str(payload.get("id")), "id")


def update_row(table: str, row_id: str, data: dict, id_col: str = "id") -> dict:
    if table in IMMUTABLE:
        raise HTTPException(status_code=405, detail=f"{table} is append-only")
    cols = _cols(table)
    # None is preserved so callers can explicitly clear a nullable column
    # (e.g. retrying a job clears error/finished_at).
    payload = {k: v for k, v in data.items() if k in cols and k != id_col}
    if not payload:
        raise HTTPException(status_code=422, detail="No writable fields supplied")
    if "updated_at" in cols:
        payload["updated_at"] = db.now_iso()
    try:
        db.update(table, row_id, payload, id_column=id_col)
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=f"Constraint failed: {exc.orig}") from exc
    return get_row(table, row_id, id_col)


def soft_delete(table: str, row_id: str, id_col: str = "id") -> dict:
    cols = _cols(table)
    if "deleted_at" in cols:
        return update_row(table, row_id, {"deleted_at": db.now_iso()}, id_col)
    if "archived_at" in cols:
        return update_row(table, row_id, {"archived_at": db.now_iso()}, id_col)
    if "revoked_at" in cols:
        return update_row(table, row_id, {"revoked_at": db.now_iso()}, id_col)
    # No soft-delete column: refuse rather than silently hard-delete evidence.
    raise HTTPException(status_code=409,
                        detail=f"{table} has no soft-delete column; hard delete is not permitted")


HARD_DELETE_ALLOWED = {"saved_vehicles", "saved_searches"}


def hard_delete(table: str, row_id: str, id_col: str = "id") -> None:
    """Only user-owned wishlist rows may be hard-deleted; evidence never is."""
    if table not in HARD_DELETE_ALLOWED:
        raise HTTPException(status_code=405, detail=f"Hard delete is not permitted for {table}")
    with db.engine().begin() as conn:
        conn.execute(text(f'DELETE FROM "{table}" WHERE "{id_col}" = :id'), {"id": row_id})


def audit(actor_id: str | None, action: str, entity_type: str, entity_id: str,
          after: Any = None) -> None:
    db.insert("audit_logs", {
        "id": db.new_id("audit"), "actor_id": actor_id, "action": action,
        "entity_type": entity_type, "entity_id": entity_id,
        "after": json.dumps(after, default=str)[:8000], "at": db.now_iso(),
        "created_at": db.now_iso(),
    })


def require_columns(table: str, required: Iterable[str]) -> None:
    cols = set(_cols(table))
    missing = [c for c in required if c not in cols]
    if missing:
        raise HTTPException(status_code=500, detail=f"Schema mismatch on {table}: missing {missing}")
