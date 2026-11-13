import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageLayout, type LegalSection } from "@/components/public/LegalPageLayout";

export const metadata: Metadata = {
  title: "Privacy Policy — TrustDrive",
  description:
    "How TrustDrive handles account data, vehicle records, uploaded documents, consent-gated files, OCR results and in-app notifications.",
};

export const dynamic = "force-dynamic";

const sections: LegalSection[] = [
  {
    id: "scope",
    heading: "Scope of this policy",
    body: (
      <>
        <p>
          This policy describes how this TrustDrive deployment handles information you provide
          while using the public site, the seller portal, the buyer portal and the admin console.
          It applies to the data stored by this installation, not to any third-party service you
          may choose to reach independently.
        </p>
        <p>
          TrustDrive is a demonstration and evaluation platform. Accounts, vehicles, listings,
          documents and findings that are pre-loaded for demonstration purposes are labelled as
          demo data and must not be treated as records about real vehicles or real people.
        </p>
      </>
    ),
  },
  {
    id: "collected",
    heading: "Information we store",
    body: (
      <>
        <p>Only information you or your organisation enter into the platform is stored:</p>
        <ul>
          <li>Account details: name, email, role, optional phone, city, preferences and avatar.</li>
          <li>Authentication data: a hashed password, session records and optional two-factor settings.</li>
          <li>Vehicle records: identifiers, specifications, mileage, history events, damage records and photographs.</li>
          <li>Uploaded documents and the text/fields extracted from them, plus a SHA-256 hash of each file.</li>
          <li>Listings, inquiries and message threads, saved vehicles, reports and in-app notifications.</li>
          <li>Audit records of material changes, including who made a change and when.</li>
        </ul>
        <p>
          Passwords are stored as salted hashes, never in plaintext. We do not request or store
          payment card details on this site.
        </p>
      </>
    ),
  },
  {
    id: "storage",
    heading: "Where data lives and who can see it",
    body: (
      <>
        <p>
          Both the web application and the intelligence service read one shared database. File
          uploads are stored in the deployment&apos;s configured storage location. Data is not
          sent to an external vehicle registry or government database by default.
        </p>
        <p>
          Access is enforced server-side by role (buyer, seller, admin). A seller sees the
          vehicles and documents they own; a buyer sees published listing information and
          permission-filtered history; private documents are additionally gated by an explicit
          consent grant. Private files cannot be fetched by guessing a URL.
        </p>
        <p>
          External email, SMS, virus-scanning and object-storage providers are optional and
          inactive unless an operator configures them. The platform reports them as unavailable
          rather than claiming a delivery or scan succeeded.
        </p>
      </>
    ),
  },
  {
    id: "automated",
    heading: "Automated processing and its limits",
    body: (
      <>
        <p>
          Uploaded documents may be processed by OCR to extract fields, and vehicle records may
          be evaluated by deterministic rules and, where configured, machine-learning models.
          Every generated finding records its evidence references, the rule or model that
          produced it, and its review status.
        </p>
        <p>
          AI and rule-generated findings are suggestions, not confirmed facts, and remain
          subject to human review. When the configured engine is unavailable, the platform
          returns an honest error instead of a fabricated result. Missing information is shown
          as unverified coverage &mdash; it never means a clean history or proof of fraud.
        </p>
        <p>
          A matching SHA-256 hash demonstrates that a stored file has not changed. It proves
          file integrity, <strong>not</strong> document authenticity, and no blockchain anchoring
          is claimed.
        </p>
      </>
    ),
  },
  {
    id: "integrations",
    heading: "No official registry affiliation",
    body: (
      <>
        <p>
          Unless an operator explicitly connects one, TrustDrive is not connected to any
          transport authority, RTO, national vehicle register, insurance database or police
          database, and is not affiliated with or endorsed by any government body. References to
          such terms in editorial content describe document types, not live integrations.
        </p>
        <p>
          When no external provider is configured, provider checks return{" "}
          <code>unavailable</code>. They are never reported as a clean result.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    heading: "Your controls",
    body: (
      <>
        <ul>
          <li>Review and update your profile, notification preferences and security settings.</li>
          <li>View active sessions and sign them out, change your password, or enable two-factor authentication.</li>
          <li>Manage consent grants for private documents and download files you are permitted to access.</li>
          <li>Request correction of an extracted field or historical record through the audited correction flow.</li>
        </ul>
        <p>
          Corrections are recorded as new audited entries. Verified history is not silently
          overwritten, so the timeline remains inspectable.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    heading: "Retention and deletion",
    body: (
      <>
        <p>
          Deleting a vehicle or document removes it from active views while preserving the audit
          trail required to explain past findings. Session records expire according to the
          deployment&apos;s configured lifetime. Backup copies of the database may be kept by the
          operator for recovery.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    heading: "Contact and changes",
    body: (
      <>
        <p>
          Questions about this policy or your data can be sent through the{" "}
          <Link href="/contact">contact form</Link>. Material changes to how this deployment
          handles information will be reflected on this page.
        </p>
        <p>
          See also the <Link href="/terms">Terms of Use</Link> and the{" "}
          <Link href="/faq">FAQ</Link> for the platform&apos;s trust and safety limitations.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      eyebrow="Privacy & Data Handling"
      title="Privacy Policy."
      intro="A plain-language account of what this TrustDrive deployment stores, who can access it, what automated processing does, and — just as importantly — what it does not claim to do."
      updated="Applies to the currently running deployment"
      sections={sections}
    />
  );
}
