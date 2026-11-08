// Real SMTP integration test. Runs only when TD_SMTP_TEST_PORT is set and a
// local SMTP sink is listening (see qa/smtp-sink.py). It verifies the exact
// message that crossed the wire and the persisted delivery evidence.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const port = process.env.TD_SMTP_TEST_PORT;
const outDir = process.env.TD_SMTP_TEST_OUT;
const suite = port ? describe : describe.skip;

function newestMessage(): string {
  const files = fs
    .readdirSync(outDir!)
    .filter((f) => f.endsWith(".eml"))
    .map((f) => ({ f, t: fs.statSync(path.join(outDir!, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(outDir!, files[0].f), "utf8");
}

suite("SMTP delivery", () => {
  let mailer: typeof import("../lib/server/mailer");
  let db: typeof import("../lib/server/db");
  const original = { ...process.env };

  beforeAll(async () => {
    process.env.TD_SMTP_HOST = "127.0.0.1";
    process.env.TD_SMTP_PORT = port;
    process.env.TD_SMTP_FROM = "TrustDrive Test <no-reply@test.local>";
    process.env.TD_SMTP_MAX_ATTEMPTS = "2";
    process.env.TD_SMTP_TIMEOUT_MS = "5000";
    mailer = await import("../lib/server/mailer");
    db = await import("../lib/server/db");
  });

  afterAll(() => {
    process.env = original;
  });

  it("delivers a real message and records a sent delivery", async () => {
    const notificationId = `test-mail-sent-${Date.now()}`;
    const result = await mailer.sendMail({
      to: "buyer@example.com",
      subject: "Verify your TrustDrive email",
      body: "Confirm your address.",
      link: "http://localhost:3000/verify-email/test-token",
      notificationId,
    });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("smtp");
    expect(result.status).toBe("sent");
    expect(result.attempts).toBe(1);
    const message = newestMessage();
    expect(message).toContain("buyer@example.com");
    expect(message).toContain("Verify your TrustDrive email");
    expect(message).toContain("/verify-email/test-token");
    const rows = db.getNotificationDeliveries(notificationId);
    expect(rows[0]?.status).toBe("sent");
    expect(rows[0]?.provider).toBe("smtp");
  }, 30_000);

  it("retries, fails and records the failure when the server is unreachable", async () => {
    process.env.TD_SMTP_PORT = "2526"; // closed port
    process.env.TD_SMTP_TIMEOUT_MS = "800";
    try {
      const notificationId = `test-mail-failed-${Date.now()}`;
      const result = await mailer.sendMail({
        to: "buyer@example.com",
        subject: "Reset your TrustDrive password",
        body: "This link expires in one hour.",
        notificationId,
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe("failed");
      expect(result.attempts).toBe(2);
      const rows = db.getNotificationDeliveries(notificationId);
      expect(rows[0]?.status).toBe("failed");
      expect(rows[0]?.attempts).toBe(2);
    } finally {
      process.env.TD_SMTP_PORT = port;
      process.env.TD_SMTP_TIMEOUT_MS = "5000";
    }
  }, 30_000);

  it("reports not_configured instead of pretending to send", async () => {
    delete process.env.TD_SMTP_HOST;
    try {
      const result = await mailer.sendMail({
        to: "buyer@example.com",
        subject: "Verify",
        body: "Body",
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe("not_configured");
      expect(result.configured).toBe(false);
      expect(mailer.getMailerStatus().configured).toBe(false);
    } finally {
      process.env.TD_SMTP_HOST = "127.0.0.1";
    }
  });

  it("reports SMS as not configured without a real gateway", () => {
    delete process.env.TD_SMS_URL;
    const status = mailer.getSmsStatus();
    expect(status.configured).toBe(false);
    expect(status.provider).toBe("none");
  });
});
