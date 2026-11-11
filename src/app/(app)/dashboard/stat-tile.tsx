import { cn } from "@/lib/utils";

/** One number with a label and a accent-ringed icon. `tone` colours the icon for statuses. */
export function StatTile({
  icon,
  label,
  value,
  unit,
  tone = "gold",
  index,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  tone?: "gold" | "success" | "warning";
  index: number;
}) {
  const ring = {
    gold: "border-gold/40 bg-gold-soft text-gold",
    success: "border-success/25 bg-success-soft text-success",
    warning: "border-warning/30 bg-warning-soft text-warning",
  }[tone];

  return (
    <div
      className="rise flex items-center gap-4 rounded-2xl bg-card p-5 shadow-card ring-1 ring-border"
      style={{ "--i": index } as React.CSSProperties}
    >
      <span
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-full border [&_svg]:size-5",
          ring,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="font-serif text-3xl leading-tight font-semibold tabular-nums">
          {value}
          {unit ? (
            <span className="ms-1.5 font-sans text-sm font-medium text-muted-foreground">
              {unit}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
