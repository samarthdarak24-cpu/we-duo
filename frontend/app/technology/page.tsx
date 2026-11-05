import { Navbar } from "@/components/public/Navbar";
import { Footer } from "@/components/public/Footer";
import { TechnologySection } from "@/components/public/TechnologySection";
import { AiIntelligenceSection } from "@/components/public/AiIntelligenceSection";
import { StackStatus } from "@/components/public/StackStatus";
import { Newsletter } from "@/components/public/Newsletter";
import { Icon } from "@/components/ui/Icon";
import Link from "next/link";

export const metadata = {
  title: "Technology & AI Architecture — TrustDrive",
  description:
    "Deterministic verification algorithms, OCR extraction, tamper-evident SHA-256 hash chains, and computer vision panel analysis.",
};

export default function TechnologyPage() {
  return (
    <div className="min-h-screen bg-[#08090A] text-[#F5F5F5] font-sans selection:bg-[#C5A46D]/30 selection:text-white">
      <Navbar />

      <main className="pt-28">
        {/* Technology Header */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
            Deterministic Systems Architecture
          </span>
          <h1 className="font-display font-extrabold text-4xl sm:text-6xl text-white tracking-tight leading-tight max-w-4xl mx-auto">
            The Algorithmic Engine Behind <br />
            <span className="text-gold-gradient">Vehicle Truth.</span>
          </h1>
          <p className="mt-5 text-[15px] sm:text-[17px] text-[#BFC3C8] max-w-2xl mx-auto leading-relaxed">
            How TrustDrive combines deterministic mathematical scoring, computer vision, OCR document parsing, and SHA-256 hash chains to eliminate pre-owned vehicle fraud.
          </p>
        </div>

        {/* Live stack status (reads the intelligence service) */}
        <StackStatus />

        {/* AI Layers */}
        <AiIntelligenceSection />

        {/* Core Pillars */}
        <TechnologySection />

        {/* Architectural Deep-Dive Grid */}
        <section className="py-24 bg-[#08090A] border-t border-[#23262A]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
                System Implementation Details
              </span>
              <h2 className="font-display font-bold text-3xl sm:text-4xl text-white">
                Four Pillars of Vehicle Verification
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-8 rounded-2xl bg-[#111315] border border-[#23262A] space-y-4">
                <div className="w-12 h-12 rounded-xl bg-[#17191C] border border-[#23262A] flex items-center justify-center text-[#C5A46D]">
                  <Icon name="BrainCircuit" size={24} />
                </div>
                <h3 className="font-display font-bold text-xl text-white">
                  Deterministic Trust Scoring vs Generative LLMs
                </h3>
                <p className="text-[14px] text-[#7A8089] leading-relaxed">
                  Generative language models hallucinate numbers and produce inconsistent judgments. TrustDrive calculates trust scores using a pure deterministic scoring matrix: fixed point deductions for missing records (-15 for RC/insurance gaps, -30 for odometer rollbacks, -12 for unresolved collision reports). An LLM is only utilized to generate plain-language explanations of results the deterministic engine already computed.
                </p>
                <div className="pt-2 text-[12px] font-mono text-[#36B982] flex items-center gap-1.5">
                  <Icon name="Check" size={14} />
                  <span>Auditable and 100% Reproducible</span>
                </div>
              </div>

              <div className="p-8 rounded-2xl bg-[#111315] border border-[#23262A] space-y-4">
                <div className="w-12 h-12 rounded-xl bg-[#17191C] border border-[#23262A] flex items-center justify-center text-[#C5A46D]">
                  <Icon name="ShieldCheck" size={24} />
                </div>
                <h3 className="font-display font-bold text-xl text-white">
                  Tamper-Evident SHA-256 Cryptographic Chains
                </h3>
                <p className="text-[14px] text-[#7A8089] leading-relaxed">
                  Every document upload, odometer record, and repair inspection event creates a cryptographic block referencing the previous block&apos;s hash. If any party attempts to retroactively alter a mileage reading or replace an invoice, all downstream hashes are invalidated immediately. We explicitly state: a valid hash guarantees file tamper-evidence; it does not replace human physical inspection.
                </p>
                <div className="pt-2 text-[12px] font-mono text-[#36B982] flex items-center gap-1.5">
                  <Icon name="Check" size={14} />
                  <span>Append-Only Immutable Ledger</span>
                </div>
              </div>

              <div className="p-8 rounded-2xl bg-[#111315] border border-[#23262A] space-y-4">
                <div className="w-12 h-12 rounded-xl bg-[#17191C] border border-[#23262A] flex items-center justify-center text-[#C5A46D]">
                  <Icon name="ScanSearch" size={24} />
                </div>
                <h3 className="font-display font-bold text-xl text-white">
                  Multi-Factor OCR & Cross-Registration Verification
                </h3>
                <p className="text-[14px] text-[#7A8089] leading-relaxed">
                  Our optical character recognition pipeline handles skewed cell phone snapshots, faded thermal receipts, and multi-page insurance declarations. Extracted parameters (Chassis VIN, Engine Number, Emission Standard, Registration Authority) are validated against national transport databases and checked for duplicate usage across other registered vehicles.
                </p>
                <div className="pt-2 text-[12px] font-mono text-[#36B982] flex items-center gap-1.5">
                  <Icon name="Check" size={14} />
                  <span>Duplicate Invoice Detection</span>
                </div>
              </div>

              <div className="p-8 rounded-2xl bg-[#111315] border border-[#23262A] space-y-4">
                <div className="w-12 h-12 rounded-xl bg-[#17191C] border border-[#23262A] flex items-center justify-center text-[#C5A46D]">
                  <Icon name="Users" size={24} />
                </div>
                <h3 className="font-display font-bold text-xl text-white">
                  Human Arbitration Queue & Dispute Resolution
                </h3>
                <p className="text-[14px] text-[#7A8089] leading-relaxed">
                  Automated algorithms flag potential inconsistencies; human compliance officers make final suspension rulings. Sellers have a dedicated dispute submission mechanism where they can present corrected RTO filings or dealer affidavits. Every dispute resolution is permanently recorded in the vehicle audit trail.
                </p>
                <div className="pt-2 text-[12px] font-mono text-[#36B982] flex items-center gap-1.5">
                  <Icon name="Check" size={14} />
                  <span>Fair Seller Appeals Process</span>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-16 text-center">
              <Link
                href="/inspection"
                className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-full bg-[#F5F5F5] hover:bg-white text-black text-[13px] font-bold uppercase tracking-wider transition-all"
              >
                <span>Experience 3D Inspection Studio</span>
                <Icon name="ArrowRight" size={15} />
              </Link>
            </div>
          </div>
        </section>

        <Newsletter />
      </main>

      <Footer />
    </div>
  );
}
