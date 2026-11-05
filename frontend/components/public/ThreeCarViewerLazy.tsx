"use client";

import dynamic from "next/dynamic";
import { Icon } from "@/components/ui/Icon";

export const ThreeCarViewerLazy = dynamic(
  () => import("./ThreeCarViewer").then((mod) => mod.ThreeCarViewer),
  {
    ssr: false,
    loading: () => (
      <div className="theme-cinematic relative w-full h-[540px] rounded-xl overflow-hidden bg-[#08090A] border border-[#23262A] flex flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border border-[#C5A46D]/30 border-t-[#C5A46D] animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon name="Car" size={18} className="text-[#C5A46D]" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-[13px] font-semibold text-[#F5F5F5] uppercase tracking-widest">
            Initialising 3D Inspection Engine
          </p>
          <p className="text-[11px] text-[#7A8089] mt-1 font-mono">
            Loading metallic shaders & articulated component meshes...
          </p>
        </div>
      </div>
    ),
  }
);
