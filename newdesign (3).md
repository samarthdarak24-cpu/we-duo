# TRUSTDRIVE — Premium Seller & Buyer Workspace

**Master UI/UX redesign + feature behavior + technical implementation specification**  
Version: 2.0 · Prepared: 5 November 2026 · Status: Build specification  
Primary outcome: redesign the two existing dashboards into a cohesive, premium automotive intelligence product while preserving working features, APIs, data and authentication.

> **Read first:** This is a redesign of an existing application, not permission to replace its stack or discard working functionality. Audit the repository before coding. Keep exactly two primary product roles: **Seller** and **Buyer**. Shared verification services power both portals.

---

## 0. Reference material and redesign goal

### 0.1 Current screenshots supplied by the project owner

These are the current-state references to audit. They show real application structure and must be preserved functionally while improving the design.

**Buyer workspace — current state**

![Current TrustDrive Buyer Dashboard](assets/references/current-buyer-dashboard.png)

**Seller workspace — current state**

![Current TrustDrive Seller Dashboard](assets/references/current-seller-dashboard.png)

### 0.2 Current UI audit

| Current issue | Required correction |
|---|---|
| Sidebar consumes too much horizontal space | Use a 248 px expanded rail and 76 px collapsed rail on desktop |
| Gold is used too heavily | Reserve champagne gold for brand emphasis and primary actions; use semantic colors for status |
| Too many KPI cards compete for attention | Show 4 primary KPIs; move secondary metrics into analytics or detail pages |
| Seller alert text wraps into very narrow columns | Use full-width alert rows with title, short evidence summary, status and action |
| Buyer recommendations use generic car icons | Use real vehicle thumbnails, consistent crops and image fallbacks |
| Current 3D viewer appears to show a primitive/placeholder object | Load a real, correctly scaled GLB/GLTF vehicle; never label a primitive as a real vehicle model |
| Trust score is visually prominent without enough context | Show score methodology, evidence coverage, risk findings and unavailable data separately |
| Several sections are cramped or clipped | Apply a strict spacing system, sensible minimum widths and responsive grid rules |
| Top bar has too many high-contrast controls | Keep search, notifications and account controls; reduce decorative chrome |
| The same dense card pattern repeats | Mix compact stats, editorial vehicle media, lists, charts and evidence timelines |

### 0.3 Redesign objective

Create a calm, premium automotive workspace: **graphite navigation + warm mineral canvas + champagne-metal accent + real vehicle imagery + high-quality 3D inspection**. Keep the two dashboards visually related, but make each role's primary task obvious.

**Do not:** add more cards just to fill space, use random gradients, add excessive glassmorphism, put cards inside cards, make every label uppercase, use tiny text, or replace actual functions with mock buttons.

---

## 1. Product definition

**TrustDrive** is a vehicle-history, condition-verification and used-vehicle discovery platform.

- **Seller:** register and manage vehicles, submit evidence, resolve findings, publish listings and communicate with interested buyers.
- **Buyer:** discover vehicles, inspect available evidence, understand risk and data coverage, compare cars and contact sellers.
- **Shared TrustDrive engine:** stores source-aware vehicle records, extracts document data, runs rules and ML checks, creates explainable findings and builds a traceable vehicle report.

### Product promise

**Seller:** Register. Verify. Showcase. Sell.  
**Buyer:** Discover. Investigate. Compare. Decide.

### Product principles

1. Evidence before claims.
2. A warning is not proof of fraud.
3. Missing information is **unknown**, never automatically clean.
4. Every verification result has a source, timestamp and method.
5. AI explains evidence; it does not silently certify a vehicle.
6. Historical records are append-only after verification; corrections create new audited events.
7. The 3D view helps people inspect evidence. It does not invent physical damage.

---

## 2. Visual direction and design system

### 2.1 Art direction

**Direction:** Modern automotive editorial / private vehicle concierge / precision engineering.

- Premium but approachable, not flashy.
- High-quality vehicle photography and realistic 3D rendering do the visual work.
- Light content canvas for data-heavy workspaces.
- Dark graphite navigation provides brand continuity.
- Champagne accent is restrained and consistent.
- Use dark mode only as a deliberate optional theme, not a mix of unrelated dark and light components.

### 2.2 Color tokens

| Token | Value | Use |
|---|---|---|
| `--td-ink` | `#17191B` | Main text, dark rail |
| `--td-ink-soft` | `#25292D` | Dark surfaces, hover |
| `--td-canvas` | `#F4F3F0` | Main application background |
| `--td-surface` | `#FFFFFF` | Cards and panels |
| `--td-surface-muted` | `#F8F7F4` | Secondary panels |
| `--td-border` | `#E6E3DC` | Borders and dividers |
| `--td-gold` | `#B99A60` | Brand accent and primary CTA |
| `--td-gold-soft` | `#EDE3CF` | Soft brand highlight |
| `--td-blue` | `#356DCE` | Interactive data visualization only |
| `--td-success` | `#2F8B59` | Verified / success |
| `--td-warning` | `#B97824` | Pending / needs review |
| `--td-danger` | `#C44D43` | Rejected / critical mismatch |
| `--td-neutral` | `#788087` | Unknown / unavailable |

**Color rules:** Gold is not a status color. Use green only for verified/success, amber for pending/review, red for confirmed errors, gray for unavailable/unknown. Do not use color alone; add text labels and icons.

### 2.3 Typography

Use the existing licensed font if it already matches. Otherwise use **Inter** or **Geist** with a restrained weight range.

| Element | Desktop | Weight | Notes |
|---|---:|---:|---|
| Page title | 28–32 px | 650–700 | One per page |
| Section title | 18–21 px | 600 | Consistent case |
| Card title | 15–17 px | 600 | Avoid oversized card headings |
| Body | 14–16 px | 400–500 | Comfortable line height |
| Supporting | 12–13 px | 400 | Secondary data only |
| KPI value | 26–32 px | 650–700 | Align baselines |
| Monospace identifiers | 12–13 px | 500 | VIN, hashes, IDs only |

Use sentence case. Avoid all-caps paragraphs, ultra-wide letter spacing and unnecessary gradient text.

### 2.4 Layout and spacing

