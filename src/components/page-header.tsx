import { PageHelp, type HelpTopic } from "@/components/page-help";
import { cn } from "@/lib/utils";

/**
 * How every screen opens: a small accent label, the title in the serif face, a
 * one-line description, the screen's main actions at the far end, and a fine
 * rule with a diamond underneath. Mirrors by itself in Hebrew and English.
 */
export function PageHeader({
  icon,
  eyebrow,
  title,
  description,
  actions,
  help,
  className,
}: {
  icon?: React.ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** The page's help window: the round ? at the far corner. */
  help?: HelpTopic;
  className?: string;
}) {
  return (
    <header className={cn("rise", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          {icon ? (
            <span className="grid size-14 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold-soft text-gold [&_svg]:size-6">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="mb-1 text-[0.7rem] font-semibold tracking-[0.22em] text-gold uppercase">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-1.5 max-w-2xl text-[0.95rem] text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {actions || help ? (
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {help ? <PageHelp topic={help} /> : null}
          </div>
        ) : null}
      </div>
      <div className="mt-6 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-linear-to-r from-border to-border/0 rtl:bg-linear-to-l" />
        <span className="size-1.5 rotate-45 bg-gold/70" />
        <span className="h-px w-10 bg-border" />
      </div>
    </header>
  );
}
