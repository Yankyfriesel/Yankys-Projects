"use client";

import { UserPlus, UserRoundPen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { DialogTitleBlock } from "@/components/dialog-parts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminUserRow } from "@/server/auth/admin-queries";
import { createUserAction, updateUserAction, type AdminErrorCode } from "./actions";
import { PermissionEditor } from "./permission-editor";

export interface UserDialogProps {
  /** Null creates a new user. */
  user: AdminUserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The actor may change permissions (admin.permissions). */
  canEditPermissions: boolean;
  /** Keys the actor may hand out; null for the owner (everything). */
  grantable: string[] | null;
  onCreated: (result: { email: string; temporaryPassword: string; emailed: boolean }) => void;
  onSaved: () => void;
}

/** Create or edit: details first, then the permission editor. Remounted per user so the fields start fresh. */
export function UserDialog(props: UserDialogProps) {
  const key = props.user?.id ?? "new";
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <UserDialogBody key={key} {...props} /> : null}
    </Dialog>
  );
}

function UserDialogBody({
  user,
  onOpenChange,
  canEditPermissions,
  grantable,
  onCreated,
  onSaved,
}: UserDialogProps) {
  const t = useTranslations("admin");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<AdminErrorCode | null>(null);

  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [jobTitle, setJobTitle] = useState(user?.jobTitle ?? "");
  const [locale, setLocale] = useState<"he" | "en">(user?.locale ?? "he");
  const [permissions, setPermissions] = useState<Set<string>>(new Set(user?.permissions ?? []));

  const editing = user !== null;
  const showPermissions = canEditPermissions && !user?.isOwner;
  const grantableSet = grantable === null ? null : new Set(grantable);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const profile = { name, displayName, jobTitle, locale };
      if (editing) {
        const result = await updateUserAction({
          id: user.id,
          ...profile,
          permissions: showPermissions ? Array.from(permissions) : undefined,
        });
        if (!result.ok) return setError(result.error);
        onSaved();
        onOpenChange(false);
      } else {
        const result = await createUserAction({
          ...profile,
          email,
          permissions: Array.from(permissions),
        });
        if (!result.ok) return setError(result.error);
        onOpenChange(false);
        onCreated({
          email: result.email,
          temporaryPassword: result.temporaryPassword,
          emailed: result.emailed,
        });
      }
    });
  }

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogTitleBlock
        icon={editing ? <UserRoundPen /> : <UserPlus />}
        title={editing ? t("form.editTitle", { name: user.displayName }) : t("form.createTitle")}
        description={editing ? t("form.editDescription") : t("form.createDescription")}
      />

      <form id="user-form" onSubmit={submit} className="space-y-6" noValidate>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="user-name">{t("form.name")}</Label>
            <Input
              id="user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-display">{t("form.displayName")}</Label>
            <Input
              id="user-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-email">{t("form.email")}</Label>
            <Input
              id="user-email"
              type="email"
              dir="ltr"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={editing}
              autoComplete="off"
              required
            />
            {editing ? null : (
              <p className="text-xs text-muted-foreground">{t("form.emailHint")}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-job">{t("form.jobTitle")}</Label>
            <Input
              id="user-job"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("form.language")}</Label>
            <div role="radiogroup" className="inline-flex rounded-lg bg-muted p-0.5">
              {(["he", "en"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={locale === option}
                  onClick={() => setLocale(option)}
                  className={
                    "h-9 rounded-md px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                    (locale === option
                      ? "bg-card text-foreground shadow-card"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {option === "he" ? "עברית" : "English"}
                </button>
              ))}
            </div>
          </div>
        </section>

        {showPermissions ? (
          <section className="space-y-3">
            <div>
              <h3 className="font-serif text-xl font-semibold">{t("permissions.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("permissions.intro")}</p>
              {grantableSet ? (
                <p className="mt-1 text-xs text-warning">{t("permissions.limited")}</p>
              ) : null}
            </div>
            <PermissionEditor
              value={permissions}
              onChange={setPermissions}
              grantable={grantableSet}
            />
          </section>
        ) : user?.isOwner ? (
          <p className="rounded-xl border border-gold/30 bg-gold-soft px-4 py-3 text-sm">
            {t("permissions.ownerNote")}
          </p>
        ) : null}
      </form>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          {t("confirm.cancel")}
        </Button>
        <Button type="submit" form="user-form" size="lg" disabled={pending}>
          {pending ? t("form.saving") : editing ? t("form.save") : t("form.create")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
