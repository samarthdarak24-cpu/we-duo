import { VehiclePhoto } from "@/components/ui/VehiclePhoto";

export interface VehiclePickerItem {
  id: string;
  make: string;
  model: string;
  year?: number;
  regNo: string;
}

export function VehicleSelector({
  vehicles,
  selectedId,
  basePath,
  label = "Vehicle",
}: {
  vehicles: VehiclePickerItem[];
  selectedId: string;
  basePath: string;
  label?: string;
}) {
  if (vehicles.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-border bg-surface p-2.5">
      <span className="px-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">{label}</span>
      <div className="td-scroll flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {vehicles.map((v) => {
          const active = v.id === selectedId;
          return (
            <a
              key={v.id}
              href={`${basePath}?vehicle=${v.id}`}
              aria-current={active ? "true" : undefined}
              className={
                "flex shrink-0 items-center gap-2 rounded-[10px] border px-2.5 py-1.5 transition " +
                (active
                  ? "border-primary/45 bg-info-bg text-ink"
                  : "border-transparent bg-surface-tint text-muted hover:border-border hover:text-ink")
              }
            >
              <VehiclePhoto make={v.make} model={v.model} year={v.year} size={26} rounded={6} />
              <span className="text-[11.5px] font-semibold">
                {v.make} {v.model}
              </span>
              <span className="hidden text-[10.5px] text-muted sm:inline">{v.regNo}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
