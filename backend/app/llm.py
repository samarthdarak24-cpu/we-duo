"""LLM provider adapter.

Offline (the default) it returns NO conclusion. It never invents a verification
result and never sets the trust score. When a compatible provider is configured
it calls an OpenAI/Anthropic-style HTTP endpoint; the output is still validated
against source records before it can be shown.
"""
from __future__ import annotations

import importlib.util
import os
import re
import time
from typing import Any

import httpx
from pydantic import BaseModel, Field

from .config import settings
from .logging import emit

LLM_VERSION = "llm-adapter-1.1.0"
_LOCAL: dict[str, Any] = {}
LOCAL_SYSTEM_PROMPT = (
    "You are a vehicle evidence summariser. Use ONLY the supplied facts.\n"
    "STRICT RULES (violating any causes your answer to be discarded):\n"
    "- Never say the vehicle is 'verified', 'fully verified', or 'verified by "
    "TrustDrive'. Instead say 'TrustDrive has the following records on file'.\n"
    "- Never claim the vehicle is safe, genuine, authentic, stolen-free, "
    "fraud-free, accident-free or has a clean history. Never recommend buying.\n"
    "- If findings are listed, you MUST report them; never say 'no issues', "
    "'no anomalies' or 'nothing suspicious'.\n"
    "- Do not invent numbers, IDs or documents that are not in the facts.\n"
    "Report the anomalies and missing records you see, cite an evidence ID for "
    "each statement, and end with a line 'Sources: <ids>'. If evidence is "
    "missing, say 'unavailable'. Keep the answer under 120 words."
)

CONTRADICTIONS = [
    r"\bno (recorded )?(mileage )?(decrease|rollback|anomal)",
    r"\bno anomalies?\b",
    r"\bno issues?\b",
    r"\bnothing (unusual|suspicious)\b",
    r"\bno discrepancies\b",
]

# The model may never make these judgements. A hit rejects the whole output.
FORBIDDEN_CLAIMS = [
    r"\bsafe to (buy|purchase|drive|own)\b",
    r"\b(good|great|excellent) (buy|purchase)\b",
    r"\bno fraud\b", r"\bnot (a )?fraud\b", r"\bfraud[- ]free\b",
    r"\bgenuine\b", r"\bauthentic\b",
    r"\baccident[- ]free\b", r"\bno accidents?\b",
    r"\bstolen[- ]free\b", r"\bnot stolen\b",
    r"\bclean (title|history)\b",
    r"\bguaranteed\b", r"\bfully verified\b", r"\b100% (safe|verified)\b",
    r"\bvehicle (has been|is|was) (fully )?verified\b",
    r"\bverified by (the )?trust ?drive\b",
]


def policy_violations(text: str) -> list[str]:
    lowered = (text or "").lower()
    return [pattern for pattern in FORBIDDEN_CLAIMS if re.search(pattern, lowered)]


def contradiction_violations(text: str, facts: dict) -> list[str]:
    """Reject output that denies findings which are present in the facts."""
    lowered = (text or "").lower()
    out: list[str] = []
    findings = facts.get("mileage_findings") or facts.get("findings") or []
    if findings:
        out += [pattern for pattern in CONTRADICTIONS if re.search(pattern, lowered)]
    if str(facts.get("vehicle_identity_status") or "") == "verified" and re.search(
        r"\b(identity|registration|vin|chassis)\b[^.]{0,40}"
        r"\b(unavailable|missing|not (?:available|verified|found))\b",
        lowered,
    ):
        out.append("identity_marked_unavailable")
    return out


def missing_citations(text: str, facts: dict) -> list[str]:
    """Inline citation is opt-in: the chat API attaches citations structurally.

    When `require_inline_citations` is set (e.g. an audit narrative), the text
    must mention at least one supplied source id.
    """
    if not facts.get("require_inline_citations"):
        return []
    sources = [str(s) for s in (facts.get("sources") or [])]
    if not sources:
        return []
    return [] if any(s in (text or "") for s in sources) else ["policy:no_citation"]


