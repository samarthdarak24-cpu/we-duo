import { Navbar } from "@/components/public/Navbar";
import { Footer } from "@/components/public/Footer";
import { ThreeCarViewerLazy } from "@/components/public/ThreeCarViewerLazy";
import { Newsletter } from "@/components/public/Newsletter";
import { Icon } from "@/components/ui/Icon";
import Link from "next/link";

export const metadata = {
  title: "3D Vehicle Inspection Studio — TrustDrive",
  description:
    "Interactive Three.js 3D vehicle inspection with exploded-view component disassembly, panel hotspots, and damage evidence linkage.",
};

export default function InspectionPage() {
  return (
    <div className="min-h-screen bg-[#08090A] text-[#F5F5F5] font-sans selection:bg-[#C5A46D]/30 selection:text-white">
      <Navbar />

      <main className="pt-28">
        {/* Inspection Header */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-[#23262A]">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
                Spatial Diagnostic Studio
              </span>
              <h1 className="font-display font-extrabold text-3xl sm:text-5xl text-white tracking-tight leading-tight">
                3D Vehicle Inspection Studio.
              </h1>
              <p className="mt-2 text-[14px] sm:text-[16px] text-[#BFC3C8] max-w-2xl">
                Experience full 360-degree spatial inspection. Explode individual structural panels, inspect mechanical component conditions, and verify accident repair history.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/vehicle/v-bmw"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#F5F5F5] hover:bg-white text-black text-[12px] font-semibold uppercase tracking-wider transition-all"
              >
                <span>Inspect Live BMW 330i</span>
                <Icon name="ArrowRight" size={14} />
              </Link>
            </div>
          </div>

          {/* 3D Model Studio */}
          <div className="my-10">
            <ThreeCarViewerLazy />
          </div>

          {/* Panel Inspection Architecture Guide */}
          <div className="py-12 border-t border-[#23262A]">
            <h2 className="font-display font-bold text-2xl text-white mb-8">
              Component-Level Inspection Methodology
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-[#111315] border border-[#23262A] space-y-3">
                <div className="flex items-center justify-between text-[#C5A46D]">
                  <Icon name="Layers" size={20} />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#7A8089]">Zone 01</span>
                </div>
                <h3 className="font-display font-bold text-lg text-white">
                  Exterior Body & Shell
                </h3>
                <p className="text-[13px] text-[#7A8089] leading-relaxed">
                  Paint depth micrometer measurements, panel alignment gaps, clearcoat re-spray lines, and OEM spot weld integrity across hood, doors, roof, and trunk.
                </p>
                <div className="text-[11px] text-[#36B982] flex items-center gap-1 font-mono pt-2">
                  <Icon name="CheckCircle2" size={13} />
                  <span>Factory Spec Verified</span>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-[#111315] border border-[#23262A] space-y-3">
                <div className="flex items-center justify-between text-[#C5A46D]">
                  <Icon name="Wrench" size={20} />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#7A8089]">Zone 02</span>
                </div>
                <h3 className="font-display font-bold text-lg text-white">
                  Powertrain & Mechanicals
                </h3>
                <p className="text-[13px] text-[#7A8089] leading-relaxed">
                  Compression ratios, turbocharger boost pressures, cooling system radiator condition, transmission fluid cleanliness, and ECU OBD-II diagnostic fault logs.
                </p>
                <div className="text-[11px] text-[#36B982] flex items-center gap-1 font-mono pt-2">
                  <Icon name="CheckCircle2" size={13} />
                  <span>0 Diagnostic Trouble Codes</span>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-[#111315] border border-[#23262A] space-y-3">
                <div className="flex items-center justify-between text-[#C5A46D]">
                  <Icon name="ShieldAlert" size={20} />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#7A8089]">Zone 03</span>
                </div>
                <h3 className="font-display font-bold text-lg text-white">
                  Chassis & Structural Frame
                </h3>
                <p className="text-[13px] text-[#7A8089] leading-relaxed">
                  Sub-frame geometry, crumple zone crash impact sensors, suspension strut towers, and underbody floorpan corrosion or weld seam repairs.
                </p>
                <div className="text-[11px] text-[#36B982] flex items-center gap-1 font-mono pt-2">
                  <Icon name="CheckCircle2" size={13} />
                  <span>Structural Integrity Clean</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Newsletter />
      </main>

      <Footer />
    </div>
  );
}
