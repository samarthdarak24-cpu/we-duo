"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { isBikePhotoTarget, photoForMake, resolveVehiclePhoto } from "@/lib/vehicle-images";
import { Icon } from "./Icon";

export { photoForMake };

/**
 * Every vehicle gets a real photograph. Seller uploads always win; otherwise a
 * clearly-labelled representative demo photo is resolved from the shared
 * catalogue (`lib/vehicle-images.ts`). A blank gradient is only a last resort
 * when every image source failed to load (for example, fully offline).
 *
 * Honesty rules: demo photos carry a visible badge and say so in the alt text;
 * they are never presented as inspection evidence for the actual vehicle.
 */
const LOCAL_FALLBACKS = [
  "/images/cars/bmw-silver.jpg",
  "/images/cars/audi-sedan.jpg",
  "/images/cars/merc-luxury.jpg",
  "/images/cars/auth-luxury-car.jpg",
];

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
  id,
  make,
  model,
  year,
  category,
  src,
  className,
  imageClassName,
  aspect = "4 / 3",
  size,
  rounded = 14,
  showFallbackLabel = false,
  priority = false,
}: {
  id?: string | null;
  make?: string;
  model?: string;
  year?: number;
  category?: string | null;
  src?: string | null;
  className?: string;
  imageClassName?: string;
  aspect?: string;
  size?: number;
  rounded?: number;
  showFallbackLabel?: boolean;
  priority?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);

  const uploaded = src && src.trim() ? src : null;
  const isBike = isBikePhotoTarget({ id, make, model, category });

  // Remote demo photo first, bundled local photo as an offline safety net.
  // Bikes have no bundled photography, so they go straight to the honest
  // gradient if the remote image is unreachable.
  const candidates = useMemo(() => {
    if (uploaded) return [uploaded];
    const remote = resolveVehiclePhoto({ id, make, model, category });
    return isBike ? [remote] : [remote, ...LOCAL_FALLBACKS];
  }, [uploaded, id, make, model, category, isBike]);

  useEffect(() => setAttempt(0), [candidates]);

  const resolved = candidates[attempt] ?? null;
  const showImage = !!resolved;
  const isDemo = !uploaded && showImage;
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
          src={resolved}
          alt={`${year ? `${year} ` : ""}${make ?? ""} ${model ?? ""}${isDemo ? " — representative demo photograph, not a photo of this vehicle" : ""}`}
          loading={priority ? "eager" : "lazy"}
          className={cn("h-full w-full object-cover", imageClassName)}
          onError={() => setAttempt((n) => n + 1)}
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
      {isDemo && (
        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/45 px-2 py-0.5 text-[9.5px] font-medium text-white/90 backdrop-blur-sm">
          Demo photo
        </span>
      )}
    </div>
  );
}
