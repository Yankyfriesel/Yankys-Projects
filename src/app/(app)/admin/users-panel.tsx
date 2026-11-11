"use client";

import {
  CircleCheck,
  Clock3,
  Crown,
  EllipsisVertical,
  KeyRound,
  ShieldOff,
  Monitor,
  Pencil,
  Smartphone,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  UserRoundX,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SCREEN_ICONS } from "@/components/screen-icons";
import { formatDateTime } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { AdminUserRow } from "@/server/auth/admin-queries";
import { SCREEN_KEYS, screenOf } from "@/server/permissions/registry";
import {
  deleteUserAction,
  resetPasswordAction,
  resetTwoFactorAction,
  setDisabledAction,
  type AdminErrorCode,
} from "./actions";
import { ConfirmDialog, type ConfirmKind } from "./confirm-dialog";
import { SecretDialog, type SecretInfo } from "./secret-dialog";
import { UserDialog } from "./user-dialog";

export interface AdminCapabilities {
  create: boolean;
  edit: boolean;
  permissions: boolean;
  disable: boolean;
  delete: boolean;
  reset: boolean;
}

type DialogState =
  | { type: "none" }
  | { type: "form"; user: AdminUserRow | null }
  | { type: "confirm"; kind: ConfirmKind; user: AdminUserRow };

function StatusBadges({ user }: { user: AdminUserRow }) {
  const t = useTranslations("admin.users.badges");
  return (
    <div className="flex flex-wrap gap-1.5">
      {user.isOwner ? (
        <Badge variant="soft">
          <Crown />
          {t("owner")}
        </Badge>
      ) : null}
      {user.isDisabled ? (
        <Badge variant="destructive">
          <UserRoundX />
          {t("disabled")}
        </Badge>
      ) : (
        <Badge variant="success">
          <CircleCheck />
          {t("active")}
        </Badge>
      )}
      {user.mustChangePassword ? (
        <Badge variant="warning">
          <KeyRound />
          {t("mustChange")}
        </Badge>
      ) : null}
    </div>
  );
}

