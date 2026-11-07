"""Category-conditional multi-vehicle LangGraph investigator.

ONE shared investigator. The canonical taxonomy supplies a node list per
vehicle category: 15 nodes for combustion profiles and 16 for electric
profiles (the extra node is `EVBatteryAnalysisNode`). Only the nodes relevant
to the resolved vehicle are added to the graph and executed. No car-only
battery check runs on a petrol scooter, and no fake battery node is reported.

LangGraph is used when installed (with a checkpointer and a human-in-the-loop
interrupt). When it is not installed, the SAME node functions run through a
deterministic sequential executor and the response reports
`orchestrator: "sequential-fallback"` — the service never claims LangGraph ran
when it did not, and never fabricates a conclusion.
"""
from __future__ import annotations

import json
from typing import Any, TypedDict

from pydantic import BaseModel, Field

from . import categories, db, detectors, explain, llm
from .config import settings
from .logging import emit

AGENT_VERSION = "investigator-2.0.0-multicategory"
LEGACY_AGENT_VERSION = "investigator-1.0.0"

# Full node registry (the UNION of all category profiles). A node is executed
# only when the resolved category lists it.
NODE_NAMES = [
    "VehicleResolverNode",
    "VehicleCategoryDetectionNode",
    "DocumentRetrievalNode",
    "OCRAnalysisNode",
    "MileageAnalysisNode",
    "EVBatteryAnalysisNode",
    "DamageAnalysisNode",
    "IdentityVerificationNode",
    "HistoryCorrelationNode",
    "AnomalyDetectionNode",
    "EvidenceGraphNode",
    "ConflictDetectionNode",
    "RiskExplanationNode",
    "HumanReviewNode",
    "ReportGenerationNode",
    "ResultPersistenceNode",
]


class InvestigationState(TypedDict, total=False):
    vehicle_id: str
    question: str
    thread_id: str
    category_id: str
    category_override: str | None
    category_explicit: bool
    category_label: str
    category_legacy: bool
    planned_nodes: list[str]
    nodes_executed: list[str]
    vehicle: dict | None
    identity_checks: list[dict]
    documents: list[dict]
    verified_documents: list[dict]
    extraction_records: list[dict]
    mileage_readings: list[dict]
    distance_label: str
    battery_records: list[dict]
    battery_note: str
    accident_records: list[dict]
    service_records: list[dict]
    damage_records: list[dict]
    damage_components: list[str]
    inspection_evidence: list[dict]
    report_records: list[dict]
    verification_results: list[dict]
    detector_findings: list[dict]
    ml_findings: list[dict]
    evidence: list[dict]
    sources: list[str]
    conflicts: list[str]
    missing_records: list[str]
    explanation: dict | None
    requires_human_review: bool
    human_review_id: str | None
    status: str
    investigation_id: str | None


class InvestigationResult(BaseModel):
    investigation_id: str
    vehicle_id: str
    question: str
    orchestrator: str
    checkpointing: bool
    checkpoint_backend: str = "memory"
    durable_checkpointing: bool = False
    nodes: list[str]
    status: str
    answer: dict
    findings: list[dict]
    evidence_ids: list[str]
    model_versions: dict
    human_review: dict
    explanation: dict
    limitations: list[str] = Field(default_factory=list)
    category_id: str = categories.DEFAULT_CATEGORY_ID
    category_label: str = ""
    category_legacy: bool = False
    node_count: int = 0


def _read(table: str, vehicle_id: str, limit: int = 200) -> list[dict]:
    try:
        if not db.has_table(table) or "vehicle_id" not in db.columns(table):
            return []
        return db.read(table, where="vehicle_id = :v", params={"v": vehicle_id}, limit=limit)
    except Exception:
        return []


def _node(fn):
    """Record that a node ran; keep node bodies deterministic and side-effect free."""
    def wrapped(state: InvestigationState) -> dict:
        out = fn(state)
        out["nodes_executed"] = list(state.get("nodes_executed", [])) + [fn.__name__]
        return out
    wrapped.__name__ = fn.__name__
    return wrapped


# ---------------------------------------------------------------------------
# Node implementations. Every node reads the shared DB; none invents evidence.
# ---------------------------------------------------------------------------

