import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/** A settings section that a later phase builds: named, described, and marked with when it arrives. */
export function SectionCard({
  icon,
  title,
  description,
  soon,
  index,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  soon: string;
  index: number;
}) {
  return (
    <Card
      className="rise flex-row items-start gap-4 border-dashed bg-card/60 p-5 shadow-none"
      style={{ "--i": index } as React.CSSProperties}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold-soft text-gold [&_svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-xl font-semibold">{title}</h3>
          <Badge variant="soft">{soon}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </Card>
  );
}
