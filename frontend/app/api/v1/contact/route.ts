import { createContactMessage } from "@/lib/server/db";
import { created, fail } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/v1/contact — persist a public contact inquiry. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    email?: string;
    phone?: string;
    subject?: string;
    message?: string;
  } | null;

  const name = (body?.name ?? "").trim();
  const email = (body?.email ?? "").trim();
  const phone = (body?.phone ?? "").trim();
  const subject = (body?.subject ?? "General Inquiry").trim() || "General Inquiry";
  const message = (body?.message ?? "").trim();

  if (name.length < 2 || name.length > 100) {
    return fail(400, "VALIDATION_FAILED", "Please provide a name between 2 and 100 characters.");
  }
  if (!EMAIL.test(email) || email.length > 200) {
    return fail(400, "VALIDATION_FAILED", "Please provide a valid email address.");
  }
  if (phone.length > 40) {
    return fail(400, "VALIDATION_FAILED", "Phone number is too long.");
  }
  if (message.length < 5 || message.length > 2000) {
    return fail(400, "VALIDATION_FAILED", "Message must be between 5 and 2000 characters.");
  }

  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || null;
  const id = createContactMessage({ name, email, phone, subject, message, ip: ip ?? undefined });

  return created({ id, receivedAt: new Date().toISOString() });
}
