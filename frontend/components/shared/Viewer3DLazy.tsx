"use client";

import dynamic from "next/dynamic";

const Viewer3D = dynamic(() => import("./Viewer3D").then((m) => m.Viewer3D), {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] w-full items-center justify-center rounded-card bg-gradient-to-b from-white to-surface-tint">
      <div className="flex flex-col items-center gap-2 text-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-caption">Loading 3D viewer…</span>
      </div>
    </div>
  ),
});

export function Viewer3DLazy(props: {
  mode?: "buyer" | "seller";
  hotspots?: any[];
  height?: number;
}) {
  return <Viewer3D {...props} />;
}
