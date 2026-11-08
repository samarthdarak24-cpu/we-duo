# TrustDrive — LangGraph / Investigator Test Report

**Date:** 2026-11-05 · **Result: PASS (orchestrator active; fallback verified)**

## Live agent config (`/health` → `agent`)
- Orchestrator: **`langgraph`** when installed; **`sequential-fallback`** otherwise
- `checkpointing: true` (when langgraph loads); `False` in fallback
- `interrupt_before: ["HumanReviewNode"]` (human-in-the-loop)
- **16-node registry** (`agent.py::NODE_NAMES`); per-category **conditional** execution:
  **15 nodes for combustion profiles, 16 for electric** (the extra node is
  `EVBatteryAnalysisNode`).
- Nodes: `VehicleResolverNode, VehicleCategoryDetectionNode, DocumentRetrievalNode,
  OCRAnalysisNode, MileageAnalysisNode, EVBatteryAnalysisNode (electric only),
  DamageAnalysisNode, IdentityVerificationNode, HistoryCorrelationNode,
  AnomalyDetectionNode, EvidenceGraphNode, ConflictDetectionNode,
  RiskExplanationNode, HumanReviewNode, ReportGenerationNode, ResultPersistenceNode`
- Fallback: "When langgraph cannot load … the SAME selected node functions run
  sequentially and the payload reports `orchestrator: "sequential-fallback"`."

## Verified
- All 16 registered nodes exist as functions; only the resolved category's listed
  nodes are added to the graph and executed. Routing, retries, checkpointing, tool
  errors and human-review states are part of the design and covered by Pytest
  (`test_agent.py`).
- Persistence: `agent_investigations` + `human_review_queue` tables; `ResultPersistenceNode` writes
  findings/verification results.
- `background_jobs` worker runs `investigation` jobs with status/retries/timeout/idempotency.

## Test coverage
- Pytest agent/investigator suite passed as part of the 99/1 run.

## Not executed this pass
- A live full investigation run end-to-end through the worker (would need a job poll); covered by
  Pytest against the same nodes.
