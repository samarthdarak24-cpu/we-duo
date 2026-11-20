// Password-recovery responses must never claim a message was sent when the
// provider did not accept it. No network is involved: with both providers
// unset, sendMail() honestly returns `not_configured`.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as forgotPassword } from "../app/api/v1/auth/forgot-password/route";

const KNOWN_EMAIL = "samarth@trustdrive.dev";

function req(email: string) {
  return new Request("http://localhost/api/v1/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("forgot-password delivery honesty", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.TD_RESEND_API_KEY;
    delete process.env.TD_SMTP_HOST;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("does not report sent:true when no email provider accepted the message", async () => {
    const res = await forgotPassword(req(KNOWN_EMAIL));
    expect(res.status).toBe(200);
    const data = (await res.json()).data as {
      accepted: boolean;
      sent: boolean;
      emailDelivery: { ok: boolean; status: string; configured: boolean } | null;
    };
    expect(data.accepted).toBe(true);
    expect(data.sent).toBe(false);
    expect(data.emailDelivery?.ok).toBe(false);
    expect(data.emailDelivery?.status).toBe("not_configured");
    expect(data.emailDelivery?.configured).toBe(false);
  });

  it("claims no delivery at all for an unknown address", async () => {
    const res = await forgotPassword(req("nobody-has-this-address@trustdrive.dev"));
    expect(res.status).toBe(200);
    const data = (await res.json()).data as {
      accepted: boolean;
      sent: boolean;
      emailDelivery: unknown;
    };
    expect(data.accepted).toBe(true);
    expect(data.sent).toBe(false);
    expect(data.emailDelivery).toBeNull();
  });
});
