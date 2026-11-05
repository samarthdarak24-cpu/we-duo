import { Icon } from "@/components/ui/Icon";

export function EmptyState({
  icon = "Car",
  title,
  detail,
  action,
}: {
  icon?: string;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 p-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-tint text-primary">
        <Icon name={icon} size={24} />
      </span>
      <h3 className="text-card-title font-bold text-ink">{title}</h3>
      {detail && <p className="max-w-md text-body text-muted">{detail}</p>}
      {action}
    </div>
  );
}
