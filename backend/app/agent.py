"""Stateful 12-node LangGraph vehicle investigator.

LangGraph is used when installed (with a checkpointer and a human-in-the-loop
interrupt). When it is not installed, the SAME twelve node functions run through
a deterministic sequential executor and the response reports
`orchestrator: "sequential-fallback"` — the service never claims LangGraph ran
when it did not, and never fabricates a conclusion.
"""
from __future__ import annotations

import json
from typing import Any, TypedDict

from pydantic import BaseModel, Field

from . import db, detectors, explain, llm
from .logging import emit

AGENT_VERSION = "investigator-1.0.0"

NODE_NAMES = [
    "VehicleResolverNode",
    "RecordRetrievalNode",
    "DocumentAnalysisNode",
    "MileageAnalysisNode",
    "DamageAnalysisNode",
    "VerificationRulesNode",
    "AnomalyDetectionNode",
    "EvidenceCorrelationNode",
    "ConflictDetectionNode",
    "ExplanationNode",
    "HumanReviewNode",
    "ResultPersistenceNode",
]


class InvestigationState(TypedDict, total=False):
    vehicle_id: str
    question: str
    thread_id: str
    nodes_executed: list[str]
    vehicle: dict | None
    documents: list[dict]
    verified_documents: list[dict]
    mileage_readings: list[dict]
    accident_records: list[dict]
    service_records: list[dict]
    damage_records: list[dict]
    inspection_evidence: list[dict]
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
    nodes: list[str]
    status: str
    answer: dict
    findings: list[dict]
    evidence_ids: list[str]
    model_versions: dict
    human_review: dict
    explanation: dict
    limitations: list[str] = Field(default_factory=list)


def _read(table: str, vehicle_id: str, limit: int = 200) -> list[dict]:
    if not db.has_table(table) or "vehicle_id" not in db.columns(table):
        return []
    return db.read(table, where="vehicle_id = :v", params={"v": vehicle_id}, limit=limit)


def _node(fn):
    """Record that a node ran; keep node bodies deterministic and side-effect free."""
    def wrapped(state: InvestigationState) -> dict:
        out = fn(state)
        out["nodes_executed"] = list(state.get("nodes_executed", [])) + [fn.__name__]
        return out
    wrapped.__name__ = fn.__name__
    return wrapped


def VehicleResolverNode(state: InvestigationState) -> dict:
    rows = db.read("vehicles", where="id = :v", params={"v": state["vehicle_id"]}, limit=1)
    v = rows[0] if rows else None
    return {
        "vehicle": v,
        "status": "not_found" if v is None else "resolved",
    }


def RecordRetrievalNode(state: InvestigationState) -> dict:
    v = state.get("vehicle") or {}
    service = _read("history_events", state["vehicle_id"])
    return {
        "service_records": service,
        "missing_records": (["Vehicle identity record not found"] if not v else [])
                           + (["Service history not available"] if not service else []),
    }


def DocumentAnalysisNode(state: InvestigationState) -> dict:
    docs = _read("documents", state["vehicle_id"])
    verified = [d for d in docs if str(d.get("status")) == "verified"]
    return {"documents": docs, "verified_documents": verified}


def MileageAnalysisNode(state: InvestigationState) -> dict:
    return {
        "mileage_readings": _read("mileage_readings", state["vehicle_id"]),
        "accident_records": _read("accident_records", state["vehicle_id"]),
    }


def DamageAnalysisNode(state: InvestigationState) -> dict:
    return {
        "damage_records": _read("damage_records", state["vehicle_id"]),
        "inspection_evidence": _read("vehicle_inspections", state["vehicle_id"]),
    }


def VerificationRulesNode(state: InvestigationState) -> dict:
    report = detectors.detect_all(state["vehicle_id"])
    findings = [
        f.model_dump() if hasattr(f, "model_dump") else f
        for r in report["reports"] for f in r["findings"]
    ]
    return {"detector_findings": findings}


def AnomalyDetectionNode(state: InvestigationState) -> dict:
    ml = [f for f in state.get("detector_findings", [])
          if "forest" in str(f.get("method")) or "lof" in str(f.get("method"))]
    return {"ml_findings": ml} if ml else {}


def EvidenceCorrelationNode(state: InvestigationState) -> dict:
    ev = _read("verification_evidence", state["vehicle_id"])
    sources = sorted({str(e.get("id")) for e in ev} |
                     {str(d.get("id")) for d in state.get("documents", [])} |
                     {str(m.get("id")) for m in state.get("mileage_readings", [])})
    return {"evidence": ev, "sources": sources}


def ConflictDetectionNode(state: InvestigationState) -> dict:
    conflicts = [
        f["explanation"] for f in state.get("detector_findings", [])
        if f.get("severity") == "high"
    ]
    return {"conflicts": conflicts}