def VehicleResolverNode(state: InvestigationState) -> dict:
    rows = db.read("vehicles", where="id = :v", params={"v": state["vehicle_id"]}, limit=1)
    v = rows[0] if rows else None
    return {
        "vehicle": v,
        "status": "not_found" if v is None else "resolved",
    }


def VehicleCategoryDetectionNode(state: InvestigationState) -> dict:
    """Resolve the ONE category profile and therefore the conditional graph."""
    override = state.get("category_override")
    try:
        rows = db.read("vehicles", where="id = :v", params={"v": state["vehicle_id"]}, limit=1)
    except Exception:
        rows = []
    row = rows[0] if rows else None
    explicit = bool(override and categories.get_category(str(override))) or \
        categories.is_explicit_category_row(row)
    profile = (categories.get_category(str(override)) if explicit and override else None) \
        or categories.category_for_vehicle(row)
    cid = str(profile["id"])
    return {
        "category_id": cid,
        "category_label": str(profile["label"]),
        "category_explicit": explicit,
        "category_legacy": bool(not explicit and cid == categories.DEFAULT_CATEGORY_ID),
        "planned_nodes": nodes_for(cid),
        "distance_label": str(categories.mileage_rules_for(cid).get("label") or "Odometer"),
    }


def DocumentRetrievalNode(state: InvestigationState) -> dict:
    docs = _read("documents", state["vehicle_id"])
    verified = [d for d in docs if str(d.get("status")) == "verified"]
    return {"documents": docs, "verified_documents": verified}


def OCRAnalysisNode(state: InvestigationState) -> dict:
    """Collect real extraction records. OCR text is never proof of genuineness."""
    records = [a for a in _read("ai_analysis", state["vehicle_id"])
               if str(a.get("kind")) in ("document", "odometer")]
    extractions = _read("document_extractions", state["vehicle_id"])
    return {
        "extraction_records": records,
        "missing_records": ([] if records or extractions else
                            ["No document text extraction on record — provenance unverified"]),
        "verification_results": [{"check": "ocr_provenance",
                                  "status": "recorded" if records or extractions else "unverified",
                                  "note": "Machine-read text is evidence of content, not of authenticity."}],
    }


def MileageAnalysisNode(state: InvestigationState) -> dict:
    return {
        "mileage_readings": _read("mileage_readings", state["vehicle_id"]),
        "accident_records": _read("accident_records", state["vehicle_id"]),
        "distance_label": state.get("distance_label") or "Odometer",
    }


def EVBatteryAnalysisNode(state: InvestigationState) -> dict:
    """Electric profiles only. Never estimates or invents State of Health."""
    records = _read("battery_records", state["vehicle_id"])
    sourced = [r for r in records if r.get("source_document_id") or r.get("source_doc_id")]
    if not sourced:
        note = ("No battery health record with a source document. Battery condition is UNVERIFIED; "
                "no SOH value has been estimated and SOH is never treated as a distance reading.")
    else:
        note = (f"{len(sourced)} battery record(s) carry a source document. "
                "SOH is evidence-backed only where the source document exists.")
    return {"battery_records": records, "battery_note": note}


def DamageAnalysisNode(state: InvestigationState) -> dict:
    cid = state.get("category_id") or categories.DEFAULT_CATEGORY_ID
    return {
        "damage_records": _read("damage_records", state["vehicle_id"]),
        "inspection_evidence": _read("vehicle_inspections", state["vehicle_id"]),
        "damage_components": categories.component_ids_for(cid),
    }


def IdentityVerificationNode(state: InvestigationState) -> dict:
    """Category-correct identifier validation (no universal 17-char VIN rule)."""
    v = state.get("vehicle") or {}
    cid = state.get("category_id") or categories.DEFAULT_CATEGORY_ID
    ok, errors, _, _ = categories.validate_identity(
        cid, reg=v.get("reg_no"), identifier=v.get("vin"), require_all=True)
    checks = [{
        "check": "identity_format", "category": cid,
        "status": "verified" if ok else "unverified",
        "note": "; ".join(errors) if errors else
                f"{categories.identity_for(cid)['primaryLabel']} matches the {cid} pattern.",
    }]
    return {
        "identity_checks": checks,
        "missing_records": ([] if ok else [f"Category identity rule not satisfied: {'; '.join(errors)}"]),
    }


