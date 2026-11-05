"use client";

import { VehicleViewer3D } from "@/components/shared/VehicleViewer3D";

export interface HotspotInfo {
  id: string;
  label: string;
  position: [number, number, number];
  component: string;
  status: "verified" | "warning" | "clean";
  severity: "None" | "Low" | "Moderate";
  description: string;
  repairStatus: string;
  evidenceDoc: string;
  verifiedAt: string;
}

const defaultHotspots = [
  {
    id: "bonnet",
    label: "Engine Hood & Cowl",
    componentId: "bonnet",
    position: [0, 0.72, 1.45] as [number, number, number],
    damage: [
      {
        id: "d-hood-demo",
        severity: "Minor",
        description: "Factory original panel. Paint depth measured at 112 µm, within OEM tolerance.",
        repairStatus: "Original factory finish",
        inspectionDate: "2026-03-12",
        status: "verified",
      },
    ],
  },
  {
    id: "front_bumper",
    label: "Front Bumper & Grille",
    componentId: "front_bumper",
    position: [0, 0.32, 2.15] as [number, number, number],
    damage: [
      {
        id: "d-bumper-demo",
        severity: "Minor",
        description: "Minor stone chipping on lower lip. Lower mounting clips inspected — structural bumper bar intact.",
        repairStatus: "Cosmetic touch-up completed",
        inspectionDate: "2026-02-18",
        status: "verified",
      },
    ],
  },
  {
    id: "front_left_door",
    label: "Driver Front Door",
    componentId: "front_left_door",
    position: [1.12, 0.65, 0.75] as [number, number, number],
    damage: [],
  },
  {
    id: "engine",
    label: "2.0L Turbo Powertrain",
    componentId: "engine",
    position: [0, 0.55, 1.3] as [number, number, number],
    damage: [
      {
        id: "d-eng-demo",
        severity: "Minor",
        description: "OBD-II scan reported 0 ECU trouble codes. Oil pressure nominal at 3.8 bar.",
        repairStatus: "Regular synthetic fluid service",
        inspectionDate: "2026-01-24",
        status: "verified",
      },
    ],
  },
  {
    id: "rear_bumper",
    label: "Rear Bumper & Sensors",
    componentId: "rear_bumper",
    position: [0, 0.38, -2.12] as [number, number, number],
    damage: [],
  },
  {
    id: "front_left_wheel",
    label: "19-inch Alloy & Disc Brakes",
    componentId: "front_left_wheel",
    position: [1.02, 0.38, 1.48] as [number, number, number],
    damage: [],
  },
];

export function ThreeCarViewer({
  className = "h-[640px]",
}: {
  className?: string;
}) {
  return (
    <VehicleViewer3D
      mode="buyer"
      hotspots={defaultHotspots}
      height="100%"
      initialViewMode="normal"
      className={className}
    />
  );
}
