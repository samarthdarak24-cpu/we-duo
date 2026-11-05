"use client";

import type { Hotspot } from "@/lib/seed";
import { VehicleViewer3D, VehicleViewerMode, HotspotItem, DamageRecordItem } from "./VehicleViewer3D";

export type HotspotDamage = DamageRecordItem;
export type ViewerHotspot = Hotspot & {
  componentId?: string;
  damage?: HotspotDamage[];
  available?: boolean;
  unavailableReason?: string;
  explosionVector?: [number, number, number];
};

export interface Viewer3DProps {
  mode?: "buyer" | "seller";
  vehicleId?: string;
  hotspots?: ViewerHotspot[];
  height?: number | string;
  initialViewMode?: VehicleViewerMode;
  className?: string;
}

/**
 * TrustDrive Professional 3D Vehicle Damage Inspection Viewer
 * Powered by Three.js & Khronos CC BY 4.0 Executive Sedan GLB.
 * Supports Normal, Exploded, Damage, and X-Ray modes.
 */
export function Viewer3D({
  mode = "buyer",
  vehicleId,
  hotspots = [],
  height = 580,
  initialViewMode = "normal",
  className,
}: Viewer3DProps) {
  return (
    <VehicleViewer3D
      mode={mode}
      vehicleId={vehicleId}
      hotspots={hotspots as HotspotItem[]}
      height={height}
      initialViewMode={initialViewMode}
      className={className}
    />
  );
}