def HistoryCorrelationNode(state: InvestigationState) -> dict:
    service = _read("history_events", state["vehicle_id"])
    return {
        "service_records": service,
        "missing_records": (["Vehicle identity record not found"] if not state.get("vehicle") else [])
                           + (["Service history not available"] if not service else []),
    }


def AnomalyDetectionNode(state: InvestigationState) -> dict:
    """One shared detector engine, category-selected rules."""
    # Preserve original v1 rules for legacy car rows: only pass an explicit
    # category override, never one resolved internally from a legacy row.
    override = state.get("category_id") if state.get("category_explicit") else None
    report = detectors.detect_all(state["vehicle_id"], override)
    findings = [
        f.model_dump() if hasattr(f, "model_dump") else f
        for r in report["reports"] for f in r["findings"]
    ]
    ml = [f for f in findings
          if "forest" in str(f.get("method")) or "lof" in str(f.get("method"))]
    return {"detector_findings": findings, "ml_findings": ml}


def EvidenceGraphNode(state: InvestigationState) -> dict:
    ev = _read("verification_evidence", state["vehicle_id"])
    sources = sorted({str(e.get("id")) for e in ev} |
                     {str(d.get("id")) for d in state.get("documents", [])} |
                     {str(m.get("id")) for m in state.get("mileage_readings", [])} |
                     {str(b.get("id")) for b in state.get("battery_records", [])})
    return {"evidence": ev, "sources": sources}


def ConflictDetectionNode(state: InvestigationState) -> dict:
    conflicts = [
        f["explanation"] for f in state.get("detector_findings", [])
        if f.get("severity") == "high"
    ]
    return {"conflicts": conflicts}


def RiskExplanationNode(state: InvestigationState) -> dict:
    cid = state.get("category_id") or categories.DEFAULT_CATEGORY_ID
    facts = {
        "vehicle_category": cid,
        "vehicle_category_label": state.get("category_label") or cid,
        "distance_label": state.get("distance_label") or "Odometer",
        "nodes_executed": state.get("nodes_executed", []),
        "vehicle_identity_status": "resolved" if state.get("vehicle") else "unverified",
        "identity_checks": state.get("identity_checks", []),
        "mileage_readings": [{"id": m.get("id"), "km": m.get("km"), "date": m.get("date")}
                             for m in state.get("mileage_readings", [])][:20],
        "mileage_findings": [f["explanation"] for f in state.get("detector_findings", [])
                             if "mileage" in f.get("anomaly_type", "") or "distance" in f.get("anomaly_type", "")][:10],
        "battery_note": state.get("battery_note") or "Battery analysis not applicable to this category.",
        "accident_records": [str(a.get("id")) for a in state.get("accident_records", [])][:10],
        "document_findings": [f["explanation"] for f in state.get("detector_findings", [])
                              if "document" in f.get("method", "")][:10],
        "inspection_evidence": [str(i.get("id")) for i in state.get("inspection_evidence", [])][:10],
        "missing_records": state.get("missing_records", []),
        "unresolved_conflicts": state.get("conflicts", []),
        "sources": state.get("sources", [])[:30],
        "recommended_next_action": (
            "Resolve high-severity conflicts with an inspector before purchase."
            if state.get("conflicts") else "Request an independent inspection before purchase."
        ),
    }
    base = llm.deterministic_answer(state["question"], facts)
    provider = llm.generate_explanation(state["question"], facts)
    answer = dict(base)
    if provider.available and provider.grounded and provider.conclusion:
        answer["llm_explanation"] = provider.conclusion
        answer["llm_provider"] = provider.provider
    else:
        answer["llm_status"] = provider.reason
    return {"explanation": answer}


def HumanReviewNode(state: InvestigationState) -> dict:
    needs = bool(state.get("conflicts")) or any(
        f.get("severity") == "high" for f in state.get("detector_findings", [])
    )
    if not needs:
        return {"requires_human_review": False, "human_review_id": None}
    rid = db.new_id("review")
    db.insert("human_review_queue", {
        # document_id is a FK to documents(id); never substitute the vehicle id.
        "id": rid, "vehicle_id": state["vehicle_id"],
        "reason": "; ".join(state.get("conflicts", [])) or "high-severity anomaly",
        "status": "open",
        "kind": "suspicious_fraud", "payload": json.dumps(state.get("conflicts", [])),
        "created_at": db.now_iso(), "updated_at": db.now_iso(),
    })
    emit("agent.human_review_requested", review_id=rid, vehicle_id=state["vehicle_id"])
    return {"requires_human_review": True, "human_review_id": rid}


