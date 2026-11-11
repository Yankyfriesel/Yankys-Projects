import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Header for the centered pop-up windows: a accent-ringed icon beside the title
 * and an optional one-line description. Use inside DialogContent.
 */
export function DialogTitleBlock({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <DialogHeader className="flex-row items-center gap-4 pe-10">
      <span className="grid size-12 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold-soft text-gold [&_svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0 space-y-1">
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </div>
    </DialogHeader>
  );
}
