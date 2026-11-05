import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export function Footer() {
  return (
    <footer className="bg-[#08090A] border-t border-[#23262A] text-[#BFC3C8] pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-[#23262A]">
          {/* Brand Column */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="inline-flex items-center gap-2.5 text-white no-underline">
              <div className="w-8 h-8 rounded-full border border-[#C5A46D]/80 flex items-center justify-center bg-[#17191C]">
                <div className="w-3.5 h-3.5 rounded-full border border-[#C5A46D] flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#C5A46D]" />
                </div>
              </div>
              <span className="font-display font-bold text-[18px] tracking-[0.16em] uppercase text-white">
                TRUST<span className="text-[#C5A46D]">DRIVE</span>
              </span>
            </Link>
            <p className="text-[13px] leading-relaxed text-[#7A8089] max-w-sm">
              AI-powered vehicle intelligence, transparent history and evidence-backed inspection for confident used-car decisions.
            </p>
            <div className="text-[11px] leading-relaxed text-[#7A8089]/80 border-l border-[#C5A46D]/40 pl-3 italic">
              Every Car Has a Story. Discover the Truth.
            </div>
            <div className="pt-2 flex items-center gap-3 text-[#7A8089]">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#111315] border border-[#23262A] hover:text-[#C5A46D] transition-colors cursor-pointer">
                <Icon name="Share2" size={14} />
              </span>
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#111315] border border-[#23262A] hover:text-[#C5A46D] transition-colors cursor-pointer">
                <Icon name="Activity" size={14} />
              </span>
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#111315] border border-[#23262A] hover:text-[#C5A46D] transition-colors cursor-pointer">
                <Icon name="Building2" size={14} />
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <div>
            <h4 className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#F5F5F5] mb-4">
              Explore
            </h4>
            <ul className="space-y-2.5 text-[13px]">
              <li>
                <Link href="/" className="hover:text-[#C5A46D] transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/technology" className="hover:text-[#C5A46D] transition-colors">
                  Technology & AI
                </Link>
              </li>
              <li>
                <Link href="/inspection" className="hover:text-[#C5A46D] transition-colors">
                  3D Inspection Studio
                </Link>
              </li>
              <li>
                <Link href="/marketplace" className="hover:text-[#C5A46D] transition-colors">
                  Verified Marketplace
                </Link>
              </li>
              <li>
                <Link href="/resources" className="hover:text-[#C5A46D] transition-colors">
                  Resources & Insights
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-[#C5A46D] transition-colors">
                  About TrustDrive
                </Link>
              </li>
            </ul>
          </div>

          {/* Portals & Solutions */}
          <div>
            <h4 className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#F5F5F5] mb-4">
              Portals
            </h4>
            <ul className="space-y-2.5 text-[13px]">
              <li>
                <Link href="/seller" className="text-[#BFC3C8] hover:text-[#C5A46D] flex items-center gap-1.5 transition-colors">
                  <span>Seller Portal</span>
                  <span className="text-[10px] bg-[#17191C] border border-[#23262A] px-1.5 py-0.5 rounded text-[#C5A46D]">Live</span>
                </Link>
              </li>
              <li>
                <Link href="/buyer" className="text-[#BFC3C8] hover:text-[#C5A46D] flex items-center gap-1.5 transition-colors">
                  <span>Buyer Portal</span>
                  <span className="text-[10px] bg-[#17191C] border border-[#23262A] px-1.5 py-0.5 rounded text-[#36B982]">Live</span>
                </Link>
              </li>
              <li>
                <Link href="/admin/queue" className="text-[#7A8089] hover:text-[#BFC3C8] transition-colors">
                  Admin Verification Queue
                </Link>
              </li>
              <li>
                <Link href="/vehicle/v-bmw" className="text-[#7A8089] hover:text-[#BFC3C8] transition-colors">
                  Sample Vehicle Report
                </Link>
              </li>
              <li>
                <Link href="/verify/MH01AB1234" className="text-[#7A8089] hover:text-[#BFC3C8] transition-colors">
                  Public VIN Lookup
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal & Standards */}
          <div>
            <h4 className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#F5F5F5] mb-4">
              Trust & Integrity
            </h4>
            <ul className="space-y-2.5 text-[13px]">
              <li>
                <Link href="/faq" className="hover:text-[#C5A46D] transition-colors">
                  Frequently Asked Questions
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-[#C5A46D] transition-colors">
                  Contact Support
                </Link>
              </li>
              <li>
                <span className="text-[#7A8089]">Deterministic Trust Engine</span>
              </li>
              <li>
                <span className="text-[#7A8089]">SHA-256 Hash Auditing</span>
              </li>
              <li>
                <span className="text-[#7A8089]">Privacy & Consent Controls</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Integrity Notice & Copyright */}
        <div className="pt-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-[11px] text-[#7A8089]">
          <p className="max-w-2xl leading-relaxed">
            <strong className="text-[#BFC3C8]">Platform Integrity Notice:</strong> TrustDrive computes trust scores via a deterministic rules engine. SHA-256 cryptographic hashes ensure document tamper-evidence; they do not independently certify physical authenticity. Unchecked records are explicitly reported as &ldquo;no record found in supported sources&rdquo;.
          </p>
          <div className="flex items-center gap-4 text-[#7A8089] whitespace-nowrap">
            <span>&copy; {new Date().getFullYear()} TrustDrive Inc.</span>
            <span>All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
