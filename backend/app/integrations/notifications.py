"""Notification provider interface.

Real interface, honest status. ``LogNotificationProvider`` always works (it just
logs) and is the default in local/dev. ``SMTPEmailProvider`` is gated by
``TD_SMTP_HOST`` / ``TD_SMTP_USER`` and ``TD_SMTP_PASS`` (or the Next.js name
``TD_SMTP_PASSWORD``) and reports ``disabled`` when those are absent -- it never
pretends to have sent a real email. ``get_notification_status`` reports which
provider is active.
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


def _active_provider() -> NotificationProvider:
    smtp = SMTPEmailProvider()
    if smtp.available():
        return smtp
    return LogNotificationProvider()


def get_notification_status() -> dict[str, Any]:
    smtp = SMTPEmailProvider()
    active = _active_provider()
    return {
        "enabled": True,
        "provider": active.name,
        "smtp_configured": bool(smtp.available()),
        "note": (
            "SMTP is not configured; falling back to log-only delivery."
            if active.name == "log-only"
            else "SMTP email delivery is configured."
        ),
    }
