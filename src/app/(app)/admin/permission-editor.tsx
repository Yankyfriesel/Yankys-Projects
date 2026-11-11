"use client";

import { ChevronDown, Monitor, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SCREEN_ICONS } from "@/components/screen-icons";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  DEVICE_PERMISSIONS,
  SCREEN_KEYS,
  screenPermissions,
  viewPermission,
  type Permission,
  type ScreenKey,
} from "@/server/permissions/registry";

type Level = "none" | "view" | "full" | "custom";

function levelOf(selected: ReadonlySet<string>, screen: ScreenKey): Level {
  const all = screenPermissions(screen);
  const chosen = all.filter((p) => selected.has(p));
  if (chosen.length === 0) return "none";
  if (chosen.length === all.length) return "full";
  if (chosen.length === 1 && chosen[0] === viewPermission(screen)) return "view";
  return "custom";
}

const LEVELS: Exclude<Level, "custom">[] = ["none", "view", "full"];

/**
 * Per screen: no access, view only or everything, with the single actions one
 * click away. Ticking any action also ticks "view"; clearing "view" clears the
 * screen. `grantable` limits what can be switched on (null = everything).
 */
export function PermissionEditor({
  value,
  onChange,
  grantable,
}: {
  value: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  grantable: ReadonlySet<string> | null;
}) {
  const t = useTranslations("admin");
  const nav = useTranslations("nav");
  const [open, setOpen] = useState<ScreenKey | null>(null);
  const allowed = (p: Permission) => grantable === null || grantable.has(p);

  function setLevel(screen: ScreenKey, level: Exclude<Level, "custom">) {
    const next = new Set(value);
    for (const p of screenPermissions(screen)) next.delete(p);
    if (level === "view" && allowed(viewPermission(screen))) next.add(viewPermission(screen));
    if (level === "full") {
      for (const p of screenPermissions(screen)) if (allowed(p)) next.add(p);
    }
    onChange(next);
  }

  function toggle(screen: ScreenKey, permission: Permission, on: boolean) {
    const next = new Set(value);
    if (on) {
      next.add(permission);
      if (allowed(viewPermission(screen))) next.add(viewPermission(screen));
    } else if (permission === viewPermission(screen)) {
      for (const p of screenPermissions(screen)) next.delete(p);
    } else {
      next.delete(permission);
    }
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {SCREEN_KEYS.map((screen) => {
          const Icon = SCREEN_ICONS[screen];
          const level = levelOf(value, screen);
          const actions = screenPermissions(screen);
          const count = actions.filter((p) => value.has(p)).length;
          const expanded = open === screen;
          return (
            <li key={screen}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : screen)}
                  aria-expanded={expanded}
                  aria-label={t("permissions.details")}
                  className="flex min-w-0 basis-full items-center gap-3 rounded-lg text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-1 sm:basis-0"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold-soft text-gold [&_svg]:size-4">
                    <Icon />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{nav(screen)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {level === "custom"
                        ? t("permissions.allowed", { allowed: count, total: actions.length })
                        : t(`permissions.levels.${level}`)}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "ms-auto size-4 shrink-0 text-muted-foreground transition-transform",
                      expanded && "rotate-180",
                    )}
                  />
                </button>

                <div
                  role="radiogroup"
                  aria-label={nav(screen)}
                  className="flex w-full shrink-0 rounded-lg bg-muted p-0.5 sm:w-auto"
                >
                  {LEVELS.map((option) => {
                    const disabled = option !== "none" && !allowed(viewPermission(screen));
                    return (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={level === option}
                        disabled={disabled}
                        onClick={() => setLevel(screen, option)}
                        className={cn(
                          "h-9 flex-1 rounded-md px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:flex-none",
                          level === option
                            ? "bg-card text-foreground shadow-card"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t(`permissions.levels.${option}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {expanded ? (
                <div className="grid gap-x-6 gap-y-1 border-t border-dashed border-border bg-background/60 px-4 py-3 sm:grid-cols-2">
                  {actions.map((permission) => (
                    <label
                      key={permission}
                      className={cn(
                        "flex items-center gap-3 rounded-md py-1.5 text-sm",
                        allowed(permission) ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Checkbox
                        checked={value.has(permission)}
                        disabled={!allowed(permission)}
                        onCheckedChange={(checked) => toggle(screen, permission, checked === true)}
                      />
                      <span>{t(`perm.${permission}`)}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <p className="font-medium">{t("permissions.devices.title")}</p>
        <p className="mb-2 text-xs text-muted-foreground">{t("permissions.devices.hint")}</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {DEVICE_PERMISSIONS.map((permission) => {
            const Icon = permission === "device.desktop" ? Monitor : Smartphone;
            return (
              <label
                key={permission}
                className={cn(
                  "flex items-center gap-3 rounded-md py-1.5 text-sm",
                  allowed(permission) ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                )}
              >
                <Switch
                  checked={value.has(permission)}
                  disabled={!allowed(permission)}
                  onCheckedChange={(checked) => {
                    const next = new Set(value);
                    if (checked) next.add(permission);
                    else next.delete(permission);
                    onChange(next);
                  }}
                />
                <Icon className="size-4 text-gold" />
                <span>
                  {t(
                    `permissions.devices.${permission === "device.desktop" ? "desktop" : "phone"}`,
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