def is_coherent(text: str) -> bool:
    """Reject fragments/garbled output from very small models.

    Evidence-dense answers legitimately contain bracketed citation IDs and a
    trailing source list (e.g. ``[f-1793869680352]``). Those characters are not
    prose, so they are stripped before the letter-ratio test; otherwise a
    perfectly readable answer with six citations was rejected as "incoherent".
    """
    t = (text or "").strip()
    if len(t) < 20:
        return False
    if t.startswith(("{", "[", "'")):
        return False
    prose = re.sub(r"\[[^\]\n]{1,200}\]", " ", t)
    prose = re.sub(r"(?im)^\s*sources?\s*:.*$", " ", prose)
    words = re.findall(r"[A-Za-z]{2,}", prose)
    if len(words) < 6:
        return False
    letters = sum(ch.isalpha() for ch in prose)
    if letters / max(1, len(prose)) < 0.5:
        return False
    return True


class LLMResult(BaseModel):
    available: bool
    provider: str
    model: str | None = None
    conclusion: str | None = None
    reason: str
    grounded: bool = False
    unsupported_claims: list[str] = Field(default_factory=list)


def _local_ready() -> bool:
    return bool(
        settings.llm_provider == "local"
        and settings.llm_model
        and importlib.util.find_spec("torch") is not None
        and importlib.util.find_spec("transformers") is not None
    )


def _http_ready() -> bool:
    return bool(
        settings.llm_provider not in ("none", "local")
        and settings.llm_api_key
        and settings.llm_base_url
    )


def available() -> bool:
    return _local_ready() or _http_ready()


def describe() -> dict:
    active = available()
    provider = ("local-transformers" if _local_ready()
                else settings.llm_provider if _http_ready() else "none")
    note = (
        "No LLM provider is configured. No conclusion is generated and the "
        "evidence-only answer is returned instead. Verification is never "
        "delegated to an LLM."
        if not active else
        f"Active LLM provider: {provider} (model {settings.llm_model}). It may "
        "rewrite the narrative only; it never sets findings or the trust score, "
        "and a rejected or ungrounded answer falls back to the deterministic "
        "evidence-only answer."
    )
    return {
        "active": active,
        "provider": provider,
        "model": settings.llm_model if active else None,
        "local_ready": _local_ready(),
        "loaded": "model" in _LOCAL,
        "version": LLM_VERSION,
        "note": note,
    }


def warm() -> dict:
    """Load the local model ahead of the first request.

    A cold transformers load takes minutes, which pushes the first live
    investigation past the caller's HTTP timeout and degrades it to the
    deterministic engine. Warming at boot keeps that cost off the request path.
    """
    if not _local_ready():
        return {"warmed": False, "provider": describe()["provider"], "reason": "no local model configured"}
    started = time.perf_counter()
    try:
        _load_local()
    except Exception as exc:
        emit("llm.warm_failed", model=settings.llm_model, error=f"{type(exc).__name__}: {exc}")
        return {"warmed": False, "provider": "local-transformers", "model": settings.llm_model,
                "error": f"{type(exc).__name__}: {exc}"}
    ms = round((time.perf_counter() - started) * 1000, 1)
    emit("llm.warm", model=settings.llm_model, ms=ms)
    return {"warmed": True, "provider": "local-transformers", "model": settings.llm_model, "ms": ms}


def _finding_label(finding: object) -> str:
    """Render one mileage finding without assuming it is a dict.

    ``RiskExplanationNode`` passes already-filled explanation strings while
    detector payloads are dicts. Both are valid; a bare string used to crash
    ``_draft`` with ``'str' object has no attribute 'get'`` and turned the whole
    LangGraph investigation into an HTTP 500.
    """
    if isinstance(finding, dict):
        return str(
            finding.get("anomaly_type")
            or finding.get("code")
            or finding.get("title")
            or "finding"
        )
    return str(finding)


def _draft(facts: dict) -> str:
    """A compact, evidence-only draft the model is asked to rewrite."""
    v = facts.get("vehicle") or {}
    trust = facts.get("trust") or {}
    readings = facts.get("mileage_readings") or []
    findings = facts.get("mileage_findings") or []
    missing = facts.get("missing_records") or []
    sources = facts.get("sources") or []
    kms = [
        r.get("km")
        for r in readings
        if isinstance(r, dict) and isinstance(r.get("km"), (int, float))
    ]
    parts = [
        f"Vehicle: {v.get('make', '')} {v.get('model', '')} {v.get('year', '')}, "
        f"registration {v.get('reg_no', 'unavailable')}.",
        f"Identity record: {facts.get('vehicle_identity_status', 'unknown')}.",
        f"Trust score: {trust.get('score', 'unavailable')}/100 "
        f"({trust.get('band_label', trust.get('band', 'unverified'))}).",
        f"Mileage readings: {len(readings)}"
        + (f", range {min(kms):,}-{max(kms):,} km." if kms else "."),
        f"Mileage findings: {len(findings)}"
        + (f" ({', '.join(_finding_label(f) for f in findings[:3])})." if findings else "."),
        f"Missing records: {', '.join(str(m) for m in missing) if missing else 'none'}.",
        f"Sources: {', '.join(str(s) for s in sources[:8]) if sources else 'none'}.",
    ]
    return " ".join(parts)


