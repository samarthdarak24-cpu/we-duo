"""External registry consent + lookup endpoints (Phase 11).

These endpoints are the only way to reach an external vehicle registry. They
enforce the rules the adapter framework defines:

* a lookup requires a CURRENT, RECORDED user consent — without one nothing is
  requested and the answer is ``consent_required``;
* a source without configured credentials is ``blocked`` — the response says so
  and never reports a verification;
* a user-supplied document is normalised as a document, never as a
  government-verified or insurer-confirmed record.

No endpoint scrapes a restricted source or bypasses authorisation.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..integrations import registry
from ..integrations.registry_consent import (
    consent_version,
    find_consent,
    has_consent,
    record_consent,
)
from ..security import current_user

router = APIRouter(prefix="/api/v1/registry", tags=["registry"])

SOURCES = ("vahan", "insurer", "theft")

MAX_ID_LEN = 64


class ConsentRequest(BaseModel):
    """Body of a consent grant. Identifiers are validated on both sides."""

    reg_no: str | None = Field(default=None, max_length=MAX_ID_LEN)
    vin: str | None = Field(default=None, max_length=MAX_ID_LEN)
    source: str | None = Field(default=None, max_length=32)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("reg_no", "vin", "source", "notes")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("source")
    @classmethod
    def _known_source(cls, value: str | None) -> str | None:
        if value is not None and value.lower() not in SOURCES:
            raise ValueError(f"source must be one of: {', '.join(SOURCES)}")
        return value.lower() if value else None


class LookupRequest(BaseModel):
    """Body of a registry lookup."""

    source: str = Field(min_length=1, max_length=32)
    reg_no: str | None = Field(default=None, max_length=MAX_ID_LEN)
    vin: str | None = Field(default=None, max_length=MAX_ID_LEN)
    consent_id: str | None = Field(default=None, max_length=64)
    document_id: str | None = Field(default=None, max_length=64)
    document: dict | None = None

    @field_validator("source")
    @classmethod
    def _known_source(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if cleaned not in SOURCES:
            raise ValueError(f"source must be one of: {', '.join(SOURCES)}")
        return cleaned

    @field_validator("reg_no", "vin", "consent_id", "document_id")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


@router.get("/status")
def registry_status(user: dict = Depends(current_user)) -> dict:
    """Honest capability report: which sources are configured, which are blocked."""
    return {"service": "registry", **registry.get_registry_status()}


@router.get("/consent")
def consent_state(reg_no: str | None = None, vin: str | None = None,
                  source: str | None = None, user: dict = Depends(current_user)) -> dict:
    """Report whether a current consent covers these identifiers."""
    if source is not None and source.lower() not in SOURCES:
        raise HTTPException(status_code=400, detail=f"source must be one of: {', '.join(SOURCES)}")
    granted = has_consent(reg_no=reg_no, vin=vin, source=source)
    record = find_consent(reg_no=reg_no, vin=vin, source=source)
    return {
        "has_consent": bool(granted),
        "consent_version": consent_version(),
        "consent": record.as_dict() if record else None,
        "note": (
            "A consent is required before any external registry is contacted. "
            "Consent covers one registration number or VIN and the current consent version only."
        ),
    }


@router.post("/consent")
def grant_consent(payload: ConsentRequest, user: dict = Depends(current_user)) -> dict:
    """Record an explicit consent. The request is rejected without identifiers."""
    if not payload.reg_no and not payload.vin:
        raise HTTPException(status_code=400, detail="Consent requires a registration number or a VIN.")
    try:
        record = record_consent(
            reg_no=payload.reg_no,
            vin=payload.vin,
            source=payload.source,
            actor_id=str(user.get("id")),
            notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "consent": record,
        "note": (
            "Consent recorded. It is stored locally, audited, and does not itself verify "
            "anything with any external authority."
        ),
    }


@router.post("/lookup")
def run_lookup(payload: LookupRequest, user: dict = Depends(current_user)) -> dict:
    """Look a vehicle up in one source.

    The response is the adapter's typed outcome. A blocked, rate-limited,
    timed-out or errored lookup NEVER reports a verification, and a user
    document is never presented as a government confirmation.
    """
    if payload.document:
        result = registry.lookup_document(
            payload.document,
            reg_no=payload.reg_no,
            vin=payload.vin,
            document_id=payload.document_id,
            actor_id=str(user.get("id")),
        )
    else:
        if not payload.reg_no and not payload.vin:
            raise HTTPException(status_code=400, detail="A lookup requires a registration number or a VIN.")
        result = registry.lookup(
            payload.source,
            reg_no=payload.reg_no,
            vin=payload.vin,
            consent_id=payload.consent_id,
            actor_id=str(user.get("id")),
        )
    return {
        **result,
        "note": (
            "A result here is only as good as the provider that produced it. "
            "No entry in this response is a guarantee of ownership, insurance or absence of theft."
        ),
    }
