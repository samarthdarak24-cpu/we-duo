// ---------------------------------------------------------------------------
// Grounded vehicle assistant. Every sentence is assembled from stored rows and
// the deterministic engine, and every claim carries a citation. There is no
// external model call: if a fact is not in the database it is reported as
// unavailable rather than invented (design.md §1.2 honesty rules).
// ---------------------------------------------------------------------------
import {
  getDamage,
  getDocument,
  getDocuments,
  getFindings,
  getHistory,
  getListingByVehicle,
  getMileage,
  getPricing,
  getReportsByVehicle,
  getTheft,
  getUserById,
  getVehicle,
} from "./db";
import { computeVehicleTrust, getChainStatus, getInsights, theftAssessment } from "./data";
import { matchTrustDriveKb } from "./trustdrive-kb";

export interface AiCitation {
  kind: "vehicle" | "document" | "finding" | "mileage" | "history" | "damage" | "pricing" | "chain" | "theft" | "report" | "listing";
  id: string;
  label: string;
  detail: string;
}

export interface AiAction {
  label: string;
  href: string;
}

export interface AiAnswer {
  intent: string;
  answer: string;
  citations: AiCitation[];
  confidence: number;
  followUps: string[];
  actions: AiAction[];
  model: "grounded-rules-v1" | "rules-v1";
  disclaimer: string;
}

const DISCLAIMER =
  "Grounded in stored TrustDrive records only. It is not a physical inspection, a legal opinion or a guarantee of condition.";

const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const title = (v: ReturnType<typeof getVehicle>) => (v ? `${v.year} ${v.make} ${v.model}${v.variant ? ` ${v.variant}` : ""}` : "this vehicle");
const list = (items: string[], max = 4) => items.slice(0, max).join("; ");