- Desktop content max width: 1600 px.
- Expanded sidebar: 248 px; collapsed: 76 px.
- Top bar: 68–72 px.
- Main page padding: 28–36 px desktop, 20 px tablet, 16 px mobile.
- Grid gap: 20–24 px desktop, 16 px tablet, 12 px mobile.
- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px.
- Card radius: 14–18 px; buttons: 10–12 px.
- Border: 1 px solid `--td-border`.
- Shadow: subtle, broad and low contrast; do not use a visible shadow on every nested element.

### 2.5 Component rules

- Cards have one job and one clear heading.
- Prefer a single surface per content area instead of nested cards.
- Buttons are 40–44 px high, with a clear primary/secondary/tertiary hierarchy.
- All loading, empty, error, disabled and success states must be designed.
- Use skeletons only for real asynchronous data loading.
- Status chips must include text; no color-only state indicators.
- Tooltips explain unfamiliar indicators such as evidence coverage or risk score.
- Tables need sorting, pagination, empty state and mobile fallback.
- Forms need inline validation, field help and submission feedback.

### 2.6 Iconography and motion

Use one consistent outline icon family (Lucide or existing equivalent). Do not mix emoji and several icon libraries.

Motion:
- Hover: 120–180 ms.
- Menus and tooltips: 150–220 ms.
- Modal/drawer: 180–260 ms.
- Page transitions: 180–240 ms.
- 3D transitions may be longer but must follow user input and never block actions.
- Respect `prefers-reduced-motion`.

---

## 3. Reference layouts for the redesign

These are structural targets, not pixel-perfect final screenshots. Keep the visual rhythm, but adapt to the actual available viewport and existing data.

### 3.1 Buyer layout target

![Buyer and Seller layout blueprint](assets/diagrams/dashboard-layouts.svg)

**Buyer overview composition**

1. Header: page title, global search, notifications, account.
2. Four compact stats: explored, saved, recently viewed, reports.
3. Main content: recommended vehicles list + featured vehicle 3D/verification preview + trust/evidence summary.
4. Below fold: recent activity, saved comparisons, latest reports and inquiries.
5. A clear primary action: **Verify a vehicle**.

**Buyer vehicle report page**

- Vehicle identity header with real thumbnail, make/model/year and listing status.
- Main 3D vehicle viewer with functional camera controls.
- Right rail: trust score, evidence coverage and key findings.
- Below: tabs for Overview, Mileage, Damage, Theft, Documents, Service history, Financial and AI analysis.
- Use real source-backed report data; do not put all report sections into the first viewport.

### 3.2 Seller layout target

**Seller overview composition**

1. Header with selected vehicle/workspace context and primary action **Add vehicle**.
2. Four primary stats: vehicles, active listings, pending verification, buyer inquiries.
3. One compact alert strip for the most important blocker.
4. Main content: vehicle alerts + document completeness + listing readiness.
5. Below fold: vehicle inventory, verification activity, marketplace performance and recent inquiries.

**Seller vehicle report page**

- Vehicle identity and action header.
- Compact secondary metrics only when they add value.
- Real 3D viewer with component inspection.
- Right-side document/verification readiness panel.
- Damage and repair evidence list linked to the selected 3D component.
- Listing panel with actual publish blockers and a single primary action.

### 3.3 Seller/Buyer shared workflow

![Seller and Buyer workflow](assets/diagrams/seller-buyer-flow.svg)

---

## 4. Navigation and route map

Keep exactly two public user roles. Use existing route conventions after repository audit; the paths below are recommended examples.

### Seller

| Route | Page |
|---|---|
| `/seller/overview` | Seller summary |
| `/seller/vehicles` | Vehicle inventory |
| `/seller/vehicles/new` | Vehicle onboarding wizard |
| `/seller/vehicles/:id` | Vehicle detail/report |
| `/seller/documents` | Document library |
| `/seller/history` | Vehicle history submissions |
| `/seller/verification` | Verification center |
| `/seller/ai-findings` | AI alerts and review actions |
| `/seller/listings` | Listing management |
| `/seller/inquiries` | Buyer messages and requests |
| `/seller/reports` | Generated reports |
| `/seller/settings` | Account and privacy settings |

### Buyer

| Route | Page |
|---|---|
| `/buyer/overview` | Buyer summary |
| `/buyer/explore` | Marketplace |
| `/buyer/search` | Advanced search and filters |
| `/buyer/vehicles/:id` | Vehicle details |
| `/buyer/verify` | Search/QR verification entry |
| `/buyer/reports/:id` | Full vehicle verification report |
| `/buyer/history/:vehicleId` | Vehicle history timeline |
| `/buyer/ai-analysis/:vehicleId` | AI risk findings |
| `/buyer/compare` | Vehicle comparison |
| `/buyer/saved` | Saved vehicles |
| `/buyer/inquiries` | Seller conversations |
| `/buyer/reports` | Downloaded/generated reports |
| `/buyer/settings` | Account and privacy settings |

### Shared

- Existing login/registration routes.
- Existing authenticated profile and notification services.
- Public share/QR report route with restricted fields and expiring/signed tokens.

**RBAC:** A Seller cannot edit Buyer data. A Buyer cannot alter vehicle records or seller documents. A vehicle owner cannot silently rewrite a verified historical event. Server-side authorization is mandatory; hiding buttons is not security.

---

## 5. Seller features — behavior specification

### 5.1 Overview

**Primary job:** understand vehicle portfolio health and see what needs attention next.

Show:
- Total vehicles.
- Active listings.
- Pending verification.
- New buyer inquiries.
- Highest-priority alert.
- Document completeness by vehicle.
- Listing readiness and blockers.
- Recent activity.
- Vehicle inventory preview.

Interactions:
- KPI click opens the corresponding filtered page.
- Alert click opens the exact finding and evidence.
- Add Vehicle starts the onboarding wizard.
- View Vehicle opens its report.
- Publish Listing is enabled only when required fields are complete and policy checks pass.

### 5.2 My Vehicles

Functions:
- Search by vehicle name, registration, VIN or TrustDrive ID.
- Filter by verification, listing and record status.
- Sort by updated date, year, price or make/model.
- Add, view, edit permitted fields, archive and mark sold.
- Show document completeness, last verification date and latest finding.
- Prevent duplicate registration/VIN records; offer to review an existing record instead of silently creating another.

Vehicle fields:
- Registration number.
- VIN/chassis number.
- Make, model, variant and body type.
- Manufacturing year and registration date where available.
- Fuel, transmission, colour and odometer reading.
- Seller-declared owner count.
- Location, asking price and vehicle images.
- Source and verification state for each important field.

