import { VehiclePhoto } from "./VehiclePhoto";

export function VehicleThumb({
  make,
  model,
  year,
  src,
  size = 56,
  className = "",
}: {
  make?: string;
  model?: string;
  year?: number;
  src?: string;
  size?: number;
  className?: string;
}) {
  return (
    <VehiclePhoto
      make={make}
      model={model}
      year={year}
      src={src}
      size={size}
      rounded={11}
      className={className}
    />
  );
}
