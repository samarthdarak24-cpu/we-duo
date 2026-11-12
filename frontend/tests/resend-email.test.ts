// Resend HTTPS API delivery test.
//
// Render free web services block outbound SMTP (ports 25/465/587), so the
// email route that works from the hosted instance is the provider's HTTP API
// over port 443. These tests pin that behaviour: the real request shape, the
// persisted delivery evidence, and the rule that a provider error is reported
// as a failure instead of being reported as a sent message.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Resend API email delivery", () => {
  const original = { ...process.env };
  let mailer: typeof import("../lib/server/mailer");
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    process.env.TD_RESEND_API_KEY = "re_test_key";
    process.env.TD_RESEND_FROM = "TrustDrive <onboarding@resend.dev>";
    process.env.TD_RESEND_MAX_ATTEMPTS = "2";
    // SMTP must not win even when it is configured: HTTPS is the route that
    // works on the hosted Free instance.
    process.env.TD_SMTP_HOST = "smtp.resend.com";
    process.env.TD_SMTP_USER = "resend";
    process.env.TD_SMTP_PASSWORD = "re_test_key";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mailer = await import("../lib/server/mailer");
  });

  afterEach(() => {
    process.env = { ...original };
    vi.unstubAllGlobals();
  });

  it("sends through the Resend HTTPS API and records the delivery", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "email-abc123" }),
    });

    const result = await mailer.sendMail({
      to: "buyer@example.com",
      subject: "Verify your TrustDrive email",
      body: "Confirm your address.",
      link: "https://example.com/verify-email/token-123",
    });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe("resend-api");
    expect(result.status).toBe("sent");
    expect(result.attempts).toBe(1);
    expect(result.messageId).toBe("email-abc123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["buyer@example.com"]);
    expect(body.subject).toBe("Verify your TrustDrive email");
    expect(body.from).toBe("TrustDrive <onboarding@resend.dev>");
    expect(body.text).toContain("https://example.com/verify-email/token-123");
  });

  it("reports a provider error as a failure and never as a send", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: "Invalid `to` address" }),
    });

    const result = await mailer.sendMail({
      to: "buyer@example.com",
      subject: "Verify your TrustDrive email",
      body: "Confirm your address.",
    });

    expect(result.ok).toBe(false);
    expect(result.provider).toBe("resend-api");
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Invalid `to` address");
    // It retried, and it did not report a message id.
    expect(fetchMock.mock.calls.length).toBe(2);
    expect(result.messageId ?? null).toBeNull();
  });

  it("reports the active provider honestly", async () => {
    const status = mailer.getMailerStatus();
    expect(status.configured).toBe(true);
    expect(status.provider).toBe("resend-api");
  });

  it("falls back to SMTP only when no HTTP key is configured", async () => {
    delete process.env.TD_RESEND_API_KEY;
    const status = mailer.getMailerStatus();
    expect(status.configured).toBe(true);
    expect(status.provider).toBe("smtp");
  });
});
