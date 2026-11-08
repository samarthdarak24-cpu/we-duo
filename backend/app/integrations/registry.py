"""External vehicle-registry provider adapters (vahan / insurer / theft).

Honest by construction:

* A lookup only happens when the source is configured, the provider
  credentials authenticate, the per-source rate limit allows it and the data
  subject's consent is recorded. A missing consent means **no request at all**.
* Every attempt -- including a refusal -- writes a structured audit event.
* Every record carries its provenance: source, provider, request id, retrieval
  timestamp and whether it came from a live provider, the labelled demo
  adapter, or a user-supplied document.
* Failures are typed: ``blocked`` (not configured), ``consent_required``,
  ``rate_limited``, ``provider_error``, ``timeout``, ``not_found``, ``ok``.
  A failure is never turned into a verified negative -- unknown stays unknown.
* The demo adapter never queries anything and never verifies anything; it is
  labelled ``demo: true`` and is not reported as an available government
  source.

Provider configuration is per source, with the generic ``TD_PROVIDER_URL`` /
``TD_PROVIDER_TOKEN`` kept as a fallback so existing wiring keeps working:

``TD_<SOURCE>_BASE_URL`` / ``TD_<SOURCE>_TOKEN`` / ``TD_<SOURCE>_TIMEOUT_MS`` /
``TD_<SOURCE>_RATE_LIMIT_PER_MIN`` (source = VAHAN | INSURER | THEFT).
"""
from __future__ import annotations

import abc
import json
import os
import socket
import time
import uuid
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from ..logging import emit
from . import registry_consent as consent_mod
from .registry_consent import ConsentRecord, has_consent, record_consent

SOURCES = ("vahan", "insurer", "theft")

OUTCOME_OK = "ok"
OUTCOME_BLOCKED = "blocked"
OUTCOME_CONSENT_REQUIRED = "consent_required"
OUTCOME_RATE_LIMITED = "rate_limited"
OUTCOME_PROVIDER_ERROR = "provider_error"
OUTCOME_TIMEOUT = "timeout"
OUTCOME_NOT_FOUND = "not_found"

OUTCOMES = (
    OUTCOME_OK,
    OUTCOME_BLOCKED,
    OUTCOME_CONSENT_REQUIRED,
    OUTCOME_RATE_LIMITED,
    OUTCOME_PROVIDER_ERROR,
    OUTCOME_TIMEOUT,
    OUTCOME_NOT_FOUND,
)

DEFAULT_TIMEOUT_MS = 5000
DEFAULT_RATE_LIMIT_PER_MIN = 60
DEFAULT_LOOKUP_PATH = "/lookup"

# Provider payload field aliases -> stable RegistryRecord fields.
_FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "reg_no": ("reg_no", "registrationNumber", "registration_number", "regNo", "rc_number"),
    "vin": ("vin", "chassisNumber", "chassis_number", "chassis", "vinNumber"),
    "make": ("make", "manufacturer", "brand", "makeName"),
    "model": ("model", "modelName", "vehicle_model", "vehicleModel"),
    "owner_count": ("owner_count", "ownershipCount", "ownerCount", "number_of_owners", "no_of_owners"),
    "status": ("status", "registrationStatus", "statusDescription", "policyStatus", "claimStatus"),
    "verified": ("verified", "isVerified", "registryVerified"),
}


class RegistryRecord(dict):
    """Normalized record returned by every adapter."""


