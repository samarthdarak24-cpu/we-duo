"""TrustDrive Intelligence API (FastAPI).

Additive runtime beside the Next.js app. It shares the same relational database,
exposes OpenAPI, and degrades honestly when an adapter or backend is unavailable.
Authentication of end users stays in the Next.js app; this service is internal
and is protected by TD_SERVICE_TOKEN (or bound to localhost in local mode).
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import (agent, blockchain, categories, db, detectors, explain, extract, llm, ocr,
               repository, security, worker)
from .config import settings
from .integrations.insurance import DemoInsuranceProvider
from .integrations.storage import get_storage
from .integrations.vehicle_data import DemoVehicleDataProvider
from .intelligence import status as intelligence_status
from .logging import emit
from .routers import CATEGORIES, ROUTERS

SERVICE_VERSION = "intelligence-2.0.0-multicategory"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.ensure_soft_delete_columns()
    app.state.llm_warm = {"warmed": False, "provider": llm.describe()["provider"]}
    warm_task = None
    if settings.llm_warm_start:
        # Background, so /health stays reachable while the weights load.
        warm_task = asyncio.create_task(asyncio.to_thread(llm.warm))
        app.state.llm_warm_task = warm_task
    emit("service.started", version=SERVICE_VERSION, environment=settings.environment,
         db=db.health(), llm=llm.describe().get("active"), worker=worker.describe().get("backend"))
    yield
    if warm_task is not None and not warm_task.done():
        warm_task.cancel()
    emit("service.stopped", version=SERVICE_VERSION)


app = FastAPI(
    title="TrustDrive Intelligence API",
    version=SERVICE_VERSION,
    description=(
        "Multi-category document intelligence, category-aware fraud detection, the "
        "conditional 15/16-node investigation agent, versioned trust scoring and "
        "background jobs over the SHARED TrustDrive database. One verification engine; "
        "category profiles supply rules only. No result is fabricated: every payload "
        "names its active engine, category and method."
    ),
    lifespan=lifespan,
)

# Full backend surface: auth, users, vehicles, documents, history, mileage,
# verification, AI, damage/inspections, listings, search, saved, comparisons,
# inquiries, reports, QR, notifications, audit. Same credentials as Next.js.
for _router in ROUTERS:
    app.include_router(_router)

def _cors_origins() -> list[str]:
    """Browser origins allowed to call this API.

    The local dev servers are always allowed. TD_CORS_ORIGINS (comma separated)
    adds deployed origins - the published site and its public API tunnel -
    without editing this file.
    """
    origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    for origin in os.getenv("TD_CORS_ORIGINS", "").split(","):
        origin = origin.strip().rstrip("/")
        if origin and origin not in origins:
            origins.append(origin)
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)


@app.middleware("http")
async def structured_request_log(request: Request, call_next):
    started = time.monotonic()
    response = await call_next(request)
    emit("http.request", method=request.method, path=request.url.path,
         status=response.status_code, ms=round((time.monotonic() - started) * 1000, 1))
    return response


@app.middleware("http")
async def intelligence_auth_guard(request: Request, call_next):
    """SEC-002: intelligence endpoints are not anonymous.

    In `docker-compose.yml` port 8000 is published to the host, so relying on
    "localhost only" is not a boundary. Accept one of:
      * the configured `X-Service-Token` (used by the Next.js server),
      * a short-lived internal service JWT minted by the Next.js server,
      * a normal user Bearer JWT whose role still matches the live account.
    `/health`, `/`, `/openapi.json` and `/docs` stay public by design.
    """
    if not request.url.path.startswith("/api/intelligence/"):
        return await call_next(request)

    if settings.service_token and hmac_service_token_matches(request):
        return await call_next(request)

    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        payload = security.verify_token(authorization[7:].strip())
        if payload:
            if security.is_internal_service(payload):
                return await call_next(request)
            rows = db.read("users", where="id = :id",
                           params={"id": payload.get("sub")}, limit=1)
            if (rows and not rows[0].get("deleted_at")
                    and str(rows[0].get("role")) in security.ROLES
                    and str(rows[0].get("role")) == payload.get("role")):
                return await call_next(request)

    return JSONResponse(
        status_code=401,
        content={"detail": "Authentication required for intelligence endpoints."},
    )


def hmac_service_token_matches(request: Request) -> bool:
    """Constant-time comparison so the service token cannot be probed bytewise."""
    import hmac as _hmac
    supplied = request.headers.get("x-service-token", "")
    return _hmac.compare_digest(supplied, settings.service_token or "")


def require_service(x_service_token: str | None = Header(default=None)) -> None:
    """Compatibility shim for the `Depends`/explicit call sites.

    `intelligence_auth_guard` is now the single authentication gate for every
    `/api/intelligence/*` route and accepts the service token, an internal
    service JWT, or a valid user JWT. Keeping a second, narrower check here
    would wrongly reject legitimate user-JWT callers when a service token is
    configured, so the gate is intentionally centralised in the middleware.
    """
    return None


class DocumentRequest(BaseModel):
    document_id: str
    vehicle_id: str
    path: str | None = None
    doc_type: str = "rc"
    # Optional explicit override. Normally the category is resolved from the
    # shared vehicles row, so no client has to know the taxonomy.
    category_id: str | None = None
    async_: bool = Field(default=True, alias="async")


class FraudRequest(BaseModel):
    vehicle_id: str
    category_id: str | None = None


class InvestigateRequest(BaseModel):
    vehicle_id: str
    question: str = "Is this vehicle safe to consider buying?"
    thread_id: str | None = None
    category_id: str | None = None


class JobRequest(BaseModel):
    type: str
    vehicle_id: str
    payload: dict = Field(default_factory=dict)
    idempotency_key: str | None = None


class ReviewDecision(BaseModel):
    decision: str  # approved | rejected | corrected
    reviewer: str
    note: str = ""


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "trustdrive-intelligence",
        "version": SERVICE_VERSION,
        "environment": settings.environment,
        "database": db.health(),
        "llm": llm.describe(),
        "ocr_backends": ocr.available_backends(),
        "agent": agent.describe_graph(),
        "worker": worker.describe(),
        "vehicle_categories": categories.describe(),
        "trust_score": explain.describe(),
        "auth": "bearer JWT (scrypt/HS256, same users as Next.js) + optional service token",
        "backend_categories": len(CATEGORIES),
        "backend_routers": len(ROUTERS),
        "intelligence": intelligence_status(),
        "blockchain": blockchain.status(),
        "integrations": {
            "vehicle_data": DemoVehicleDataProvider().name,
            "insurance": DemoInsuranceProvider().name,
            "storage": get_storage().name,
        },
    }


@app.get("/api/intelligence/capabilities")
def capabilities(x_service_token: str | None = Header(default=None)) -> dict:
    require_service(x_service_token)
    return {
        "version": SERVICE_VERSION,
        "ocr": ocr.available_backends(),
        "llm": llm.describe(),
        "agent": agent.describe_graph(),
        "worker": worker.describe(),
        "trust_score": explain.describe(),
        "categories": categories.describe(),
        "fraud": {"rules_version": detectors.RULES_VERSION,
                  "legacy_rules_version": detectors.LEGACY_RULES_VERSION,
                  "ml_version": detectors.ML_VERSION},
        "extraction": {"version": extract.EXTRACTION_VERSION},
        "database": db.health(),
        "entity_counts": db.table_summary([
            "vehicles", "documents", "mileage_readings", "findings", "history_events",
            "damage_records", "vehicle_inspections", "verification_evidence",
            "trust_scores", "ai_analysis", "background_jobs", "human_review_queue",
            "agent_investigations", "chain_records",
        ]),
        "policy": "Unavailable integrations are reported as adapters; nothing is presented as a real verification.",
    }


@app.get("/api/intelligence/categories")
def list_vehicle_categories() -> dict:
    """Public catalogue backing the dynamic Seller form and Buyer filters."""
    return {
        "version": categories.spec_version(),
        "trust_version": categories.trust_version(),
        "default": categories.DEFAULT_CATEGORY_ID,
        "categories": [
            {
                "id": c["id"], "label": c["label"], "status": c.get("status"),
                "powertrain": c.get("powertrain"),
                "fields": categories.fields_for(c["id"]),
                "documents": categories.documents_for(c["id"]),
                "identity": categories.identity_for(c["id"]),
                "labels": categories.labels_for(c["id"]),
                "mileage": categories.mileage_rules_for(c["id"]),
                "trust": categories.trust_weights_for(c["id"])[1],
                "components": categories.component_ids_for(c["id"]),
                "damage_detector": categories.damage_detector_for(c["id"]),
                "model3d": categories.model_asset_for(c["id"]),
                "agent_nodes": categories.agent_nodes_for(c["id"]),
            }
            for c in categories.categories()
        ],
        "planned": categories.planned_categories(),
        "principles": categories.spec().get("principles", []),
        "note": "One shared verification engine and one shared database. Unavailable capabilities are reported, never fabricated.",
    }


@app.get("/api/intelligence/categories/{category_id}")
def get_vehicle_category(category_id: str) -> dict:
    """Resolve a taxonomy id or a legacy human label to one full profile.

    Strict matching: an unknown label is a 404, never a silent car fallback.
    """
    cid = categories.match_category_id(category_id)
    profile = categories.get_category(cid) if cid else None
    if not profile or not cid:
        raise HTTPException(status_code=404, detail=f"Unknown vehicle category '{category_id}'.")
    return {
        **profile,
        "resolved_from": category_id,
        "fields": categories.fields_for(cid),
        "documents": categories.documents_for(cid),
        "agent_nodes": categories.agent_nodes_for(cid),
        "trust_weights": categories.trust_weights_for(cid)[1],
        "mileage_rules": categories.mileage_rules_for(cid),
        "components": categories.component_ids_for(cid),
        "damage_detector": categories.damage_detector_for(cid),
        "model3d": categories.model_asset_for(cid),
    }


@app.post("/api/intelligence/documents/process")
def process_document(req: DocumentRequest, x_service_token: str | None = Header(default=None)) -> dict:
    require_service(x_service_token)
    if req.async_:
        jid = worker.enqueue("document_processing", req.vehicle_id,
                             {"path": req.path, "document_id": req.document_id,
                              "doc_type": req.doc_type, "category_id": req.category_id},
                             idempotency_key=f"doc:{req.document_id}")
        return {"status": "queued", "job_id": jid, "note": "Poll /api/intelligence/jobs/{id}."}
    if not req.path:
        raise HTTPException(status_code=422, detail="path is required for synchronous processing")
    p = Path(req.path)
    ok, reason = ocr.validate_file(p)
    if not ok:
        raise HTTPException(status_code=422, detail=reason)
    return extract.process_document(p, req.document_id, req.vehicle_id, req.doc_type,
                                    req.category_id).model_dump()


@app.post("/api/intelligence/fraud/detect")
def detect_fraud(req: FraudRequest, x_service_token: str | None = Header(default=None)) -> dict:
    require_service(x_service_token)
    return detectors.detect_all(req.vehicle_id, req.category_id)


@app.get("/api/intelligence/fraud/{vehicle_id}")
def get_fraud(vehicle_id: str, category_id: str | None = None,
              x_service_token: str | None = Header(default=None)) -> dict:
    require_service(x_service_token)
    return detectors.detect_all(vehicle_id, category_id)


@app.post("/api/intelligence/investigate")
def investigate(req: InvestigateRequest, x_service_token: str | None = Header(default=None)) -> dict:
    require_service(x_service_token)
    return agent.investigate(req.vehicle_id, req.question, req.thread_id,
                             req.category_id).model_dump()


@app.get("/api/intelligence/trust-score/{vehicle_id}")
def trust_score(vehicle_id: str, persist: bool = False, category_id: str | None = None,
                x_service_token: str | None = Header(default=None)) -> dict:
    require_service(x_service_token)
    result = explain.compute(vehicle_id, category_id)
    if persist:
        result_dict = result.model_dump()
        result_dict["persisted"] = explain.persist(result)
        return result_dict
    return result.model_dump()


@app.get("/api/intelligence/jobs")
def list_jobs(limit: int = 50, x_service_token: str | None = Header(default=None)) -> dict:
    require_service(x_service_token)
    return {"jobs": db.read("background_jobs", limit=min(limit, 200)),
            "worker": worker.describe()}


@app.get("/api/intelligence/jobs/{job_id}")
def get_job(job_id: str, x_service_token: str | None = Header(default=None)) -> dict:
    require_service(x_service_token)
    rows = db.read("background_jobs", where="id = :id", params={"id": job_id}, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="Job not found")
    return rows[0]


@app.post("/api/intelligence/jobs")
def create_job(req: JobRequest, x_service_token: str | None = Header(default=None)) -> dict:
    require_service(x_service_token)
    if req.type not in worker.HANDLERS:
        raise HTTPException(status_code=422, detail=f"Unsupported job type. Valid: {sorted(worker.HANDLERS)}")
    jid = worker.enqueue(req.type, req.vehicle_id, req.payload, req.idempotency_key)
    return {"job_id": jid, "status": "pending"}


@app.post("/api/intelligence/jobs/run-one")
def run_one_job(x_service_token: str | None = Header(default=None)) -> dict:
    require_service(x_service_token)
    result = worker.run_once()
    return {"result": result, "message": "No pending jobs." if result is None else "Job processed."}


@app.get("/api/intelligence/review")
def review_queue(x_service_token: str | None = Header(default=None)) -> dict:
    require_service(x_service_token)
    rows = db.read("human_review_queue", where="status = 'open'", limit=200)
    return {"pending": rows, "count": len(rows)}


@app.post("/api/intelligence/review/{review_id}/resolve")
def resolve_review(review_id: str, decision: ReviewDecision,
                   x_service_token: str | None = Header(default=None)) -> dict:
    require_service(x_service_token)
    if decision.decision not in ("approved", "rejected", "corrected"):
        raise HTTPException(status_code=422, detail="decision must be approved | rejected | corrected")
    # Real schema CHECK: open|assigned|resolved|rejected
    db_status = "rejected" if decision.decision == "rejected" else "resolved"
    # resolved_by / actor_id are FKs to users(id): only set them for a real user.
    reviewer_is_user = bool(db.read("users", where="id = :id",
                                    params={"id": decision.reviewer}, limit=1)) \
        if db.has_table("users") else False
    ok = db.update("human_review_queue", review_id, {
        "status": db_status, "reviewer": decision.reviewer, "note": decision.note,
        "resolution": f"{decision.decision}: {decision.note}".strip(": "),
        "resolved_by": decision.reviewer if reviewer_is_user else None,
        "resolved_at": db.now_iso(), "updated_at": db.now_iso(),
    })
    if not ok:
        raise HTTPException(status_code=404, detail="Review item not found or schema mismatch")
    db.insert("audit_logs", {
        "id": db.new_id("audit"), "action": "human_review_resolved",
        "entity_type": "human_review", "entity_id": review_id,
        "actor_id": decision.reviewer if reviewer_is_user else None,
        "after": decision.model_dump_json(), "details": decision.model_dump_json(),
        "at": db.now_iso(), "created_at": db.now_iso(),
    })
    emit("review.resolved", review_id=review_id, decision=decision.decision,
         reviewer=decision.reviewer, db_status=db_status)
    return {"status": db_status, "decision": decision.decision, "review_id": review_id}


@app.get("/api/intelligence/integrity/{vehicle_id}")
def verify_integrity(vehicle_id: str, x_service_token: str | None = Header(default=None)) -> dict:
    """SHA-256 drift detection: recompute stored document hashes where the file
    is available and surface drift. Never claims a hash is intact if the file
    cannot be read."""
    require_service(x_service_token)
    docs = db.read("documents", where="vehicle_id = :v", params={"v": vehicle_id}, limit=200)
    cols = db.columns("documents")
    hash_col = next((c for c in ("sha256", "hash", "file_hash", "content_hash") if c in cols), None)
    path_col = next((c for c in ("file_key", "file_path", "path", "storage_key", "key", "file_name") if c in cols), None)
    checked, drift, unavailable = [], [], []
    for d in docs:
        stored = str(d.get(hash_col) or "") if hash_col else ""
        rel = str(d.get(path_col) or "") if path_col else ""
        candidate = Path(rel) if rel and Path(rel).is_absolute() else settings.upload_dir / rel
        if not stored or not rel or not candidate.is_file():
            unavailable.append(str(d.get("id")))
            continue
        actual = hashlib.sha256(candidate.read_bytes()).hexdigest()
        if actual != stored:
            drift.append({"document_id": str(d.get("id")), "stored": stored, "actual": actual})
        else:
            checked.append(str(d.get("id")))
    chain = db.read("chain_records", where="vehicle_id = :v", params={"v": vehicle_id}, limit=200)
    return {
        "vehicle_id": vehicle_id,
        "documents_checked": len(checked),
        "document_ids_checked": checked,
        "drift_detected": drift,
        "files_unavailable": unavailable,
        "chain_records": len(chain),
        "integrity_status": "drift_detected" if drift else (
            "partially_verified" if unavailable else "verified"),
        "disclaimer": "A matching hash proves the stored file is unchanged; it does NOT prove the original document was genuine.",
        "generated_at": db.now_iso(),
    }


@app.get("/api/intelligence/damage/{vehicle_id}")
def damage_evidence(vehicle_id: str, x_service_token: str | None = Header(default=None)) -> dict:
    require_service(x_service_token)
    return {
        "vehicle_id": vehicle_id,
        "damage_records": db.read("damage_records", where="vehicle_id = :v",
                                  params={"v": vehicle_id}, limit=200) if db.has_table("damage_records") else [],
        "inspections": db.read("vehicle_inspections", where="vehicle_id = :v",
                               params={"v": vehicle_id}, limit=100) if db.has_table("vehicle_inspections") else [],
        "damage_cv": "adapter-only: no trained weights; OpenCV signals require inspector validation.",
    }


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    emit("http.unhandled_error", path=request.url.path,
         error=f"{type(exc).__name__}: {exc}")
    return JSONResponse(status_code=500, content={
        "error": {"message": "Internal intelligence service error",
                  "type": type(exc).__name__}})


class ChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=600)
    vehicle_id: str | None = None


def _chat_facts(vehicle_id: str | None) -> dict:
    if not vehicle_id:
        return {
            "vehicle_identity_status": "not_provided",
            "missing_records": ["vehicle_id"],
            "sources": [],
            "note": "No vehicle was selected; answer only in general terms.",
        }
    vehicle = repository.get_row("vehicles", vehicle_id)
    trust = explain.compute(vehicle_id)
    documents = [d for d in db.read("documents", where="vehicle_id = :v",
                                    params={"v": vehicle_id}, limit=50)
                 if not d.get("deleted_at")]
    findings = db.read("findings", where="vehicle_id = :v", params={"v": vehicle_id}, limit=30)
    readings = db.read("mileage_readings", where="vehicle_id = :v", params={"v": vehicle_id}, limit=500)
    evidence = db.read("verification_evidence", where="vehicle_id = :v", params={"v": vehicle_id}, limit=50)
    expected = ("rc", "insurance", "puc", "service")
    present = {str(d.get("type")) for d in documents}
    missing = [t for t in expected if t not in present]
    mileage_findings = [f for f in findings
                        if "mileage" in str(f.get("code") or f.get("rule_key") or "")]
    sources = ([vehicle_id] + [str(d["id"]) for d in documents]
               + [str(f["id"]) for f in findings] + [str(e["id"]) for e in evidence])
    return {
        "vehicle": {k: vehicle.get(k) for k in
                    ("id", "make", "model", "year", "reg_no", "vin", "trustdrive_id", "km_claimed")},
        "vehicle_identity_status": "verified" if vehicle.get("vin") and vehicle.get("reg_no") else "unverified",
        "trust": trust.model_dump(),
        "documents": [{"id": d["id"], "type": d.get("type"), "status": d.get("status")} for d in documents],
        "document_findings": [{"id": f["id"], "code": f.get("code"), "severity": f.get("severity"),
                               "title": f.get("title")} for f in findings],
        "mileage_readings": [{"id": r["id"], "km": r.get("km"), "date": r.get("date")} for r in readings],
        "mileage_findings": [{"id": f["id"], "anomaly_type": f.get("code"),
                              "severity": f.get("severity")} for f in mileage_findings],
        "missing_records": missing,
        "sources": sources[:24],
    }


def _narrative(facts: dict) -> str:
    v = facts.get("vehicle") or {}
    trust = facts.get("trust") or {}
    findings = facts.get("document_findings") or []
    missing = facts.get("missing_records") or []
    sources = facts.get("sources") or []
    return (
        f"{v.get('make', '')} {v.get('model', '')} ({v.get('year', '')}), "
        f"registration {v.get('reg_no', 'unavailable')}. "
        f"Trust score {trust.get('score', 'unavailable')}/100 "
        f"({trust.get('band_label', trust.get('band', 'unverified'))}). "
        f"{len(findings)} recorded finding(s); missing records: "
        f"{', '.join(missing) if missing else 'none'}. "
        "An independent inspection is recommended before purchase. "
        f"Sources: {', '.join(str(s) for s in sources[:6])}."
    )


@app.post("/api/intelligence/chat")
def chat(req: ChatRequest, _: None = Depends(require_service)) -> dict:
    """Grounded vehicle chat. The LLM narrative is validated; on rejection the
    deterministic evidence-only answer is returned instead."""
    facts = _chat_facts(req.vehicle_id)
    result = llm.generate_explanation(req.question, facts)
    answer = result.conclusion
    provider = result.provider
    model = result.model
    llm_rejected = False
    if not answer:
        answer = _narrative(facts)
        provider = "deterministic"
        model = "rules-v1"
        llm_rejected = True
    citations = []
    if req.vehicle_id:
        v = facts.get("vehicle", {})
        citations.append({"kind": "vehicle", "id": req.vehicle_id,
                          "label": f"{v.get('make', '')} {v.get('model', '')}".strip() or "Vehicle",
                          "detail": f"Registration {v.get('reg_no') or 'unavailable'}"})
        for d in facts.get("documents", []):
            citations.append({"kind": "document", "id": d["id"],
                              "label": str(d.get("type") or "document").upper(),
                              "detail": f"Status: {d.get('status')}"})
        for f in facts.get("document_findings", []):
            citations.append({"kind": "finding", "id": f["id"],
                              "label": str(f.get("code") or "finding"),
                              "detail": f"{f.get('severity')}: {f.get('title') or ''}"})
    return {
        "answer": answer,
        "grounded": True if llm_rejected else result.grounded,
        "provider": provider,
        "model": model,
        "llm_rejected": llm_rejected,
        "reason": result.reason,
        "unsupported_claims": result.unsupported_claims,
        "citations": citations,
        "deterministic": llm.deterministic_answer(req.question, facts),
        "facts": {"vehicle": facts.get("vehicle"), "missing_records": facts.get("missing_records"),
                  "trust_score": (facts.get("trust") or {}).get("score")},
    }


@app.get("/api/intelligence/blockchain/status")
def blockchain_status() -> dict:
    return blockchain.status()


@app.get("/api/intelligence/blockchain/integrity/{vehicle_id}")
def blockchain_integrity(vehicle_id: str) -> dict:
    return blockchain.verify_vehicle_chain(vehicle_id)


@app.get("/api/backend")
def backend_index() -> dict:
    """Index of the full backend surface (all checklist feature categories)."""
    return {
        "service": "TrustDrive backend",
        "auth": "Bearer JWT issued by /api/backend/auth/login (scrypt + HS256, "
                "identical to the Next.js implementation).",
        "categories": CATEGORIES,
        "intelligence": "/api/intelligence/*",
        "openapi": "/openapi.json",
    }


@app.get("/")
def root() -> dict:
    return {"service": "TrustDrive Intelligence API", "version": SERVICE_VERSION,
            "docs": "/docs", "openapi": "/openapi.json", "health": "/health",
            "backend": "/api/backend"}
