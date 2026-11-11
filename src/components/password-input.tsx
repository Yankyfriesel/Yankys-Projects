"use client";

import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password box with an eye at its start: while the eye is pressed and held (mouse, finger, or the
 * space or enter key) the password is shown, and it is hidden again the moment it is let go.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type">) {
  const t = useTranslations("auth.login");
  const [shown, setShown] = useState(false);
  const show = () => setShown(true);
  const hide = () => setShown(false);

  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className={cn("ps-11", className)} />
      <button
        type="button"
        aria-label={t("reveal")}
        title={t("reveal")}
        data-testid="reveal-password"
        onPointerDown={show}
        onPointerUp={hide}
        onPointerLeave={hide}
        onPointerCancel={hide}
        onBlur={hide}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            show();
          }
        }}
        onKeyUp={hide}
        // Keeps the cursor in the box, and stops a long press on a phone from opening a menu.
        onMouseDown={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
        className={cn(
          "absolute start-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          shown && "text-foreground",
        )}
      >
        <Eye className="size-4" aria-hidden />
      </button>
    </div>
  );
}