def ExplanationNode(state: InvestigationState) -> dict:
    facts = {
        "vehicle_identity_status": "resolved" if state.get("vehicle") else "unverified",
        "mileage_readings": [{"id": m.get("id"), "km": m.get("km"), "date": m.get("date")}
                             for m in state.get("mileage_readings", [])][:20],
        "mileage_findings": [f["explanation"] for f in state.get("detector_findings", [])
                             if "mileage" in f.get("anomaly_type", "")][:10],
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


def ResultPersistenceNode(state: InvestigationState) -> dict:
    iid = state.get("investigation_id") or db.new_id("inv")
    answer = state.get("explanation") or {}
    # Real schema CHECK: running|awaiting_review|completed|failed
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
        "node_trace_json": json.dumps(state.get("nodes_executed", [])),
        "graph_version": AGENT_VERSION,
        "started_at": db.now_iso(), "finished_at": db.now_iso(),
        "created_at": db.now_iso(),
    })
    db.insert("ai_analysis", {
        "id": db.new_id("analysis"), "vehicle_id": state["vehicle_id"],
        # Real schema CHECK: odometer|document|damage|conflict|agent|market|inspection
        "kind": "agent", "analysis_type": "investigation",
        "title": "12-node evidence investigation",
        "explanation": f"orchestrator reported separately; {len(state.get('detector_findings', []))} findings",
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
        "status": "awaiting_review" if state.get("requires_human_review") else "completed",
    }


# Wrap every node so the executed-node list is maintained by the graph itself
# as well as by the sequential fallback.
NODE_FUNCS = {name: _node(globals()[name]) for name in NODE_NAMES}


_GRAPH_ERROR: str | None = None


def build_graph():
    """Return a compiled LangGraph graph, or None if it cannot be loaded.

    A missing package is not the only failure mode: on some hosts a dependency
    DLL is blocked by an application-control policy. Any load error is captured
    and reported, and the deterministic sequential executor is used instead.
    """
    global _GRAPH_ERROR
    try:
        from langgraph.checkpoint.memory import MemorySaver  # type: ignore
        from langgraph.graph import END, StateGraph  # type: ignore
    except Exception as exc:  # ImportError, OSError (DLL), etc.
        _GRAPH_ERROR = f"{type(exc).__name__}: {exc}"
        return None
    try:
        builder = StateGraph(InvestigationState)
        for name in NODE_NAMES:
            builder.add_node(name, NODE_FUNCS[name])
        builder.set_entry_point(NODE_NAMES[0])
        for a, b in zip(NODE_NAMES, NODE_NAMES[1:]):
            builder.add_edge(a, b)
        builder.add_edge(NODE_NAMES[-1], END)
        return builder.compile(checkpointer=MemorySaver(),
                               interrupt_before=["HumanReviewNode"])
    except Exception as exc:
        _GRAPH_ERROR = f"{type(exc).__name__}: {exc}"
        return None


def _sequential(initial: InvestigationState) -> InvestigationState:
    state: InvestigationState = dict(initial)  # type: ignore[assignment]
    for name in NODE_NAMES:
        state.update(NODE_FUNCS[name](state))  # type: ignore[arg-type]
    return state


def investigate(vehicle_id: str, question: str, thread_id: str | None = None) -> InvestigationResult:
    initial: InvestigationState = {
        "vehicle_id": vehicle_id,
        "question": question,
        "thread_id": thread_id or db.new_id("thread"),
        "nodes_executed": [],
        "investigation_id": db.new_id("inv"),
    }
    graph = build_graph()
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
            for name in NODE_NAMES:
                if name not in state.get("nodes_executed", []):
                    state.update(NODE_FUNCS[name](state))  # type: ignore[arg-type]
        except Exception as exc:
            emit("agent.graph_fallback", error=f"{type(exc).__name__}: {exc}")
            state = _sequential(initial)
            orchestrator = "sequential-fallback"
    else:
        state = _sequential(initial)
        orchestrator = "sequential-fallback"

    findings = state.get("detector_findings", [])
    explanation = explain.compute(vehicle_id)
    emit("agent.complete", vehicle_id=vehicle_id, orchestrator=orchestrator,
         findings=len(findings), review=bool(state.get("requires_human_review")))
    return InvestigationResult(
        investigation_id=str(state.get("investigation_id")),
        vehicle_id=vehicle_id, question=question, orchestrator=orchestrator,
        checkpointing=checkpointing, nodes=state.get("nodes_executed", NODE_NAMES),
        status=str(state.get("status") or "completed"),
        answer=state.get("explanation") or {},
        findings=findings,
        evidence_ids=state.get("sources", []),
        model_versions={
            "agent": AGENT_VERSION,
            "fraud_rules": detectors.RULES_VERSION,
            "fraud_ml": detectors.ML_VERSION,
            "trust_score": explain.SCORE_VERSION,
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
            "LangGraph checkpointing is in-memory; Postgres checkpoint persistence is the documented production target.",
        ],
    )


def describe_graph() -> dict:
    graph = build_graph()
    return {
        "orchestrator": "langgraph" if graph is not None else "sequential-fallback",
        "checkpointing": graph is not None,
        "interrupt_before": ["HumanReviewNode"] if graph is not None else [],
        "nodes": NODE_NAMES,
        "version": AGENT_VERSION,
        "error": None if graph is not None else _GRAPH_ERROR,
        "note": "When langgraph cannot load (missing package or blocked DLL) the same 12 node functions run sequentially and the payload says so.",
    }
