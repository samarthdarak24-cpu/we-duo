"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Technology", href: "/technology" },
    { name: "Inspection", href: "/inspection" },
    { name: "Marketplace", href: "/marketplace" },
    { name: "Resources", href: "/resources" },
    { name: "About", href: "/about" },
  ];

  return (
    <header
      className={`theme-nav fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "glass-nav py-3.5 shadow-2xl shadow-black/80"
          : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 text-white tracking-wider no-underline group"
        >
          <div className="w-8 h-8 rounded-full border border-[#C5A46D]/60 flex items-center justify-center bg-[#17191C] group-hover:border-[#C5A46D] transition-colors shadow-[0_0_15px_rgba(197,164,109,0.2)]">
            <div className="w-3.5 h-3.5 rounded-full border border-[#C5A46D] flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-[#C5A46D]" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold text-[17px] tracking-[0.16em] uppercase text-white group-hover:text-[#F5F5F5] transition-colors">
              TRUST<span className="text-[#C5A46D]">DRIVE</span>
            </span>
            <span className="text-[9px] tracking-[0.24em] text-[#7A8089] uppercase font-mono -mt-1">
              Automotive Truth
            </span>
          </div>
        </Link>

        {/* Center Desktop Links */}
        <nav className="hidden md:flex items-center gap-7">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`text-[13px] tracking-[0.06em] font-medium uppercase transition-colors relative py-1 ${
                  isActive
                    ? "text-[#C5A46D]"
                    : "text-[#BFC3C8] hover:text-white"
                }`}
              >
                {link.name}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#C5A46D]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right CTA Buttons */}
        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle variant="nav" />
          <Link
            href="/login"
            className="text-[13px] tracking-wide font-medium text-[#BFC3C8] hover:text-white px-3.5 py-2 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center justify-center text-[12px] uppercase tracking-[0.12em] font-semibold bg-[#F5F5F5] hover:bg-[#FFFFFF] text-[#08090A] px-5 py-2.5 rounded-full transition-all duration-200 shadow-md hover:shadow-white/20 active:scale-95"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile: Day/Night switch + Hamburger */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle variant="compact" />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex items-center justify-center w-10 h-10 rounded-lg border border-[#23262A] text-[#BFC3C8] hover:text-white bg-[#111315]/80 focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            <Icon name={mobileOpen ? "X" : "Menu"} size={20} />
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileOpen && (
        <div className="md:hidden glass-nav border-t border-[#23262A] px-6 py-6 mt-3 flex flex-col gap-4 animate-fade-up">
          <div className="flex flex-col gap-3">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`text-[15px] font-medium uppercase tracking-wider py-1.5 ${
                    isActive ? "text-[#C5A46D]" : "text-[#BFC3C8]"
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </div>
          <div className="pt-4 border-t border-[#23262A] flex flex-col gap-2.5">
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="text-center text-[14px] font-medium text-[#BFC3C8] py-2 border border-[#23262A] rounded-lg bg-[#111315]"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              onClick={() => setMobileOpen(false)}
              className="text-center text-[13px] font-semibold uppercase tracking-wider text-[#08090A] py-2.5 rounded-full bg-[#F5F5F5]"
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
