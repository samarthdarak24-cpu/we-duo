"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTheme } from "./ThemeProvider";

type ToggleVariant = "nav" | "compact" | "labeled" | "floating";

/**
 * Day / Night switch. Every instance reads the same context, so the control
 * stays in sync no matter how many are mounted (desktop nav, mobile drawer,
 * dashboard top bar, auth screens, floating fallback).
 */
export function ThemeToggle({
  variant = "nav",
  className,
}: {
  variant?: ToggleVariant;
  className?: string;
}) {
  const { theme, mounted, toggleTheme } = useTheme();
  // First client render must match the server render exactly.
  const isNight = mounted && theme === "night";

  const container: Record<ToggleVariant, string> = {
    nav: "rounded-full border border-border bg-surface/70 px-2 py-1.5 backdrop-blur-md hover:border-primary/60 hover:bg-surface",
    compact:
      "rounded-full border border-border bg-surface/60 p-1.5 backdrop-blur-md hover:border-primary/60 hover:bg-surface",
    labeled:
      "rounded-full border border-border bg-surface/70 px-2.5 py-1.5 backdrop-blur-md hover:border-primary/60 hover:bg-surface",
    floating:
      "fixed right-4 top-4 z-[60] rounded-full border border-border bg-surface/90 px-2.5 py-2 shadow-lg shadow-black/30 backdrop-blur-md hover:border-primary/60",
  };

  return (
    <button
      type="button"
      data-theme-toggle
      onClick={toggleTheme}
      aria-pressed={isNight}
      aria-label={isNight ? "Switch to Day mode" : "Switch to Night mode"}
      title={isNight ? "Night mode — switch to Day" : "Day mode — switch to Night"}
      className={cn(
        "group inline-flex select-none items-center gap-2 font-sans outline-none transition-colors duration-300",
        "focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
        container[variant],
        className
      )}
    >
      <span className="relative flex h-7 w-[52px] shrink-0 items-center rounded-full border border-border bg-bg/70">
        {/* sliding highlight */}
        <span
          aria-hidden
          className={cn(
            "absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-primary shadow-[0_2px_8px_rgba(0,0,0,0.35)]",
            "transition-transform duration-300 ease-out-soft",
            isNight && "translate-x-6"
          )}
        />
        <span className="relative z-10 flex w-1/2 justify-center" aria-hidden>
          <Sun
            size={13}
            strokeWidth={2.2}
            className={cn(
              "transition-colors duration-300",
              isNight ? "text-muted" : "text-[var(--on-primary)]"
            )}
          />
        </span>
        <span className="relative z-10 flex w-1/2 justify-center" aria-hidden>
          <Moon
            size={13}
            strokeWidth={2.2}
            className={cn(
              "transition-colors duration-300",
              isNight ? "text-[var(--on-primary)]" : "text-muted"
            )}
          />
        </span>
      </span>

      {(variant === "labeled" || variant === "floating") && (
        <span className="pr-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted transition-colors group-hover:text-ink">
          {isNight ? "Night" : "Day"}
        </span>
      )}
    </button>
  );
}
