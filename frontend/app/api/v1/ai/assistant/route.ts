import { askVehicleAssistant, suggestedQuestions } from "@/lib/server/ai";
import { signServiceToken } from "@/lib/server/auth";
import { getListingByVehicle, getVehicle } from "@/lib/server/db";
import { fail, getAuth, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/ai/assistant?vehicleId= — suggested grounded questions. */
export async function GET(req: Request) {
  const vehicleId = new URL(req.url).searchParams.get("vehicleId") ?? undefined;
  return ok({ suggestions: suggestedQuestions(vehicleId), model: "grounded-rules-v1" });
}

/** POST /api/v1/ai/assistant — answer only from stored vehicle records. Public for published listings. */
export async function POST(req: Request) {
  const auth = getAuth(req);
  const body = (await req.json().catch(() => null)) as { vehicleId?: string; question?: string } | null;
  const question = (body?.question ?? "").trim();
  if (!question) return fail(400, "VALIDATION_FAILED", "question is required");
  if (question.length > 600) return fail(400, "VALIDATION_FAILED", "question must be 600 characters or fewer");

  if (body?.vehicleId) {
    const v = getVehicle(body.vehicleId);
    if (!v) return fail(404, "NOT_FOUND", "Vehicle not found.");
    const listing = getListingByVehicle(body.vehicleId);
    const allowed = auth?.role === "admin" || v.owner_id === auth?.sub || listing?.status === "published";
    if (!allowed) return fail(403, "FORBIDDEN", "This vehicle is not available to you.");
  }

  const deterministic = askVehicleAssistant({
    vehicleId: body?.vehicleId,
    question,
    role: auth?.role ?? "buyer",
  });

  // Keep the chat feeling live. The deterministic engine already answers
  // greetings, TrustDrive/project questions and precise, cited factual lookups
  // in milliseconds. Only open-ended narrative requests ("summarise…",
  // "explain…", "overview…") benefit from a generated narrative, so the slow
  // local CPU LLM is reserved for those. It never sets the trust score, and a
  // rejected/unavailable narrative still falls back to the grounded answer.
  const INSTANT_INTENTS = new Set(["prompt", "smalltalk", "project", "general"]);
  const wantsNarrative =
    /\b(summari[sz]e|summar\w*|overview|in detail|full picture|walk me through|explain|elaborate|comprehensive|tell me (?:all )?about|analyse|analyze)\b/i.test(question);
  if (INSTANT_INTENTS.has(deterministic.intent) || !wantsNarrative) {
    return ok(deterministic);
  }

  // Prefer the LLM narrative when the intelligence service is reachable. The
  // Python side validates the output (policy/coherence/contradiction/citation)
  // and returns no answer when it fails, in which case the deterministic
  // grounded answer below is used. The LLM never sets the trust score.
  const base = process.env.TD_INTELLIGENCE_URL?.replace(/\/$/, "");
  if (base) {
    // Local CPU inference takes ~13-25 s per answer, and the very first call
    // also loads the model (~65 s measured). A shorter default timeout keeps
    // the chat feeling live; it silently falls back to the deterministic
    // answer when the model is slow or unavailable. Configurable via
    // TD_INTELLIGENCE_TIMEOUT_MS (clamped to 1-120 s).
    const rawTimeout = Number(process.env.TD_INTELLIGENCE_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0
      ? Math.min(Math.max(rawTimeout, 1_000), 120_000)
      : 30_000;
    try {
      const res = await fetch(`${base}/api/intelligence/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // SEC-002: the Python service no longer accepts anonymous calls.
          // Prefer the configured static token; otherwise mint a short-lived,
          // signed service token with the shared secret. Anonymous assistant
          // users keep the LLM path instead of silently losing the feature,
          // and the Python side still never sees an unauthenticated request.
          ...(process.env.TD_SERVICE_TOKEN
            ? { "X-Service-Token": process.env.TD_SERVICE_TOKEN }
            : { Authorization: `Bearer ${signServiceToken()}` }),
        },
        body: JSON.stringify({ question, vehicle_id: body?.vehicleId }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          answer?: string | null;
          grounded?: boolean;
          provider?: string;
          model?: string | null;
          llm_rejected?: boolean;
          reason?: string;
          citations?: { kind: string; id: string; label: string; detail: string }[];
        };
        const isLlm = !!json.provider && json.provider !== "deterministic";
        if (json.answer && isLlm && json.grounded !== false && !json.llm_rejected) {
          return ok({
            ...deterministic,
            intent: "llm_grounded",
            answer: json.answer,
            citations: json.citations?.length ? json.citations : deterministic.citations,
            confidence: 0.85,
            model: `llm:${json.provider}${json.model ? `:${json.model}` : ""}`,
            provider: json.provider ?? "deterministic",
            grounded: json.grounded ?? false,
            llmRejected: json.llm_rejected ?? false,
            disclaimer: isLlm
              ? `${deterministic.disclaimer} Narrative generated by an LLM and validated against stored records; it never sets the trust score.`
              : deterministic.disclaimer,
          });
        }
        if (json.llm_rejected || json.provider === "deterministic") {
          const fallbackAnswer = deterministic.answer.includes("Sources:")
            ? deterministic.answer
            : `${deterministic.answer}\n\nSources: ${deterministic.citations.map((citation) => citation.id).join(", ")}`;
          return ok({
            ...deterministic,
            answer: fallbackAnswer,
            model: "rules-v1",
            provider: "deterministic",
            grounded: false,
            llmRejected: true,
          });
        }
      }
    } catch {
      // Service down or slow: fall back to the deterministic answer.
    }
  }

  return ok(deterministic);
}
