// ---------------------------------------------------------------------------
// TrustDrive project knowledge base.
// Powers instant, on-brand answers for general + project questions so the
// assistant feels like a live chatbot instead of hanging on the local LLM.
// Every entry is grounded in how the app actually works (see design.md /
// ARCHITECTURE.md). Keep claims conservative and honest.
// ---------------------------------------------------------------------------

export interface KbLink {
  label: string;
  href: string;
}

export interface KbEntry {
  id: string;
  q: string;
  keywords: RegExp[];
  answer: string;
  links?: KbLink[];
}

export const TRUSTDRIVE_KB: KbEntry[] = [
  {
    id: "what-is",
    q: "What is TrustDrive?",
    keywords: [
      /what(?:'s| is) (?:trust\s?drive|td)\b/i,
      /\btrust\s?drive\b.*\b(about|what|platform|company|do)\b/i,
      /tell me about (?:trust\s?drive|this (?:app|platform|service))/i,
    ],
    answer:
      "TrustDrive is a vehicle trust & verification platform. Sellers list cars with their documents, and a deterministic rules engine checks those records — ownership (RC), insurance, PUC, mileage readings, damage and service history — then computes a 0–100 trust score. Buyers can explore verified vehicles, read a full verification report, inspect the car in an interactive 3D studio, and chat with me about anything on the record.",
    links: [
      { label: "Explore vehicles", href: "/buyer/explore" },
      { label: "How verification works", href: "/buyer/verification" },
    ],
  },
  {
    id: "trust-score",
    q: "What does the trust score mean?",
    keywords: [
      /trust (?:score|rating|grade|points)/i,
      /what(?:'s| is) (?:the )?(?:score|rating)/i,
      /how (?:is|does) (?:the )?(?:trust )?(?:score|rating) (?:calculated|work|computed|made)/i,
      /why (?:is|does) .*(?:score|rating)/i,
    ],
    answer:
      "The trust score is a 0–100 number produced by a deterministic rules engine — never by a person or an LLM. It starts from evidence coverage (how many of the expected records are present and verified) and subtracts points for each open finding. A low score means records are missing or conflict, not necessarily that the car is bad. It measures documentation and consistency, NOT physical condition, and it is not a guarantee.",
    links: [{ label: "Open the full report", href: "/vehicle/v-bmw" }],
  },
  {
    id: "verification",
    q: "How does TrustDrive verify a vehicle?",
    keywords: [
      /how (?:do|does) (?:you|trust\s?drive) (?:verify|check|validate)/i,
      /verif(?:y|ication)/i,
      /how (?:does|is) (?:a )?(?:vehicle|car) (?:verified|checked)/i,
      /what (?:records|documents) (?:do )?(?:you|we) (?:check|use|need)/i,
    ],
    answer:
      "Verification compares several stored records: the RC (ownership), insurance and PUC documents are hashed and checked; mileage readings are tested for rollbacks and inconsistencies; damage and history events are correlated; a theft source is checked when available; and every record is hash-chained so tampering is detectable. Findings (like an odometer rollback or a missing document) are raised as warnings that need investigation — they are not proof of fraud.",
    links: [{ label: "Run a verification lookup", href: "/buyer/verification" }],
  },
  {
    id: "3d-studio",
    q: "What is the 3D Inspection Studio?",
    keywords: [
      /3d (?:inspection|studio|model|viewer|car)/i,
      /inspection studio/i,
      /\b(?:exploded|x-?ray|damage) mode/i,
      /can i (?:see|view|rotate|inspect).*(?:car|vehicle|3d)/i,
    ],
    answer:
      "The 3D Inspection Studio is an interactive Three.js model of the vehicle shown right on the report page. You can orbit it 360°, zoom, and switch between Normal, Exploded (component disassembly), Damage and X-Ray views. Coloured hotspots sit on the panels that have a verified damage record in the database — click one to see the exact finding. It is an illustrative model, not a photo of the specific car.",
    links: [{ label: "See it on the report", href: "/vehicle/v-bmw" }],
  },
  {
    id: "evidence-graph",
    q: "What is the evidence graph?",
    keywords: [/evidence graph/i, /node.*edge/i, /how (?:are|is) (?:findings|records) (?:linked|connected)/i],
    answer:
      "The evidence graph is a node-and-edge view of every record behind the report — vehicle, verification run, findings, documents, history events, mileage readings, damage records and the hash chain. Edges only show relationships the engine actually derived, so you can see exactly why a record is part of the report and where conflicts sit.",
  },
  {
    id: "odometer",
    q: "How is the odometer / mileage checked?",
    keywords: [/odometer/i, /mileage (?:check|rollback|consistent)/i, /rollback/i, /clocked/i, /km (?:reading|consistent)/i],
    answer:
      "The cross-modal odometer check compares three independent readings inside matching time windows: the seller-declared reading, a document-extracted reading (from a service invoice or inspection), and any independent reading. If they don't increase monotonically or jump backwards, the engine raises an odometer-rollback or inconsistency finding. A flagged reading means 'needs investigation', not automatic proof of tampering.",
  },
  {
    id: "roles",
    q: "What are the buyer, seller and admin roles?",
    keywords: [/buyer|seller|admin|role|account type/i, /who can (?:list|sell|buy)/i],
    answer:
      "There are three roles. Sellers list vehicles and upload the documents that back a verification; they control which documents buyers can see via consent. Buyers explore verified vehicles, read reports, ask me questions and start tracked inquiries (so both sides keep a record). Admins run verification, review findings and manage users. Sellers only ever see their own vehicles and listings.",
    links: [
      { label: "Buyer explore", href: "/buyer/explore" },
      { label: "Seller console", href: "/seller/vehicles" },
    ],
  },
  {
    id: "limits",
    q: "What are TrustDrive's limits and disclaimers?",
    keywords: [/limit|disclaim|guarantee|physical|inspect|fraud|honest|can(?:'t| not) (?:promise|guarantee)/i, /is (?:this|it) (?:safe|genuine|verified)/i],
    answer:
      "TrustDrive reports are generated only from records on file. Important limits: a finding is a warning that needs investigation, not proof of fraud; missing data is 'unverified coverage', not evidence the car is clean; and no accident- or theft-free record in the supported sources proves the vehicle has none. TrustDrive cannot replace a physical pre-purchase inspection of the engine, brakes, tyres and underbody. Always inspect the car in person before buying.",
  },
  {
    id: "get-started",
    q: "How do I get started / use TrustDrive?",
    keywords: [/how (?:do|to) (?:use|start|begin|get started)/i, /sign (?:up|in)|login|register/i, /where (?:do )?i (?:start|begin)/i],
    answer:
      "Start by exploring verified vehicles on the Explore page, or run a verification lookup by vehicle. Sellers can sign in to list a car and upload its documents. Once you're on a vehicle report, you can ask me anything about its records, open the 3D studio, or read the evidence graph. Sign in to save vehicles and start inquiries with sellers.",
    links: [
      { label: "Explore", href: "/buyer/explore" },
      { label: "Verify a vehicle", href: "/buyer/verification" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    id: "data-sources",
    q: "What data sources does TrustDrive use?",
    keywords: [/data source|registry|rto|insurer|insurance (?:company|db)|where (?:do )?(?:records|data) (?:come|from)/i, /integrate/i],
    answer:
      "TrustDrive works from the records a seller or verification uploads into its own database — RC, insurance, PUC, service history, mileage readings and damage records — plus an optional theft-source check when available. Each record is hashed and chained so it can be audited. The platform is built to plug into external registries and insurer feeds, but in this deployment those connectors are demonstration integrations, so a 'no record' result means the check was not available, not that something is wrong.",
  },
];

export function matchTrustDriveKb(question: string): KbEntry | null {
  const q = question.toLowerCase();
  for (const e of TRUSTDRIVE_KB) {
    if (e.keywords.some((re) => re.test(q))) return e;
  }
  return null;
}