def ReportGenerationNode(state: InvestigationState) -> dict:
    """Cite existing reports/passport evidence; never fabricate a report."""
    reports = _read("reports", state["vehicle_id"])
    if not reports:
        return {
            "report_records": [],
            "missing_records": ["No generated Vehicle History Passport on record."],
            "verification_results": [{"check": "passport", "status": "not_generated",
                                      "note": "The passport can be generated from the evidence graph on request."}],
        }
    return {"report_records": reports}


def ResultPersistenceNode(state: InvestigationState) -> dict:
    iid = state.get("investigation_id") or db.new_id("inv")
    answer = state.get("explanation") or {}
    cid = state.get("category_id") or categories.DEFAULT_CATEGORY_ID
    nodes = state.get("nodes_executed", [])
    status = "awaiting_review" if state.get("requires_human_review") else "completed"
    db.insert("agent_investigations", {
        "id": iid, "vehicle_id": state["vehicle_id"], "question": state["question"],
        "status": status, "version": AGENT_VERSION, "result": str(answer)[:4000],
        # Real schema: answer / citations_json / node_trace_json / graph_version…
        "thread_id": state.get("thread_id"),
        "answer": json.dumps(answer, default=str)[:8000],
        "citations_json": json.dumps(state.get("sources", [])),
        "conflicts_json": json.dumps(state.get("conflicts", [])),
        "missing_json": json.dumps(state.get("missing_records", [])),
        "node_trace_json": json.dumps(nodes),
        "graph_version": AGENT_VERSION,
        "started_at": db.now_iso(), "finished_at": db.now_iso(),
        "created_at": db.now_iso(),
    })
    db.insert("ai_analysis", {
        "id": db.new_id("analysis"), "vehicle_id": state["vehicle_id"],
        # Real schema CHECK: odometer|document|damage|conflict|agent|market|inspection
        "kind": "agent", "analysis_type": "investigation",
        "title": f"{len(nodes)}-node {cid} evidence investigation",
        "explanation": (f"category={cid}; orchestrator reported separately; "
                        f"{len(state.get('detector_findings', []))} findings"),
        "method": "langgraph-or-sequential", "engine": "investigator",
        "model_version": AGENT_VERSION, "version": AGENT_VERSION,
        "severity": "high" if state.get("conflicts") else "low",
        "result": str(state.get("conflicts", []))[:2000],
        "evidence_json": json.dumps(state.get("sources", [])[:30]),
        "recommended_action": "Human review" if state.get("requires_human_review") else "None",
        "review_state": "pending_review" if state.get("requires_human_review") else "auto",
        "disclaimer": "Investigation findings are leads for human review, not proof.",
        "created_at": db.now_iso(),
    })
    return {
        "investigation_id": iid,
        "status": status,
    }


# Wrap every node so the executed-node list is maintained by the graph itself
# as well as by the sequential fallback.
NODE_FUNCS = {name: _node(globals()[name]) for name in NODE_NAMES}


def nodes_for(category_id: str | None = None) -> list[str]:
    """Conditional node list. EV profiles add EVBatteryAnalysisNode."""
    cid = category_id or categories.DEFAULT_CATEGORY_ID
    declared = categories.agent_nodes_for(cid)
    missing = [n for n in declared if n not in NODE_FUNCS]
    if missing:
        emit("agent.unknown_nodes", category=cid, nodes=missing)
    nodes = [n for n in declared if n in NODE_FUNCS]
    return nodes or list(NODE_NAMES)


_GRAPH_ERROR: str | None = None
_CHECKPOINTER: Any | None = None
_CHECKPOINT_CONN: Any | None = None
_CHECKPOINT_BACKEND: str | None = None
_CHECKPOINT_ERROR: str | None = None


