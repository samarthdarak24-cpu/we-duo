"""Notification provider interface.

Real interface, honest status. ``LogNotificationProvider`` always works (it just
logs) and is the default in local/dev. ``ResendApiEmailProvider`` (HTTPS, port
443) is used when ``TD_RESEND_API_KEY`` is set; it is the only email route that
works from Render free web services, which block outbound SMTP. ``
SMTPEmailProvider`` is the fallback and is gated by ``TD_SMTP_HOST`` /
``TD_SMTP_USER`` and ``TD_SMTP_PASS`` (or the Next.js name
``TD_SMTP_PASSWORD``). Both report ``disabled`` when their credentials are
absent -- they never pretend to have sent a real email.
``get_notification_status`` reports which provider is active.
"""
from __future__ import annotations

import abc
import logging
import os
import smtplib
from email.message import EmailMessage
from typing import Any

from ..logging import emit

logger = logging.getLogger(__name__)


class NotificationResult(dict):
    """Structured result returned by every provider."""


class NotificationProvider(abc.ABC):
    name: str

    @abc.abstractmethod
    def available(self) -> bool:
        ...

    @abc.abstractmethod
    def send(self, subject: str, body: str, recipient: str) -> NotificationResult:
        ...


class LogNotificationProvider(NotificationProvider):
    name = "log-only"

    def available(self) -> bool:
        return True

    def send(self, subject: str, body: str, recipient: str) -> NotificationResult:
        logger.info("notification[log-only] -> %s | %s | %s", recipient, subject, body)
        emit("notification.sent", provider=self.name, recipient=recipient, subject=subject,
             channel="log")
        return NotificationResult({
            "provider": self.name, "delivered": True, "channel": "log",
            "recipient": recipient, "subject": subject,
        })


class SMTPEmailProvider(NotificationProvider):
    name = "smtp"

    def __init__(self) -> None:
        self.host = os.getenv("TD_SMTP_HOST")
        self.port = int(os.getenv("TD_SMTP_PORT", "587"))
        self.user = os.getenv("TD_SMTP_USER")
        # Next.js reads TD_SMTP_PASSWORD, the Python service reads TD_SMTP_PASS.
        # Accept both so one provider secret works for both runtimes.
        self.password = os.getenv("TD_SMTP_PASS") or os.getenv("TD_SMTP_PASSWORD")
        self.from_addr = os.getenv("TD_SMTP_FROM", self.user or "no-reply@trustdrive.local")
        # Port 465 is implicit TLS (SMTP_SSL); port 587 is STARTTLS. Real
        # providers such as Resend and SES expose both, so the transport has to
        # follow the configured port instead of always assuming STARTTLS.
        self.implicit_tls = (
            os.getenv("TD_SMTP_SECURE", "").strip().lower() in ("1", "true", "yes")
            or self.port == 465
        )

    def available(self) -> bool:
        # All three must be present; we never silently fall back to a fake send.
        if not (self.host and self.user and self.password):
            return False
        try:
            import smtplib as _s  # noqa: F401  (ensures stdlib present)
            return True
        except Exception:
            return False

    def send(self, subject: str, body: str, recipient: str) -> NotificationResult:
        if not self.available():
            return NotificationResult({
                "provider": self.name, "delivered": False, "channel": "email",
                "recipient": recipient, "subject": subject,
                "error": "SMTP credentials are not configured (TD_SMTP_*).",
            })
        try:
            msg = EmailMessage()
            msg["Subject"] = subject
            msg["From"] = self.from_addr
            msg["To"] = recipient
            msg.set_content(body)
            if self.implicit_tls:
                with smtplib.SMTP_SSL(self.host, self.port, timeout=10) as server:
                    server.login(self.user, self.password)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(self.host, self.port, timeout=10) as server:
                    server.starttls()
                    server.login(self.user, self.password)
                    server.send_message(msg)
            emit("notification.sent", provider=self.name, recipient=recipient,
                 subject=subject, channel="email")
            return NotificationResult({
                "provider": self.name, "delivered": True, "channel": "email",
                "recipient": recipient, "subject": subject,
            })
        except Exception as exc:
            return NotificationResult({
                "provider": self.name, "delivered": False, "channel": "email",
                "recipient": recipient, "subject": subject,
                "error": f"{type(exc).__name__}: {exc}",
            })


class ResendApiEmailProvider(NotificationProvider):
    """Resend HTTPS API provider (port 443).

    Render free web services block outbound SMTP (ports 25, 465 and 587), so an
    SMTP connection from the hosted instance times out. The provider's HTTP API
    is reachable over HTTPS and is the only route that works there. It is
    selected whenever ``TD_RESEND_API_KEY`` is set.
    """

    name = "resend-api"

    def __init__(self) -> None:
        self.api_key = os.getenv("TD_RESEND_API_KEY")
        self.endpoint = os.getenv("TD_RESEND_ENDPOINT", "https://api.resend.com/emails")
        self.from_addr = (
            os.getenv("TD_RESEND_FROM")
            or os.getenv("TD_SMTP_FROM")
            or "no-reply@trustdrive.local"
        )
        self.timeout = max(1.0, float(os.getenv("TD_RESEND_TIMEOUT_MS", "15000")) / 1000)

    def available(self) -> bool:
        return bool(self.api_key)

    def send(self, subject: str, body: str, recipient: str) -> NotificationResult:
        if not self.available():
            return NotificationResult({
                "provider": self.name, "delivered": False, "channel": "email",
                "recipient": recipient, "subject": subject,
                "error": "TD_RESEND_API_KEY is not configured.",
            })
        try:
            import httpx  # imported lazily: keeps the module import cheap

            response = httpx.post(
                self.endpoint,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": self.from_addr,
                    "to": [recipient],
                    "subject": subject,
                    "text": body,
                },
                timeout=self.timeout,
            )
            if response.status_code >= 400:
                return NotificationResult({
                    "provider": self.name, "delivered": False, "channel": "email",
                    "recipient": recipient, "subject": subject,
                    "error": f"HTTP {response.status_code}: {response.text[:200]}",
                })
            try:
                payload = response.json()
            except ValueError:
                payload = {}
            message_id = payload.get("id") if isinstance(payload, dict) else None
            emit("notification.sent", provider=self.name, recipient=recipient,
                 subject=subject, channel="email", message_id=message_id)
            return NotificationResult({
                "provider": self.name, "delivered": True, "channel": "email",
                "recipient": recipient, "subject": subject, "message_id": message_id,
            })
        except Exception as exc:
            return NotificationResult({
                "provider": self.name, "delivered": False, "channel": "email",
                "recipient": recipient, "subject": subject,
                "error": f"{type(exc).__name__}: {exc}",
            })


def _active_provider() -> NotificationProvider:
    resend = ResendApiEmailProvider()
    if resend.available():
        return resend
    smtp = SMTPEmailProvider()
    if smtp.available():
        return smtp
    return LogNotificationProvider()


def get_notification_status() -> dict[str, Any]:
    smtp = SMTPEmailProvider()
    resend = ResendApiEmailProvider()
    active = _active_provider()
    return {
        "enabled": True,
        "provider": active.name,
        "smtp_configured": bool(smtp.available()),
        "resend_configured": bool(resend.available()),
        "note": (
            "No email provider is configured; falling back to log-only delivery."
            if active.name == "log-only"
            else "Email delivery is configured over HTTPS (Resend API)."
            if active.name == "resend-api"
            else "SMTP email delivery is configured."
        ),
    }