### 5.3 Add Vehicle wizard

Steps:
1. Identity and specifications.
2. Images and odometer photo.
3. Documents.
4. Seller-declared history.
5. Verification review.
6. Listing setup.

Behavior:
- Save draft after each step.
- Validate required fields inline.
- Display upload progress and retry.
- Show extracted OCR values beside seller-entered values.
- Ask the seller to confirm mismatches; never overwrite silently.
- Create a new audit event for each submission or correction.

### 5.4 Documents

Supported categories:
- RC / registration document.
- Insurance policy.
- PUC certificate.
- Service invoice.
- Repair invoice.
- Inspection report.
- Accident/claim evidence.
- Ownership/transfer evidence.
- Other supporting evidence.

Document lifecycle:
`uploaded → queued → extracting → extracted → validation_pending → verified / needs_review / rejected / unavailable`.

Features:
- Upload, preview, download and replace a rejected version.
- OCR field extraction.
- VIN/registration/mileage/date extraction where present.
- Expiry checks where applicable.
- Duplicate and near-duplicate detection.
- Metadata and file-integrity checks.
- Hash each file version.
- Show extraction confidence and source provenance.
- Preserve original file versions; corrections create versions, not destructive replacement.

### 5.5 Vehicle history

Event types:
- Registration.
- Ownership transfer.
- Service.
- Repair.
- Accident/claim.
- Odometer reading.
- Inspection.
- Document update.
- Verification event.

Each timeline item must show date, odometer reading if applicable, event type, source, evidence file, who submitted it and verification state.

Seller may submit a missing event or request a correction. Verified past events remain immutable; correction creates a linked new event with reason and audit details.

### 5.6 Verification Center

Checks:
- VIN/registration consistency across submitted documents.
- RC field extraction and internal consistency.
- Insurance status/date checks from the provided evidence or authorized source.
- PUC dates where applicable.
- Mileage chronology.
- Duplicate document checks.
- File metadata anomalies.
- Record hash integrity.

Show each check as `passed`, `failed`, `pending`, `needs_review` or `unavailable` with a short explanation and action.

### 5.7 AI Fraud Analysis

Show findings, not a vague chatbot answer.

Each finding includes:
- Finding title and severity.
- Why it was raised.
- Evidence references.
- Rule/model version.
- Confidence or quality indicator where calibrated.
- Suggested next step.
- Seller response/correction workflow.

The Seller may add evidence or request re-analysis. The Seller cannot delete a finding from the audit trail.

### 5.8 3D inspection and damage records

- Load the actual vehicle model.
- Rotate, zoom and use camera presets.
- Select a named component.
- Add a damage/repair record against that component.
- Attach photographs and invoices.
- Enter severity, repair status, date and notes.
- Submit for verification.
- Preserve history when a component is repaired or a new inspection changes its condition.

### 5.9 Marketplace listings

Fields:
- Vehicle reference.
- Asking price.
- Description.
- Location.
- Photos/video.
- Availability and seller contact preferences.
- Disclosures and known issues.

Lifecycle:
`draft → readiness_check → pending_review (if required) → published → paused → sold / withdrawn`.

A checklist explains every blocker. A listing must not show a verified badge just because a seller filled the form.

### 5.10 Listing action bar

Actions:
- Add Photos.
- Upload Documents.
- Set Price.
- Write Description.
- Preview Listing.
- Share Listing.
- Track Inquiries.
- Get Verification Report.

Each action must open a real modal/page/workflow, persist changes and show success/error feedback.

### 5.11 Buyer inquiries

- View conversation and vehicle context.
- Respond to buyer messages.
- Accept/reject inspection request.
- Suggest test-drive times.
- Share permitted documents/report.
- Track state: new, replied, inspection_requested, scheduled, closed.
- Keep private personal details protected.

### 5.12 Price estimate and analytics

Use comparable listing/transaction data only when legitimately available. Explain the sample size, date and method. Show range and confidence, not an exact guaranteed value. If insufficient comparables exist, show `estimate unavailable` and why.

---

## 6. Buyer features — behavior specification

### 6.1 Overview

Show:
- Vehicles explored.
- Saved vehicles.
- Recently viewed.
- Pending reports.
- Recommended cars.
- Latest saved-vehicle changes.
- Active inquiries.
- Quick Verify action.

### 6.2 Explore marketplace

- Browse only active/published listings.
- Show high-quality image, make/model/year, asking price, mileage, fuel, transmission, location and seller label.
- Display verification status and evidence coverage separately.
- Save/unsave vehicle.
- Open details.
- Share listing.
- Report suspicious listing.

### 6.3 Search and filters

Filters:
- Make/model/variant.
- Price range.
- Year range.
- Mileage range.
- Fuel and transmission.
- Location/distance if a location service exists.
- Seller-declared ownership count.
- Listing status.
- Verification state.
- Evidence coverage.
- Accident/repair records found in available sources.

Use URL query parameters for shareable search states. Debounce text search. Paginate or use cursor-based loading. Never return private documents or unmasked personal data in marketplace search.

### 6.4 Vehicle details

- Hero gallery with responsive crop.
- Vehicle specifications and seller description.
- Asking price and estimate range if available.
- Seller profile and contact action.
- Verification summary.
- History highlights.
- 3D inspection entry.
- AI findings summary.
- Save, compare and share actions.

### 6.5 Verify a vehicle

Search by permitted registration number, VIN/chassis or TrustDrive ID; QR scan opens a signed report link.

Before verification, explain what data is being queried and what is stored. Return only fields the requester is allowed to see.

### 6.6 Full vehicle report

Sections:
- Vehicle identity.
- Evidence coverage.
- Trust/risk summary.
- Mileage history.
- Accident/repair records.
- Component damage.
- Service timeline.
- Document checks.
- Theft status from authorized sources only.
- Insurance information where supported.
- Record integrity/hash events.
- Sources, limitations and timestamps.

For every section, distinguish `verified`, `seller_submitted`, `unverified`, `suspicious`, `pending` and `unavailable`.

### 6.7 Trust score and evidence coverage

Do not show a score alone. Show:
- Score and score version.
- Evidence coverage percentage.
- Number of verified sources/events.
- Open findings.
- Missing/unavailable categories.
- Explanation of what changes the score.

