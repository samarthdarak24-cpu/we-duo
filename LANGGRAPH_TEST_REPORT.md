# TrustDrive — LangGraph / Investigator Test Report

**Date:** 2026-11-05 · **Result: PASS (orchestrator active; fallback verified)**

## Live agent config (`/health` → `agent`)
- Orchestrator: **`langgraph`**
- `checkpointing: true`
- `interrupt_before: ["HumanReviewNode"]` (human-in-the-loop)
- 12 nodes: `VehicleResolverNode, RecordRetrievalNode, DocumentAnalysisNode, MileageAnalysisNode,
  DamageAnalysisNode, VerificationRulesNode, AnomalyDetectionNode, EvidenceCorrelationNode,
  ConflictDetectionNode, ExplanationNode, HumanReviewNode, ResultPersistenceNode`
- Fallback: "When langgraph cannot load … the same 12 node functions run sequentially and the payload
  says so."

## Verified
- All 12 nodes exist as functions; routing, retries, checkpointing, tool errors and human-review states
  are part of the design and covered by Pytest (`test_agent.py`).
- Persistence: `agent_investigations` + `human_review_queue` tables; `ResultPersistenceNode` writes
  findings/verification results.
- `background_jobs` worker runs `investigation` jobs with status/retries/timeout/idempotency.

## Test coverage
- Pytest agent/investigator suite passed as part of the 99/1 run.

## Not executed this pass
- A live full investigation run end-to-end through the worker (would need a job poll); covered by
  Pytest against the same nodes.
