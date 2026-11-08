// Real SMS gateway integration test against qa/sms-sink.mjs.
// Runs only when TD_SMS_TEST_URL is set.
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TD_SMS_TEST_URL;
const outFile = process.env.TD_SMS_TEST_OUT;
const suite = url ? describe : describe.skip;

suite("SMS gateway delivery", () => {
  let mailer: typeof import("../lib/server/mailer");
  let db: typeof import("../lib/server/db");
  const original = { ...process.env };

  beforeAll(async () => {
    process.env.TD_SMS_URL = url;
    process.env.TD_SMS_MAX_ATTEMPTS = "2";
    process.env.TD_SMS_TIMEOUT_MS = "5000";
    process.env.TD_SMS_FROM = "TRUSTDRIVE";
    mailer = await import("../lib/server/mailer");
    db = await import("../lib/server/db");
  });

  afterAll(() => {
    process.env = original;
  });

  it("sends a real gateway request and records the delivery", async () => {
    const notificationId = `test-sms-sent-${Date.now()}`;
    const result = await mailer.sendSms({
      to: "+919876543210",
      body: "New inquiry: is the vehicle available?",
      notificationId,
    });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("http-gateway");
    expect(result.status).toBe("sent");
    const lines = fs.readFileSync(outFile!, "utf8").trim().split(/\r?\n/).filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.to).toBe("+919876543210");
    expect(last.body).toContain("New inquiry");
    expect(last.from).toBe("TRUSTDRIVE");
    const rows = db.getNotificationDeliveries(notificationId);
    expect(rows[0]?.status).toBe("sent");
    expect(rows[0]?.channel).toBe("sms");
  }, 30_000);

  it("retries and records a gateway failure", async () => {
    const notificationId = `test-sms-failed-${Date.now()}`;
    const result = await mailer.sendSms({
      to: "+91987650fail",
      body: "Should fail",
      notificationId,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.attempts).toBe(2);
    const rows = db.getNotificationDeliveries(notificationId);
    expect(rows[0]?.status).toBe("failed");
  }, 30_000);

  it("reports not_configured when TD_SMS_URL is absent", async () => {
    delete process.env.TD_SMS_URL;
    try {
      const result = await mailer.sendSms({ to: "+919876543210", body: "x" });
      expect(result.status).toBe("not_configured");
      expect(result.ok).toBe(false);
    } finally {
      process.env.TD_SMS_URL = url;
    }
  });
});
