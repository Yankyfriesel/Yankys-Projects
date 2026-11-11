"use client";

import { KeyRound, ShieldOff, Trash2, UserCheck, UserX, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { DialogTitleBlock } from "@/components/dialog-parts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import type { AdminErrorCode } from "./actions";

export type ConfirmKind = "reset" | "resetTwoFactor" | "disable" | "enable" | "delete";

const ICONS: Record<ConfirmKind, LucideIcon> = {
  reset: KeyRound,
  resetTwoFactor: ShieldOff,
  disable: UserX,
  enable: UserCheck,
  delete: Trash2,
};

/** One window for the four actions that need a second look. `run` returns an error code, or null on success. */
export function ConfirmDialog({
  kind,
  name,
  onClose,
  run,
}: {
  kind: ConfirmKind | null;
  name: string;
  onClose: () => void;
  run: (kind: ConfirmKind, force: boolean) => Promise<AdminErrorCode | null>;
}) {
  const t = useTranslations("admin");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<AdminErrorCode | null>(null);
  // A user with history: the person was warned and may still delete.
  const warned = error === "HAS_HISTORY";

  function close() {
    setError(null);
    onClose();
  }

  const Icon = kind ? ICONS[kind] : KeyRound;
  const destructive = kind === "delete" || kind === "disable";

  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {kind ? (
          <>
            <DialogTitleBlock
              icon={<Icon />}
              title={t(`confirm.${kind}.title`)}
              description={t(`confirm.${kind}.body`, { name })}
            />
            {error ? (
              <Alert variant="destructive" data-testid={warned ? "history-warning" : undefined}>
                <AlertDescription>
                  {warned ? t("confirm.delete.historyWarning", { name }) : t(`errors.${error}`)}
                </AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" onClick={close} disabled={pending}>
                {t("confirm.cancel")}
              </Button>
              <Button
                type="button"
                size="lg"
                variant={destructive ? "destructive" : "default"}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const failure = await run(kind, warned);
                    if (failure) setError(failure);
                    else close();
                  })
                }
              >
                {warned ? t("confirm.delete.anyway") : t(`confirm.${kind}.action`)}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
