"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Safety net for screens that render no top navigation of their own
 * (404, QR verification, public vehicle report, printable report, ...).
 * If a page already mounts a toggle inside its nav, this renders nothing.
 */
export function GlobalThemeToggle() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (!cancelled) setShow(!document.querySelector("[data-theme-toggle]"));
    };

    // Effects run child-first, so in-nav toggles are already in the DOM here.
    check();
    const raf = requestAnimationFrame(() => requestAnimationFrame(check));
    // Client-side navigations can briefly keep the outgoing page mounted.
    const timer = setTimeout(check, 400);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [pathname]);

  if (!show) return null;
  return <ThemeToggle variant="floating" />;
}