Missing data does not count as a clean record. The score must come from a documented deterministic method, not an LLM-generated number.

### 6.8 3D inspection

- 360-degree orbit.
- Zoom.
- Front/rear/left/right/top camera presets.
- Full screen.
- Select component.
- Show recorded damage hotspots.
- View linked photos, repair invoices and inspection event.
- Compare before/after evidence if available.
- Explain that the viewer maps records to model components; it does not itself prove hidden structural damage.

### 6.9 Mileage analysis

- Chronological readings with dates and source.
- Chart filters: 1Y / 3Y / All.
- Show original reading, normalized reading and source.
- Detect decrease, duplicate reading, impossible sequence or suspicious large jump.
- Allow the user to open evidence for each point.
- Do not infer rollback solely from two readings without checking date/source/unit context.

### 6.10 AI Risk Analysis

- Group findings by severity and category.
- Show evidence and confidence/quality.
- Explain alternative reasons for anomalies.
- Let the buyer request more information from the seller.
- Never claim a vehicle is stolen, fraudulent or accident-free without a supported authorized source.

### 6.11 Theft and external checks

- Use authorized data-provider adapter only.
- Show provider, timestamp and fields queried.
- If no provider is configured, show `external theft check unavailable`.
- Never scrape restricted portals or imply MoRTH/Vahan access exists by default.

### 6.12 Compare vehicles

Compare 2–4 selected vehicles across price, year, mileage, fuel, transmission, service evidence, accident/repair events, document coverage, open findings and estimate range. Highlight meaningful differences, not just green ticks.

### 6.13 Saved vehicles, inquiries and reports

- Save and organize vehicles.
- Receive price/listing updates.
- Contact seller and ask for evidence.
- Request inspection/test drive.
- Track message and request state.
- Generate/download PDF report.
- Share a QR link with permission and expiry controls.

---

## 7. Signature innovations for a hackathon

Do not add technology labels just to look advanced. Build a small number of connected innovations that judges can see and test.

### Innovation 1 — Vehicle Evidence Graph (signature differentiator)

![TrustDrive Vehicle Evidence Graph](assets/diagrams/evidence-graph.svg)

**What it does:** connects vehicle, VIN, documents, mileage readings, service events, damage records, inspection records, AI findings and source provenance.

**How it works:**
1. Every uploaded record creates an evidence entity.
2. OCR extracts fields and attaches them to the source document.
3. Rules compare matching fields across records.
4. Conflicts create finding nodes, not destructive edits.
5. Frontend renders the connected graph and allows a user to open the source evidence.

**Build path:** PostgreSQL tables/edges first; React Flow for visualization. Add Neo4j only if actual graph query needs justify another database.

**Demo moment:** click a vehicle VIN node, reveal two documents with different VINs, open both sources, and show the exact mismatch.

### Innovation 2 — LangGraph Evidence Investigator

![AI investigation workflow](assets/diagrams/ai-investigation-workflow.svg)

Use a controlled stateful workflow, not a free-running swarm of agents.

**Graph nodes:**
1. `load_vehicle_context`
2. `extract_document_fields`
3. `run_deterministic_checks`
4. `run_mileage_anomaly_model`
5. `run_duplicate_document_check`
6. `run_damage_cv_if_images_exist`
7. `correlate_evidence_graph`
8. `resolve_conflicts`
9. `generate_explanation`
10. `human_review_if_required`
11. `persist_case_and_report`

**LangChain use:** model/provider abstraction, tool interfaces, structured output and retriever integration.  
**LangGraph use:** explicit state, branching, persistence/checkpoints and human approval/interrupts.  
**RAG use:** retrieve only documents/records the user is authorized to access; cite document/event IDs in answers.

**Agent tools:** `get_vehicle`, `get_documents`, `get_mileage_events`, `compare_identifiers`, `find_duplicate_files`, `run_rule_checks`, `get_damage_records`, `create_review_task`, `generate_report`.

**Hard rule:** the agent can explain, summarize and recommend. It cannot silently approve a document, alter a historical event, publish a listing, send money, or make a legal conclusion.

### Innovation 3 — Cross-modal mileage verification

Compare three independent inputs:
- Seller-entered odometer reading.
- OCR extracted from dashboard/inspection photos.
- Historical service/invoice/inspection readings.

Normalize units and dates first. Raise a finding only when the sequence has a meaningful conflict. Save the exact values and sources.

### Innovation 4 — Document authenticity and duplicate intelligence

Use multiple complementary checks:
- SHA-256 for exact file equality.
- Perceptual hash for visually similar scans/images.
- OCR text normalization + token/character similarity for altered copies.
- Metadata timeline checks as weak signals only.
- Cross-document field consistency for VIN, registration, date and mileage.

A hash proves file integrity after hashing, not that the source document was genuine.

### Innovation 5 — 3D Damage Evidence Twin

Map vehicle mesh/component IDs to damage records. A buyer selects a door/bumper/bonnet; the panel opens the associated inspection images, repair invoice, date, severity and verification status. This links the 3D experience to real data instead of using 3D as decoration.

### Innovation 6 — Explainable trust and coverage model

Separate three concepts:
- **Evidence coverage:** how much usable evidence exists.
- **Risk findings:** confirmed and unresolved discrepancies.
- **Trust score:** deterministic, versioned summary based only on approved scoring rules and available evidence.

Always show methodology, date and missing-data limitations. Do not give a high score merely because there are no records.

### Innovation 7 — Privacy-safe, tamper-evident vehicle passport

Create a QR-linked vehicle passport. Store only necessary public report fields. Use signed, random, expiring tokens. Keep PII and source documents private. Store file hashes and event references off-chain/in an audit layer; blockchain anchoring is optional and must not contain personal data.

### Innovation priority

| Priority | Feature | Why it matters |
|---|---|---|
| P0 | Evidence graph + deterministic consistency checks | Demo-friendly, explainable core |
| P0 | LangGraph investigation workflow | Connects signals into one repeatable case |
| P1 | OCR + cross-modal mileage | Concrete, measurable intelligence |
| P1 | Duplicate/altered document detection | Strong practical fraud use case |
| P1 | 3D damage evidence twin | Memorable visual differentiator |
| P2 | Damage CV model | Useful if dataset and model quality are sufficient |
| P2 | RAG evidence assistant | Ask questions about this vehicle's evidence |
| P3 | Blockchain anchoring | Add only after core evidence pipeline works |

