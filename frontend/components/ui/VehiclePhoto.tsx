"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

/**
 * Curated, licensed demo photography bundled with the repo. The mapping is by
 * manufacturer, so it is only shown for the makes it actually depicts. Every
 * other vehicle gets an explicit, non-misleading fallback that says the seller
 * has not supplied a photo yet.
 */
const PHOTOS: Record<string, string> = {
  bmw: "/images/cars/merc-luxury.jpg",
  mercedes: "/images/cars/auth-luxury-car.jpg",
  "mercedes-benz": "/images/cars/auth-luxury-car.jpg",
};

export function photoForMake(make?: string): string | null {
  if (!make) return null;
  return PHOTOS[make.trim().toLowerCase()] ?? null;
}

const GRADIENTS = [
  "linear-gradient(135deg,#F3ECDD 0%,#E5D7BE 55%,#D8C7A6 100%)",
  "linear-gradient(135deg,#F6F4EF 0%,#E9E3D7 55%,#DED4C2 100%)",
  "linear-gradient(135deg,#EFE8DB 0%,#E2D4BB 55%,#D3BE97 100%)",
];

function gradientFor(make?: string) {
  const code = (make || "V").trim().charCodeAt(0) || 65;
  return GRADIENTS[code % GRADIENTS.length];
}

export function VehiclePhoto({
  make,
  model,
  year,
  src,
  className,
  imageClassName,
  aspect = "4 / 3",
  size,
  rounded = 14,
  showFallbackLabel = false,
  priority = false,
}: {
  make?: string;
  model?: string;
  year?: number;
  src?: string | null;
  className?: string;
  imageClassName?: string;
  aspect?: string;
  size?: number;
  rounded?: number;
  showFallbackLabel?: boolean;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const resolved = src || photoForMake(make);
  const showImage = !!resolved && !failed;
  const isBike = /ducati|royal enfield|kawasaki|motorrad|bike/i.test(`${make ?? ""} ${model ?? ""}`);
  const monogram = (make || "V").trim().slice(0, 2).toUpperCase();

  return (
    <div
      className={cn("relative isolate overflow-hidden bg-surface-tint", className)}
      style={{
        width: size,
        height: size,
        aspectRatio: size ? undefined : aspect,
        borderRadius: rounded,
        background: showImage ? undefined : gradientFor(make),
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved!}
          alt={`${year ? `${year} ` : ""}${make ?? ""} ${model ?? ""}${src ? "" : " — representative demo photograph"}`}
          loading={priority ? "eager" : "lazy"}
          className={cn("h-full w-full object-cover", imageClassName)}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2 text-center">
          <Icon
            name={isBike ? "Bike" : "CarFront"}
            size={size ? Math.max(18, Math.round(size * 0.36)) : 34}
            className="text-[#17191B]/45"
            strokeWidth={1.5}
          />
          {(!size || size >= 64) && (
            <span className="text-[10.5px] font-semibold leading-tight text-[#17191B]/55">
              {monogram}
              {showFallbackLabel ? " · no photo" : ""}
            </span>
          )}
        </div>
      )}
      {showImage && !src && (
        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/45 px-2 py-0.5 text-[9.5px] font-medium text-white/90 backdrop-blur-sm">
          Demo photo
        </span>
      )}
    </div>
  );
}