class RegistryResult(dict):
    """Outcome envelope for one lookup attempt."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return int(str(raw).strip())
    except ValueError:
        return default


def _audit_enabled() -> bool:
    raw = (os.getenv("TD_REGISTRY_AUDIT_ENABLED") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _redact(text: str | None, token: str | None) -> str | None:
    """Never let a provider token reach a log line, a reason or a response."""
    if not text:
        return text
    cleaned = str(text)
    if token and len(token) >= 4:
        cleaned = cleaned.replace(token, "***redacted***")
    return cleaned


# --------------------------------------------------------------------------- #
# Provider configuration
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class ProviderConfig:
    """Per-source provider configuration, read from the environment."""

    source: str
    base_url: str | None
    token: str | None
    timeout_ms: int
    rate_limit_per_min: int
    lookup_path: str

    @classmethod
    def from_env(cls, source: str) -> "ProviderConfig":
        key = source.upper()
        base_url = (
            os.getenv(f"TD_{key}_BASE_URL")
            or os.getenv(f"TD_{key}_URL")
            or os.getenv("TD_PROVIDER_URL")
        )
        token = os.getenv(f"TD_{key}_TOKEN") or os.getenv("TD_PROVIDER_TOKEN")
        timeout_ms = _int_env(
            f"TD_{key}_TIMEOUT_MS", _int_env("TD_PROVIDER_TIMEOUT_MS", DEFAULT_TIMEOUT_MS)
        )
        rate_limit = _int_env(
            f"TD_{key}_RATE_LIMIT_PER_MIN",
            _int_env("TD_PROVIDER_RATE_LIMIT_PER_MIN", DEFAULT_RATE_LIMIT_PER_MIN),
        )
        lookup_path = os.getenv(f"TD_{key}_LOOKUP_PATH") or DEFAULT_LOOKUP_PATH
        return cls(
            source=source,
            base_url=base_url.strip() if base_url else None,
            token=token.strip() if token else None,
            timeout_ms=max(100, timeout_ms),
            rate_limit_per_min=max(1, rate_limit),
            lookup_path=lookup_path,
        )

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.token)

    @property
    def endpoint(self) -> str | None:
        if not self.base_url:
            return None
        return f"{self.base_url.rstrip('/')}/{self.lookup_path.lstrip('/')}"

    def headers(self, request_id: str, consent: ConsentRecord | None = None) -> dict[str, str]:
        """Request headers. The token is only ever sent, never logged."""
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Request-ID": request_id,
            "X-Consent-Version": consent_mod.consent_version(),
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if consent is not None:
            headers["X-Consent-ID"] = consent.consent_id
        return headers


# --------------------------------------------------------------------------- #
# Rate limiting
# --------------------------------------------------------------------------- #
class RateLimiter:
    """Sliding-window limiter: N requests per 60 seconds, per source."""

    def __init__(self, limit_per_min: int) -> None:
        self.limit = max(1, int(limit_per_min))
        self._hits: deque[float] = deque()

    def check(self) -> tuple[bool, int]:
        """Consume one slot. Returns (allowed, remaining slots)."""
        now = time.monotonic()
        while self._hits and (now - self._hits[0]) >= 60.0:
            self._hits.popleft()
        if len(self._hits) >= self.limit:
            return False, 0
        self._hits.append(now)
        return True, self.limit - len(self._hits)

    def reset(self) -> None:
        self._hits.clear()


_limiters: dict[str, tuple[int, RateLimiter]] = {}


def _limiter_for(source: str, limit_per_min: int) -> RateLimiter:
    """One limiter per source; rebuilt when the configured limit changes."""
    entry = _limiters.get(source)
    if entry is None or entry[0] != limit_per_min:
        entry = (limit_per_min, RateLimiter(limit_per_min))
        _limiters[source] = entry
    return entry[1]


def reset_rate_limits() -> None:
    """Clear every per-source rate limiter (tests, and operator resets)."""
    _limiters.clear()


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
class _ProviderTimeout(Exception):
    """The provider did not answer inside the configured timeout."""


class _ProviderError(Exception):
    """The provider could not be reached or answered unusably."""


def _parse_json(text: str | None) -> Any:
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def _urllib_post_json(url: str, body: dict, headers: dict, timeout_ms: int) -> tuple[int, Any]:
    """stdlib fallback used only when httpx is unavailable."""
    import urllib.error
    import urllib.request

    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    timeout = max(0.05, timeout_ms / 1000.0)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, _parse_json(response.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as exc:
        try:
            exc.read()
        except Exception:
            pass
        return exc.code, None
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, (socket.timeout, TimeoutError)):
            raise _ProviderTimeout(f"provider request timed out after {timeout_ms} ms") from exc
        raise _ProviderError(f"{type(exc).__name__}: {exc.reason}") from exc
    except (socket.timeout, TimeoutError) as exc:
        raise _ProviderTimeout(f"provider request timed out after {timeout_ms} ms") from exc
    except Exception as exc:
        raise _ProviderError(f"{type(exc).__name__}: {exc}") from exc


def _http_post_json(url: str, body: dict, headers: dict, timeout_ms: int) -> tuple[int, Any]:
    """POST JSON to the provider. Returns (status_code, parsed_body)."""
    try:
        import httpx
    except ImportError:  # pragma: no cover - httpx is a declared dependency
        return _urllib_post_json(url, body, headers, timeout_ms)
    timeout = max(0.05, timeout_ms / 1000.0)
    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url, json=body, headers=headers)
    except httpx.TimeoutException as exc:
        raise _ProviderTimeout(f"provider request timed out after {timeout_ms} ms") from exc
    except Exception as exc:
        raise _ProviderError(f"{type(exc).__name__}: {exc}") from exc
    return response.status_code, _parse_json(response.text)


# --------------------------------------------------------------------------- #
# Adapters
# --------------------------------------------------------------------------- #
class RegistryAdapter(abc.ABC):
    """Base contract for every registry source adapter."""

    name: str
    source: str
    provider_kind: str = "live"

    @abc.abstractmethod
    def available(self) -> bool:
        """Is this adapter able to perform a live lookup right now?"""

    @abc.abstractmethod
    def auth(self) -> bool:
        """Are provider credentials present?"""

    @abc.abstractmethod
    def endpoints(self) -> list[str]:
        """Configured endpoints (never includes credentials)."""

    @abc.abstractmethod
    def normalize(self, raw: dict | None) -> RegistryRecord:
        """Map a provider payload onto the stable record shape."""

    @abc.abstractmethod
    def health(self) -> dict:
        """Honest status for the status endpoint."""

    def lookup(
        self,
        *,
        reg_no: str | None = None,
        vin: str | None = None,
        consent_id: str | None = None,
        actor_id: str | None = None,
        document: dict | None = None,
    ) -> RegistryResult:
        raise NotImplementedError


def _pick(raw: dict, field: str) -> Any:
    for alias in _FIELD_ALIASES[field]:
        if alias in raw and raw[alias] not in (None, ""):
            return raw[alias]
    return None


def _as_owner_count(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        count = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return count if count >= 0 else None


def _as_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


class LiveRegistryAdapter(RegistryAdapter):
    """Adapter for an authorised external provider (VAHAN, insurer, theft)."""

    provider_kind = "live"

    def __init__(self, source: str = "vahan", config: ProviderConfig | None = None) -> None:
        self.source = source
        self.name = source
        self.config = config or ProviderConfig.from_env(source)

    # -- capability ------------------------------------------------------- #
    def available(self) -> bool:
        return self.config.configured

    def auth(self) -> bool:
        return bool(self.config.token)

    def endpoints(self) -> list[str]:
        return [self.config.endpoint] if self.config.endpoint else []

    def health(self) -> dict:
        source = self.source.upper()
        if not self.config.base_url:
            return {
                "source": self.source,
                "status": "blocked",
                "provider": self.name,
                "reason": (
                    f"{source} is not configured: set TD_{source}_BASE_URL (or the generic "
                    "TD_PROVIDER_URL). No external registry is queried and nothing is verified."
                ),
            }
        if not self.config.token:
            return {
                "source": self.source,
                "status": "blocked",
                "provider": self.name,
                "reason": (
                    f"{source} credentials are missing: set TD_{source}_TOKEN (or the generic "
                    "TD_PROVIDER_TOKEN). No request is sent."
                ),
            }
        return {
            "source": self.source,
            "status": "available",
            "provider": self.name,
            "endpoint": self.config.endpoint,
            "reason": "Configured. A lookup still requires a recorded user consent.",
        }

    # -- mapping ---------------------------------------------------------- #
    def normalize(self, raw: dict | None) -> RegistryRecord:
        raw = raw or {}
        body = raw.get("data") if isinstance(raw.get("data"), dict) else raw
        record = RegistryRecord({
            "source": self.source,
            "reg_no": _as_text(_pick(body, "reg_no")),
            "vin": _as_text(_pick(body, "vin")),
            "make": _as_text(_pick(body, "make")),
            "model": _as_text(_pick(body, "model")),
            "owner_count": _as_owner_count(_pick(body, "owner_count")),
            "status": _as_text(_pick(body, "status")) or "unknown",
            # Only a live provider may assert its own verification, and only
            # when it says so explicitly. Nothing is inferred here.
            "verified": bool(_pick(body, "verified")),
            "demo": False,
            "retrieved_at": _now_iso(),
            "provenance": {},
        })
        return record

    # -- lookup ----------------------------------------------------------- #
    def lookup(
        self,
        *,
        reg_no: str | None = None,
        vin: str | None = None,
        consent_id: str | None = None,
        actor_id: str | None = None,
        document: dict | None = None,
    ) -> RegistryResult:
        request_id = f"reg-{uuid.uuid4().hex[:12]}"
        started = time.monotonic()
        outcome = OUTCOME_BLOCKED
        reason: str | None = None
        record: RegistryRecord | None = None
        http_status: int | None = None
        consent: ConsentRecord | None = None

        try:
            if not self.available():
                outcome = OUTCOME_BLOCKED
                reason = self.health().get("reason")
            elif not self.auth():
                outcome = OUTCOME_BLOCKED
                reason = (
                    f"{self.source.upper()} provider credentials are not configured; "
                    "no request was sent."
                )
            else:
                consent = consent_mod.find_consent(
                    reg_no=reg_no, vin=vin, source=self.source, consent_id=consent_id
                )
                if consent is None:
                    outcome = OUTCOME_CONSENT_REQUIRED
                    reason = (
                        "No recorded, current user consent covers these identifiers; "
                        "no external registry request was made."
                    )
                else:
                    allowed, _remaining = _limiter_for(
                        self.source, self.config.rate_limit_per_min
                    ).check()
                    if not allowed:
                        outcome = OUTCOME_RATE_LIMITED
                        reason = (
                            f"{self.source} rate limit of {self.config.rate_limit_per_min} "
                            "requests/minute exceeded; no request was sent."
                        )
                    else:
                        outcome, record, http_status, reason = self._fetch(
                            reg_no, vin, request_id, consent
                        )
        except Exception as exc:  # never leak an exception to the API layer
            outcome = OUTCOME_PROVIDER_ERROR
            reason = _redact(f"{type(exc).__name__}: {exc}", self.config.token)
            record = None

        result = self._envelope(
            outcome=outcome,
            request_id=request_id,
            record=record,
            reason=reason,
            http_status=http_status,
            consent=consent,
        )
        self._audit(
            result,
            actor_id=actor_id,
            reg_no=reg_no,
            vin=vin,
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        return result

    # -- internals -------------------------------------------------------- #
    def _fetch(
        self,
        reg_no: str | None,
        vin: str | None,
        request_id: str,
        consent: ConsentRecord,
    ) -> tuple[str, RegistryRecord | None, int | None, str | None]:
        url = self.config.endpoint
        assert url is not None  # guaranteed by available()/auth()
        body = {
            "reg_no": reg_no,
            "vin": vin,
            "source": self.source,
            "consent_version": consent.consent_version,
            "consent_id": consent.consent_id,
        }
        headers = self.config.headers(request_id, consent)
        try:
            status, payload = _http_post_json(url, body, headers, self.config.timeout_ms)
        except _ProviderTimeout as exc:
            return (
                OUTCOME_TIMEOUT,
                self._unknown_record(reg_no, vin, request_id, consent),
                None,
                _redact(str(exc), self.config.token),
            )
        except _ProviderError as exc:
            return (
                OUTCOME_PROVIDER_ERROR,
                self._unknown_record(reg_no, vin, request_id, consent),
                None,
                _redact(str(exc), self.config.token),
            )

        if status == 404:
            record = self._unknown_record(reg_no, vin, request_id, consent)
            record["status"] = "not_found"
            return OUTCOME_NOT_FOUND, record, status, (
                "The provider has no record for these identifiers."
            )
        if status < 200 or status >= 300:
            return (
                OUTCOME_PROVIDER_ERROR,
                self._unknown_record(reg_no, vin, request_id, consent),
                status,
                f"The provider answered with HTTP {status}.",
            )
        if not isinstance(payload, dict):
            return (
                OUTCOME_PROVIDER_ERROR,
                self._unknown_record(reg_no, vin, request_id, consent),
                status,
                "The provider returned a payload that is not a JSON object.",
            )
        record = self.normalize(payload)
        record["provenance"] = self._provenance(request_id, consent, live=True)
        return OUTCOME_OK, record, status, None

    def _provenance(
        self,
        request_id: str,
        consent: ConsentRecord | None = None,
        *,
        live: bool = False,
        document_id: str | None = None,
        note: str | None = None,
    ) -> dict[str, Any]:
        return {
            "source": self.source,
            "provider": self.name,
            "provider_kind": self.provider_kind,
            "live": bool(live),
            "demo": self.provider_kind == "mock",
            "request_id": request_id,
            "retrieved_at": _now_iso(),
            "consent_id": consent.consent_id if consent else None,
            "consent_version": consent.consent_version if consent else None,
            "document_id": document_id,
            "note": note,
        }

    def _unknown_record(
        self,
        reg_no: str | None,
        vin: str | None,
        request_id: str,
        consent: ConsentRecord | None,
    ) -> RegistryRecord:
        """A record that says 'unknown' -- never a definitive negative."""
        return RegistryRecord({
            "source": self.source,
            "reg_no": reg_no,
            "vin": vin,
            "make": None,
            "model": None,
            "owner_count": None,
            "status": "unknown",
            "verified": False,
            "demo": False,
            "retrieved_at": _now_iso(),
            "provenance": self._provenance(request_id, consent, live=True),
        })

    def _envelope(
        self,
        *,
        outcome: str,
        request_id: str,
        record: RegistryRecord | None,
        reason: str | None,
        http_status: int | None,
        consent: ConsentRecord | None,
    ) -> RegistryResult:
        return RegistryResult({
            "outcome": outcome,
            "source": self.source,
            "provider": self.name,
            "provider_kind": self.provider_kind,
            "request_id": request_id,
            "retrieved_at": _now_iso(),
            "demo": self.provider_kind == "mock",
            "verified": bool(record.get("verified")) if record else False,
            "record": record,
            "reason": reason,
            "http_status": http_status,
            "consent_id": consent.consent_id if consent else None,
            "audited": True,
        })

    def _audit(
        self,
        result: RegistryResult,
        *,
        actor_id: str | None,
        reg_no: str | None,
        vin: str | None,
        duration_ms: int,
    ) -> None:
        if not _audit_enabled():
            return
        emit(
            "registry.lookup",
            source=result.get("source"),
            provider=result.get("provider"),
            provider_kind=result.get("provider_kind"),
            outcome=result.get("outcome"),
            request_id=result.get("request_id"),
            actor_id=actor_id,
            reg_no=reg_no,
            vin=vin,
            consent_id=result.get("consent_id"),
            http_status=result.get("http_status"),
            duration_ms=duration_ms,
            demo=result.get("demo"),
            verified=result.get("verified"),
            reason=_redact(result.get("reason"), self.config.token),
        )


class MockRegistryAdapter(RegistryAdapter):
    """Labelled demo adapter. It queries nothing and verifies nothing.

    It exists for local development and for tests. Every record it returns is
    marked ``demo: true`` and carries no make, model or owner count, because a
    demo adapter must never invent registry facts.
    """

    provider_kind = "mock"

    def __init__(self, source: str = "vahan") -> None:
        self.source = source
        self.name = f"mock-{source}"

    def available(self) -> bool:
        # It is not a live provider, so it is never "available" as a registry.
        return False

    def auth(self) -> bool:
        return False

    def endpoints(self) -> list[str]:
        return []

    def normalize(self, raw: dict | None) -> RegistryRecord:
        raw = raw or {}
        return RegistryRecord({
            "source": self.source,
            "reg_no": _as_text(_pick(raw, "reg_no")),
            "vin": _as_text(_pick(raw, "vin")),
            "make": None,
            "model": None,
            "owner_count": None,
            "status": "unknown",
            "verified": False,
            "demo": True,
            "retrieved_at": _now_iso(),
            "provenance": {},
        })

    def health(self) -> dict:
        return {
            "source": self.source,
            "status": "blocked",
            "provider": self.name,
            "reason": (
                "Demo adapter only: it queries no registry and verifies nothing. "
                "It is never reported as an available government source."
            ),
        }

    def lookup(
        self,
        *,
        reg_no: str | None = None,
        vin: str | None = None,
        consent_id: str | None = None,
        actor_id: str | None = None,
        document: dict | None = None,
    ) -> RegistryResult:
        request_id = f"demo-{uuid.uuid4().hex[:12]}"
        record = self.normalize({"reg_no": reg_no, "vin": vin})
        record["provenance"] = {
            "source": self.source,
            "provider": self.name,
            "provider_kind": self.provider_kind,
            "live": False,
            "demo": True,
            "request_id": request_id,
            "retrieved_at": _now_iso(),
            "consent_id": consent_id,
            "consent_version": None,
            "document_id": None,
            "note": (
                "DEMO DATA: no external registry was queried and nothing was verified. "
                "This is not a government or insurer confirmation."
            ),
        }
        result = RegistryResult({
            "outcome": OUTCOME_OK,
            "source": self.source,
            "provider": self.name,
            "provider_kind": self.provider_kind,
            "request_id": request_id,
            "retrieved_at": _now_iso(),
            "demo": True,
            "verified": False,
            "record": record,
            "reason": "Demo record: no registry was queried.",
            "http_status": None,
            "consent_id": consent_id,
            "audited": True,
        })
        if _audit_enabled():
            emit(
                "registry.lookup",
                source=result["source"],
                provider=result["provider"],
                provider_kind=result["provider_kind"],
                outcome=result["outcome"],
                request_id=request_id,
                actor_id=actor_id,
                reg_no=reg_no,
                vin=vin,
                consent_id=consent_id,
                http_status=None,
                duration_ms=0,
                demo=True,
                verified=False,
                reason=result["reason"],
            )
        return result


class UserDocumentAdapter(RegistryAdapter):
    """Normalises a user-supplied document (RC copy, policy copy, invoice).

    Values taken from the document are *claims by the seller*, never facts
    confirmed by a registry. The result is never labelled government-verified
    or insurer-confirmed and is never ``verified``.
    """

    provider_kind = "user_document"

    def __init__(self, source: str = "document") -> None:
        self.source = source
        self.name = "user-document"

    def available(self) -> bool:
        return True

    def auth(self) -> bool:
        return True  # no provider credentials involved

    def endpoints(self) -> list[str]:
        return []

    def normalize(self, raw: dict | None) -> RegistryRecord:
        raw = raw or {}
        body = raw.get("data") if isinstance(raw.get("data"), dict) else raw
        return RegistryRecord({
            "source": self.source,
            "reg_no": _as_text(_pick(body, "reg_no")),
            "vin": _as_text(_pick(body, "vin")),
            "make": _as_text(_pick(body, "make")),
            "model": _as_text(_pick(body, "model")),
            "owner_count": _as_owner_count(_pick(body, "owner_count")),
            "status": _as_text(_pick(body, "status")) or "unknown",
            "verified": False,
            "demo": False,
            "retrieved_at": _now_iso(),
            "provenance": {},
        })

    def health(self) -> dict:
        return {
            "source": self.source,
            "status": "available",
            "provider": self.name,
            "reason": "Reads the seller's own document; it is a claim, not a registry confirmation.",
        }

    def lookup(
        self,
        *,
        reg_no: str | None = None,
        vin: str | None = None,
        consent_id: str | None = None,
        actor_id: str | None = None,
        document: dict | None = None,
    ) -> RegistryResult:
        request_id = f"doc-{uuid.uuid4().hex[:12]}"
        payload = dict(document or {})
        payload.setdefault("reg_no", reg_no)
        payload.setdefault("vin", vin)
        record = self.normalize(payload)
        document_id = payload.get("document_id") or payload.get("id")
        record["provenance"] = {
            "source": self.source,
            "provider": self.name,
            "provider_kind": self.provider_kind,
            "live": False,
            "demo": False,
            "request_id": request_id,
            "retrieved_at": _now_iso(),
            "consent_id": consent_id,
            "consent_version": None,
            "document_id": document_id,
            "note": (
                "User-supplied document. Not government-verified and not "
                "insurer-confirmed; the values are the seller's own claims."
            ),
        }
        result = RegistryResult({
            "outcome": OUTCOME_OK,
            "source": self.source,
            "provider": self.name,
            "provider_kind": self.provider_kind,
            "request_id": request_id,
            "retrieved_at": _now_iso(),
            "demo": False,
            "verified": False,
            "record": record,
            "reason": "Document-derived values are unverified seller claims.",
            "http_status": None,
            "consent_id": consent_id,
            "audited": True,
        })
        if _audit_enabled():
            emit(
                "registry.lookup",
                source=result["source"],
                provider=result["provider"],
                provider_kind=result["provider_kind"],
                outcome=result["outcome"],
                request_id=request_id,
                actor_id=actor_id,
                reg_no=reg_no,
                vin=vin,
                consent_id=consent_id,
                http_status=None,
                duration_ms=0,
                demo=False,
                verified=False,
                document_id=document_id,
                reason=result["reason"],
            )
        return result


# --------------------------------------------------------------------------- #
# Public entry points
# --------------------------------------------------------------------------- #
def get_adapter(source: str) -> RegistryAdapter:
    """Return the adapter for a source. Unknown sources are refused."""
    key = (source or "").strip().lower()
    if key in SOURCES:
        return LiveRegistryAdapter(key)
    if key in ("demo", "mock"):
        return MockRegistryAdapter("vahan")
    if key in ("document", "documents", "user_document"):
        return UserDocumentAdapter()
    raise ValueError(f"Unknown registry source: {source!r}")


def lookup(
    source: str,
    *,
    reg_no: str | None = None,
    vin: str | None = None,
    consent_id: str | None = None,
    actor_id: str | None = None,
    document: dict | None = None,
) -> RegistryResult:
    """Look a vehicle up in one source and return the typed outcome.

    The request is only sent when the source is configured, the credentials
    authenticate, the rate limit allows it and a current consent covers the
    identifiers. Every attempt is audited.
    """
    try:
        adapter = get_adapter(source)
    except ValueError as exc:
        request_id = f"reg-{uuid.uuid4().hex[:12]}"
        result = RegistryResult({
            "outcome": OUTCOME_BLOCKED,
            "source": source,
            "provider": None,
            "provider_kind": None,
            "request_id": request_id,
            "retrieved_at": _now_iso(),
            "demo": False,
            "verified": False,
            "record": None,
            "reason": str(exc),
            "http_status": None,
            "consent_id": consent_id,
            "audited": True,
        })
        if _audit_enabled():
            emit(
                "registry.lookup",
                source=source,
                provider=None,
                provider_kind=None,
                outcome=OUTCOME_BLOCKED,
                request_id=request_id,
                actor_id=actor_id,
                reg_no=reg_no,
                vin=vin,
                consent_id=consent_id,
                http_status=None,
                duration_ms=0,
                demo=False,
                verified=False,
                reason=str(exc),
            )
        return result
    return adapter.lookup(
        reg_no=reg_no,
        vin=vin,
        consent_id=consent_id,
        actor_id=actor_id,
        document=document,
    )


def lookup_document(
    document: dict,
    *,
    reg_no: str | None = None,
    vin: str | None = None,
    document_id: str | None = None,
    actor_id: str | None = None,
) -> RegistryResult:
    """Normalise a user-supplied document. Never a registry confirmation."""
    payload = dict(document or {})
    if document_id:
        payload.setdefault("document_id", document_id)
    return UserDocumentAdapter().lookup(
        reg_no=reg_no, vin=vin, actor_id=actor_id, document=payload
    )


def get_registry_status() -> dict[str, Any]:
    """Honest capability report.

    Shape (unchanged): ``active_provider``, ``sources`` (per source ``status``,
    ``provider``, ``configured``, ``reason``) and ``note``. An unconfigured
    source is reported as ``blocked`` -- never as ``available`` -- and the mock
    adapter is never presented as a live registry.
    """
    entries: dict[str, dict[str, Any]] = {}
    configured_any = False
    for source in SOURCES:
        adapter = LiveRegistryAdapter(source)
        health = adapter.health()
        configured = adapter.available()
        configured_any = configured_any or configured
        entries[source] = {
            "status": health["status"],
            "provider": health.get("provider", source),
            "configured": configured,
            "reason": health.get("reason"),
            # True only when the labelled demo adapter is all this source can
            # offer: demo data is never a verification.
            "demo": not configured,
        }
    active = "live" if configured_any else "unavailable"
    emit(
        "registry.status",
        active=active,
        sources={key: value["status"] for key, value in entries.items()},
    )
    return {
        "active_provider": active,
        "sources": entries,
        "note": (
            "External registry lookups run only for sources with authorised credentials "
            "(TD_<SOURCE>_BASE_URL + TD_<SOURCE>_TOKEN) and only with a recorded user "
            "consent. Unconfigured sources are blocked, and the labelled demo adapter "
            "never returns a government-verified or insurer-confirmed result."
        ),
    }


__all__ = [
    "SOURCES",
    "OUTCOMES",
    "OUTCOME_OK",
    "OUTCOME_BLOCKED",
    "OUTCOME_CONSENT_REQUIRED",
    "OUTCOME_RATE_LIMITED",
    "OUTCOME_PROVIDER_ERROR",
    "OUTCOME_TIMEOUT",
    "OUTCOME_NOT_FOUND",
    "ProviderConfig",
    "RateLimiter",
    "RegistryAdapter",
    "RegistryRecord",
    "RegistryResult",
    "LiveRegistryAdapter",
    "MockRegistryAdapter",
    "UserDocumentAdapter",
    "get_adapter",
    "get_registry_status",
    "lookup",
    "lookup_document",
    "has_consent",
    "record_consent",
    "reset_rate_limits",
]
