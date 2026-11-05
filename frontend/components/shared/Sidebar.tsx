"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/seed";
import { Icon } from "@/components/ui/Icon";

export interface PromoProps {
  title: string;
  cta: string;
  ctaHref: string;
}

const STORAGE_KEY = "trustdrive.sidebar";

function isActive(pathname: string, href: string, portal: string) {
  const root = `/${portal}`;
  if (href === root) return pathname === root;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ portal }: { portal: string }) {
  return (
    <Link href="/" className="sidebar-brand group flex items-center gap-3 px-1" aria-label="TrustDrive home">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#B99A60]/50 bg-[#1E2124] shadow-[0_0_18px_rgba(185,154,96,0.16)] transition-colors group-hover:border-[#B99A60]">
        <div className="flex h-4 w-4 items-center justify-center rounded-full border border-[#B99A60]">
          <div className="h-1.5 w-1.5 rounded-full bg-[#B99A60]" />
        </div>
      </div>
      <div className="sidebar-brand-text leading-tight">
        <div className="font-display text-[15px] font-bold tracking-[0.08em] text-[#F5F5F5]">
          TRUST<span className="text-[#B99A60]">DRIVE</span>
        </div>
        <div className="mt-0.5 text-[10.5px] font-medium capitalize tracking-wide text-[#8F979F]">
          {portal} workspace
        </div>
      </div>
    </Link>
  );
}

