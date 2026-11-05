import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-[var(--bg)] font-sans text-[var(--text)] selection:bg-[var(--primary)]/30 selection:text-white lg:grid-cols-2">
      <div className="theme-cinematic relative h-[320px] w-full select-none overflow-hidden bg-[var(--bg)] sm:h-[400px] lg:sticky lg:top-0 lg:h-screen">
        <Image
          src="/images/cars/auth-luxury-car.jpg"
          alt="TrustDrive luxury automotive inspection"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="scale-100 object-cover object-center brightness-95 contrast-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/40 to-[var(--bg)]/20" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-transparent via-transparent to-[var(--bg)]/70 lg:block" />
        <div className="absolute inset-0 bg-radial-vignette opacity-50" />
        <div className="pointer-events-none absolute -left-32 -top-32 h-[400px] w-[400px] rounded-full bg-[var(--primary)]/15 blur-[140px]" />
        <div className="pointer-events-none absolute -bottom-24 left-1/4 h-[300px] w-[500px] rounded-full bg-[var(--primary)]/10 blur-[130px]" />

        <div className="relative z-10 flex h-full w-full flex-col justify-between p-6 sm:p-10 lg:p-14">
          <Link href="/" className="group inline-flex w-fit items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--primary)]/70 bg-[var(--bg)]/80 shadow-[0_0_20px_rgba(185,154,96,0.25)] backdrop-blur-md transition-colors group-hover:border-[var(--primary)]">
              <div className="flex h-4 w-4 items-center justify-center rounded-full border border-[var(--primary)]">
                <div className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-display text-[17px] font-extrabold uppercase tracking-[0.2em] text-white">
                TRUST<span className="text-[var(--primary)]">DRIVE</span>
              </span>
              <span className="-mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.26em] text-[var(--muted)]">
                Automotive Truth
              </span>
            </div>
          </Link>

          <div className="max-w-lg space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--primary)]/40 bg-[var(--bg)]/80 px-3 py-1 font-mono text-[10.5px] uppercase tracking-widest text-[var(--primary)] backdrop-blur-md">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--success)]" />
              <span>Evidence-Backed Intelligence</span>
            </div>
            <h1 className="font-display text-3xl font-extrabold leading-[1.12] tracking-tight text-white drop-shadow-lg sm:text-4xl lg:text-5xl">
              Know the Car. <br />
              <span className="text-gold-gradient">Trust the Journey.</span>
            </h1>
            <p className="text-sm leading-relaxed text-[var(--muted)] drop-shadow-md sm:text-base">
              Account security is part of the evidence chain. Every session, reset and verification is signed and revocable.
            </p>
            <div className="flex items-center gap-3 border-t border-[var(--border)]/80 pt-2 font-mono text-[11px] text-[var(--muted)]">
              <span className="font-semibold text-[var(--primary)]">Transparency</span>
              <span>&bull;</span>
              <span className="font-semibold text-[var(--primary)]">Verification</span>
              <span>&bull;</span>
              <span className="font-semibold text-[var(--primary)]">Confidence</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex min-h-screen w-full flex-col justify-between overflow-y-auto bg-[var(--bg)] p-6 sm:p-10 lg:p-14">
        <div className="mx-auto flex w-full max-w-md items-center justify-between border-b border-[var(--border)]/60 pb-6">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-tint)] px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-[var(--muted)] transition-colors hover:text-[var(--primary)]"
          >
            <Icon name="ArrowLeft" size={14} />
            <span>Back to sign in</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-[11px] uppercase tracking-widest text-[var(--muted)] sm:inline">{eyebrow}</span>
            <ThemeToggle variant="labeled" />
          </div>
        </div>

        <div className="mx-auto my-auto w-full max-w-md space-y-6 py-8">
          <div className="space-y-1.5 text-left">
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{title}</h2>
            <p className="text-[13.5px] leading-relaxed text-[var(--muted)]">{subtitle}</p>
          </div>
          {children}
        </div>

        <div className="mx-auto w-full max-w-md border-t border-[var(--border)]/60 pt-6 text-center font-mono text-[11px] text-[var(--muted)]">
          {footer ?? (
            <>&copy; 2026 TrustDrive Inc. &bull; Signed sessions &bull; All rights reserved.</>
          )}
        </div>
      </div>
    </div>
  );
}
