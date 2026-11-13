import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageLayout, type LegalSection } from "@/components/public/LegalPageLayout";

export const metadata: Metadata = {
  title: "Terms of Use — TrustDrive",
  description:
    "Conditions for using TrustDrive, including verification limits, evidence handling, seller and buyer responsibilities, and platform availability.",
};

export const dynamic = "force-dynamic";

const sections: LegalSection[] = [
  {
    id: "about",
    heading: "About this service",
    body: (
      <>
        <p>
          TrustDrive is a vehicle-history and evidence platform. It lets sellers register
          vehicles, upload documents and photographs, record history and damage, and publish
          listings. Buyers can discover listings, inspect permission-filtered history and
          generate reports. Reviewers and admins manage verification queues and disputes.
        </p>
        <p>
          This installation is provided for demonstration and evaluation. Pre-loaded accounts,
          vehicles, documents and findings are demo records and are labelled as such. By using
          the site you agree to these terms and to the{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </>
    ),
  },
  {
    id: "no-guarantee",
    heading: "No guarantee of condition or authenticity",
    body: (
      <>
        <p>
          TrustDrive is an information tool, not a physical inspection, a valuation, a legal
          opinion, an insurance product or a guarantee of a vehicle&apos;s condition, ownership
          or authenticity. A trust score is an additive, deterministic, versioned measure of{" "}
          <strong>evidence coverage</strong> computed from stored records; it is not a
          certification and no language model sets it.
        </p>
        <p>
          A matching SHA-256 hash proves that a stored file has not changed. It does not prove
          that the underlying document is genuine. Blockchain anchoring is not claimed.
          Missing data is unverified coverage, never proof that a vehicle is accident-free or
          that fraud is absent.
        </p>
        <p>
          Always arrange an independent physical inspection and verify documents with the
          issuing authority before making a purchase decision.
        </p>
      </>
    ),
  },
  {
    id: "integrations",
    heading: "External sources and provider status",
    body: (
      <>
        <p>
          Unless an operator explicitly configures one, no external vehicle registry,
          transport authority, insurance database, police database or other official source is
          connected. TrustDrive is not affiliated with or endorsed by any government body.
          References to RTO or registry documents in editorial content describe document
          types, not active integrations.
        </p>
        <p>
          Unconfigured providers are reported as <code>unavailable</code>. The platform never
          presents an unavailable check as a clean result, and never claims a notification was
          delivered unless the configured provider confirms it.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    heading: "Automated findings and human review",
    body: (
      <>
        <p>
          Findings may be produced by deterministic rules, OCR extraction, or configured
          machine-learning models. Each records its evidence references, the method and rule
          or model version, and its review status. AI-generated output is a suggestion, not a
          confirmed fact.
        </p>
        <p>
          If an engine is unavailable, the platform returns an honest error rather than a
          fabricated analysis. Sellers and reviewers may dispute or correct findings through
          audited endpoints; verified history is not silently overwritten.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    heading: "Accounts and acceptable use",
    body: (
      <>
        <ul>
          <li>Provide accurate information and keep your credentials confidential.</li>
          <li>Only upload documents and photographs you are entitled to submit.</li>
          <li>Do not misrepresent a vehicle, forge evidence, or attempt to access another user&apos;s private files.</li>
          <li>Do not attempt to bypass role permissions, rate limits, or audit logging.</li>
        </ul>
        <p>
          Roles and permissions are enforced on the server, including for direct API calls.
          A role chosen in a browser form is never treated as proof of authorisation. Material
          changes are written to an audit trail.
        </p>
      </>
    ),
  },
  {
    id: "sellers",
    heading: "Seller responsibilities",
    body: (
      <>
        <p>
          Sellers are responsible for the accuracy of the specifications, disclosures,
          mileage readings, photographs and documents they submit, and for setting an asking
          price and location on any listing they publish. A listing may be paused, resumed or
          marked sold; publishing is subject to the platform&apos;s readiness gate.
        </p>
        <p>
          Seller-submitted information is visibly distinguished from independently verified
          information in the Vehicle History Passport.
        </p>
      </>
    ),
  },
  {
    id: "buyers",
    heading: "Buyer responsibilities",
    body: (
      <>
        <p>
          Buyers see a permission-filtered view of history. Evidence a seller has not consented
          to disclose is shown as unavailable rather than guessed. Reports generated from the
          platform state their generation date, vehicle identifier, sources, limitations and
          verification status.
        </p>
        <p>
          Reports and dashboards must not be read as a clean-history certificate; absent
          records are explicitly identified as unverified coverage.
        </p>
      </>
    ),
  },
  {
    id: "availability",
    heading: "Availability and changes",
    body: (
      <>
        <p>
          Features may be unavailable when an optional provider or model is not configured; in
          that case the interface states the limitation rather than substituting sample data.
          The operator may modify or withdraw this demonstration deployment at any time.
        </p>
        <p>
          Questions can be sent through the <Link href="/contact">contact form</Link>. See also
          the <Link href="/faq">FAQ</Link> for trust and safety limitations.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPageLayout
      eyebrow="Conditions of Use"
      title="Terms of Use."
      intro="The conditions for using this TrustDrive deployment — and an explicit statement of what the platform's evidence can and cannot establish."
      updated="Applies to the currently running deployment"
      sections={sections}
    />
  );
}
