"""Notification provider tests.

The Python service must report real delivery evidence. These tests pin the
Resend HTTPS provider (the only email route that works from Render free web
services, which block outbound SMTP) and the honest failure path.
"""
from __future__ import annotations

import httpx
import pytest

from app.integrations import notifications


class _Response:
    def __init__(self, status_code: int, payload=None, text: str = "") -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("no json body")
        return self._payload


def test_resend_api_provider_delivers_over_https(monkeypatch):
    monkeypatch.setenv("TD_RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("TD_RESEND_FROM", "TrustDrive <onboarding@resend.dev>")
    calls: dict = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        calls["url"] = url
        calls["headers"] = headers
        calls["json"] = json
        calls["timeout"] = timeout
        return _Response(200, {"id": "email-abc123"})

    monkeypatch.setattr(httpx, "post", fake_post)

    provider = notifications.ResendApiEmailProvider()
    assert provider.available() is True
    result = provider.send(
        "Verify your TrustDrive email", "Confirm your address.", "buyer@example.com"
    )

    assert result["delivered"] is True
    assert result["provider"] == "resend-api"
    assert result["message_id"] == "email-abc123"
    assert calls["url"] == "https://api.resend.com/emails"
    assert calls["headers"]["Authorization"] == "Bearer re_test_key"
    assert calls["json"]["to"] == ["buyer@example.com"]
    assert calls["json"]["subject"] == "Verify your TrustDrive email"


def test_resend_api_provider_reports_a_real_failure(monkeypatch):
    monkeypatch.setenv("TD_RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: _Response(422, None, "Invalid `to` address")
    )

    result = notifications.ResendApiEmailProvider().send(
        "Subject", "Body", "buyer@example.com"
    )

    assert result["delivered"] is False
    assert result["provider"] == "resend-api"
    assert "422" in result["error"]


def test_resend_api_provider_is_preferred_over_smtp(monkeypatch):
    monkeypatch.setenv("TD_RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("TD_SMTP_HOST", "smtp.resend.com")
    monkeypatch.setenv("TD_SMTP_USER", "resend")
    monkeypatch.setenv("TD_SMTP_PASS", "re_test_key")

    status = notifications.get_notification_status()
    assert status["provider"] == "resend-api"
    assert status["resend_configured"] is True
    assert status["smtp_configured"] is True


def test_smtp_is_used_when_no_http_key_is_set(monkeypatch):
    monkeypatch.delenv("TD_RESEND_API_KEY", raising=False)
    monkeypatch.setenv("TD_SMTP_HOST", "smtp.resend.com")
    monkeypatch.setenv("TD_SMTP_USER", "resend")
    monkeypatch.setenv("TD_SMTP_PASS", "re_test_key")

    status = notifications.get_notification_status()
    assert status["provider"] == "smtp"
    assert status["resend_configured"] is False


def test_no_provider_reports_log_only(monkeypatch):
    monkeypatch.delenv("TD_RESEND_API_KEY", raising=False)
    monkeypatch.delenv("TD_SMTP_HOST", raising=False)
    monkeypatch.delenv("TD_SMTP_USER", raising=False)
    monkeypatch.delenv("TD_SMTP_PASS", raising=False)
    monkeypatch.delenv("TD_SMTP_PASSWORD", raising=False)

    status = notifications.get_notification_status()
    assert status["provider"] == "log-only"
    assert "No email provider" in status["note"]


@pytest.mark.parametrize("port", [465, 587])
def test_smtp_transport_follows_the_configured_port(monkeypatch, port):
    monkeypatch.setenv("TD_SMTP_HOST", "smtp.resend.com")
    monkeypatch.setenv("TD_SMTP_PORT", str(port))
    monkeypatch.setenv("TD_SMTP_USER", "resend")
    monkeypatch.setenv("TD_SMTP_PASS", "re_test_key")

    provider = notifications.SMTPEmailProvider()
    assert provider.implicit_tls is (port == 465)
