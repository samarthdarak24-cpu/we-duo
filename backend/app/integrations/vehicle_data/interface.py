"""Vehicle-registry provider interface (RTO / OEM / authorised aggregator)."""
from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, Field


class VehicleRecord(BaseModel):
    reg_no: str | None = None
    vin: str | None = None
    make: str | None = None
    model: str | None = None
    year: int | None = None
    fuel: str | None = None
    owner_count: int | None = None
    source: str
    verified: bool = False
    demo: bool = False
    notes: list[str] = Field(default_factory=list)


class VehicleDataProvider(Protocol):
    name: str

    def available(self) -> bool: ...

    def lookup(self, *, reg_no: str | None = None, vin: str | None = None) -> VehicleRecord: ...