def _load_local():
    """Load the local causal LM + tokenizer once (CPU)."""
    if "model" in _LOCAL:
        return _LOCAL["model"], _LOCAL["tokenizer"]
    import torch  # type: ignore
    from transformers import AutoModelForCausalLM, AutoTokenizer  # type: ignore
    tokenizer = AutoTokenizer.from_pretrained(settings.llm_model)
    # CPU inference is most stable in float32 (bf16 is slow/unsupported on many CPUs).
    try:
        model = AutoModelForCausalLM.from_pretrained(settings.llm_model, dtype=torch.float32)
    except TypeError:  # transformers < 5 uses torch_dtype
        model = AutoModelForCausalLM.from_pretrained(settings.llm_model, torch_dtype=torch.float32)
    model.eval()
    _LOCAL["model"], _LOCAL["tokenizer"] = model, tokenizer
    return model, tokenizer


def _generate_local(question: str, facts: dict) -> LLMResult:
    try:
        model, tokenizer = _load_local()
        messages = [
            {"role": "system", "content": LOCAL_SYSTEM_PROMPT},
            {"role": "user", "content": (
                f"QUESTION: {question}\n\nFACTS:\n{facts}\n\n"
                f"DRAFT (rewrite only; do not add facts):\n{_draft(facts)}"
            )},
        ]
        prompt = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        inputs = tokenizer(prompt, return_tensors="pt")
        max_new = int(os.getenv("TD_LLM_MAX_NEW_TOKENS", "220"))
        output = model.generate(
            **inputs, max_new_tokens=max_new, do_sample=False,
            pad_token_id=tokenizer.eos_token_id,
        )
        new_tokens = output[0][inputs["input_ids"].shape[-1]:]
        text = tokenizer.decode(new_tokens, skip_special_tokens=True)
        grounded, unsupported = validate_grounding(text, facts)
        violations = policy_violations(text)
        if violations:
            grounded = False
            unsupported = unsupported + [f"policy:{v}" for v in violations]
        if not is_coherent(text):
            grounded = False
            unsupported = unsupported + ["policy:incoherent"]
        contradictions = contradiction_violations(text, facts)
        if contradictions:
            grounded = False
            unsupported = unsupported + [f"policy:contradiction:{c}" for c in contradictions]
        unsupported = unsupported + missing_citations(text, facts)
        if missing_citations(text, facts):
            grounded = False
        emit("llm.local", model=settings.llm_model, grounded=grounded,
             policy_violations=len(violations))
        return LLMResult(
            available=True, provider="local-transformers", model=settings.llm_model,
            conclusion=text if grounded else None,
            reason=("Grounded in supplied evidence." if grounded else
                    "Rejected: the model made a safety/authenticity judgement or an "
                    "unsupported claim. The deterministic evidence-only answer is used instead."),
            grounded=grounded, unsupported_claims=unsupported,
        )
    except Exception as exc:
        emit("llm.error", error=f"{type(exc).__name__}: {exc}")
        return LLMResult(
            available=True, provider="local-transformers", model=settings.llm_model,
            reason=f"Local model call failed ({type(exc).__name__}). No conclusion was produced.",
        )


