"""Insurance provider interface (authorised insurer / aggregator only)."""
from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, Field


class PolicyRecord(BaseModel):
    policy_no: str
    status: str
    valid_from: str | None = None
    valid_to: str | None = None
    claim_count: int | None = None
    source: str
    verified: bool = False
    demo: bool = False
    notes: list[str] = Field(default_factory=list)


class InsuranceProvider(Protocol):
    name: str

    def available(self) -> bool: ...

    def check_policy(self, policy_no: str) -> PolicyRecord: ...