export function Sidebar({
  portal,
  nav,
  activeLabel,
  promo,
}: {
  portal: "buyer" | "seller" | "admin";
  nav: NavItem[];
  activeLabel?: string;
  promo: PromoProps;
}) {
  const pathname = usePathname();
  const shellRef = useRef<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "collapsed") setCollapsed(true);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const shell = shellRef.current?.closest(".app-shell");
    shell?.setAttribute("data-sidebar", collapsed ? "collapsed" : "expanded");
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  }, [collapsed, ready]);

  // Split navigation into task groups without changing the source data.
  const accountLabels = new Set(["Profile & Settings", "Notifications", "Reports"]);
  const mainNav = nav.filter((n) => !accountLabels.has(n.label));
  const accountNav = nav.filter((n) => accountLabels.has(n.label));

  return (
    <aside
      ref={shellRef}
      className="theme-nav sidebar sticky top-0 hidden h-screen md:flex"
      aria-label={`${portal} navigation`}
    >
      <div className="flex h-full w-full flex-col border-r border-[#2A2F35] bg-[#17191B] px-3 py-5">
        <div className="mb-6 flex items-center justify-between">
          <Brand portal={portal} />
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="sidebar-toggle sidebar-toggle ml-auto hidden h-7 w-7 items-center justify-center rounded-md text-[#7E8790] transition hover:bg-[#24282D] hover:text-[#F5F5F5] min-[1181px]:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon name={collapsed ? "PanelLeftOpen" : "PanelLeftClose"} size={16} />
          </button>
        </div>

        <div className="nav-label mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#727B84]">
          Workspace
        </div>

        <nav className="td-scroll flex-1 space-y-0.5 overflow-y-auto pb-2">
          {mainNav.map((item) => {
            const active = isActive(pathname, item.href, portal);
            return (
              <Link
                key={item.label}
                href={item.href}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "sidebar-link group relative flex items-center gap-3 rounded-[10px] border px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150",
                  active
                    ? "border-[#B99A60]/25 bg-[#B99A60]/10 text-[#E9D6B4]"
                    : "border-transparent text-[#A6AEB6] hover:bg-[#212529] hover:text-[#F5F5F5]"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r bg-[#B99A60]" />
                )}
                <Icon
                  name={item.icon}
                  size={18}
                  strokeWidth={active ? 2.1 : 1.8}
                  className={cn("shrink-0", active ? "text-[#B99A60]" : "text-[#8F979F] group-hover:text-[#F5F5F5]")}
                />
                <span className="nav-label flex-1 truncate">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="sidebar-badge nav-label flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#B99A60] px-1.5 text-[10px] font-bold text-[#17191B]">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}

          {accountNav.length > 0 && (
            <>
              <div className="nav-label px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#727B84]">
                Account
              </div>
              {accountNav.map((item) => {
                const active = isActive(pathname, item.href, portal);
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "sidebar-link group relative flex items-center gap-3 rounded-[10px] border px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150",
                      active
                        ? "border-[#B99A60]/25 bg-[#B99A60]/10 text-[#E9D6B4]"
                        : "border-transparent text-[#A6AEB6] hover:bg-[#212529] hover:text-[#F5F5F5]"
                    )}
                  >
                    <Icon
                      name={item.icon}
                      size={18}
                      strokeWidth={active ? 2.1 : 1.8}
                      className={cn("shrink-0", active ? "text-[#B99A60]" : "text-[#8F979F] group-hover:text-[#F5F5F5]")}
                    />
                    <span className="nav-label flex-1 truncate">{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="sidebar-badge nav-label flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#B99A60] px-1.5 text-[10px] font-bold text-[#17191B]">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="sidebar-promo mt-3 rounded-[14px] border border-[#B99A60]/20 bg-[#1B1E22] p-4">
          <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-[9px] border border-[#B99A60]/30 bg-[#B99A60]/10">
            <Icon name="ShieldCheck" size={16} className="text-[#B99A60]" strokeWidth={2} />
          </div>
          <div className="font-display text-[12.5px] font-semibold leading-snug text-[#F5F5F5]">{promo.title}</div>
          <Link
            href={promo.ctaHref}
            className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] bg-[#B99A60] px-3 text-[11.5px] font-bold text-[#17191B] transition hover:bg-[#CBAE7E]"
          >
            {promo.cta}
            <Icon name="ChevronRight" size={13} strokeWidth={2.4} />
          </Link>
        </div>

        <div className="sidebar-footer-copy mt-3 flex items-center gap-2 px-1 text-[10px] text-[#6B727B]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2F8B59]" />
          Demo workspace · seeded data
        </div>
      </div>
    </aside>
  );
}

const SHORT_LABELS: Record<string, string> = {
  "Vehicle Verification": "Verify",
  "Vehicle History": "History",
  "Verification Center": "Verify",
  "AI Risk Analysis": "Risk",
  "AI Fraud Analysis": "Fraud",
  "Explore Vehicles": "Explore",
  "Search & Filters": "Search",
  "My Vehicles": "Vehicles",
  "Add Vehicle": "Add",
  "Marketplace Listings": "Listings",
  "Buyer Inquiries": "Inbox",
  "Compare Vehicles": "Compare",
  "Saved Vehicles": "Saved",
  "Profile & Settings": "Profile",
  "Review Queue": "Review",
  "Seller KYC": "KYC",
  "Users": "Users",
  "Audit Log": "Audit",
};

/** Mobile bottom tab bar (first 5 key items). */
export function MobileNav({ nav, activeLabel }: { nav: NavItem[]; activeLabel?: string }) {
  const pathname = usePathname();
  const items = nav.slice(0, 5);
  return (
    <nav
      aria-label="Primary navigation"
      className="theme-nav mobile-nav fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-[#2A2F35] bg-[#17191B]/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden"
    >
      {items.map((item) => {
        const active =
          item.href === pathname ||
          (item.href !== "/buyer" && item.href !== "/seller" && item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-w-[56px] flex-col items-center gap-1 rounded-lg py-0.5",
              active ? "text-[#B99A60]" : "text-[#98A0A8]"
            )}
          >
            <Icon name={item.icon} size={19} />
            {item.badge !== undefined && item.badge > 0 && (
              <span className="absolute right-2 top-0 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#C44D43] px-1 text-[10px] font-bold text-white">
                {item.badge}
              </span>
            )}
            <span className="text-[10px] font-medium">{SHORT_LABELS[item.label] ?? item.label.split(" ")[0]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