def generate_explanation(question: str, facts: dict) -> LLMResult:
    if _local_ready():
        return _generate_local(question, facts)
    if not _http_ready():
        return LLMResult(
            available=False, provider="none", reason=(
                "No LLM provider is configured (set TD_LLM_PROVIDER=local for the "
                "local model, or TD_LLM_API_KEY / TD_LLM_BASE_URL for an HTTP provider). "
                "A deterministic, evidence-only answer is returned instead. "
                "No conclusion was fabricated."
            ),
        )
    prompt = (
        f"{LOCAL_SYSTEM_PROMPT}\n\nQUESTION: {question}\n\nFACTS:\n{facts}\n\n"
        f"DRAFT (rewrite only; do not add facts):\n{_draft(facts)}"
    )
    try:
        resp = httpx.post(
            f"{settings.llm_base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {settings.llm_api_key}",
                     "Content-Type": "application/json"},
            json={"model": settings.llm_model,
                  "messages": [{"role": "user", "content": prompt}],
                  "temperature": 0},
            timeout=30,
        )
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"]
        grounded, unsupported = validate_grounding(text, facts)
        violations = policy_violations(text)
        if violations:
            grounded = False
            unsupported = unsupported + [f"policy:{v}" for v in violations]
        if not is_coherent(text):
            grounded = False
            unsupported = unsupported + ["policy:incoherent"]
        contradictions = contradiction_violations(text, facts)
        if contradictions:
            grounded = False
            unsupported = unsupported + [f"policy:contradiction:{c}" for c in contradictions]
        unsupported = unsupported + missing_citations(text, facts)
        if missing_citations(text, facts):
            grounded = False
        emit("llm.called", provider=settings.llm_provider, grounded=grounded,
             policy_violations=len(violations))
        return LLMResult(
            available=True, provider=settings.llm_provider, model=settings.llm_model,
            conclusion=text if grounded else None,
            reason=("Grounded in supplied evidence." if grounded else
                    "Rejected: the model made a safety/authenticity judgement or an "
                    "unsupported claim. The deterministic evidence-only answer is used instead."),
            grounded=grounded, unsupported_claims=unsupported,
        )
    except Exception as exc:
        emit("llm.error", error=f"{type(exc).__name__}: {exc}")
        return LLMResult(
            available=True, provider=settings.llm_provider,
            reason=f"Provider call failed ({type(exc).__name__}). No conclusion was produced.",
        )


_SCORE_SCALE_RE = re.compile(r"\b(\d{1,3})\s*(?:/|out\s+of)\s*100\b", re.IGNORECASE)


def _trust_score(facts: dict) -> int | None:
    trust = facts.get("trust")
    score = trust.get("score") if isinstance(trust, dict) else facts.get("score")
    try:
        return int(score) if score is not None else None
    except (TypeError, ValueError):
        return None


def validate_grounding(text: str, facts: dict) -> tuple[bool, list[str]]:
    """Reject numeric claims / IDs that do not appear anywhere in the evidence."""
    allowed = re.findall(r"\d[\d,]{2,}", str(facts))
    allowed_ids = set(re.findall(r"\b(?:v|doc|ev|f|d|u|r)-[A-Za-z0-9_-]{1,}\b", str(facts)))
    unsupported: list[str] = []

    # "92/100" is the trust-score scale, not an invented number. Validate the
    # numerator against the persisted score, then drop the span before the
    # generic number check so the literal 100 is not flagged.
    score = _trust_score(facts)
    for match in _SCORE_SCALE_RE.finditer(text):
        if score is None or int(match.group(1)) != score:
            unsupported.append(match.group(0))
    text_without_scores = _SCORE_SCALE_RE.sub(" ", text)

    for token in re.findall(r"\b\d[\d,]{2,}\b", text_without_scores):
        if token not in allowed and token.replace(",", "") not in [a.replace(",", "") for a in allowed]:
            unsupported.append(token)
    for token in re.findall(r"\b(?:v|doc|ev|f|d|u|r)-[A-Za-z0-9_-]{1,}\b", text):
        if token not in allowed_ids:
            unsupported.append(token)
    return len(unsupported) == 0, unsupported


def deterministic_answer(question: str, facts: dict) -> dict:
    """Evidence-only answer used when no provider is available (and as the
    validation baseline when one is)."""
    return {
        "question": question,
        "answer_source": "deterministic-evidence-only",
        "vehicle_identity_status": facts.get("vehicle_identity_status", "unverified"),
        "available_mileage_history": facts.get("mileage_readings", []),
        "detected_mileage_anomalies": facts.get("mileage_findings", []),
        "accident_records": facts.get("accident_records", []),
        "document_findings": facts.get("document_findings", []),
        "available_inspection_evidence": facts.get("inspection_evidence", []),
        "missing_records": facts.get("missing_records", []),
        "unresolved_conflicts": facts.get("unresolved_conflicts", []),
        "recommended_next_action": facts.get("recommended_next_action",
                                             "Request an independent inspection before purchase."),
        "sources": facts.get("sources", []),
        "disclaimer": "This answer is assembled from persisted records only. No LLM conclusion is included.",
    }
