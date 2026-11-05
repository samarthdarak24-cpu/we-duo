"use client";

import dynamic from "next/dynamic";
import { Icon } from "@/components/ui/Icon";
import type { VehicleViewer3DProps } from "./VehicleViewer3D";

const VehicleViewer3D = dynamic(
  () => import("./VehicleViewer3D").then((mod) => mod.VehicleViewer3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[360px] w-full flex-col items-center justify-center rounded-[16px] border border-[#23262A] bg-[#0A0C0E] text-[#BFC3C8]">
        <div className="flex items-center gap-2.5 rounded-full border border-[#23262A] bg-[#111315]/90 px-4 py-2 text-[12px]">
          <Icon name="Loader2" size={16} className="animate-spin text-primary" />
          <span>Initializing 3D Inspection Studio…</span>
        </div>
      </div>
    ),
  }
);

export function VehicleViewer3DLazy(props: VehicleViewer3DProps) {
  return <VehicleViewer3D {...props} />;
}
