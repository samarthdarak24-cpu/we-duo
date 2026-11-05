"""Optional on-chain anchoring adapter.

No chain is configured by default, and this module never claims an anchor that
did not happen. The product relies on the local SHA-256 chain; on-chain
anchoring is a separate, optional integration that requires an RPC endpoint,
a contract and a funded signer.
"""
from __future__ import annotations

import importlib.util
import os


class NotConfigured(RuntimeError):
    pass


def status() -> dict:
    rpc = os.getenv("TD_CHAIN_RPC_URL")
    contract = os.getenv("TD_CHAIN_CONTRACT")
    has_web3 = importlib.util.find_spec("web3") is not None
    configured = bool(rpc and contract and has_web3)
    return {
        "configured": configured,
        "provider": "evm" if rpc else "none",
        "rpc_configured": bool(rpc),
        "contract_configured": bool(contract),
        "web3_installed": has_web3,
        "anchoring_claimed": False,
        "note": ("No chain is configured. Integrity is the local SHA-256 chain only; "
                 "on-chain anchoring is NOT claimed. Set TD_CHAIN_RPC_URL / "
                 "TD_CHAIN_CONTRACT and install web3 to enable the adapter."),
    }


def anchor(digest: str, vehicle_id: str) -> dict:
    st = status()
    if not st["configured"]:
        raise NotConfigured(st["note"])
    # Even when configured, this build does not sign/submit a transaction.
    raise NotConfigured(
        "Chain adapter is configured but not wired to a signed transaction in this build. "
        "No anchor was written."
    )