---

## 8. AI/ML implementation details

### 8.1 Use the simplest method that solves the check

| Feature | Baseline | Advanced option | Output |
|---|---|---|---|
| Document field extraction | OCR + regex/schema validation | Layout-aware document model | Extracted fields with page/box confidence |
| VIN/registration mismatch | Deterministic normalization and comparison | Entity resolution | Mismatch finding |
| Exact duplicate | SHA-256 | — | Duplicate file ID |
| Near-duplicate invoice | Perceptual hash + OCR text similarity | Embeddings / vector search | Similar document candidates |
| Mileage rollback | Ordered rule checks | Isolation Forest / robust regression with enough labeled data | Anomaly with readings and evidence |
| Damage type | Manual inspection baseline | Fine-tuned object detection/segmentation | Candidate damage region + confidence |
| Price estimate | Comparable listing median/range | Regression model after collecting clean data | Range + sample count + date |
| Natural-language report Q&A | Structured report retrieval | RAG with pgvector | Answer with evidence references |

### 8.2 OCR pipeline

1. Validate type, size and safe file handling.
2. Store original in private object storage.
3. Compute SHA-256.
4. Detect orientation/quality and preprocess.
5. Run OCR.
6. Normalize extracted values.
7. Attach field confidence and source page/coordinates.
8. Compare with vehicle record and other documents.
9. Send low-confidence/high-impact mismatches to review.

OCR extraction is not document verification by itself.

### 8.3 Mileage model

- Sort readings by event date and preserve source dates.
- Normalize kilometre/mile units.
- Check non-decreasing odometer sequence, with explicit handling for meter replacement/reset and data-entry errors.
- Flag impossible decreases and abnormal jumps.
- Only use ML anomaly detection after enough reliable history exists; otherwise show rules-based results.
- Track model version, training data version and evaluation metrics.
- Report false-positive limitations.

### 8.4 Damage vision

- Start with manual component-level inspection and evidence capture.
- Add computer vision only when the team has legally usable, representative labeled data.
- Detect candidate regions, classify visible damage and optionally segment affected pixels.
- Require human confirmation before writing a verified damage event.
- State that photos can miss hidden structural damage and lighting/angle affects predictions.
- Do not claim a model detects all accident history from one image.

### 8.5 Agent and RAG architecture

Use **one orchestrated investigation graph** first. Avoid a multi-agent swarm unless a measurable bottleneck requires specialist agents.

State fields should include:
- `case_id`, `vehicle_id`, `requester_role`.
- `source_records[]`, `document_ids[]`, `reading_ids[]`.
- `rule_results[]`, `ml_signals[]`, `conflicts[]`.
- `evidence_graph_refs[]`.
- `explanation`, `review_required`, `review_status`.
- `model_versions`, `ruleset_version`, `created_at`.

Persist checkpoints so work can resume after an OCR/model failure or review pause. Make nodes idempotent. Add retry limits and dead-letter/error status.

### 8.6 Ask TrustDrive assistant

- Answer only from authorized vehicle records and reports.
- Every factual claim links to a source event/document.
- If evidence is missing, say so.
- Do not invent provider checks, legal results or accident history.
- Read-only by default. Write actions require explicit user confirmation and server-side permission.

---

## 9. Three.js vehicle inspection specification

### 9.1 Asset requirements

- One premium sedan GLB/GLTF model with separate meshes or a prepared component hierarchy.
- Meaningful mesh names where possible.
- Consistent origin, scale, orientation and units.
- PBR materials and optimized textures.
- Fallback poster image while loading.
- Asset source, license and attribution recorded in `ASSET_REGISTER.md`.

### 9.2 Component mapping

| Component key | Example mesh group | UI use |
|---|---|---|
| `front_bumper` | front bumper mesh | Damage hotspot |
| `rear_bumper` | rear bumper mesh | Damage hotspot |
| `hood` | hood/bonnet mesh | Damage hotspot |
| `front_left_door` | left front door | Damage hotspot |
| `front_right_door` | right front door | Damage hotspot |
| `rear_left_door` | left rear door | Damage hotspot |
| `rear_right_door` | right rear door | Damage hotspot |
| `wheel_fl/fr/rl/rr` | wheel assemblies | Component inspection |
| `headlight_left/right` | lamp meshes | Component inspection |
| `chassis` | frame mesh | Exploded view |
| `engine` | engine group | Exploded view |
| `suspension_*` | suspension meshes | Exploded view |

Map actual imported mesh names. Do not assume a downloaded model has all of these separated. If not, document the limitation and obtain/prepare a suitable asset.

### 9.3 Viewer controls

- Orbit/360° drag.
- Zoom in/out.
- Front/rear/left/right/top presets.
- Reset camera.
- Full screen.
- Select component by raycasting.
- Highlight selected component.
- Show recorded damage markers only when records exist.
- Open linked evidence panel.
- Exploded view only where model hierarchy supports it.

### 9.4 UI states

`loading → ready → selected_component → evidence_open`  
Error and fallback: `model_unavailable → poster + inspection list`.

Never leave the viewer as an empty black box. Show a useful fallback and a clear retry.

### 9.5 Performance

- Compress GLB with Draco/Meshopt where compatible.
- Optimize texture dimensions and formats.
- Lazy-load 3D when the viewer approaches viewport.
- Pause/limit rendering when not visible.
- Dispose geometry/material/texture resources on unmount.
- Cap DPR on mobile.
- Use reduced scene quality for low-power devices.
- Provide keyboard controls and a non-WebGL evidence list.

---

## 10. System architecture

![TrustDrive system architecture](assets/diagrams/system-architecture.svg)

**Recommended approach:** modular monolith first. Keep bounded modules and interfaces; do not split into microservices for a hackathon unless the existing backend already does so.

### 10.1 Layers

1. **Frontend:** Seller workspace, Buyer workspace, public listing/report pages.
2. **API/auth layer:** session/JWT according to existing app, role checks, request validation, rate limits.
3. **Domain modules:** vehicles, documents, history, mileage, damage, verification, listings, inquiries, reports, notifications, audit.
4. **Background workers:** OCR, image analysis, AI graph, PDF generation, email.
5. **Data layer:** relational database, private object storage, optional vector index, optional queue/cache.
6. **External adapters:** authorized vehicle-data provider, maps, email, optional chain anchoring.

### 10.2 Existing-stack rule

