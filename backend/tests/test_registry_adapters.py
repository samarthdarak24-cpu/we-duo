"""Phase 11 -- external vehicle-registry provider adapters.

The fake provider here is a REAL local HTTP server (``http.server`` in a
thread), not a mock of our own client: the adapter performs an actual socket
request, and the tests assert on what the server actually received.

Nothing in this file contacts VAHAN, an insurer or a theft register -- those
access paths are blocked without authorised credentials, and no government
response is simulated anywhere.
"""
from __future__ import annotations

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from app.integrations import registry, registry_consent
from app.integrations.registry import (
    OUTCOME_BLOCKED,
    OUTCOME_CONSENT_REQUIRED,
    OUTCOME_NOT_FOUND,
    OUTCOME_OK,
    OUTCOME_PROVIDER_ERROR,
    OUTCOME_RATE_LIMITED,
    OUTCOME_TIMEOUT,
)

REG_NO = "MH01AB1234"
VIN = "WBA8E9G50GNU12345"

PROVIDER_PAYLOAD = {
    "registrationNumber": REG_NO,
    "chassisNumber": VIN,
    "make": "BMW",
    "model": "3 Series",
    "ownershipCount": 2,
    "status": "active",
}


class _QuietServer(ThreadingHTTPServer):
    """Threading server that does not print a traceback when a client hangs up."""

    def handle_error(self, request, client_address):  # noqa: D102 - stdlib hook
        pass


class FakeProvider:
    """A real local HTTP server standing in for an authorised provider."""

    def __init__(self) -> None:
        self.requests: list[dict] = []
        self.mode = "ok"
        self.payload = dict(PROVIDER_PAYLOAD)
        self.delay = 0.0
        self._lock = threading.Lock()
        self._server = _QuietServer(("127.0.0.1", 0), self._make_handler())
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    @property
    def base_url(self) -> str:
        host, port = self._server.server_address[:2]
        return f"http://{host}:{port}"

    def close(self) -> None:
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=5)

    def _make_handler(self):
        provider = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *args):  # silence stderr noise
                pass

            def do_POST(self):  # noqa: N802 - stdlib naming
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) if length else b""
                try:
                    body = json.loads(raw.decode("utf-8")) if raw else {}
                except Exception:
                    body = {"_unparsed": raw.decode("utf-8", "replace")}
                with provider._lock:
                    provider.requests.append({
                        "path": self.path,
                        "headers": {k.lower(): v for k, v in self.headers.items()},
                        "body": body,
                    })
                if provider.delay:
                    time.sleep(provider.delay)
                mode = provider.mode
                if mode == "not_found":
                    self._json(404, {"error": "no record"})
                elif mode == "garbage":
                    self._raw(200, b"<<not-json-at-all>>", "text/plain")
                elif mode == "server_error":
                    self._json(500, {"error": "provider exploded"})
                else:
                    self._json(200, provider.payload)

            def _json(self, status: int, payload) -> None:
                self._raw(status, json.dumps(payload).encode("utf-8"), "application/json")

            def _raw(self, status: int, raw: bytes, content_type: str) -> None:
                try:
                    self.send_response(status)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Content-Length", str(len(raw)))
                    self.end_headers()
                    self.wfile.write(raw)
                except OSError:
                    # The client gave up first (timeout test) -- expected.
                    pass

        return Handler


@pytest.fixture
def provider():
    fake = FakeProvider()
    try:
        yield fake
    finally:
        fake.close()


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch):
    """No provider may be configured unless the test configures it."""
    for key in list(os.environ):
        if key.startswith(("TD_VAHAN_", "TD_INSURER_", "TD_THEFT_", "TD_PROVIDER_")):
            monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("TD_REGISTRY_CONSENT_VERSION", "registry-consent-v1")
    monkeypatch.setenv("TD_REGISTRY_AUDIT_ENABLED", "1")
    registry.reset_rate_limits()
    registry_consent.reset_store()
    yield
    registry.reset_rate_limits()
    registry_consent.reset_store()


def configure(provider: FakeProvider, monkeypatch, source: str = "vahan",
              token: str | None = "provider-secret-token", timeout_ms: int = 2000,
              rate_limit: int = 60) -> None:
    key = source.upper()
    monkeypatch.setenv(f"TD_{key}_BASE_URL", provider.base_url)
    if token is not None:
        monkeypatch.setenv(f"TD_{key}_TOKEN", token)
    monkeypatch.setenv(f"TD_{key}_TIMEOUT_MS", str(timeout_ms))
    monkeypatch.setenv(f"TD_{key}_RATE_LIMIT_PER_MIN", str(rate_limit))


def grant_consent(source: str = "vahan", reg_no: str = REG_NO, vin: str = VIN) -> dict:
    return registry_consent.record_consent(
        reg_no=reg_no, vin=vin, source=source, actor_id="u-seller"
    )


# --------------------------------------------------------------------------- #
# blocked / consent
# --------------------------------------------------------------------------- #
def test_unconfigured_source_is_blocked_and_queries_nothing(provider):
    result = registry.lookup("vahan", reg_no=REG_NO, vin=VIN)

    assert result["outcome"] == OUTCOME_BLOCKED
    assert result["record"] is None
    assert result["verified"] is False
    assert result["demo"] is False
    assert provider.requests == []


