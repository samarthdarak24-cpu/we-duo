"""Adapter over `app.llm` so integrations and the agent share one code path."""
from __future__ import annotations

from ... import llm as core_llm
from .interface import LLMResponse


class ProviderLLM:
    name = "configured-llm"

    def available(self) -> bool:
        return core_llm.available()

    def explain(self, question: str, facts: dict) -> LLMResponse:
        result = core_llm.generate_explanation(question, facts)
        return LLMResponse(
            available=result.available,
            provider=result.provider,
            text=result.conclusion,
            grounded=result.grounded,
            reason=result.reason,
        )

    def describe(self) -> dict:
        return core_llm.describe()


def get_provider() -> ProviderLLM:
    return ProviderLLM()
