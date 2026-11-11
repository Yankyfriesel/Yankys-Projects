"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DialogTitleBlock } from "@/components/dialog-parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";

export interface SecretInfo {
  email: string;
  temporaryPassword: string;
  /** Created a user, or reset a password. */
  reason: "created" | "reset";
  /** The sign-in details were also sent to the person by email. */
  emailed?: boolean;
}

/** Shows a temporary password once. It is never stored in clear, so closing the window loses it. */
export function SecretDialog({
  secret,
  onClose,
}: {
  secret: SecretInfo | null;
  onClose: () => void;
}) {
  const t = useTranslations("admin.password");
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(false);
  // The details were emailed: the password stays hidden unless someone wants to hand it over too.
  const emailed = secret?.reason === "created" && secret.emailed === true;

  function close() {
    setShown(false);
    onClose();
  }

  async function copy() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the password is selectable on screen.
    }
  }

  return (
    <Dialog
      open={secret !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {secret ? (
          <>
            <DialogTitleBlock
              icon={<KeyRound />}
              title={secret.reason === "created" ? t("createdTitle") : t("resetTitle")}
              description={
                emailed
                  ? t("emailedDescription", { email: secret.email })
                  : t("description", { email: secret.email })
              }
            />
            {emailed && !shown ? (
              <div className="space-y-3">
                <p data-testid="secret-emailed" className="text-sm text-success">
                  {t("emailSent", { email: secret.email })}
                </p>
                <p className="text-sm text-muted-foreground">{t("checkSpam")}</p>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="secret-show"
                  onClick={() => setShown(true)}
                >
                  {t("showPassword")}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-[0.18em] text-gold uppercase">
                  {t("temporary")}
                </p>
                <div className="flex items-center gap-2">
                  <code
                    dir="ltr"
                    className="flex-1 rounded-xl border border-gold/40 bg-gold-soft px-4 py-3 text-center font-mono text-2xl font-semibold tracking-widest select-all"
                  >
                    {secret.temporaryPassword}
                  </code>
                  <Button type="button" variant="outline" size="lg" onClick={copy}>
                    {copied ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Copy data-icon="inline-start" />
                    )}
                    {copied ? t("copied") : t("copy")}
                  </Button>
                </div>
                {secret.reason === "created" ? (
                  <p
                    data-testid="secret-emailed"
                    className={
                      secret.emailed ? "text-sm text-success" : "text-sm font-medium text-warning"
                    }
                  >
                    {secret.emailed
                      ? t("emailSent", { email: secret.email })
                      : t("emailNotSent", { email: secret.email })}
                  </p>
                ) : null}
                <p className="text-sm text-muted-foreground">{t("warning")}</p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" size="lg" onClick={close}>
                {emailed ? t("doneEmailed") : t("done")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