Before selecting packages, inspect `package.json`, lockfiles, source folders, runtime, database schema and deployment configuration. Reuse current technologies and upgrade only when necessary. Record decisions in `ARCHITECTURE.md`.

### 10.3 Suggested logical modules

- `auth`
- `users`
- `vehicles`
- `documents`
- `extraction`
- `vehicle-history`
- `mileage`
- `damage-inspection`
- `verification`
- `ai-investigation`
- `evidence-graph`
- `trust-score`
- `marketplace`
- `inquiries`
- `reports`
- `qr-sharing`
- `notifications`
- `audit`
- `provider-adapters`

---

## 11. Database model — minimum entities

Use the existing ORM and migration system if one exists.

| Table/entity | Key fields / purpose |
|---|---|
| `users` | role, name, contact, auth reference, status |
| `vehicles` | VIN, registration, make/model/year, owner user, specifications |
| `vehicle_claims` | seller-declared values with provenance/status |
| `vehicle_documents` | type, storage key, hash, version, extraction status |
| `document_extractions` | normalized fields, confidence, page/coordinate refs |
| `verification_cases` | subject, state, rule/model versions, requester |
| `verification_findings` | code, severity, explanation, status, evidence refs |
| `vehicle_events` | event type, date, mileage, source, immutable history |
| `mileage_records` | value, unit, event date, source, confidence |
| `damage_records` | component, severity, repair state, evidence refs |
| `inspections` | inspector/source, date, findings, images |
| `evidence_nodes` | node type, linked entity, provenance |
| `evidence_edges` | source node, relation, target node |
| `vehicle_listings` | status, price, description, location, published date |
| `listing_images` | image storage key, sort order, view |
| `saved_vehicles` | buyer, vehicle, created date |
| `inquiries` | buyer, seller, listing, type, status |
| `messages` | inquiry, sender, body, attachment refs, timestamp |
| `trust_scores` | score, coverage, methodology version, calculated date |
| `ai_runs` | graph run, input refs, output refs, model version, status |
| `report_files` | report type, storage key, token reference, expiry |
| `notifications` | recipient, type, payload, read state |
| `audit_logs` | actor, action, entity, before/after refs, timestamp |
| `provider_checks` | provider, request ref, status, checked timestamp |
| `blockchain_anchors` | record hash, chain/network, transaction ref, status |

### Database rules

- Normalize VIN and registration for matching, but preserve original submitted text.
- Add unique constraints only where legally/technically valid; handle duplicates gracefully.
- Use foreign keys and transactions for multi-entity writes.
- Index common filters and lookup keys.
- Store files in object storage; database stores metadata and storage keys.
- Keep sensitive fields separate and access-controlled.
- Use append-only event/audit patterns for important historical changes.
- Add migrations and deterministic seed scripts.

---

## 12. API behavior and contracts

Keep the existing API style where working. If REST, use consistent versioned endpoints and JSON contracts.

Example endpoint groups:

| Method + route | Role | Purpose |
|---|---|---|
| `POST /api/v1/vehicles` | Seller | Create vehicle draft |
| `GET /api/v1/vehicles/mine` | Seller | List own vehicles |
| `GET /api/v1/vehicles/:id` | Permission-based | Vehicle detail |
| `PATCH /api/v1/vehicles/:id` | Seller owner | Edit allowed fields |
| `POST /api/v1/vehicles/:id/documents` | Seller owner | Upload document |
| `GET /api/v1/vehicles/:id/documents` | Permission-based | List permitted docs |
| `POST /api/v1/vehicles/:id/verification-runs` | Seller/authorized | Start verification |
| `GET /api/v1/verification-cases/:id` | Permission-based | Status/findings |
| `GET /api/v1/marketplace/listings` | Buyer/Seller | Search published listings |
| `POST /api/v1/listings` | Seller | Create draft listing |
| `PATCH /api/v1/listings/:id` | Seller owner | Update listing |
| `POST /api/v1/listings/:id/publish` | Seller owner | Run readiness gate then publish |
| `POST /api/v1/saved-vehicles` | Buyer | Save vehicle |
| `POST /api/v1/inquiries` | Buyer | Send inquiry |
| `GET /api/v1/inquiries` | Buyer/Seller | List role-owned inquiries |
| `POST /api/v1/vehicles/:id/ai-investigations` | Authorized | Start investigation graph |
| `GET /api/v1/vehicles/:id/evidence-graph` | Permission-based | Graph nodes/edges |
| `POST /api/v1/reports` | Authorized | Generate report |
| `GET /api/v1/reports/:id` | Owner/authorized | Download report |

For every endpoint document:
- Authentication and role requirement.
- Resource ownership rule.
- Request schema and validation.
- Response schema.
- Status codes and error format.
- Pagination/filtering.
- Idempotency requirements for uploads, publishing and background job triggers.

Do not invent endpoints before inspecting existing controllers/routes. Update `API_SPECIFICATION.md` with the actual routes.

---

## 13. Security, privacy and data access

- Hash passwords using a modern password hash already supported by the app; never store plain text.
- Enforce authorization on the server for every resource.
- Protect against XSS, CSRF where applicable, SQL injection and insecure direct object references.
- Rate-limit authentication, search, report and upload endpoints.
- Validate file type by content/magic bytes, not filename only.
- Apply size limits, virus scanning where available and safe file preview/download headers.
- Keep uploaded documents private by default.
- Encrypt transport (HTTPS) and sensitive stored data where appropriate.
- Keep API keys and LLM secrets outside source control.
- Redact VIN, registration, name, phone and other PII from prompts/telemetry unless required and authorized.
- Do not send personal documents to a third-party AI service without a lawful basis, consent and provider review.
- Audit document views, downloads, corrections, sharing and exports.
- Signed QR/report tokens must be unguessable, scoped and optionally expiring/revocable.

### India vehicle data constraint

Do not assume public access to Vahan/MoRTH or insurer data. The MoRTH National Transport Repository data-sharing policy dated 18 August 2025 sets conditions around recipient eligibility, approvals, API access, security and consent. Implement a provider-adapter interface and show unavailable status until an authorized provider is configured. Never scrape restricted services or label seller-entered data as government-verified.

---

## 14. Visual asset strategy

### Required asset folders

```text
public/assets/
  brand/
  vehicles/
    thumbnails/
    gallery/
    3d/
      sedan.glb
      poster.webp
      environment.hdr
  damage/
  documents/demo/
  icons/
```

