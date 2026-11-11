import Link from "next/link";
import { cn } from "@/lib/utils";

export interface SectionMenuItem {
  key: string;
  href: string;
  title: string;
  /** A few words under the title, shown on wide screens. */
  hint: string;
  icon: React.ReactNode;
}

/**
 * A screen split into parts: a menu at the side on wide screens (a 2-column grid of
 * buttons on a phone), and the open part next to it. Used by Settings and Admin.
 */
export function SectionLayout({
  label,
  items,
  current,
  children,
}: {
  label: string;
  items: SectionMenuItem[];
  current: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
      <nav
        aria-label={label}
        className="rise lg:sticky lg:top-6"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        <ul className="grid grid-cols-2 gap-2 lg:flex lg:flex-col lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-2 lg:shadow-sm">
          {items.map((item) => {
            const open = item.key === current;
            return (
              <li key={item.key} className="min-w-0">
                <Link
                  href={item.href}
                  aria-current={open ? "page" : undefined}
                  data-testid="section-link"
                  className={cn(
                    "flex h-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:gap-3 lg:border-transparent lg:px-3 lg:py-2.5",
                    open
                      ? "border-gold/50 bg-gold-soft text-foreground lg:border-gold/40"
                      : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground lg:bg-transparent",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full [&_svg]:size-4",
                      open
                        ? "border border-gold/40 bg-card text-gold"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block leading-tight font-semibold">{item.title}</span>
                    <span className="hidden text-xs text-muted-foreground lg:block">
                      {item.hint}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
