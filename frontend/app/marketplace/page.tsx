import { getMarketplace } from "@/lib/server/data";
import { Navbar } from "@/components/public/Navbar";
import { Footer } from "@/components/public/Footer";
import { MarketplaceSection } from "@/components/public/MarketplaceSection";
import { Newsletter } from "@/components/public/Newsletter";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Verified Used Vehicle Marketplace — TrustDrive",
  description:
    "Browse real verified used cars backed by deterministic AI inspection scores, mileage history curves, and SHA-256 hash chains.",
};

export default function MarketplacePage() {
  const data = getMarketplace({}, undefined);
  const vehicles = (data?.items ?? []).filter(Boolean);

  return (
    <div className="min-h-screen bg-[#08090A] text-[#F5F5F5] font-sans selection:bg-[#C5A46D]/30 selection:text-white">
      <Navbar />

      <main className="pt-28">
        {/* Marketplace Banner */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-[#23262A]">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block mb-3">
                Verified Pre-Owned Inventory
              </span>
              <h1 className="font-display font-extrabold text-3xl sm:text-5xl text-white tracking-tight leading-tight">
                TrustDrive Marketplace.
              </h1>
              <p className="mt-2 text-[14px] sm:text-[16px] text-[#BFC3C8] max-w-2xl">
                Every listed vehicle includes an auditable inspection score, full document verification status, and recorded odometer history.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/seller/add-vehicle"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#C5A46D] hover:bg-[#D6B882] text-black text-[12px] font-bold uppercase tracking-wider transition-all"
              >
                <Icon name="CirclePlus" size={15} />
                <span>List Your Vehicle</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Live Marketplace Section */}
        <MarketplaceSection initialVehicles={vehicles as any} />

        <Newsletter />
      </main>

      <Footer />
    </div>
  );
}
