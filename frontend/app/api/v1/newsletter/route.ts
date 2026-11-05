import { subscribeNewsletter } from "@/lib/server/db";
import { created, fail } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/v1/newsletter — idempotent newsletter subscription. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = (body?.email ?? "").trim();

  if (!EMAIL.test(email) || email.length > 200) {
    return fail(400, "VALIDATION_FAILED", "Please provide a valid email address.");
  }

  subscribeNewsletter(email);
  return created({ subscribed: true });
}
