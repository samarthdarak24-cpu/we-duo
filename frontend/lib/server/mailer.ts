// ---------------------------------------------------------------------------
// Outbound email and SMS delivery.
//
// Every send is a real provider call or an explicit "not configured" result.
// Nothing is reported as delivered unless the provider accepted it.
//
// Email: SMTP via nodemailer (TD_SMTP_*). Retries use exponential backoff.
// SMS:   HTTP gateway (TD_SMS_URL / TD_SMS_TOKEN / TD_SMS_FROM).
//
// Each final outcome is persisted in `notification_deliveries` with the
// provider, attempt count and message id / error, so delivery evidence
// survives a refresh and can be inspected by an admin.
// ---------------------------------------------------------------------------
import { randomUUID } from "node:crypto";

import { recordNotificationDelivery } from "./db";

export type DeliveryChannel = "email" | "sms";

export interface DeliveryResult {
  ok: boolean;
  channel: DeliveryChannel;
  provider: string;
  configured: boolean;
  attempts: number;
  status: "sent" | "failed" | "not_configured";
  messageId?: string | null;
  error?: string | null;
}

export interface OutboundMail {
  to: string;
  subject: string;
  body: string;
  link?: string;
  notificationId?: string | null;
}

export interface OutboundSms {
  to: string;
  body: string;
  notificationId?: string | null;
}

function record(result: DeliveryResult, recipient: string, notificationId?: string | null) {
  recordNotificationDelivery({
    id: `del-${randomUUID()}`,
    notification_id: notificationId ?? null,
    channel: result.channel,
    provider: result.provider,
    status: result.status,
    attempts: result.attempts,
    message_id: result.messageId ?? null,
    error: result.error ?? null,
    recipient,
  });
  return result;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function smtpConfig() {
  const host = process.env.TD_SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.TD_SMTP_PORT || 587);
  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: process.env.TD_SMTP_SECURE === "1" || process.env.TD_SMTP_SECURE === "true",
    user: process.env.TD_SMTP_USER?.trim() || undefined,
    password: process.env.TD_SMTP_PASSWORD || undefined,
    from: process.env.TD_SMTP_FROM?.trim() || "TrustDrive <no-reply@trustdrive.local>",
    timeoutMs: Number(process.env.TD_SMTP_TIMEOUT_MS || 15000) || 15000,
    maxAttempts: Math.max(1, Number(process.env.TD_SMTP_MAX_ATTEMPTS || 3) || 3),
  };
}

function smsConfig() {
  const url = process.env.TD_SMS_URL?.trim();
  if (!url) return null;
  return {
    url,
    token: process.env.TD_SMS_TOKEN?.trim() || undefined,
    from: process.env.TD_SMS_FROM?.trim() || undefined,
    timeoutMs: Number(process.env.TD_SMS_TIMEOUT_MS || 15000) || 15000,
    maxAttempts: Math.max(1, Number(process.env.TD_SMS_MAX_ATTEMPTS || 3) || 3),
  };
}

export function getMailerStatus() {
  const cfg = smtpConfig();
  if (!cfg) {
    return {
      channel: "email" as const,
      configured: false,
      provider: "none",
      reason:
        "TD_SMTP_HOST is not set. Verification and reset links are only shown in non-production demo mode.",
    };
  }
  return {
    channel: "email" as const,
    configured: true,
    provider: "smtp",
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    from: cfg.from,
  };
}

export function getSmsStatus() {
  const cfg = smsConfig();
  if (!cfg) {
    return {
      channel: "sms" as const,
      configured: false,
      provider: "none",
      reason: "TD_SMS_URL is not set. No SMS can be sent.",
    };
  }
  return {
    channel: "sms" as const,
    configured: true,
    provider: "http-gateway",
    endpoint: cfg.url,
    from: cfg.from ?? null,
  };
}

/** Send an email through SMTP. Returns an honest, persisted outcome. */
export async function sendMail(mail: OutboundMail): Promise<DeliveryResult> {
  const cfg = smtpConfig();
  if (!cfg) {
    // Development demo behaviour: surface the link in the server log only.
    // Production never logs the token and never claims a send.
    if (process.env.NODE_ENV !== "production" && mail.link) {
      console.log(`[mail:demo] -> ${mail.to} :: ${mail.subject} :: ${mail.link}`);
    } else {
      console.warn(`[mail] SMTP is not configured; "${mail.subject}" was not sent to ${mail.to}.`);
    }
    return record(
      {
        ok: false,
        channel: "email",
        provider: "none",
        configured: false,
        attempts: 0,
        status: "not_configured",
        error: "TD_SMTP_HOST is not set.",
      },
      mail.to,
      mail.notificationId
    );
  }

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    connectionTimeout: cfg.timeoutMs,
    greetingTimeout: cfg.timeoutMs,
    socketTimeout: cfg.timeoutMs,
  });

  const text = mail.link ? `${mail.body}\n\n${mail.link}` : mail.body;
  let lastError = "Unknown SMTP error";
  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      const info = await transport.sendMail({
        from: cfg.from,
        to: mail.to,
        subject: mail.subject,
        text,
        headers: { "X-TrustDrive-Notification": mail.notificationId ?? "transactional" },
      });
      return record(
        {
          ok: true,
          channel: "email",
          provider: "smtp",
          configured: true,
          attempts: attempt,
          status: "sent",
          messageId: info.messageId ?? null,
        },
        mail.to,
        mail.notificationId
      );
    } catch (error) {
      lastError = (error as Error).message;
      if (attempt < cfg.maxAttempts) await sleep(500 * 2 ** (attempt - 1));
    }
  }
  return record(
    {
      ok: false,
      channel: "email",
      provider: "smtp",
      configured: true,
      attempts: cfg.maxAttempts,
      status: "failed",
      error: lastError,
    },
    mail.to,
    mail.notificationId
  );
}

/** Send an SMS through a configured HTTP gateway. */
export async function sendSms(sms: OutboundSms): Promise<DeliveryResult> {
  const cfg = smsConfig();
  if (!cfg) {
    return record(
      {
        ok: false,
        channel: "sms",
        provider: "none",
        configured: false,
        attempts: 0,
        status: "not_configured",
        error: "TD_SMS_URL is not set.",
      },
      sms.to,
      sms.notificationId
    );
  }

  let lastError = "Unknown SMS gateway error";
  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      const res = await fetch(cfg.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
        },
        body: JSON.stringify({ to: sms.to, body: sms.body, from: cfg.from }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      const payload = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string; error?: string };
      if (res.ok) {
        return record(
          {
            ok: true,
            channel: "sms",
            provider: "http-gateway",
            configured: true,
            attempts: attempt,
            status: "sent",
            messageId: payload.messageId ?? payload.id ?? null,
          },
          sms.to,
          sms.notificationId
        );
      }
      lastError = payload.error ?? `SMS gateway returned ${res.status}`;
    } catch (error) {
      lastError = (error as Error).message;
    }
    if (attempt < cfg.maxAttempts) await sleep(500 * 2 ** (attempt - 1));
  }
  return record(
    {
      ok: false,
      channel: "sms",
      provider: "http-gateway",
      configured: true,
      attempts: cfg.maxAttempts,
      status: "failed",
      error: lastError,
    },
    sms.to,
    sms.notificationId
  );
}