def test_missing_consent_is_refused_before_any_request(provider, monkeypatch):
    configure(provider, monkeypatch)

    result = registry.lookup("vahan", reg_no=REG_NO, vin=VIN)

    assert result["outcome"] == OUTCOME_CONSENT_REQUIRED
    assert result["record"] is None
    assert result["consent_id"] is None
    assert provider.requests == []


def test_consent_for_another_vehicle_does_not_cover_this_lookup(provider, monkeypatch):
    configure(provider, monkeypatch)
    grant_consent(reg_no="MH99ZZ9999", vin="OTHERVIN000000000")

    result = registry.lookup("vahan", reg_no=REG_NO, vin=VIN)

    assert result["outcome"] == OUTCOME_CONSENT_REQUIRED
    assert provider.requests == []


def test_missing_token_is_blocked_and_no_request_is_sent(provider, monkeypatch):
    configure(provider, monkeypatch, token=None)

    result = registry.lookup("vahan", reg_no=REG_NO, vin=VIN)

    assert result["outcome"] == OUTCOME_BLOCKED
    assert provider.requests == []
    assert result["record"] is None
    assert "provider-secret-token" not in json.dumps(result)


# --------------------------------------------------------------------------- #
# a real request over HTTP
# --------------------------------------------------------------------------- #
def test_consented_lookup_reaches_the_provider_and_is_normalised(provider, monkeypatch):
    configure(provider, monkeypatch)
    consent = grant_consent()

    result = registry.lookup(
        "vahan", reg_no=REG_NO, vin=VIN, consent_id=consent["consent_id"], actor_id="u-seller"
    )

    assert result["outcome"] == OUTCOME_OK
    assert len(provider.requests) == 1
    request = provider.requests[0]
    assert request["body"]["reg_no"] == REG_NO
    assert request["body"]["vin"] == VIN
    assert request["body"]["source"] == "vahan"
    assert request["headers"]["authorization"] == "Bearer provider-secret-token"

    record = result["record"]
    assert record["source"] == "vahan"
    assert record["reg_no"] == REG_NO
    assert record["vin"] == VIN
    assert record["make"] == "BMW"
    assert record["model"] == "3 Series"
    assert record["owner_count"] == 2
    assert record["status"] == "active"
    assert record["demo"] is False
    assert record["retrieved_at"]

    provenance = record["provenance"]
    assert provenance["source"] == "vahan"
    assert provenance["provider"] == "vahan"
    assert provenance["provider_kind"] == "live"
    assert provenance["live"] is True
    assert provenance["demo"] is False
    assert provenance["request_id"] == result["request_id"]
    assert provenance["consent_id"] == consent["consent_id"]
    assert provenance["retrieved_at"]


def test_provider_404_is_not_found_not_an_error(provider, monkeypatch):
    provider.mode = "not_found"
    configure(provider, monkeypatch)
    grant_consent()

    result = registry.lookup("vahan", reg_no=REG_NO, vin=VIN)

    assert result["outcome"] == OUTCOME_NOT_FOUND
    assert result["record"]["status"] == "not_found"
    assert result["record"]["verified"] is False
    assert result["verified"] is False


def test_unusable_payload_is_a_provider_error(provider, monkeypatch):
    provider.mode = "garbage"
    configure(provider, monkeypatch)
    grant_consent()

    result = registry.lookup("vahan", reg_no=REG_NO, vin=VIN)

    assert result["outcome"] == OUTCOME_PROVIDER_ERROR
    assert result["record"]["status"] == "unknown"
    assert result["record"]["verified"] is False
    assert result["verified"] is False


def test_timeout_never_becomes_a_negative_result(provider, monkeypatch):
    provider.mode = "timeout"
    provider.delay = 1.0
    configure(provider, monkeypatch, timeout_ms=150)
    grant_consent()

    result = registry.lookup("vahan", reg_no=REG_NO, vin=VIN)

    assert result["outcome"] == OUTCOME_TIMEOUT
    record = result["record"]
    assert record["status"] == "unknown"
    assert record["verified"] is False
    assert record["make"] is None
    assert record["model"] is None
    assert record["owner_count"] is None
    assert result["verified"] is False


def test_unreachable_provider_is_typed_and_never_crashes(monkeypatch):
    import socket

    # A port that was free a moment ago: nothing is listening on it.
    probe = socket.socket()
    probe.bind(("127.0.0.1", 0))
    closed_port = probe.getsockname()[1]
    probe.close()

    monkeypatch.setenv("TD_VAHAN_BASE_URL", f"http://127.0.0.1:{closed_port}")
    monkeypatch.setenv("TD_VAHAN_TOKEN", "provider-secret-token")
    monkeypatch.setenv("TD_VAHAN_TIMEOUT_MS", "5000")
    grant_consent()

    result = registry.lookup("vahan", reg_no=REG_NO, vin=VIN)

    # Depending on the host, an unreachable port is refused (provider_error) or
    # times out (timeout). Both are typed failures -- never a crash, never a
    # verified negative, never an invented value.
    assert result["outcome"] in (OUTCOME_PROVIDER_ERROR, OUTCOME_TIMEOUT)
    assert result["record"]["status"] == "unknown"
    assert result["record"]["verified"] is False
    assert result["verified"] is False
    assert result["record"]["owner_count"] is None


