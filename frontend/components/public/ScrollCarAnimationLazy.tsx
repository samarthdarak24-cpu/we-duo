"use client";

import dynamic from "next/dynamic";

export const ScrollCarAnimationLazy = dynamic(
  () => import("./ScrollCarAnimation").then((mod) => mod.ScrollCarAnimation),
  {
    ssr: false,
    loading: () => (
      <div className="theme-cinematic w-full h-screen bg-[#08090A] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border border-[#C5A46D]/30 border-t-[#C5A46D] animate-spin" />
      </div>
    ),
  }
);