/** The screens a person can open, and whether they may use a computer and a phone. */
function UserAccess({ user }: { user: AdminUserRow }) {
  const t = useTranslations("admin.users");
  const nav = useTranslations("nav");
  const screens = user.isOwner
    ? SCREEN_KEYS
    : SCREEN_KEYS.filter((screen) => user.permissions.some((p) => screenOf(p) === screen));
  const devices = [
    {
      key: "desktop",
      icon: Monitor,
      on: user.isOwner || user.permissions.includes("device.desktop"),
    },
    {
      key: "phone",
      icon: Smartphone,
      on: user.isOwner || user.permissions.includes("device.phone"),
    },
  ] as const;
  return (
    <div className="space-y-2.5 rounded-xl bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">
          {user.isOwner ? t("allScreens") : t("screens")}
        </p>
        <div className="flex items-center gap-1.5" data-testid="user-devices">
          {devices.map(({ key, icon: DeviceIcon, on }) => (
            <span
              key={key}
              data-on={on}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                on
                  ? "border-success/30 bg-success-soft text-success"
                  : "border-border text-muted-foreground line-through opacity-60",
              )}
            >
              <DeviceIcon className="size-3.5" aria-hidden />
              {t(key)}
            </span>
          ))}
        </div>
      </div>
      {screens.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noScreens")}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" data-testid="user-screens">
          {screens.map((screen) => {
            const ScreenIcon = SCREEN_ICONS[screen];
            return (
              <li
                key={screen}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-xs font-medium"
              >
                <ScreenIcon className="size-3.5 text-gold" aria-hidden />
                {nav(screen)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function UsersPanel({
  users,
  can,
  currentUserId,
  actorIsOwner,
  grantable,
}: {
  users: AdminUserRow[];
  can: AdminCapabilities;
  currentUserId: string;
  actorIsOwner: boolean;
  /** Keys the actor holds, or null for the owner. */
  grantable: string[] | null;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>({ type: "none" });
  const [secret, setSecret] = useState<SecretInfo | null>(null);

  async function runConfirmed(kind: ConfirmKind, force: boolean): Promise<AdminErrorCode | null> {
    if (dialog.type !== "confirm") return "GENERIC";
    const user = dialog.user;
    if (kind === "reset") {
      const result = await resetPasswordAction(user.id);
      if (!result.ok) return result.error;
      setSecret({
        email: user.email,
        temporaryPassword: result.temporaryPassword,
        reason: "reset",
      });
    } else if (kind === "resetTwoFactor") {
      const result = await resetTwoFactorAction(user.id);
      if (!result.ok) return result.error;
      toast.success(t("toast.twoFactorReset"));
    } else if (kind === "delete") {
      const result = await deleteUserAction(user.id, force);
      if (!result.ok) return result.error;
      toast.success(t("toast.deleted"));
    } else {
      const result = await setDisabledAction(user.id, kind === "disable");
      if (!result.ok) return result.error;
      toast.success(t(kind === "disable" ? "toast.disabled" : "toast.enabled"));
    }
    router.refresh();
    return null;
  }

  /** Which menu entries this row offers to this actor. */
  function entries(user: AdminUserRow) {
    const self = user.id === currentUserId;
    const protectedOwner = user.isOwner && !actorIsOwner;
    return {
      edit: (can.edit || can.permissions) && !protectedOwner,
      reset: can.reset && !self && !protectedOwner,
      toggle: can.disable && !user.isOwner && !self,
      delete: can.delete && !user.isOwner && !self,
    };
  }

  const confirmUser = dialog.type === "confirm" ? dialog.user : null;

  return (
    <>
      <Card className="rise gap-0 overflow-hidden p-0" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="font-serif text-2xl font-semibold">{t("users.title")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("users.count", { count: users.length })}
              {" · "}
              {t("users.subtitle")}
            </p>
          </div>
          {can.create ? (
            <Button size="lg" onClick={() => setDialog({ type: "form", user: null })}>
              <UserPlus data-icon="inline-start" />
              {t("users.new")}
            </Button>
          ) : null}
        </div>
      </Card>

      {users.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-muted-foreground">
          {t("users.empty")}
        </p>
      ) : (
        <ul className="grid auto-rows-fr gap-4 xl:grid-cols-2" aria-label={t("users.title")}>
          {users.map((user, i) => {
            const allowed = entries(user);
            const hasMenu = Object.values(allowed).some(Boolean);
            return (
              <li
                key={user.id}
                aria-label={user.displayName}
                data-testid="user-card"
                className={cn(
                  "rise flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card",
                  user.isDisabled && "opacity-70",
                )}
                style={{ "--i": 2 + i } as React.CSSProperties}
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-sidebar font-serif text-xl text-sidebar-primary">
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate font-serif text-lg font-semibold">{user.displayName}</p>
                    <p className="truncate text-sm text-muted-foreground">{user.jobTitle || "—"}</p>
                    <p dir="ltr" className="truncate text-start text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                  {hasMenu ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("users.menu.label", { name: user.displayName })}
                          />
                        }
                      >
                        <EllipsisVertical />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-52">
                        {allowed.edit ? (
                          <DropdownMenuItem onClick={() => setDialog({ type: "form", user })}>
                            <Pencil />
                            {t("users.menu.edit")}
                          </DropdownMenuItem>
                        ) : null}
                        {allowed.reset ? (
                          <DropdownMenuItem
                            onClick={() => setDialog({ type: "confirm", kind: "reset", user })}
                          >
                            <KeyRound />
                            {t("users.menu.reset")}
                          </DropdownMenuItem>
                        ) : null}
                        {allowed.reset && user.twoFactorEnabled ? (
                          <DropdownMenuItem
                            onClick={() =>
                              setDialog({ type: "confirm", kind: "resetTwoFactor", user })
                            }
                          >
                            <ShieldOff />
                            {t("users.menu.resetTwoFactor")}
                          </DropdownMenuItem>
                        ) : null}
                        {allowed.toggle ? (
                          <DropdownMenuItem
                            onClick={() =>
                              setDialog({
                                type: "confirm",
                                kind: user.isDisabled ? "enable" : "disable",
                                user,
                              })
                            }
                          >
                            {user.isDisabled ? <UserCheck /> : <UserX />}
                            {user.isDisabled ? t("users.menu.enable") : t("users.menu.disable")}
                          </DropdownMenuItem>
                        ) : null}
                        {allowed.delete ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDialog({ type: "confirm", kind: "delete", user })}
                            >
                              <Trash2 />
                              {t("users.menu.delete")}
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>

                <StatusBadges user={user} />

                <UserAccess user={user} />

                <p className="mt-auto flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                  <Clock3 className="size-3.5 shrink-0" aria-hidden />
                  {user.lastSeen ? (
                    <>
                      {t("users.columns.lastSeen")}:{" "}
                      <span dir="ltr" className="tabular-nums">
                        {formatDateTime(user.lastSeen)}
                      </span>
                    </>
                  ) : (
                    t("users.never")
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <UserDialog
        user={dialog.type === "form" ? dialog.user : null}
        open={dialog.type === "form"}
        onOpenChange={(open) => {
          if (!open) setDialog({ type: "none" });
        }}
        canEditPermissions={can.permissions}
        grantable={grantable}
        onCreated={(created) => {
          setSecret({ ...created, reason: "created" });
          router.refresh();
        }}
        onSaved={() => {
          toast.success(t("toast.saved"));
          router.refresh();
        }}
      />

      <ConfirmDialog
        kind={dialog.type === "confirm" ? dialog.kind : null}
        name={confirmUser?.displayName ?? ""}
        onClose={() => setDialog({ type: "none" })}
        run={runConfirmed}
      />

      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
    </>
  );
}
