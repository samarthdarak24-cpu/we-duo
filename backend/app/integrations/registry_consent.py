"""Explicit consent records for external vehicle-registry lookups.

A registry lookup (government registration, insurer policy, theft register)
discloses a vehicle's identifiers to a third party. TrustDrive performs that
disclosure only when the data subject has explicitly consented, and the consent
itself is recorded: identifiers + timestamp + consent version.

The store is pluggable:

* ``InMemoryConsentStore`` -- default, process-local.
* ``SqlConsentStore``       -- optional; persists into a ``registry_consents``
  table in the shared database *when that table exists*. The shared schema is
  owned by the Next.js app, so this store degrades honestly (it emits
  ``registry.consent_store.degraded`` and the caller falls back to the
  in-memory store) instead of claiming a durable record it did not write.

Nothing here contacts a provider and nothing here verifies a vehicle.
"""
from __future__ import annotations

import os
import re
import uuid
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Any, Protocol

from ..logging import emit

DEFAULT_CONSENT_VERSION = "registry-consent-v1"
DEFAULT_SCOPE = "registry_lookup"
CONSENT_TABLE = "registry_consents"


class ConsentStoreUnavailable(RuntimeError):
    """The configured consent store cannot persist a record right now."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def consent_version() -> str:
    """The consent version this deployment requires.

    Changing ``TD_REGISTRY_CONSENT_VERSION`` invalidates older consents: the
    user must consent again under the new wording.
    """
    return (os.getenv("TD_REGISTRY_CONSENT_VERSION") or DEFAULT_CONSENT_VERSION).strip()


def _norm(value: str | None) -> str:
    """Normalise an identifier for comparison (case/space/punctuation free)."""
    if not value:
        return ""
    return re.sub(r"[^A-Z0-9]", "", str(value).upper())


@dataclass(frozen=True)
class ConsentRecord:
    """A recorded, explicit consent for one set of identifiers."""

    consent_id: str
    reg_no: str | None
    vin: str | None
    source: str | None
    scope: str
    consent_version: str
    granted_at: str
    actor_id: str | None = None
    notes: str | None = None
    store_name: str = "memory"

    def as_dict(self) -> dict[str, Any]:
        return {
            "consent_id": self.consent_id,
            "reg_no": self.reg_no,
            "vin": self.vin,
            "source": self.source,
            "scope": self.scope,
            "consent_version": self.consent_version,
            "granted_at": self.granted_at,
            "actor_id": self.actor_id,
            "notes": self.notes,
            "store": self.store_name,
        }

    def matches(self, *, source: str | None, reg_no: str | None, vin: str | None) -> bool:
        """Does this consent cover exactly the identifiers being disclosed?

        A consent that does not mention an identifier being sent does not cover
        it: the check is deliberately strict so a broad consent can never be
        stretched into an unrelated disclosure.
        """
        if self.source and source and self.source != source:
            return False
        if reg_no:
            if not self.reg_no or _norm(self.reg_no) != _norm(reg_no):
                return False
        if vin:
            if not self.vin or _norm(self.vin) != _norm(vin):
                return False
        return True


class ConsentStore(Protocol):
    """Minimal persistence contract for consent records."""

    name: str

    def put(self, record: ConsentRecord) -> ConsentRecord: ...

    def get(self, consent_id: str) -> ConsentRecord | None: ...

    def find(self, *, source: str | None, reg_no: str | None, vin: str | None) -> ConsentRecord | None: ...


class InMemoryConsentStore:
    """Default process-local store. Lost on restart -- reported as such."""

    name = "memory"

    def __init__(self) -> None:
        self._records: dict[str, ConsentRecord] = {}

    def put(self, record: ConsentRecord) -> ConsentRecord:
        stored = replace(record, store_name=self.name)
        self._records[stored.consent_id] = stored
        return stored

    def get(self, consent_id: str) -> ConsentRecord | None:
        return self._records.get(consent_id)

    def find(self, *, source: str | None, reg_no: str | None, vin: str | None) -> ConsentRecord | None:
        best: ConsentRecord | None = None
        for record in self._records.values():
            if not record.matches(source=source, reg_no=reg_no, vin=vin):
                continue
            if best is None or record.granted_at >= best.granted_at:
                best = record
        return best

    def all(self) -> list[ConsentRecord]:
        return list(self._records.values())


class SqlConsentStore:
    """Optional DB-backed store against the shared database.

    The shared schema does not ship a ``registry_consents`` table yet, so this
    store is opt-in: until the owner adds the table it raises
    ``ConsentStoreUnavailable`` and the caller degrades to the in-memory store
    with an explicit event -- it never pretends the consent was persisted.
    """

    name = "sql"

    def __init__(self, table: str = CONSENT_TABLE) -> None:
        self.table = table

    @staticmethod
    def _db():
        from .. import db  # imported lazily: the engine is created on first use

        return db

    def _require_table(self) -> None:
        if not self._db().has_table(self.table):
            raise ConsentStoreUnavailable(
                f"shared database has no '{self.table}' table; add it to the Next.js schema "
                "or keep the in-memory consent store"
            )

    def put(self, record: ConsentRecord) -> ConsentRecord:
        self._require_table()
        ok, reason = self._db().insert(self.table, {
            "consent_id": record.consent_id,
            "reg_no": record.reg_no,
            "vin": record.vin,
            "source": record.source,
            "scope": record.scope,
            "consent_version": record.consent_version,
            "granted_at": record.granted_at,
            "actor_id": record.actor_id,
            "notes": record.notes,
        })
        if not ok:
            raise ConsentStoreUnavailable(reason or "consent insert failed")
        return replace(record, store_name=self.name)

    def _rows(self) -> list[dict]:
        self._require_table()
        return self._db().read(self.table, "consent_id IS NOT NULL", {}, limit=1000)

    @staticmethod
    def _to_record(row: dict) -> ConsentRecord:
        return ConsentRecord(
            consent_id=str(row.get("consent_id") or ""),
            reg_no=row.get("reg_no"),
            vin=row.get("vin"),
            source=row.get("source"),
            scope=str(row.get("scope") or DEFAULT_SCOPE),
            consent_version=str(row.get("consent_version") or DEFAULT_CONSENT_VERSION),
            granted_at=str(row.get("granted_at") or ""),
            actor_id=row.get("actor_id"),
            notes=row.get("notes"),
            store_name="sql",
        )

    def get(self, consent_id: str) -> ConsentRecord | None:
        for row in self._rows():
            if str(row.get("consent_id")) == consent_id:
                return self._to_record(row)
        return None

    def find(self, *, source: str | None, reg_no: str | None, vin: str | None) -> ConsentRecord | None:
        best: ConsentRecord | None = None
        for row in self._rows():
            record = self._to_record(row)
            if not record.matches(source=source, reg_no=reg_no, vin=vin):
                continue
            if best is None or record.granted_at >= best.granted_at:
                best = record
        return best


_store: ConsentStore | None = None


def get_store() -> ConsentStore:
    """The active consent store (in-memory unless the owner plugs another in)."""
    global _store
    if _store is None:
        _store = InMemoryConsentStore()
    return _store


def set_store(store: ConsentStore) -> ConsentStore:
    """Plug a different consent store in (used by the owner and by tests)."""
    global _store
    _store = store
    return _store


def reset_store() -> ConsentStore:
    """Drop every stored consent (used by tests and by consent-version bumps)."""
    return set_store(InMemoryConsentStore())


def record_consent(
    *,
    reg_no: str | None = None,
    vin: str | None = None,
    source: str | None = None,
    actor_id: str | None = None,
    version: str | None = None,
    scope: str = DEFAULT_SCOPE,
    notes: str | None = None,
    store: ConsentStore | None = None,
) -> dict[str, Any]:
    """Record an explicit consent and return the stored record.

    Raises ``ValueError`` when neither a registration number nor a VIN is
    supplied: a consent without identifiers covers nothing.
    """
    if not reg_no and not vin:
        raise ValueError("Consent requires at least a registration number or a VIN.")
    target = store or get_store()
    record = ConsentRecord(
        consent_id=f"consent-{uuid.uuid4().hex[:12]}",
        reg_no=reg_no,
        vin=vin,
        source=source,
        scope=scope,
        consent_version=version or consent_version(),
        granted_at=_now_iso(),
        actor_id=actor_id,
        notes=notes,
        store_name=target.name,
    )
    try:
        record = target.put(record)
    except ConsentStoreUnavailable as exc:
        emit("registry.consent_store.degraded", store=target.name, reason=str(exc))
        fallback = InMemoryConsentStore()
        record = fallback.put(record)
    emit(
        "registry.consent.recorded",
        consent_id=record.consent_id,
        source=record.source,
        reg_no=record.reg_no,
        vin=record.vin,
        consent_version=record.consent_version,
        granted_at=record.granted_at,
        actor_id=record.actor_id,
        store=record.store_name,
    )
    return record.as_dict()


def find_consent(
    *,
    reg_no: str | None = None,
    vin: str | None = None,
    source: str | None = None,
    consent_id: str | None = None,
    store: ConsentStore | None = None,
) -> ConsentRecord | None:
    """Find a consent that covers these identifiers under the current version.

    Returns ``None`` when there is none, when the store is unavailable, or when
    the stored consent was given under a different consent version.
    """
    target = store or get_store()
    try:
        if consent_id:
            record = target.get(consent_id)
        else:
            record = target.find(source=source, reg_no=reg_no, vin=vin)
    except ConsentStoreUnavailable as exc:
        emit("registry.consent_store.degraded", store=target.name, reason=str(exc))
        return None
    if record is None:
        return None
    if record.consent_version != consent_version():
        return None
    if not record.matches(source=source, reg_no=reg_no, vin=vin):
        return None
    return record


def has_consent(
    *,
    reg_no: str | None = None,
    vin: str | None = None,
    source: str | None = None,
    consent_id: str | None = None,
    store: ConsentStore | None = None,
) -> bool:
    """True when a usable, current consent covers these identifiers."""
    return find_consent(
        reg_no=reg_no, vin=vin, source=source, consent_id=consent_id, store=store
    ) is not None
