import { Navbar } from "@/components/public/Navbar";
import { Footer } from "@/components/public/Footer";
import { Viewer3DLazy } from "@/components/shared/Viewer3DLazy";
import { Newsletter } from "@/components/public/Newsletter";
import { Icon } from "@/components/ui/Icon";
import { getAllListings, getVehicle } from "@/lib/server/db";
import { hotspotsFor } from "@/lib/server/data";
import Link from "next/link";

export const metadata = {
  title: "3D Vehicle Inspection Studio — TrustDrive",
  description:
    "Interactive Three.js 3D vehicle inspection with exploded-view component disassembly, panel hotspots, and damage evidence linkage.",
};

const ZONE_GROUPS: {
  title: string;
  icon: "Layers" | "Wrench" | "ShieldAlert";
  zone: string;
  blurb: string;
  categories: string[];
}[] = [
  {
    title: "Exterior Body & Shell",
    icon: "Layers",
    zone: "Zone 01",
    blurb:
      "Paint depth micrometer measurements, panel alignment gaps, clearcoat re-spray lines, and OEM spot weld integrity across hood, doors, roof, and trunk.",
    categories: ["exterior_body", "closure", "glass", "lighting"],
  },
  {
    title: "Powertrain & Mechanicals",
    icon: "Wrench",
    zone: "Zone 02",
    blurb:
      "Compression ratios, turbocharger boost pressures, cooling system radiator condition, transmission fluid cleanliness, and ECU OBD-II diagnostic fault logs.",
    categories: ["powertrain", "wheels_brakes"],
  },
  {
    title: "Chassis & Structural Frame",
    icon: "ShieldAlert",
    zone: "Zone 03",
    blurb:
      "Sub-frame geometry, crumple zone crash impact sensors, suspension strut towers, and underbody floorpan corrosion or weld seam repairs.",
    categories: ["chassis_structure", "interior", "trim"],
  },
];

export default function InspectionPage() {
  const published = getAllListings().filter((l) => l.status === "published");
  const vehicle = published.length ? getVehicle(published[0].vehicle_id) : undefined;
  const hotspots = vehicle ? hotspotsFor(vehicle.id) : [];

  function zoneStat(categories: string[]) {
    const inZone = hotspots.filter(
      (h) => categories.includes((h as { category?: string }).category ?? "")
    );
    const records = inZone.reduce((n, h) => n + h.damage.length, 0);
    return { zones: inZone.length, records };
  }

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
                href={vehicle ? `/vehicle/${vehicle.id}` : "/buyer/explore"}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#F5F5F5] hover:bg-white text-black text-[12px] font-semibold uppercase tracking-wider transition-all"
              >
                <span>
                  {vehicle
                    ? `Inspect ${vehicle.year} ${vehicle.make} ${vehicle.model}`
                    : "Browse published vehicles"}
                </span>
                <Icon name="ArrowRight" size={14} />
              </Link>
            </div>
          </div>

          {/* 3D Model Studio — driven by the first published record */}
          <div className="my-10">
            {vehicle ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[11.5px] font-mono uppercase tracking-wider text-[#7A8089]">
                  <span className="rounded-full border border-[#C5A46D]/35 bg-[#C5A46D]/10 px-2.5 py-1 text-[#C5A46D]">
                    Live record · {vehicle.make} {vehicle.model} · {vehicle.reg_no}
                  </span>
                  <span>
                    {hotspots.reduce((n, h) => n + h.damage.length, 0)} damage record(s) across{" "}
                    {hotspots.filter((h) => h.damage.length).length} panel(s) — read from the shared
                    database for this workspace.
                  </span>
                </div>
                <Viewer3DLazy
                  mode="buyer"
                  vehicleId={vehicle.id}
                  hotspots={hotspots}
                  height={640}
                />
              </>
            ) : (
              <div className="rounded-2xl border border-[#23262A] bg-[#111315] p-8 text-center">
                <h3 className="font-display text-lg font-bold text-white">
                  Nothing published to inspect yet
                </h3>
                <p className="mx-auto mt-1.5 max-w-md text-[13px] text-[#9299A2]">
                  The studio renders real damage records from a published vehicle. Publish one from
                  the seller workspace and it will appear here.
                </p>
              </div>
            )}
          </div>

          {/* Panel Inspection Architecture Guide */}
          <div className="py-12 border-t border-[#23262A]">
            <h2 className="font-display font-bold text-2xl text-white mb-8">
              Component-Level Inspection Methodology
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {ZONE_GROUPS.map((zone) => {
                const stat = zoneStat(zone.categories);
                return (
                  <div
                    key={zone.zone}
                    className="p-6 rounded-2xl bg-[#111315] border border-[#23262A] space-y-3"
                  >
                    <div className="flex items-center justify-between text-[#C5A46D]">
                      <Icon name={zone.icon} size={20} />
                      <span className="text-[10px] font-mono uppercase tracking-widest text-[#7A8089]">
                        {zone.zone}
                      </span>
                    </div>
                    <h3 className="font-display font-bold text-lg text-white">{zone.title}</h3>
                    <p className="text-[13px] text-[#7A8089] leading-relaxed">{zone.blurb}</p>
                    <div className="pt-2 text-[11px] font-mono">
                      {vehicle ? (
                        stat.records > 0 ? (
                          <span className="flex items-center gap-1 text-[#C5A46D]">
                            <Icon name="FileSearch" size={13} />
                            <span>
                              {stat.records} record(s) on {stat.zones > 0 ? `${stat.zones} zone(s)` : "0 zones"}{" "}
                              for this vehicle
                            </span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[#9299A2]">
                            <Icon name="HelpCircle" size={13} />
                            <span>
                              {stat.zones} zone(s) — no records filed. Unverified, not proven clean.
                            </span>
                          </span>
                        )
                      ) : (
                        <span className="flex items-center gap-1 text-[#9299A2]">
                          <Icon name="Info" size={13} />
                          <span>Methodology only — no vehicle loaded</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <Newsletter />
      </main>

      <Footer />
    </div>
  );
}
