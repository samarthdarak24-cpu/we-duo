"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { BuyerProfile, SellerProfile } from "@/lib/seed";

function UserMenu({
  name,
  role,
  initials,
  base,
}: {
  name: string;
  role: string;
  initials: string;
  base: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-[11px] border border-transparent px-1.5 py-1.5 transition hover:border-[#2F353B] hover:bg-[#212529] [&::-webkit-details-marker]:hidden">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#B99A60]/40 bg-[#B99A60] text-[11px] font-bold text-[#17191B]">
          {initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[150px] truncate text-[13px] font-semibold text-[#F5F5F5]">{name}</span>
          <span className="block text-[10.5px] capitalize tracking-wide text-[#98A0A8]">{role}</span>
        </span>
        <Icon name="ChevronDown" size={14} className="text-[#98A0A8] transition group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-[12px] border border-[#333A41] bg-[#1B1E22] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
        <div className="px-2.5 py-2">
          <div className="truncate text-[13px] font-semibold text-[#F5F5F5]">{name}</div>
          <div className="text-[11px] text-[#98A0A8]">{role} · demo workspace</div>
        </div>
        <div className="my-1 h-px bg-[#2F353B]" />
        <Link href={`${base}/settings`} className="flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[12.5px] text-[#C9CFD5] hover:bg-[#252A2F] hover:text-white">
          <Icon name="Settings" size={15} /> Profile & settings
        </Link>
        <Link href={`${base}/notifications`} className="flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[12.5px] text-[#C9CFD5] hover:bg-[#252A2F] hover:text-white">
          <Icon name="Bell" size={15} /> Notifications
        </Link>
        <div className="my-1 h-px bg-[#2F353B]" />
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[12.5px] text-[#E6A7A2] hover:bg-[#2E1F1D] disabled:opacity-60"
        >
          <Icon name="LogOut" size={15} /> {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </details>
  );
}

function Bell({ href, unread }: { href: string; unread?: number }) {
  return (
    <Link
      href={href}
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative flex h-9 w-9 items-center justify-center rounded-[10px] border border-transparent text-[#C9CFD5] transition hover:border-[#2F353B] hover:bg-[#212529] hover:text-[#B99A60]"
    >
      <Icon name="Bell" size={18} />
      {unread ? (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#C44D43] px-1 text-[9.5px] font-bold text-white ring-2 ring-[#17191B]">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}

export function Topbar({
  variant,
  profile,
  title,
  selector,
  notificationsHref,
  settingsHref,
  unread,
}: {
  variant: "buyer" | "seller" | "admin";
  profile: BuyerProfile | SellerProfile;
  title?: string;
  selector?: { label: string; sub: string };
  notificationsHref?: string;
  settingsHref?: string;
  unread?: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const base = variant === "buyer" ? "/buyer" : variant === "seller" ? "/seller" : "/admin";

  return (
    <header className="theme-nav sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-[#2A2F35] bg-[#17191B]/92 px-4 backdrop-blur-xl md:px-6">
      {/* Mobile brand */}
      <Link href="/" className="flex items-center gap-2 md:hidden" aria-label="TrustDrive home">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#B99A60]/60">
          <span className="h-1.5 w-1.5 rounded-full bg-[#B99A60]" />
        </span>
        <span className="font-display text-[13px] font-bold tracking-[0.08em] text-[#F5F5F5]">
          TRUST<span className="text-[#B99A60]">DRIVE</span>
        </span>
      </Link>

      {variant === "buyer" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/buyer/search?q=${encodeURIComponent(q.trim())}`);
          }}
          className="relative hidden min-w-0 flex-1 max-w-[430px] md:block"
          role="search"
        >
          <Icon name="Search" size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7E8790]" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search registration, VIN or vehicle ID"
            aria-label="Search registration, VIN or vehicle ID"
            className="h-10 w-full rounded-[11px] border border-[#2F353B] bg-[#1E2126] pl-10 pr-16 text-[13px] text-[#F5F5F5] outline-none transition placeholder:text-[#7E8790] focus:border-[#B99A60] focus:ring-2 focus:ring-[#B99A60]/20"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-[#3A4148] px-1.5 py-0.5 text-[10px] font-medium text-[#7E8790] lg:block">
            Enter
          </span>
        </form>
      ) : (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#B99A60]/25 bg-[#B99A60]/10 text-[#B99A60] sm:flex">
            <Icon name="Car" size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8F979F]">
              <span>TrustDrive</span>
              <span className="text-[#5F676F]">/</span>
              <span className="text-[#B99A60]">{variant} workspace</span>
            </div>
            <h1 className="truncate font-display text-[14.5px] font-semibold leading-tight text-[#F5F5F5]">
              {title ?? "TrustDrive"}
            </h1>
            {selector && (
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10.5px] text-[#98A0A8]">
                <span className="truncate font-medium text-[#C9CFD5]">{selector.label}</span>
                <span aria-hidden>·</span>
                <span className="truncate">{selector.sub}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <span className="mr-1 hidden items-center gap-1.5 rounded-full border border-[#2F8B59]/25 bg-[#2F8B59]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#62C08D] xl:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2F8B59]" />
          Secure
        </span>
        <ThemeToggle variant="compact" />
        <Bell href={notificationsHref ?? `${base}/notifications`} unread={unread} />
        <div className="mx-1 hidden h-6 w-px bg-[#2F353B] sm:block" />
        <UserMenu name={profile.name} role={profile.role} initials={profile.avatarInitials} base={base} />
      </div>
    </header>
  );
}
