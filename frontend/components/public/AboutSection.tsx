import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export function AboutSection() {
  const stats = [
    { value: "9+", label: "Vehicles Live Cataloged", sub: "100% Database Seeded" },
    { value: "100%", label: "SHA-256 Hash Audited", sub: "Tamper-Evident Chain" },
    { value: "Zero", label: "Undisclosed Accidents", sub: "Strict Policy Rule" },
    { value: "3", label: "Dedicated Portals", sub: "Buyer / Seller / Admin" },
  ];

  return (
    <section id="about" className="py-24 bg-[#08090A] border-t border-[#23262A] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Editorial Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center mb-16">
          <div className="lg:col-span-6 space-y-6">
            <span className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#C5A46D] inline-block">
              Our Mission & Philosophy
            </span>
            <h2 className="font-display font-bold text-3xl sm:text-5xl text-white tracking-tight leading-[1.12]">
              Making Used-Car Decisions More Transparent.
            </h2>
            <p className="text-[15px] text-[#BFC3C8] leading-relaxed">
              TrustDrive was founded to dismantle the information asymmetry that has compromised the pre-owned vehicle industry for decades. We believe every buyer has the right to verified automotive truth, and every honest seller deserves a platform that rewards transparency.
            </p>
            <p className="text-[14px] text-[#7A8089] leading-relaxed">
              By coupling deterministic mathematical scoring with tamper-evident cryptographic hash chains, we replace biased dealer promises with hard, verifiable evidence.
            </p>

            <div className="pt-2 flex flex-wrap gap-3">
              <Link
                href="/about"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#17191C] border border-[#23262A] hover:border-[#C5A46D] text-[12px] font-semibold text-white transition-colors"
              >
                <span>Read Full Story</span>
                <Icon name="ArrowRight" size={14} />
              </Link>
              <Link
                href="/seller"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#C5A46D] hover:bg-[#D6B882] text-black text-[12px] font-bold uppercase tracking-wider transition-colors"
              >
                <span>Sell a Verified Car</span>
              </Link>
            </div>
          </div>

          {/* Visual Editorial Image */}
          <div className="lg:col-span-6 relative h-[420px] rounded-2xl overflow-hidden border border-[#23262A] shadow-2xl">
            <Image
              src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80"
              alt="TrustDrive Technology and Inspection Studio"
              fill
              unoptimized
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#08090A] via-transparent to-transparent opacity-80" />
            <div className="absolute bottom-6 left-6 right-6 p-4 rounded-xl bg-[#111315]/80 border border-[#23262A] backdrop-blur-md">
              <div className="text-[11px] font-mono text-[#C5A46D] uppercase tracking-wider">
                Automotive Truth Lab &bull; Established 2026
              </div>
              <div className="text-[13px] text-white font-medium mt-1">
                Engineering deterministic trust for cars and motorcycles across pre-owned marketplaces.
              </div>
            </div>
          </div>
        </div>

        {/* Real Statistics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-10 border-t border-[#23262A]">
          {stats.map((s) => (
            <div key={s.label} className="p-5 rounded-2xl bg-[#111315] border border-[#23262A] text-center">
              <div className="font-display font-extrabold text-3xl sm:text-4xl text-white font-mono">
                {s.value}
              </div>
              <div className="text-[13px] font-bold text-[#F5F5F5] mt-1.5">
                {s.label}
              </div>
              <div className="text-[11px] font-mono text-[#7A8089] mt-0.5">
                {s.sub}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
