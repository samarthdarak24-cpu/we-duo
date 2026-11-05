import { Sidebar, MobileNav, type PromoProps } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AiAssistant } from "./AiAssistant";
import { adminNav, buyerNav, sellerNav } from "@/lib/seed";

export interface PortalProfile {
  name: string;
  role: string;
  avatarInitials: string;
}

const promos: Record<"buyer" | "seller" | "admin", PromoProps> = {
  buyer: { title: "Evidence before claims. Verify before you buy.", cta: "Verify a vehicle", ctaHref: "/buyer/verification" },
  seller: { title: "A complete record is the fastest route to a trusted listing.", cta: "Open verification", ctaHref: "/seller/verification" },
  admin: { title: "Review fairly. Record every decision.", cta: "Open queue", ctaHref: "/admin/queue" },
};

export function PortalShell({
  portal,
  activeLabel,
  profile,
  title,
  selector,
  unread,
  hideAssistant = false,
  children,
}: {
  portal: "buyer" | "seller" | "admin";
  activeLabel: string;
  profile: PortalProfile;
  title?: string;
  selector?: { label: string; sub: string };
  unread?: number;
  hideAssistant?: boolean;
  children: React.ReactNode;
}) {
  const nav = portal === "buyer" ? buyerNav : portal === "seller" ? sellerNav : adminNav;
  return (
    <div className="app-shell">
      <a
        href="#portal-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[#B99A60] focus:px-3 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-[#17191B]"
      >
        Skip to content
      </a>
      <Sidebar portal={portal} nav={nav} activeLabel={activeLabel} promo={promos[portal]} />
      <MobileNav nav={nav} activeLabel={activeLabel} />
      <div className="flex min-w-0 flex-col">
        <Topbar variant={portal} profile={profile} title={title} selector={selector} unread={unread} />
        <main id="portal-main" className="portal-canvas flex-1 min-w-0">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <div className="td-page">{children}</div>
          </div>
        </main>
      </div>
      {!hideAssistant && <AiAssistant />}
    </div>
  );
}
