"""Demo vehicle-data provider.

Used when no authorised registry is configured. It NEVER returns `verified=True`
and every record is marked `demo=True` so the UI can label it.
"""
from __future__ import annotations

import hashlib

from .interface import VehicleRecord

DEMO_CATALOGUE = {
    "MH01AB1234": ("BMW", "3 Series", 2019, "petrol", 1),
    "MH12CD8899": ("Toyota", "Camry", 2020, "hybrid", 1),
    "MH02CD5678": ("Honda", "City", 2020, "petrol", 2),
}


class DemoVehicleDataProvider:
    name = "demo-vehicle-registry"

    def available(self) -> bool:
        return True

    def lookup(self, *, reg_no: str | None = None, vin: str | None = None) -> VehicleRecord:
        key = (reg_no or "").replace(" ", "").upper()
        row = DEMO_CATALOGUE.get(key)
        if row:
            make, model, year, fuel, owners = row
            return VehicleRecord(
                reg_no=key, vin=vin, make=make, model=model, year=year, fuel=fuel,
                owner_count=owners, source=self.name, verified=False, demo=True,
                notes=["DEMO DATA: no authorised registry was queried."],
            )
        # Deterministic pseudo-record so the shape is stable for demos.
        digest = hashlib.sha256((key or vin or "unknown").encode()).hexdigest()[:8]
        return VehicleRecord(
            reg_no=key or None, vin=vin, source=self.name, verified=False, demo=True,
            notes=[f"DEMO DATA: no registry match; synthetic reference {digest}."],
        )
