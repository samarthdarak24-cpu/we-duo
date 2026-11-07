# TrustDrive — LangGraph Integration Report

**Date:** 2026-11-07 · **Result: PASS (real LangGraph execution + durable SQLite checkpoints).**
**Package:** LangGraph 0.4.10 + `langgraph-checkpoint-sqlite` 3.1.3 installed in `backend/.venv`
**Agent version:** `investigator-2.0.0-multicategory`
**Health:** `orchestrator=langgraph`, `checkpointing=true`, `checkpoint_backend=sqlite`, `durable_checkpointing=true`, `conditional=true`, `node_registry_count=16`

## 1. Graph design

| Profile | Nodes executed | EV node |
|---|---:|---|
| `petrol_motorcycle` | 15 | — |
| `petrol_scooter` | 15 | — |
| `electric_scooter` | 16 | `EVBatteryAnalysisNode` |
| `electric_motorcycle` | 16 | `EVBatteryAnalysisNode` |
| `passenger_car` | 15 | — |
| `electric_car` | 16 | `EVBatteryAnalysisNode` |

Shared node sequence:

```text
VehicleResolverNode
→ VehicleCategoryDetectionNode
→ DocumentRetrievalNode
→ OCRAnalysisNode
→ MileageAnalysisNode
→ [EVBatteryAnalysisNode — EV only]
→ DamageAnalysisNode
→ IdentityVerificationNode
→ HistoryCorrelationNode
→ AnomalyDetectionNode
→ EvidenceGraphNode
→ ConflictDetectionNode
→ RiskExplanationNode
→ HumanReviewNode
→ ReportGenerationNode
→ ResultPersistenceNode
```

`HumanReviewNode` is an interrupt before high-impact unresolved findings. The graph is conditional, not a fixed 12-step pipeline.

## 2. Live proof

| Check | Observed | Result |
|---|---|---|
| Endpoint | `POST /api/v1/vehicles/:id/ai-investigations` → 200 | PASS |
| Source | `python-intelligence` | PASS |
| Orchestrator | `langgraph` | PASS |
| Nodes in response | 15 (car) / 16 (EV) | PASS |
| UI timeline | 15/15 executed nodes rendered | PASS |
| Findings/citations | 2 findings / 6 citations | PASS |
| Human review | `required:true`, `review-1a0e6cfae277` | PASS |
| Persisted run | `ai_runs.graph=langgraph-conditional`, status `awaiting_review` | PASS |
| EV-only node | absent for petrol, present for EV | PASS |
| Service auth | anonymous 401; token 200 | PASS |
| Fallback | only on failure, labelled `next-deterministic-fallback` | PASS |

Six categories executed real investigations in the broad run; all six returned the expected node count and category profile.

## 3. Checkpointing and persistence

- `checkpointing=true` means LangGraph's checkpointer is active.
- **Durable backend is configured.** `TD_CHECKPOINT_BACKEND=sqlite` (default) uses `langgraph-checkpoint-sqlite` to persist every investigation thread to `TD_CHECKPOINT_DB` (default `.data/langgraph-checkpoints.db`), with tables `checkpoints` and `writes`.
- The completed state is written back to the checkpoint after the human-review interrupt, so a thread does not stop forever at the interrupt.
- `/health` and every investigation payload report `checkpoint_backend` and `durable_checkpointing`; a slim deployment without the optional package reports `memory`/`false` instead of claiming durability. Set `TD_CHECKPOINT_BACKEND=memory` to force the old behaviour.
- **Status: PASS for durable SQLite checkpoints.** Backend suite `127/127` includes a test that opens the checkpoint file, asserts both tables exist and that the checkpoint count is greater than zero. Test runs isolate the file via `TD_CHECKPOINT_DB` in `conftest.py`.
- A split Postgres deployment should configure a Postgres saver instead of the local SQLite file.

## 4. Fallback behaviour

If Python/LangGraph is unavailable, Next returns a deterministic review labelled:

```json
{
  "source": "next-deterministic-fallback",
  "orchestrator": "deterministic-next",
  "limitations": ["..."]
}
```

The UI shows the actual source. A fallback is never presented as a LangGraph run.

## 5. LLM boundary

`TD_LLM_PROVIDER=none` in the final runtime. `/health` states:

> “Offline: no conclusion is generated. Verification is never delegated to an LLM.”

The graph still computes deterministic findings, evidence citations and a human-review requirement. LLM narrative generation is **BLOCKED**, not faked.

## 6. Verdict

**LangGraph integration: PASS.** The service runs a real conditional 15/16-node graph, persists the run, returns evidence-cited findings with human review, and persists investigation threads to durable SQLite checkpoints. LLM narrative generation remains BLOCKED and is never faked.
