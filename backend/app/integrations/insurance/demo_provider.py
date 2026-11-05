"""Demo insurance provider. Never claims a live policy check."""
from __future__ import annotations

from .interface import PolicyRecord


class DemoInsuranceProvider:
    name = "demo-insurance"

    def available(self) -> bool:
        return True

    def check_policy(self, policy_no: str) -> PolicyRecord:
        return PolicyRecord(
            policy_no=policy_no, status="unknown", claim_count=None,
            source=self.name, verified=False, demo=True,
            notes=["DEMO DATA: no insurer API is configured; status is unknown, not 'clean'."],
        )