def _get_checkpointer():
    """Return a process-wide checkpointer and record which backend is active.

    `sqlite` stores thread checkpoints in `.data/langgraph-checkpoints.db` so an
    interrupted investigation survives a restart. The package is optional: when
    it is missing (slim deployment) the in-memory saver is used and the API
    payload reports `checkpoint_backend: "memory"` instead of pretending the
    history is durable.
    """
    global _CHECKPOINTER, _CHECKPOINT_CONN, _CHECKPOINT_BACKEND, _CHECKPOINT_ERROR
    if _CHECKPOINTER is not None:
        return _CHECKPOINTER
    from langgraph.checkpoint.memory import MemorySaver  # type: ignore

    backend = (settings.checkpoint_backend or "memory").strip().lower()
    if backend in ("sqlite", "durable", "db"):
        try:
            import sqlite3

            from langgraph.checkpoint.sqlite import SqliteSaver  # type: ignore

            path = settings.checkpoint_db
            path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(str(path), check_same_thread=False)
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA busy_timeout = 5000;")
            saver = SqliteSaver(conn)
            setup = getattr(saver, "setup", None)
            if callable(setup):
                setup()
            _CHECKPOINT_CONN = conn
            _CHECKPOINTER = saver
            _CHECKPOINT_BACKEND = "sqlite"
            return _CHECKPOINTER
        except Exception as exc:
            _CHECKPOINT_ERROR = f"{type(exc).__name__}: {exc}"
    elif backend not in ("memory", "none", ""):
        _CHECKPOINT_ERROR = f"unsupported TD_CHECKPOINT_BACKEND={backend!r}; using memory"
    _CHECKPOINTER = MemorySaver()
    _CHECKPOINT_BACKEND = "memory"
    return _CHECKPOINTER


def build_graph(nodes: list[str] | None = None):
    """Return a compiled LangGraph graph, or None if it cannot be loaded.

    A missing package is not the only failure mode: on some hosts a dependency
    DLL is blocked by an application-control policy. Any load error is captured
    and reported, and the deterministic sequential executor is used instead.
    """
    global _GRAPH_ERROR
    active = nodes or nodes_for(categories.DEFAULT_CATEGORY_ID)
    try:
        from langgraph.graph import END, StateGraph  # type: ignore

        checkpointer = _get_checkpointer()
    except Exception as exc:  # ImportError, OSError (DLL), etc.
        _GRAPH_ERROR = f"{type(exc).__name__}: {exc}"
        return None
    try:
        builder = StateGraph(InvestigationState)
        for name in active:
            builder.add_node(name, NODE_FUNCS[name])
        builder.set_entry_point(active[0])
        for a, b in zip(active, active[1:]):
            builder.add_edge(a, b)
        builder.add_edge(active[-1], END)
        return builder.compile(checkpointer=checkpointer,
                               interrupt_before=["HumanReviewNode"])
    except Exception as exc:
        _GRAPH_ERROR = f"{type(exc).__name__}: {exc}"
        return None


def _sequential(initial: InvestigationState, nodes: list[str]) -> InvestigationState:
    state: InvestigationState = dict(initial)  # type: ignore[assignment]
    for name in nodes:
        state.update(NODE_FUNCS[name](state))  # type: ignore[arg-type]
    return state


