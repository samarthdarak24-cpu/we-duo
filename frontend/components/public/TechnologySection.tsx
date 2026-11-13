"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export function TechnologySection() {
  const [activePillar, setActivePillar] = useState<number | null>(null);

  const pillars = [
    {
      id: "engine",
      title: "Deterministic Trust Engine",
      subtitle: "Mathematical Rule-Based Scoring",
      tag: "Pure Rules Logic",
      icon: "Scale",
      status: "Rule-Based",
      highlights: ["No language model sets the score", "Fixed penalties for documented anomalies", "Auditable 0 to 100 additive scale"],
      visualType: "formula",
    },
    {
      id: "ocr",
      title: "OCR & Document Vision",
      subtitle: "Automotive Document Ingestion",
      tag: "Document Extraction",
      icon: "ScanSearch",
      status: "Engine-Dependent",
      highlights: ["Extracts fields with an evidence reference", "Checks fields against the stored vehicle record", "Unavailable engine returns an honest error"],
      visualType: "ocr",
    },
    {
      id: "blockchain",
      title: "SHA-256 File Integrity",
      subtitle: "Tamper-Evident Fingerprints",
      tag: "Tamper-Evident",
      icon: "ShieldCheck",
      status: "SHA-256 Hashes",
      highlights: ["A hash is stored for each uploaded document", "A matching hash proves file integrity only", "No blockchain anchoring is claimed"],
      visualType: "chain",
    },
    {
      id: "audit",
      title: "Audited Change Trail",
      subtitle: "Timestamped State Progression",
      tag: "Audit Records",
      icon: "FileClock",
      status: "Server-Written",
      highlights: ["Material changes are logged with actor and time", "Admin reviews and seller appeals are tracked", "Corrections supersede rather than silently overwrite"],
      visualType: "feed",
    },
    {
      id: "arbitration",
      title: "Human Dispute Arbitration",
      subtitle: "Admin Verification Queue",
      tag: "Human Oversight",
      icon: "Users",
      status: "Review Queue",
      highlights: ["Findings are suggestions, not accusations of fraud", "Sellers can submit corrective evidence", "Human reviewers resolve disputed records"],
      visualType: "arbitration",
    },
    {
      id: "privacy",
      title: "Privacy & Consent Safeguards",
      subtitle: "Granular Document Access",
      tag: "Privacy First",
      icon: "Lock",
      status: "Consent-Gated",
      highlights: ["Private documents are not publicly addressable", "Sellers grant explicit access to a buyer", "Role checks are enforced on the server"],
      visualType: "privacy",
    },
  ];

  return (
    <section id="technology" className="py-24 bg-[#08090A] border-t border-[#23262A] relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mb-16">
          <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
            Integrity by Design
          </span>
          <h2 className="font-display font-bold text-3xl sm:text-5xl text-white tracking-tight leading-[1.12]">
            Built on Intelligence. <br className="hidden sm:inline" />
            Designed for Transparency.
          </h2>
          <p className="mt-4 text-[15px] text-[#BFC3C8] leading-relaxed">
            We avoid unverifiable claims. Findings cite stored evidence and the rule or model version that produced them; a SHA-256 hash proves file integrity, not document authenticity, and no external registry is queried unless explicitly configured. The diagrams below are illustrative.
          </p>
        </div>

        {/* 6 Architectural Feature Cards with Visual HUD Elements */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pillars.map((pillar, idx) => {
            const isHovered = activePillar === idx;

            return (
              <div
                key={pillar.id}
                onMouseEnter={() => setActivePillar(idx)}
                onMouseLeave={() => setActivePillar(null)}
                className={`p-6 rounded-2xl bg-[#111315] border transition-all duration-300 flex flex-col justify-between group relative overflow-hidden shadow-xl ${
                  isHovered ? "border-[#C5A46D] shadow-[#C5A46D]/5 -translate-y-1" : "border-[#23262A] hover:border-[#3A3E45]"
                }`}
              >
                {/* Top Subtle Ambient Glow on Hover */}
                <div
                  className={`absolute -top-20 -right-20 w-40 h-40 bg-[#C5A46D]/10 rounded-full blur-3xl pointer-events-none transition-opacity duration-500 ${
                    isHovered ? "opacity-100" : "opacity-0"
                  }`}
                />

                <div className="space-y-4">
                  {/* Card Header & Status Badge */}
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-[#17191C] border border-[#23262A] flex items-center justify-center text-[#C5A46D] group-hover:border-[#C5A46D]/50 transition-colors">
                      <Icon name={pillar.icon} size={20} />
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#36B982] bg-[#36B982]/10 border border-[#36B982]/20 px-2.5 py-0.5 rounded-full">
                      {pillar.status}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#7A8089] block">
                      {pillar.tag}
                    </span>
                    <h3 className="font-display font-bold text-lg text-white mt-0.5 group-hover:text-[#F5F5F5] transition-colors">
                      {pillar.title}
                    </h3>
                  </div>

                  {/* ================= VISUAL HUD ELEMENT (Replacing Plain Text) ================= */}
                  <div className="p-3.5 rounded-xl bg-[#08090A] border border-[#23262A] font-mono text-[11px] space-y-2">
                    {/* Visual 1: Deterministic Formula */}
                    {pillar.visualType === "formula" && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[#7A8089] text-[10px]">
                          <span>SCORING FORMULA</span>
                          <span className="text-[#36B982]">EXPLICIT RULES</span>
                        </div>
                        <div className="p-2 rounded bg-[#111315] text-[#C5A46D] font-bold text-[12px] text-center border border-[#23262A]">
                          Trust = 100 - &Sigma;(Penalties) + Coverage
                        </div>
                        <div className="text-[10px] text-[#7A8089] text-center">
                          0% Black-box LLM &bull; Pure deterministic math
                        </div>
                      </div>
                    )}

                    {/* Visual 2: OCR Bounding Box Preview */}
                    {pillar.visualType === "ocr" && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[#7A8089] text-[10px]">
                          <span>OCR PREVIEW</span>
                          <span className="text-[#C5A46D]">ILLUSTRATIVE</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] p-1 rounded bg-[#111315]">
                            <span className="text-[#7A8089]">VIN:</span>
                            <span className="text-white">WBA5R1C5...KAK12</span>
                          </div>
                          <div className="flex justify-between text-[10px] p-1 rounded bg-[#111315]">
                            <span className="text-[#7A8089]">SEAL:</span>
                            <span className="text-[#C5A46D]">TEXT DETECTED (UNVERIFIED)</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Visual 3: Cryptographic Hash Block */}
                    {pillar.visualType === "chain" && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[#7A8089] text-[10px]">
                          <span>HASH VERIFICATION</span>
                          <span className="text-[#36B982]">SHA-256 MATCH</span>
                        </div>
                        <div className="p-1.5 rounded bg-[#111315] text-[10px] text-[#BFC3C8] truncate">
                          #block-28: 9f8a4e21c33b0c44...
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-[#C5A46D]">
                          <Icon name="ShieldCheck" size={12} />
                          <span>Integrity only — not authenticity</span>
                        </div>
                      </div>
                    )}

                    {/* Visual 4: Audit Stream */}
                    {pillar.visualType === "feed" && (
                      <div className="space-y-1 text-[10px]">
                        <div className="flex items-center justify-between text-[#7A8089]">
                          <span>CHANGE LOG EXAMPLE</span>
                          <span className="text-[#C5A46D]">ILLUSTRATIVE</span>
                        </div>
                        <div className="p-1 rounded bg-[#111315] text-[#BFC3C8] truncate">
                          [14:20:05] Document Ingested (RC)
                        </div>
                        <div className="p-1 rounded bg-[#111315] text-[#C5A46D] truncate">
                          [14:20:07] SHA-256 Hash Stored
                        </div>
                      </div>
                    )}

                    {/* Visual 5: Human Arbitration */}
                    {pillar.visualType === "arbitration" && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[#7A8089] text-[10px]">
                          <span>WORKFLOW ROUTING</span>
                          <span className="text-[#E7A83E]">DISPUTE QUEUE</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-[10px] text-center">
                          <span className="p-1 rounded bg-[#111315] text-[#E7A83E]">AI Flags Issue</span>
                          <span className="p-1 rounded bg-[#111315] text-[#36B982]">Human Arbitrates</span>
                        </div>
                        <div className="text-[10px] text-[#7A8089] text-center">
                          Suggestions only &bull; Appealable findings
                        </div>
                      </div>
                    )}

                    {/* Visual 6: Privacy Masking Switch */}
                    {pillar.visualType === "privacy" && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[#7A8089] text-[10px]">
                          <span>SELLER PRIVACY MASK</span>
                          <span className="text-[#36B982]">PROTECTED</span>
                        </div>
                        <div className="p-1.5 rounded bg-[#111315] flex items-center justify-between text-[10px]">
                          <span className="text-[#7A8089]">Owner Name:</span>
                          <span className="text-white font-bold">S***h D***k</span>
                        </div>
                        <div className="text-[10px] text-[#7A8089] text-center">
                          Consent-gated document sharing
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bullet Highlights */}
                  <div className="space-y-1.5 pt-1">
                    {pillar.highlights.map((h, i) => (
                      <div key={i} className="flex items-start gap-2 text-[12px] text-[#7A8089] leading-snug">
                        <span className="w-1 h-1 rounded-full bg-[#C5A46D] mt-1.5 shrink-0" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom capability footnote — no unearned "production active" claim. */}
                <div className="mt-5 pt-3 border-t border-[#23262A]/60 flex items-center gap-1.5 text-[11px] font-mono text-[#7A8089]">
                  <Icon name="Info" size={13} />
                  <span>Capability overview &bull; diagrams illustrative</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
