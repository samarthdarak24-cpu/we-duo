"""Local hash-chain integrity (NOT a blockchain anchor)."""
from __future__ import annotations

from .. import db


def verify_vehicle_chain(vehicle_id: str) -> dict:
    rows = db.read("chain_records", where="vehicle_id = :v",
                   params={"v": vehicle_id}, limit=2000)
    broken = [r for r in rows if r.get("broken")]
    return {
        "vehicle_id": vehicle_id,
        "records": len(rows),
        "broken": len(broken),
        "status": "broken" if broken else ("intact" if rows else "no_records"),
        "method": "local-sha256-chain",
        "note": ("A matching hash proves the stored bytes are unchanged against the "
                 "recorded hash. It is not proof that the original document was genuine, "
                 "and it is not an on-chain anchor."),
    }
