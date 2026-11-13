"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export function ReportShowcaseSection() {
  const [activeTab, setActiveTab] = useState<"summary" | "mileage" | "documents" | "chain">("summary");

  return (
    <section id="report" className="py-24 bg-[#08090A] border-t border-[#23262A] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl mb-14">
          <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
            Evidence-Backed Verification
          </span>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight">
            Every Finding Has a Source.
          </h2>
          <p className="mt-3 text-[14px] sm:text-[15px] text-[#7A8089] leading-relaxed">
            TrustDrive replaces vague seller claims with auditable evidence. Each data point is linked to an OCR-extracted document, service invoice, or tamper-evident cryptographic hash.
          </p>
        </div>

        {/* Report Preview Container */}
        <div className="rounded-2xl border border-[#23262A] bg-[#111315] overflow-hidden shadow-2xl">
          {/* Top Report Header Bar */}
          <div className="p-6 bg-[#17191C] border-b border-[#23262A] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg bg-[#08090A] border border-[#23262A] flex items-center justify-center text-[#C5A46D]">
                <Icon name="FileCheck" size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-bold text-lg text-white">
                    2021 BMW 3 Series 330i Sport
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#C5A46D]/15 text-[#C5A46D] border border-[#C5A46D]/30">
                    Sample Report
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#7A8089] mt-0.5">
                  VIN: WBA5R1C50KAK12345 &bull; Reg: MH01AB1234 &bull; Ref: RPT-2026-0001
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <a
                href="/api/v1/public/sample-report"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#111315] border border-[#23262A] hover:border-[#C5A46D] text-[12px] font-semibold text-white transition-colors"
              >
                <Icon name="Download" size={14} className="text-[#C5A46D]" />
                <span>Download sample PDF (demo)</span>
              </a>
              <Link
                href="/vehicle/v-bmw"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F5F5F5] hover:bg-white text-black text-[12px] font-semibold uppercase tracking-wider transition-all"
              >
                <span>Full Web Report</span>
                <Icon name="ArrowRight" size={13} />
              </Link>
            </div>
          </div>

          {/* Interactive Navigation Tabs */}
          <div className="px-6 pt-4 border-b border-[#23262A] flex items-center gap-6 overflow-x-auto">
            {[
              { id: "summary", label: "Executive Summary" },
              { id: "mileage", label: "Odometer Verification" },
              { id: "documents", label: "Extracted Documents" },
              { id: "chain", label: "SHA-256 Hash Chain" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`pb-3 text-[13px] font-medium transition-colors relative whitespace-nowrap ${
                  activeTab === tab.id
                    ? "text-[#C5A46D]"
                    : "text-[#7A8089] hover:text-[#BFC3C8]"
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#C5A46D]" />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content Area */}
          <div className="p-6 sm:p-8">
            {activeTab === "summary" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Trust Score Gauge Column */}
                <div className="lg:col-span-4 p-6 rounded-xl bg-[#0D0F11] border border-[#23262A] flex flex-col items-center justify-center text-center">
                  <div className="relative w-36 h-36 flex items-center justify-center mb-4">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        stroke="#1C1F23"
                        strokeWidth="8"
                        fill="none"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        stroke="#C5A46D"
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray="264"
                        strokeDashoffset="21" // ~92%
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-display font-extrabold text-3xl text-white">92</span>
                      <span className="text-[10px] text-[#7A8089] uppercase tracking-widest font-mono">
                        Score / 100
                      </span>
                    </div>
                  </div>
                  <h4 className="font-display font-bold text-base text-white">
                    Strong Verification
                  </h4>
                  <p className="mt-1 text-[11px] text-[#7A8089]">
                    Computed deterministically based on complete document records and consistent odometer progression.
                  </p>
                  <div className="mt-4 pt-4 border-t border-[#23262A] w-full grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <div className="text-[#7A8089]">Evidence Depth</div>
                      <div className="font-semibold text-[#F5F5F5]">85% Complete</div>
                    </div>
                    <div>
                      <div className="text-[#7A8089]">Open Disputes</div>
                      <div className="font-semibold text-[#36B982]">0 Active</div>
                    </div>
                  </div>
                </div>

                {/* Findings & Breakdown */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 rounded-xl bg-[#17191C] border border-[#23262A]">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-[#7A8089]">
                        Ownership
                      </span>
                      <div className="font-bold text-base text-white mt-1">Single Owner</div>
                      <div className="text-[11px] text-[#C5A46D] mt-0.5">Seller-declared</div>
                    </div>
                    <div className="p-4 rounded-xl bg-[#17191C] border border-[#23262A]">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-[#7A8089]">
                        Verified Mileage
                      </span>
                      <div className="font-bold text-base text-white mt-1">42,000 km</div>
                      <div className="text-[11px] text-[#36B982] mt-0.5">3 Logged Intervals</div>
                    </div>
                    <div className="p-4 rounded-xl bg-[#17191C] border border-[#23262A]">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-[#7A8089]">
                        Accident Check
                      </span>
                      <div className="font-bold text-base text-white mt-1">No Source Records</div>
                      <div className="text-[11px] text-[#7A8089] mt-0.5">In supported databases</div>
                    </div>
                  </div>

                  {/* AI & Human Review Summary Note */}
                  <div className="p-5 rounded-xl bg-[#17191C] border border-[#23262A] space-y-2">
                    <div className="flex items-center gap-2 text-[#C5A46D] text-[12px] font-semibold uppercase tracking-wider font-mono">
                      <Icon name="BrainCircuit" size={16} />
                      <span>Deterministic Intelligence Assessment</span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-[#BFC3C8]">
                      This illustrative example shows how an assessment reads: uploaded documents are checked for expiry dates, odometer readings are ordered chronologically, and document hashes are compared for duplicates within this platform's own stored records. No external or government database is queried unless a provider is configured; unconfigured checks are reported as unavailable, never as a clean result.
                    </p>
                    <div className="pt-2 flex items-center gap-4 text-[11px] text-[#7A8089]">
                      <span>Engine: Deterministic v2.4</span>
                      <span>Auditor: System / Admin Verified</span>
                      <span>Date: {new Date().toLocaleDateString("en-IN")}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "mileage" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#23262A]">
                  <div>
                    <h4 className="font-bold text-white text-[15px]">Chronological Odometer Entries</h4>
                    <p className="text-[12px] text-[#7A8089]">Every point validated against workshop service bills or statutory test receipts.</p>
                  </div>
                  <span className="text-[11px] font-mono text-[#36B982] bg-[#36B982]/10 px-2.5 py-1 rounded-full border border-[#36B982]/30">
                    Odometer Curve: Normal
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-[#23262A] text-[#7A8089] font-mono text-[11px] uppercase">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Logged Mileage</th>
                        <th className="py-2.5 px-3">Document Source</th>
                        <th className="py-2.5 px-3">Anomaly Detection</th>
                        <th className="py-2.5 px-3">Integrity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#23262A]/60">
                      <tr>
                        <td className="py-3 px-3 font-mono text-[#F5F5F5]">2026-02-15</td>
                        <td className="py-3 px-3 font-mono font-bold text-white">42,000 km</td>
                        <td className="py-3 px-3 text-[#BFC3C8]">Authorised BMW Workshop Invoice</td>
                        <td className="py-3 px-3 text-[#36B982] flex items-center gap-1">
                          <Icon name="CheckCircle2" size={13} />
                          <span>Consistent</span>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-[#C5A46D]">SHA-256 Verified</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-3 font-mono text-[#F5F5F5]">2024-06-10</td>
                        <td className="py-3 px-3 font-mono font-bold text-white">28,500 km</td>
                        <td className="py-3 px-3 text-[#BFC3C8]">Periodic Maintenance Inspection</td>
                        <td className="py-3 px-3 text-[#36B982] flex items-center gap-1">
                          <Icon name="CheckCircle2" size={13} />
                          <span>Consistent</span>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-[#C5A46D]">SHA-256 Verified</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-3 font-mono text-[#F5F5F5]">2022-09-01</td>
                        <td className="py-3 px-3 font-mono font-bold text-white">14,200 km</td>
                        <td className="py-3 px-3 text-[#BFC3C8]">First Annual Service Receipt</td>
                        <td className="py-3 px-3 text-[#36B982] flex items-center gap-1">
                          <Icon name="CheckCircle2" size={13} />
                          <span>Consistent</span>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-[#C5A46D]">SHA-256 Verified</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "documents" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  {
                    type: "Registration Certificate (RC)",
                    file: "v-bmw-rc.pdf",
                    status: "Verified",
                    hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                    extracted: "VIN & owner fields checked against stored vehicle record",
                  },
                  {
                    type: "Comprehensive Insurance",
                    file: "v-bmw-insurance.pdf",
                    status: "Verified",
                    hash: "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918",
                    extracted: "Zero-Depreciation Cover Active to 2027",
                  },
                  {
                    type: "Emission Certificate (PUC)",
                    file: "v-bmw-puc.pdf",
                    status: "Verified",
                    hash: "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
                    extracted: "CO2 Emissions within Euro 6 / BS6 standard",
                  },
                ].map((doc) => (
                  <div key={doc.type} className="p-4 rounded-xl bg-[#0D0F11] border border-[#23262A] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#7A8089]">
                          Document
                        </span>
                        <span className="text-[10px] font-semibold text-[#36B982] bg-[#36B982]/10 px-2 py-0.5 rounded">
                          {doc.status}
                        </span>
                      </div>
                      <h5 className="font-bold text-white text-[14px] mt-1.5">{doc.type}</h5>
                      <p className="text-[12px] text-[#BFC3C8] mt-1">{doc.extracted}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#23262A]">
                      <div className="text-[10px] font-mono text-[#7A8089]">SHA-256 Checksum:</div>
                      <div className="font-mono text-[9px] text-[#C5A46D] truncate mt-0.5">
                        {doc.hash}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "chain" && (
              <div className="p-5 rounded-xl bg-[#0D0F11] border border-[#23262A] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#23262A]">
                  <div className="flex items-center gap-2">
                    <Icon name="ShieldCheck" size={18} className="text-[#36B982]" />
                    <span className="font-bold text-white text-[14px]">Tamper-Evident SHA-256 Hash Chain</span>
                  </div>
                  <span className="text-[11px] font-mono text-[#36B982] bg-[#36B982]/10 px-2.5 py-0.5 rounded border border-[#36B982]/30">
                    Chain Integrity: 100% Intact
                  </span>
                </div>
                <p className="text-[12px] text-[#7A8089] leading-relaxed">
                  Every historical event, mileage update, and document upload produces a cryptographic hash linked to the previous block hash. Any retro-active alteration breaks subsequent block validations immediately.
                </p>
                <div className="space-y-2 font-mono text-[11px]">
                  <div className="p-3 rounded-lg bg-[#17191C] border border-[#23262A] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-white">Block #3: Odometer Inspection (42,000 km)</span>
                    <span className="text-[#C5A46D] text-[10px]">Prev: 9f8a... &bull; Hash: 4e21...</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#17191C] border border-[#23262A] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-white">Block #2: RC Document Verification</span>
                    <span className="text-[#C5A46D] text-[10px]">Prev: 1c33... &bull; Hash: 9f8a...</span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#17191C] border border-[#23262A] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-white">Block #1: Genesis Vehicle Registration</span>
                    <span className="text-[#C5A46D] text-[10px]">Genesis &bull; Hash: 1c33...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Footnote on Honesty */}
          <div className="p-4 bg-[#0D0F11] border-t border-[#23262A] text-center text-[11px] text-[#7A8089]">
            Illustrative sample only — values are not live results. No government or national vehicle registry is connected by default. Real reports are generated on demand from stored records and state their sources, limitations and verification status.
          </div>
        </div>
      </div>
    </section>
  );
}