def investigate(vehicle_id: str, question: str, thread_id: str | None = None,
                category_id: str | None = None) -> InvestigationResult:
    if category_id and categories.get_category(category_id):
        profile = categories.get_category(category_id)
    else:
        profile = categories.resolve_vehicle_category(vehicle_id)
    cid = str(profile["id"])
    nodes = nodes_for(cid)
    initial: InvestigationState = {
        "vehicle_id": vehicle_id,
        "question": question,
        "thread_id": thread_id or db.new_id("thread"),
        # Only a real caller override is passed down; resolved categories are
        # detected by VehicleCategoryDetectionNode from the shared DB row.
        "category_override": category_id if category_id and categories.get_category(category_id) else None,
        "nodes_executed": [],
        "investigation_id": db.new_id("inv"),
    }
    graph = build_graph(nodes)
    orchestrator = "langgraph"
    checkpointing = False
    if graph is not None:
        try:
            config = {"configurable": {"thread_id": initial["thread_id"]}}
            out = graph.invoke(initial, config=config)
            state: InvestigationState = dict(out)  # type: ignore[assignment]
            checkpointing = True
            # The interrupt stops before HumanReviewNode; finish the remaining
            # nodes deterministically so every investigation is persisted.
            for name in nodes:
                if name not in state.get("nodes_executed", []):
                    state.update(NODE_FUNCS[name](state))  # type: ignore[arg-type]
            # Write the completed state back to the checkpoint so a durable
            # thread does not stop at the human-review interrupt forever.
            try:
                graph.update_state(config, state)
            except Exception as exc:
                emit("agent.checkpoint_update_failed", error=f"{type(exc).__name__}: {exc}")
        except Exception as exc:
            emit("agent.graph_fallback", error=f"{type(exc).__name__}: {exc}")
            state = _sequential(initial, nodes)
            orchestrator = "sequential-fallback"
    else:
        state = _sequential(initial, nodes)
        orchestrator = "sequential-fallback"

    findings = state.get("detector_findings", [])
    explanation = explain.compute(vehicle_id, cid)
    emit("agent.complete", vehicle_id=vehicle_id, orchestrator=orchestrator,
         category=cid, nodes=len(nodes), findings=len(findings),
         review=bool(state.get("requires_human_review")))
    executed = state.get("nodes_executed", nodes)
    checkpoint_backend = _CHECKPOINT_BACKEND or "none"
    durable_checkpointing = checkpoint_backend == "sqlite"
    checkpoint_note = (
        "LangGraph checkpoints are persisted to the shared SQLite checkpoint file and survive a service restart."
        if durable_checkpointing
        else "LangGraph checkpointing is in-memory for this process; install langgraph-checkpoint-sqlite and set "
        "TD_CHECKPOINT_BACKEND=sqlite for durable thread history."
    )
    return InvestigationResult(
        investigation_id=str(state.get("investigation_id")),
        vehicle_id=vehicle_id, question=question, orchestrator=orchestrator,
        checkpointing=checkpointing,
        checkpoint_backend=checkpoint_backend,
        durable_checkpointing=durable_checkpointing,
        nodes=executed,
        status=str(state.get("status") or "completed"),
        answer=state.get("explanation") or {},
        findings=findings,
        evidence_ids=state.get("sources", []),
        model_versions={
            "agent": AGENT_VERSION,
            "fraud_rules": detectors.RULES_VERSION,
            "fraud_rules_legacy": detectors.LEGACY_RULES_VERSION,
            "fraud_ml": detectors.ML_VERSION,
            "trust_score": explain.SCORE_VERSION,
            "category_spec": categories.spec_version(),
            "llm": llm.LLM_VERSION,
        },
        human_review={
            "required": bool(state.get("requires_human_review")),
            "id": state.get("human_review_id"),
            "policy": "High-impact unresolved findings are held for authorised human review; no automated decision is final.",
        },
        explanation=explanation.model_dump(),
        limitations=[
            "Evidence is permission-filtered and read from the shared database only.",
            "An LLM never sets the trust score and never invents verification results.",
            checkpoint_note,
            f"Conditional graph: {len(nodes)} of {len(NODE_NAMES)} registered nodes were relevant to '{cid}'.",
            "Battery State of Health is never inferred; missing battery evidence is reported as unverified.",
        ],
        category_id=cid, category_label=str(profile["label"]),
        category_legacy=bool(state.get("category_legacy")),
        node_count=len(executed),
    )


def describe_graph() -> dict:
    graph = build_graph()
    profiles = {
        c["id"]: {"label": c["label"], "count": len(nodes_for(c["id"])), "nodes": nodes_for(c["id"])}
        for c in categories.categories()
    }
    return {
        "orchestrator": "langgraph" if graph is not None else "sequential-fallback",
        "checkpointing": graph is not None,
        "checkpoint_backend": (_CHECKPOINT_BACKEND or "none") if graph is not None else "none",
        "durable_checkpointing": graph is not None and _CHECKPOINT_BACKEND == "sqlite",
        "checkpoint_error": _CHECKPOINT_ERROR,
        "interrupt_before": ["HumanReviewNode"] if graph is not None else [],
        # Full registered node set; the EXECUTED subset is per-category.
        "nodes": NODE_NAMES,
        "node_registry_count": len(NODE_NAMES),
        "conditional": True,
        "default_nodes": nodes_for(categories.DEFAULT_CATEGORY_ID),
        "category_profiles": profiles,
        "version": AGENT_VERSION,
        "legacy_version": LEGACY_AGENT_VERSION,
        "error": None if graph is not None else _GRAPH_ERROR,
        "note": ("One shared investigator; only the category's listed nodes are added to the graph and executed "
                 "(15 for combustion profiles, 16 for electric profiles). When langgraph cannot load "
                 "(missing package or blocked DLL) the SAME selected node functions run sequentially and "
                 "the payload says so."),
    }
