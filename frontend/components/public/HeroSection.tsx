"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export function HeroSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    }
  }, []);

  const togglePlayback = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  return (
    <section className="theme-cinematic relative w-full min-h-screen flex items-center justify-center bg-[#08090A] overflow-hidden pt-28 pb-20">
      {/* ================= BACKGROUND VIDEO ================= */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none">
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/frames/ezgif-frame-001.jpg"
          className="w-full h-full object-cover object-center opacity-75"
        >
          <source src="/videos/hero-car.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>

        {/* Cinematic Vignette & Gradient Overlays for Readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#08090A] via-[#08090A]/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#08090A]/90 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(8,9,10,0.15)_0%,_rgba(8,9,10,0.7)_100%)]" />

        {/* Ambient Champagne Floor Glow */}
        <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-[900px] h-[340px] bg-[#C5A46D]/15 blur-[160px] rounded-full pointer-events-none" />
      </div>

      {/* ================= HERO EDITORIAL CONTENT ================= */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
        {/* Small Eyebrow Label */}
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#111315]/85 border border-[#C5A46D]/35 backdrop-blur-md mb-8 shadow-lg shadow-black/40">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C5A46D] animate-ping" />
          <span className="text-[11px] font-mono uppercase tracking-[0.22em] text-[#C5A46D]">
            Intelligent Vehicle Verification
          </span>
        </div>

        {/* Main Display Heading */}
        <h1 className="font-display font-extrabold text-4xl sm:text-6xl lg:text-7xl text-white tracking-tight leading-[1.08] max-w-4xl drop-shadow-md">
          Every Car Has a Story. <br className="hidden sm:inline" />
          <span className="text-gold-gradient">Discover the Truth.</span>
        </h1>

        {/* Description */}
        <p className="mt-6 text-base sm:text-lg lg:text-xl text-[#BFC3C8] max-w-2xl leading-relaxed font-normal">
          AI-powered vehicle intelligence, transparent history, and evidence-backed inspection for confident used-car decisions.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <Link
            href="#marketplace"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-[#F5F5F5] hover:bg-white text-[#08090A] text-[13px] font-bold uppercase tracking-[0.14em] transition-all duration-200 shadow-xl shadow-white/5 active:scale-95"
          >
            <span>Explore Marketplace</span>
            <Icon name="ArrowRight" size={15} />
          </Link>
          <Link
            href="/vehicle/v-bmw"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-[#111315]/90 hover:bg-[#17191C] text-white text-[13px] font-semibold uppercase tracking-[0.14em] border border-[#23262A] hover:border-[#C5A46D]/60 transition-all duration-200 active:scale-95 backdrop-blur-md"
          >
            <span>Inspect Sample Car</span>
          </Link>
        </div>

        {/* Subtle Scroll Indicator */}
        <Link
          href="#problem"
          className="mt-16 flex flex-col items-center gap-2 text-[#7A8089] hover:text-[#C5A46D] transition-colors focus:outline-none"
          aria-label="Scroll to explore"
        >
          <span className="text-[10px] uppercase font-mono tracking-widest">Scroll to Explore</span>
          <div className="w-5 h-8 rounded-full border border-[#23262A] flex items-start justify-center p-1">
            <div className="w-1 h-2 rounded-full bg-[#C5A46D] animate-bounce" />
          </div>
        </Link>
      </div>

      {/* Subtle Video Play/Pause Toggle in bottom corner */}
      <button
        onClick={togglePlayback}
        type="button"
        className="absolute bottom-6 right-6 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#111315]/75 hover:bg-[#17191C] border border-[#23262A] text-[11px] font-mono text-[#BFC3C8] hover:text-white transition-colors backdrop-blur-md"
        aria-label={isPlaying ? "Pause video background" : "Play video background"}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? "bg-[#36B982]" : "bg-[#E7A83E]"}`} />
        <span>{isPlaying ? "Pause Background" : "Play Background"}</span>
      </button>
    </section>
  );
}