# --------------------------------------------------------------------------- #
# rate limiting
# --------------------------------------------------------------------------- #
def test_rate_limit_stops_the_request_before_it_is_sent(provider, monkeypatch):
    configure(provider, monkeypatch, rate_limit=1)
    grant_consent()

    first = registry.lookup("vahan", reg_no=REG_NO, vin=VIN)
    second = registry.lookup("vahan", reg_no=REG_NO, vin=VIN)

    assert first["outcome"] == OUTCOME_OK
    assert second["outcome"] == OUTCOME_RATE_LIMITED
    assert second["record"] is None
    assert len(provider.requests) == 1


# --------------------------------------------------------------------------- #
# secrets
# --------------------------------------------------------------------------- #
def test_provider_token_never_appears_in_the_result(provider, monkeypatch):
    provider.mode = "server_error"
    configure(provider, monkeypatch, token="provider-secret-token")
    grant_consent()

    result = registry.lookup("vahan", reg_no=REG_NO, vin=VIN)

    assert result["outcome"] == OUTCOME_PROVIDER_ERROR
    assert "provider-secret-token" not in json.dumps(result)


def test_provider_token_never_appears_in_the_audit_event(provider, monkeypatch):
    provider.mode = "server_error"
    configure(provider, monkeypatch, token="provider-secret-token")
    grant_consent()
    events: list[tuple[str, dict]] = []
    monkeypatch.setattr(registry, "emit", lambda name, **ctx: events.append((name, ctx)))

    registry.lookup("vahan", reg_no=REG_NO, vin=VIN)

    assert events
    assert "provider-secret-token" not in json.dumps([ctx for _, ctx in events])


# --------------------------------------------------------------------------- #
# audit trail
# --------------------------------------------------------------------------- #
def test_every_attempt_is_audited(provider, monkeypatch):
    events: list[tuple[str, dict]] = []
    monkeypatch.setattr(registry, "emit", lambda name, **ctx: events.append((name, ctx)))

    blocked = registry.lookup("vahan", reg_no=REG_NO, vin=VIN)
    configure(provider, monkeypatch)
    refused = registry.lookup("vahan", reg_no=REG_NO, vin=VIN)
    grant_consent()
    allowed = registry.lookup("vahan", reg_no=REG_NO, vin=VIN)

    lookups = [ctx for name, ctx in events if name == "registry.lookup"]
    assert len(lookups) == 3
    assert [ctx["outcome"] for ctx in lookups] == [
        blocked["outcome"], refused["outcome"], allowed["outcome"]
    ]
    assert lookups[1]["outcome"] == OUTCOME_CONSENT_REQUIRED
    assert all(ctx["request_id"] for ctx in lookups)
    assert all(ctx["source"] == "vahan" for ctx in lookups)


# --------------------------------------------------------------------------- #
# demo data and user documents are never verification
# --------------------------------------------------------------------------- #
def test_demo_adapter_is_labelled_and_never_verified():
    result = registry.MockRegistryAdapter("vahan").lookup(reg_no=REG_NO, vin=VIN)

    assert result["demo"] is True
    assert result["verified"] is False
    record = result["record"]
    assert record["demo"] is True
    assert record["verified"] is False
    assert record["provenance"]["provider_kind"] == "mock"
    assert record["provenance"]["live"] is False
    assert record["owner_count"] is None
    assert record["status"] == "unknown"


def test_demo_source_never_reports_itself_as_a_live_registry():
    status = registry.get_registry_status()

    for source in ("vahan", "insurer", "theft"):
        entry = status["sources"][source]
        assert entry["status"] == "blocked"
        assert entry["configured"] is False
        assert entry["demo"] is True
        assert entry["reason"]
    assert status["active_provider"] != "live"
    assert "demo" in status["note"].lower()


def test_user_document_is_never_government_verified():
    result = registry.lookup_document(
        {"registrationNumber": REG_NO, "make": "BMW", "ownershipCount": 1},
        document_id="doc-1",
    )

    assert result["record"]["source"] == "document"
    assert result["record"]["verified"] is False
    assert result["verified"] is False
    provenance = result["record"]["provenance"]
    assert provenance["provider_kind"] == "user_document"
    assert provenance["live"] is False
    assert "not government-verified" in provenance["note"].lower()


def test_configured_source_is_reported_as_available(provider, monkeypatch):
    configure(provider, monkeypatch)

    status = registry.get_registry_status()

    assert status["active_provider"] == "live"
    assert status["sources"]["vahan"]["status"] == "available"
    assert status["sources"]["vahan"]["configured"] is True
    assert status["sources"]["vahan"]["demo"] is False
    assert status["sources"]["insurer"]["status"] == "blocked"
    assert status["sources"]["theft"]["status"] == "blocked"
