"""LLM provider interface. A provider must never decide verification."""
from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel


class LLMResponse(BaseModel):
    available: bool
    provider: str
    text: str | None = None
    grounded: bool = False
    reason: str = ""


class LLMProvider(Protocol):
    name: str

    def available(self) -> bool: ...

    def explain(self, question: str, facts: dict) -> LLMResponse: ...