function isSmallTalk(question: string) {
  const s = question.toLowerCase().trim();
  if (!s) return false;
  return (
    /^(hi|hii|hiii|hello|hey|heyya|heya|gm|yo|sup|howdy|hiya|good (morning|afternoon|evening))\b/.test(s) ||
    /^(thanks|thank you|thx|ty|cheers|nice|cool|great|awesome|amazing|ok|okay|k|sure|got it|gotcha|understood|perfect|love it)\b/.test(s) ||
    /^(who are you|what are you|are you (?:a )?(?:bot|ai|human|assistant)|your name|what's your name)\b/.test(s)
  );
}

function smallTalkReply(vehicleTitle?: string) {
  const greeting = vehicleTitle
    ? `Hi! I'm the TrustDrive assistant for the ${vehicleTitle}.`
    : "Hi! I'm the TrustDrive assistant.";
  return `${greeting} I can answer questions about a vehicle's records — trust score, mileage, damage, documents — or about how TrustDrive works. What would you like to know?`;
}

function detectIntent(question: string) {
  const q = question.toLowerCase();
  if (/price|cost|worth|value|market|budget|expensive|cheap|₹|inr/.test(q)) return "pricing";
  if (/mileage|odometer|\bkm\b|reading|rollback|clock/.test(q)) return "mileage";
  if (/accident|damage|repair|dent|crash|panel|paint|bumper/.test(q)) return "damage";
  if (/document|\brc\b|insurance|\bpuc\b|paper|verification|verified|proof|consent/.test(q)) return "documents";
  if (/theft|stolen|police/.test(q)) return "theft";
  if (/trust|score|risk|safe|reliable|condition|grade/.test(q)) return "trust";
  if (/service|history|owner|ownership|timeline|insurance claim/.test(q)) return "history";
  if (/seller|dealer|contact|phone|address/.test(q)) return "seller";
  if (/report|\bpdf\b|download|snapshot|hash|integrity/.test(q)) return "report";
  if (/inspect|tyre|tire|engine|transmission|brake|suspension/.test(q)) return "inspection";
  if (/buy|purchase|available|listing|test drive|inquiry|negotiat|offer/.test(q)) return "buying";
  return "summary";
}

export function suggestedQuestions(vehicleId?: string) {
  const base = [
    "What is TrustDrive?",
    "What is the trust score and why?",
    "Is there any accident or damage record?",
    "Does the mileage look consistent?",
    "Which documents are verified?",
    "What should I do next before buying?",
  ];
  return vehicleId ? base : ["What is TrustDrive?", "How does TrustDrive verify a vehicle?", "What does the trust score mean?", ...base.slice(2, 5)];
}

function citationsFor(vehicleId: string) {
  const v = getVehicle(vehicleId);
  const docs = getDocuments(vehicleId);
  const findings = getFindings(vehicleId).filter((f) => f.status !== "cleared");
  const mileage = getMileage(vehicleId);
  const history = getHistory(vehicleId);
  const damage = getDamage(vehicleId);
  const theft = getTheft(vehicleId);
  const chain = getChainStatus(vehicleId);
  const pricing = getPricing(vehicleId);
  const listing = getListingByVehicle(vehicleId);
  const reports = getReportsByVehicle(vehicleId);
  return { v, docs, findings, mileage, history, damage, theft, chain, pricing, listing, reports };
}

function base(
  intent: string,
  answer: string,
  citations: AiCitation[],
  actions: AiAction[],
  followUps: string[],
  confidence = 0.86
): AiAnswer {
  return { intent, answer, citations, confidence, followUps, actions, model: "grounded-rules-v1", disclaimer: DISCLAIMER };
}

export function askVehicleAssistant(input: { vehicleId?: string; question: string; role: string }): AiAnswer {
  const question = (input.question ?? "").trim();
  const role = input.role === "seller" || input.role === "admin" ? input.role : "buyer";
  const vehicle = input.vehicleId ? getVehicle(input.vehicleId) : undefined;

  if (!question) {
    return base("prompt", "Ask a question about a vehicle, its documents, mileage, findings or price.", [], [], suggestedQuestions(vehicle?.id));
  }

  if (isSmallTalk(question)) {
    return base("smalltalk", smallTalkReply(vehicle ? title(vehicle) : undefined), [], [], suggestedQuestions(vehicle?.id), 0.95);
  }

  // On a vehicle report the assistant must answer from THAT car's records, not
  // from the generic project KB. Questions like "What is the trust score and
  // why?" (a visible suggested question) need the real, cited score. Only
  // conceptual / project questions keep the instant KB answer.
  const conceptual = /\bwhat (?:is|are) trust\s?drive\b/i.test(question)
    || /\bwhat does\b.*\bmean\b/i.test(question)
    || /\bhow (?:does|do|is|are)\b.*\b(?:work|calculated|computed|checked|verified|made|mean)\b/i.test(question)
    || /\b(?:3d studio|inspection studio|evidence graph|data sources|get started|sign up|disclaimers|limits)\b/i.test(question);
  const dataIntent = vehicle ? detectIntent(question) !== "summary" : false;
  const kb = !dataIntent || conceptual ? matchTrustDriveKb(question) : null;
  if (kb) {
    const tail = vehicle ? ` For the ${title(vehicle)} on this page, just ask about its specific records any time.` : "";
    return base(
      "project",
      kb.answer + tail,
      [],
      (kb.links ?? []).map((l) => ({ label: l.label, href: l.href })),
      ["What does the trust score mean?", "How is mileage checked?", "What are the 3D studio modes?"],
      0.92
    );
  }

  if (!vehicle) {
    return base(
      "general",
      "TrustDrive checks a vehicle against stored records: RC, insurance, PUC and ownership documents are hashed and compared, mileage readings are tested for rollbacks, damage and history events are correlated, and a deterministic rules engine turns evidence coverage minus open finding points into a 0–100 trust score. Open a vehicle to ask about its specific records.",
      [],
      [
        { label: "Explore verified vehicles", href: role === "seller" ? "/seller/vehicles" : "/buyer/explore" },
        { label: "Run a verification lookup", href: "/buyer/verification" },
      ],
      ["What does the trust score mean?", "How is mileage checked?", "Which documents are required?"]
    );
  }

  const ctx = citationsFor(vehicle.id);
  const trust = computeVehicleTrust(vehicle.id);
  const intent = detectIntent(question);
  const reportAction: AiAction[] = [
    { label: "Open full report", href: `/vehicle/${vehicle.id}` },
    ...(role === "seller"
      ? [{ label: "Seller verification centre", href: "/seller/verification" }]
      : [{ label: "AI risk analysis", href: `/buyer/risk?vehicle=${vehicle.id}` }]),
  ];

  if (intent === "pricing") {
    if (!ctx.pricing) {
      return base("pricing", `No price estimate is stored for ${title(vehicle)} yet. The asking price is ${vehicle.asking_price ? money(vehicle.asking_price) : "not set"}.`, [
        { kind: "vehicle", id: vehicle.id, label: "Vehicle record", detail: `Asking price ${vehicle.asking_price ? money(vehicle.asking_price) : "not set"}` },
      ], reportAction, ["Why is there no estimate?", "What affects the price?"], 0.6);
    }
    const p = ctx.pricing;
    const delta = vehicle.asking_price - p.estimate;
    const deltaText = Math.abs(delta) < p.estimate * 0.03
      ? "in line with the estimate"
      : delta > 0
      ? `${money(Math.abs(delta))} above the estimate`
      : `${money(Math.abs(delta))} below the estimate`;
    return base(
      "pricing",
      `The model estimate for ${title(vehicle)} is ${money(p.estimate)} (range ${money(p.low)}–${money(p.high)}, ${p.confidence} confidence, ${p.method}). The asking price is ${vehicle.asking_price ? money(vehicle.asking_price) : "not set"} — ${deltaText}. Price is not a condition guarantee.`,
      [
        { kind: "pricing", id: vehicle.id, label: "Price model", detail: `${money(p.low)}–${money(p.high)} · ${p.confidence} confidence · ${p.method}` },
        { kind: "vehicle", id: vehicle.id, label: "Asking price", detail: money(vehicle.asking_price) },
      ],
      reportAction,
      ["How was this estimate calculated?", "Is the mileage consistent?", "What are the open findings?"]
    );
  }

  if (intent === "mileage") {
    if (!ctx.mileage.length) {
      return base("mileage", `No mileage readings are stored for ${title(vehicle)}. The claimed reading is ${vehicle.km_claimed.toLocaleString("en-IN")} km, which cannot be cross-checked yet.`, [], reportAction, ["Which documents prove mileage?", "What does a flagged reading mean?"], 0.55);
    }
    const sorted = [...ctx.mileage].sort((a, b) => a.date.localeCompare(b.date));
    const flagged = sorted.filter((m) => m.flagged);
    const last = sorted[sorted.length - 1];
    const first = sorted[0];
    const cited = sorted.slice(-3).map<AiCitation>((m) => ({
      kind: "mileage",
      id: m.id,
      label: `${m.year} reading`,
      detail: `${m.km.toLocaleString("en-IN")} km · ${m.source} · ${m.verified ? "verified" : m.is_seller_claim ? "seller claim" : "unverified"}${m.flagged ? " · FLAGGED" : ""}`,
    }));
    return base(
      "mileage",
      flagged.length
        ? `${flagged.length} mileage reading${flagged.length === 1 ? "" : "s"} on ${title(vehicle)} are flagged: ${list(flagged.map((m) => `${m.year}: ${m.km.toLocaleString("en-IN")} km (${m.source})`))}. The claimed reading is ${vehicle.km_claimed.toLocaleString("en-IN")} km. Flagged readings mean "needs investigation", not proof of tampering.`
        : `Mileage on ${title(vehicle)} is consistent across ${sorted.length} stored readings, from ${first.km.toLocaleString("en-IN")} km (${first.year}) to ${last.km.toLocaleString("en-IN")} km (${last.year}). The claimed reading is ${vehicle.km_claimed.toLocaleString("en-IN")} km.`,
      cited,
      role === "seller" ? [{ label: "Review history", href: "/seller/history" }, ...reportAction] : reportAction,
      ["Who supplied each reading?", "What is a plausible annual mileage?", "Show service history"]
    );
  }

  if (intent === "damage") {
    if (!ctx.damage.length) {
      return base(
        "damage",
        `No damage records were found in the available sources for ${title(vehicle)}. That does not prove the car never had damage — it means no record was detected.`,
        ctx.findings.filter((f) => /ACCIDENT|DAMAGE/.test(f.code)).map((f) => ({ kind: "finding", id: f.id, label: f.title, detail: f.explanation })),
        reportAction,
        ["What do the inspection documents say?", "Is there any accident finding?", "What should I inspect in person?"],
        0.6
      );
    }
    return base(
      "damage",
      `${ctx.damage.length} damage record${ctx.damage.length === 1 ? "" : "s"} exist for ${title(vehicle)}: ${list(ctx.damage.map((d) => `${d.zone_id}: ${d.description} (${d.severity}, ${d.repair_status})`))}.`,
      ctx.damage.map((d) => ({ kind: "damage", id: d.id, label: d.zone_id, detail: `${d.description} · ${d.severity} · ${d.repair_status}` })),
      reportAction,
      ["Was the damage repaired?", "Which document proves the repair?", "Show the photo evidence"]
    );
  }

  if (intent === "documents") {
    const verified = ctx.docs.filter((d) => d.status === "verified");
    const attention = ctx.docs.filter((d) => d.status === "pending" || d.status === "processing" || d.status === "suspicious" || d.status === "rejected");
    return base(
      "documents",
      `${verified.length} of ${ctx.docs.length} documents on ${title(vehicle)} are verified${verified.length ? ` (${verified.map((d) => d.type.toUpperCase()).join(", ")})` : ""}.${attention.length ? ` ${attention.length} need attention: ${attention.map((d) => `${d.type.toUpperCase()} (${d.status})`).join(", ")}.` : ""} Buyers only see documents the seller has consented to share on a published listing.`,
      verified.slice(0, 4).map((d): AiCitation => ({ kind: "document", id: d.id, label: d.type.toUpperCase(), detail: `verified · SHA-256 ${d.sha256.slice(0, 12)}…` })).concat(
        attention.slice(0, 3).map((d): AiCitation => ({ kind: "document", id: d.id, label: d.type.toUpperCase(), detail: `${d.status}${d.status_reason ? ` · ${d.status_reason}` : ""}` }))
      ),
      role === "seller" ? [{ label: "Manage documents", href: "/seller/documents" }, ...reportAction] : reportAction,
      ["Which document is missing?", "How is a document verified?", "What is the hash chain?"]
    );
  }

  if (intent === "theft") {
    const t = ctx.theft;
    const check = theftAssessment(t);
    const text =
      check.status === "verified"
        ? `No theft record was found for ${title(vehicle)} in the configured source (${check.source}${t ? `, checked ${new Date(t.checked_at).toLocaleDateString("en-IN")}` : ""}).`
        : check.status === "unavailable"
          ? `${check.note} This check is incomplete — not a pass.`
          : `A theft record was found in ${check.source}. Treat this as a serious open issue and request the seller's clarification before proceeding.`;
    return base(
      "theft",
      text,
      t ? [{ kind: "theft", id: vehicle.id, label: "Theft check", detail: `${check.status} · ${check.source}` }] : [],
      reportAction,
      ["What does 'no record' mean?", "Which sources are checked?"],
      check.status === "unavailable" ? 0.45 : check.status === "suspicious" ? 0.9 : 0.82
    );
  }

  if (intent === "history") {
    const events = ctx.history;
    const recent = events.slice(-5).reverse();
    return base(
      "history",
      events.length
        ? `${title(vehicle)} has ${events.length} stored history events. Most recent: ${recent.map((h) => `${h.event_date} — ${h.title}${h.mileage_km ? ` at ${h.mileage_km.toLocaleString("en-IN")} km` : ""}`).join("; ")}.`
        : `No history events are stored for ${title(vehicle)}. Absence of records is not evidence that nothing happened.`,
      recent.map((h) => ({ kind: "history", id: h.id, label: h.title, detail: `${h.event_date} · ${h.source} · ${h.status}` })),
      role === "seller" ? [{ label: "Add or correct history", href: "/seller/history" }, ...reportAction] : reportAction,
      ["Who owned the car before?", "Was servicing regular?", "Any insurance claims?"],
      events.length ? 0.84 : 0.55
    );
  }

  if (intent === "seller") {
    const seller = getUserById(vehicle.owner_id);
    return base(
      "seller",
      seller
        ? `${seller.name}${seller.business_name ? ` (${seller.business_name})` : ""} is the seller, a ${seller.seller_type || "private"} seller based in ${seller.city || vehicle.location}. KYC status: ${seller.kyc_status}. Contact happens through a tracked inquiry so both sides keep a record.`
        : "The seller record is unavailable.",
      seller ? [{ kind: "listing", id: seller.id, label: "Seller", detail: `${seller.name} · KYC ${seller.kyc_status}` }] : [],
      role === "buyer" ? [{ label: "Contact seller", href: "/buyer/inquiries" }, ...reportAction] : reportAction,
      ["Is the seller KYC verified?", "Schedule a test drive", "Ask for service records"]
    );
  }

  if (intent === "report") {
    const latest = ctx.reports[0];
    return base(
      "report",
      latest
        ? `The latest report for ${title(vehicle)} is ${latest.report_id} (${latest.type}), status ${latest.status}${latest.generated_at ? `, generated ${new Date(latest.generated_at).toLocaleDateString("en-IN")}` : ""}. Its PDF is bound to snapshot ${latest.snapshot && latest.snapshot !== "{}" ? `${latest.snapshot.slice(0, 12)}…` : "not stored"}.`
        : `No report has been generated for ${title(vehicle)} yet.`,
      latest
        ? [{ kind: "report", id: latest.id, label: latest.report_id, detail: `${latest.type} · ${latest.status}${latest.pdf_hash ? ` · PDF ${latest.pdf_hash.slice(0, 12)}…` : ""}` }]
        : [],
      latest?.status === "ready" ? [{ label: "Download PDF", href: `/api/v1/reports/${latest.id}/download` }, ...reportAction] : reportAction,
      ["What is inside the report?", "How do I verify the PDF hash?", "Can I regenerate it?"]
    );
  }

  if (intent === "inspection") {
    const inspection = ctx.docs.find((d) => d.type === "inspection");
    return base(
      "inspection",
      `Stored condition signal for ${title(vehicle)}: condition score ${vehicle.condition_score}/100, ${vehicle.ownership_count} recorded owner${vehicle.ownership_count === 1 ? "" : "s"}, ${vehicle.km_claimed.toLocaleString("en-IN")} km. ${inspection ? `Inspection document is ${inspection.status}.` : "No inspection document is stored."} TrustDrive cannot replace a physical pre-purchase inspection of tyres, brakes, engine and underbody.`,
      [
        { kind: "vehicle", id: vehicle.id, label: "Condition fields", detail: `score ${vehicle.condition_score}/100 · ${vehicle.km_claimed.toLocaleString("en-IN")} km · ${vehicle.ownership_count} owner(s)` },
        ...(inspection ? [{ kind: "document" as const, id: inspection.id, label: "Inspection document", detail: inspection.status }] : []),
      ],
      reportAction,
      ["Which damage records exist?", "What does the inspection document cover?", "Book a physical inspection"]
    );
  }

  if (intent === "buying") {
    const status = ctx.listing?.status ?? "not listed";
    return base(
      "buying",
      ctx.listing?.status === "published"
        ? `${title(vehicle)} is published at ${vehicle.asking_price ? money(vehicle.asking_price) : "an unset asking price"} with trust ${trust.trustScore}/100 (${trust.bandLabel}). Send a tracked inquiry to request documents, a test drive or an offer.`
        : `${title(vehicle)} is not currently open for purchase (listing status: ${status}). You can still review its verification record.`,
      ctx.listing ? [{ kind: "listing", id: ctx.listing.id, label: "Listing", detail: `${ctx.listing.status} · ${money(vehicle.asking_price)}` }] : [],
      role === "buyer" ? [{ label: "Start an inquiry", href: "/buyer/inquiries" }, ...reportAction] : reportAction,
      ["Is the price negotiable?", "Can I schedule a test drive?", "What should I check in person?"]
    );
  }

  if (intent === "trust") {
    const deductions = trust.breakdown.length
      ? trust.breakdown.map((b) => `${b.code} −${b.points}`).join(", ")
      : "no open deductions";
    return base(
      "trust",
      `${title(vehicle)} scores ${trust.trustScore}/100 (${trust.bandLabel}). Evidence coverage is ${trust.evidenceCoverage}% and open findings deduct ${deductions}. The score is computed as coverage points minus open finding points; it describes documentation and consistency, not physical condition.`,
      [
        ...ctx.findings.slice(0, 4).map((f) => ({ kind: "finding" as const, id: f.id, label: f.title, detail: `${f.severity} · −${f.points} pts · ${f.status}` })),
        { kind: "chain" as const, id: vehicle.id, label: "Hash chain", detail: ctx.chain.intact ? `intact · ${ctx.chain.records} records` : `broken at record ${ctx.chain.brokenAt}` },
      ],
      reportAction,
      ["Which findings hurt the score most?", "What documents are missing?", "How can the seller improve it?"]
    );
  }

  const insights = getInsights(vehicle.id);
  return base(
    "summary",
    `${title(vehicle)} — trust ${trust.trustScore}/100 (${trust.bandLabel}), evidence coverage ${trust.evidenceCoverage}%, ${ctx.findings.length} open finding${ctx.findings.length === 1 ? "" : "s"}. ${insights.map((i) => `${i.label}: ${i.detail}`).join(". ")}.`,
    [
      ...ctx.findings.slice(0, 3).map((f) => ({ kind: "finding" as const, id: f.id, label: f.title, detail: `${f.severity} · ${f.explanation}` })),
      { kind: "chain" as const, id: vehicle.id, label: "Integrity", detail: ctx.chain.intact ? `${ctx.chain.records} hash-chained records, intact` : "chain broken" },
    ],
    reportAction,
    ["What are the open findings?", "Is the mileage consistent?", "What should I do next?"]
  );
}

export function explainFinding(vehicleId: string, findingId?: string) {
  const vehicle = getVehicle(vehicleId);
  if (!vehicle) return { ok: false as const, code: "NOT_FOUND", message: "Vehicle not found." };
  const findings = getFindings(vehicleId).filter((f) => f.status !== "cleared");
  const finding = findingId ? findings.find((f) => f.id === findingId) : [...findings].sort((a, b) => b.points - a.points)[0];
  if (!finding) {
    return {
      ok: true as const,
      explanation: {
        title: "No open findings",
        severity: "none",
        points: 0,
        narrative: `No open findings are stored for ${title(vehicle)} in the available sources. This is not proof that the vehicle has no issues.`,
        evidence: [],
        recommendation: "Still arrange a physical inspection and confirm the latest service records.",
        citations: [] as AiCitation[],
      },
    };
  }
  const doc = finding.responsible_doc ? getDocument(finding.responsible_doc) : undefined;
  const evidence = (() => {
    try {
      return JSON.parse(finding.evidence) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  const evidenceLines = Object.entries(evidence).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  const citations: AiCitation[] = [
    { kind: "finding", id: finding.id, label: finding.title, detail: `${finding.code} · ${finding.severity} · ${finding.points} pts` },
    ...(doc ? [{ kind: "document" as const, id: doc.id, label: doc.type.toUpperCase(), detail: `${doc.status} · ${doc.sha256.slice(0, 12)}…` }] : []),
  ];
  return {
    ok: true as const,
    explanation: {
      id: finding.id,
      title: finding.title,
      code: finding.code,
      severity: finding.severity,
      points: finding.points,
      status: finding.status,
      narrative: `${finding.explanation} ${doc ? `The responsible document is the ${doc.type.toUpperCase()} (${doc.status}), hash ${doc.sha256.slice(0, 12)}… .` : "No single document is linked; the finding comes from cross-record consistency."} ${evidenceLines.length ? `Evidence used: ${evidenceLines.join("; ")}.` : ""} This is a rules-engine result, not an accusation of fraud.`,
      evidence,
      recommendation: finding.recommendation,
      citations,
    },
  };
}

export function aiHealth() {
  return {
    mode: "grounded-rules-v1",
    externalModel: false,
    grounded: true,
    capabilities: ["vehicle Q&A", "finding explanation", "price/mileage/document summaries", "next-step guidance"],
    limits: ["No free-form generation", "No physical condition claims", "No approval authority", "No data outside stored records"],
    disclaimer: DISCLAIMER,
  };
}