### Asset rules

- Use real, licensed vehicle photographs and models.
- Record source, license, attribution and modification in `ASSET_REGISTER.md`.
- Keep one consistent vehicle model for the featured report.
- Crop gallery thumbnails consistently.
- Avoid low-resolution stock images and watermark-heavy images.
- Don't generate a model, invoice, inspection image or QR data that looks like real third-party evidence. Demo content must be labelled `DEMO DATA`.

### Reference images to code workflow

1. Inspect supplied screenshots at full resolution.
2. Create a page-by-page target design reference, not one tiny collage.
3. Extract design tokens and component patterns.
4. Build one page at a time.
5. Compare actual browser screenshots to the target.
6. Fix large layout/spacing issues before micro-polish.
7. Repeat for desktop and mobile.

---

## 15. Recommended tools and skills for the coding agent

These are optional development aids, not runtime dependencies. Use the tools supported by the chosen agent. Do not block implementation if a skill/MCP requires a paid key.

### A. Taste Skill — design direction and redesign audit

Current install name for the default v2 skill:

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

For existing-project redesign audit:

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill "redesign-skill"
```

Note: Taste's default v2 is described by its maintainers as experimental. If it causes workflow problems, pin the v1 skill or use the stable redesign skill. Do not let it replace this specification.

### B. Image-to-Code — generate and analyze section references

The image generation skills moved to a separate repository in October 2026:

```bash
npx skills add https://github.com/Leonxlnx/imagegen-skills --skill "image-to-code"
```

Use one image per important page/section when the agent can generate design references. Since current screenshots are already supplied, analyze them first. Do not generate one unreadable mega-collage.

### C. Vercel Web Design Guidelines

```bash
npx skills add https://github.com/vercel-labs/agent-skills --skill "web-design-guidelines"
```

Use it after each page implementation for accessibility, keyboard operation, target sizes, loading states, clear labels and UX review.

### D. Vercel React Best Practices

```bash
npx skills add https://github.com/vercel-labs/agent-skills --skill "vercel-react-best-practices"
```

Use when implementing or refactoring React/Next.js pages, server/client data fetching, bundle size and render performance.

### E. 21st MCP (formerly Magic MCP)

The former Magic MCP has been replaced by the unified 21st MCP. For a supported client:

```bash
npx @21st-dev/cli@latest init --client cursor
```

Replace `cursor` with the actual supported client (for example `claude`, `vscode`, `windsurf` or `codex`). Follow the official setup for authentication and API key storage. Search for components/themes and use generation only if the account has access. The old Magic API keys were reset; do not keep old credentials. Never expose API keys in source code or commit them.

Use 21st selectively for component discovery; do not paste in many unrelated components. Match every selected component to the TrustDrive design tokens.

### F. Awesome Design MD

Use the VoltAgent `awesome-design-md` repository as a **reference library** for learning how design documents describe theme, color roles, typography, component states, layout, elevation and responsive behavior. Do not copy another product's brand identity or blindly install multiple design systems.

### G. Playwright CLI — visual and interaction QA

```bash
npm install -g @playwright/cli@latest
playwright-cli install --skills
```

Use it to open the local app, test every page and action, capture screenshots and repeat the design-fix loop. Use Playwright Test for repeatable automated E2E tests where the repository supports it.

### Tool usage order

1. Taste/redesign skill reads the brief and audits current screens.
2. Image-to-Code generates/organizes page references if available.
3. 21st MCP may help find a component; it is optional.
4. Agent implements using the current stack and this design system.
5. Vercel guidelines review interaction/accessibility.
6. Playwright CLI captures screenshots and tests flows.

---

## 16. Functional quality and state requirements

Every feature needs:
- Loading state.
- Success state.
- Empty state.
- Error state with an actionable next step.
- Permission-denied state.
- Retry behavior where safe.
- Confirmation for destructive actions.
- Persistence across reloads where expected.

### Data state vocabulary

Use a consistent enum across API and UI:

`draft`, `queued`, `processing`, `pending`, `verified`, `needs_review`, `suspicious`, `rejected`, `unverified`, `unavailable`, `archived`.

Don't invent another status per page unless there is a documented domain reason.

---

## 17. Accessibility, responsive behavior and performance

### Required breakpoints

- Wide desktop: ≥1440 px.
- Standard laptop: 1280–1439 px.
- Tablet: 768–1279 px.
- Mobile: <768 px.

### Responsive rules

- Sidebar collapses to icon rail or drawer.
- KPI cards change from 4 columns to 2, then 1.
- 3D viewer moves above evidence details on mobile.
- Data tables become readable stacked rows or controlled horizontal scroll.
- Filters become a drawer on mobile.
- Buttons remain at least 44 px touch size.
- No horizontal page overflow.

### Performance rules

- Lazy-load large 3D models and image galleries.
- Paginate large records.
- Avoid sequential request waterfalls.
- Cache stable public listing data; revalidate user-specific data safely.
- Avoid unnecessary React state updates during animation.
- Keep chart and 3D packages out of routes that do not need them.
- Use responsive images and modern image formats.
- Measure bundle size and largest contentful paint.

---

## 18. Testing and visual acceptance

### 18.1 Required automated tests

**Unit tests**
- VIN/registration normalization.
- Document status transitions.
- Mileage sequence checks.
- Trust score calculation and versioning.
- Listing publish readiness.
- Permission helper functions.

**API integration tests**
- Seller can create own vehicle.
- Seller cannot change another seller's vehicle.
- Buyer cannot modify vehicle history/documents.
- Buyer can search only published listings.
- Private documents cannot be downloaded without access.
- Findings and reports persist correctly.

**E2E tests**
1. Seller signs in, adds vehicle, uploads document and sees processing state.
2. OCR finishes and extracted fields are shown for confirmation.
3. Mismatch creates a finding and alert.
4. Seller uploads correction/evidence; original history remains.
5. Seller creates and publishes listing after readiness checks.
6. Buyer searches, opens listing, saves and compares it.
7. Buyer opens report, inspects evidence and downloads report.
8. Buyer sends inquiry; Seller replies.
9. Role restrictions are enforced on direct route and API calls.
10. 3D view loads, rotates, selects component and displays linked evidence.

### 18.2 Screenshot QA loop

Capture and review at:
- 1920 × 1080.
- 1440 × 900.
- 1366 × 768.
- 390 × 844.

Review:
- No overlap or clipped content.
- No awkward text wrapping.
- Consistent gutters and alignment.
- Images have consistent aspect ratio.
- Primary task is visible without scrolling unnecessarily.
- Cards are not nested without purpose.
- Text hierarchy is obvious.
- 3D model looks realistic and fully loaded.
- Empty/loading/error states are attractive.
- Mobile layouts are genuinely usable.

### 18.3 Definition of done

A page is not done because it compiles. It is done when:
- It matches this design system.
- All displayed data is real or visibly labelled demo data.
- Every visible action works.
- Role permissions pass.
- Loading/empty/error states work.
- Tests pass.
- Browser screenshots are reviewed and corrected.

---

## 19. Implementation sequence

Do not attempt all modules in one unverified pass.

| Phase | Deliverable | Acceptance gate |
|---|---|---|
| 0 | Repository audit and current route map | No existing behavior lost; `ARCHITECTURE.md` updated |
| 1 | Tokens, fonts, sidebar, header, buttons, cards, forms | Design system preview approved |
| 2 | Buyer overview and seller overview redesign | Both screenshots checked at desktop/mobile |
| 3 | Buyer/Seller detail pages and navigation | All routes and page states work |
| 4 | Vehicle forms, documents, listings and inquiries | CRUD + RBAC + persistence pass |
| 5 | Shared vehicle verification/history service | Rules and evidence sources persist |
| 6 | OCR + mileage + duplicate checks | Tested on labelled demo files |
| 7 | LangGraph investigation workflow + evidence graph | Findings include evidence IDs and model/rule versions |
| 8 | Three.js component viewer and damage evidence | Real GLB, raycasting and component-linked records work |
| 9 | Trust score, PDF, QR, price comparison | Methodology/source/limitations visible |
| 10 | Hardening and deployment | CI, security, E2E, backups and deployment docs complete |

Update `IMPLEMENTATION_STATUS.md` after each phase. Do not claim a feature is complete when it only has a visual placeholder.

---

## 20. Required project documentation files

Create/update:

- `design.md` — this document, master UI/feature specification.
- `AGENTS.md` — mandatory rules for coding agents.
- `ARCHITECTURE.md` — actual stack, modules and design decisions.
- `API_SPECIFICATION.md` — actual endpoints and schemas.
- `ER_DIAGRAM.md` — database relationships.
- `RBAC_MATRIX.md` — exact seller/buyer access.
- `IMPLEMENTATION_STATUS.md` — phase and feature tracking.
- `TESTING.md` — test commands, scenarios and latest results.
- `ASSET_REGISTER.md` — image/model source, license and attribution.
- `DEPLOYMENT.md` — environment and deployment steps.
- `.env.example` — variable names only, never real secrets.

---

## 21. Master instruction to the AI coding agent

> Read this complete `design.md` and inspect both images in `assets/references/`. Start with a repository audit. Preserve the existing stack and working business logic. Redesign the Buyer and Seller interfaces one page at a time using this design system. Fix the problems identified in Section 0. Build reusable components before duplicating page markup. Use real vehicle imagery and a real GLB/GLTF model for the 3D viewer. Never show a primitive placeholder as the final vehicle. Implement the feature behavior, API and RBAC rules described here. All AI findings must cite evidence and remain reviewable. Use the optional design skills and Playwright tools only when available. After each phase, run the tests, open the local app, capture screenshots at the specified viewport sizes, review visual defects, fix them and update `IMPLEMENTATION_STATUS.md`. Do not stop after mockups. Do not use fake numbers as production data. Do not claim unavailable provider integrations work. Do not mark a feature complete until its acceptance gate passes.

### Final product standard

**Premium at first glance. Clear under inspection. Honest about evidence. Functional end to end.**

---

## 22. Research and reference links

The following sources informed the design workflow and developer-tool recommendations. Check current repository documentation before installing because commands and versions can change.

1. [Taste Skill documentation](https://www.tasteskill.dev/docs) — design inference, redesign skills and image-first workflow. Its default v2 is experimental; use the stable redesign skill if needed.
2. [Taste Skill repository](https://github.com/Leonxlnx/taste-skill) — `design-taste-frontend` and `redesign-skill`.
3. [Image Generation Skills](https://github.com/Leonxlnx/imagegen-skills) — `image-to-code` moved here in October 2026.
4. [Vercel Agent Skills](https://github.com/vercel-labs/agent-skills) — web design guidelines and React performance best practices.
5. [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines) — keyboard usability, focus states, touch targets, loading feedback and actionable errors.
6. [21st MCP documentation](https://docs.21st.dev/mcp) — current UI component MCP; former Magic MCP.
7. [21st MCP GitHub](https://github.com/21st-dev/magic-mcp) — current install and migration notes.
8. [VoltAgent awesome-design-md](https://github.com/VoltAgent/awesome-design-md) — design-document examples and preview structure.
9. [Microsoft Playwright CLI](https://github.com/microsoft/playwright-cli) — browser automation, screenshots and agent skills.
10. [Playwright CLI setup](https://playwright.dev/docs/getting-started-cli) — install and usage.
11. [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence) — checkpoints, resumable workflows and memory.
12. [LangGraph human-in-the-loop](https://docs.langchain.com/oss/javascript/langgraph/interrupts) — approval and pause/resume patterns.
13. [MoRTH National Transport Repository data-sharing policy (18 Aug 2025)](https://morth.nic.in/sites/default/files/circulars_document/Data-Sharing-policy-20082025-merged.pdf) — authorized data-sharing and consent constraints.
14. [Reddit discussion: visual UI iteration with coding agents](https://www.reddit.com/r/ClaudeCode/comments/1vyr8ep/how_do_you_guys_actually_deal_with_ui_fixes_in/) — practical discussion about screenshot-led, page-by-page visual correction. Treat community comments as experience, not a formal standard.

---

## Appendix A — Current reference images

- `assets/references/current-buyer-dashboard.png`
- `assets/references/current-seller-dashboard.png`

## Appendix B — Diagrams

- `assets/diagrams/dashboard-layouts.svg`
- `assets/diagrams/system-architecture.svg`
- `assets/diagrams/ai-investigation-workflow.svg`
- `assets/diagrams/evidence-graph.svg`
- `assets/diagrams/seller-buyer-flow.svg`
