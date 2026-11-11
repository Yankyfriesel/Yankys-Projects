"use client";

import { ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoLight, LogoMark } from "@/components/brand-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SCREEN_ICONS } from "@/components/screen-icons";
import { SignOutButton } from "@/components/sign-out-button";
import { cn } from "@/lib/utils";
import type { ScreenKey } from "@/server/permissions/registry";

export interface NavItem {
  key: ScreenKey;
  href: string;
  label: string;
  group: "operations" | "system";
  /** A red number beside the item, for things that need attention. */
  badge?: number;
}

export interface ShellUser {
  displayName: string;
  /** Job title, or "Owner" for the owner. */
  subtitle: string;
}

const GROUPS = ["operations", "system"] as const;

/**
 * The dark side menu: the logo, the user's screens in two labelled
 * sections, and the user card with language and sign-out. Used as the fixed
 * desktop sidebar and inside the phone's slide-in sheet.
 */
export function SidebarContent({
  items,
  user,
  company,
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
  onClose,
}: {
  items: NavItem[];
  user: ShellUser;
  company: string;
  collapsed?: boolean;
  /** Desktop only: shows the round collapse handle on the menu's edge. */
  onToggleCollapsed?: () => void;
  /** Phone: called after a link is followed so the sheet can close. */
  onNavigate?: () => void;
  /** Phone: shows a close button in the header. */
  onClose?: () => void;
}) {
  const t = useTranslations("shell");
  const pathname = usePathname();
  const initial = Array.from(user.displayName.trim())[0]?.toUpperCase() ?? "?";

  return (
    <div className="relative flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center border-b border-sidebar-border",
          collapsed ? "h-24" : "px-8 pt-9 pb-7",
        )}
      >
        {collapsed ? <LogoMark /> : <LogoLight alt={company} className="w-44" />}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeMenu")}
            className="absolute end-3 top-3 grid size-9 place-items-center rounded-lg text-sidebar-muted hover:bg-sidebar-accent hover:text-white"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      <nav aria-label={t("navigation")} className="flex-1 overflow-y-auto px-3 py-6">
        {GROUPS.map((group, groupIndex) => {
          const groupItems = items.filter((item) => item.group === group);
          if (groupItems.length === 0) return null;
          return (
            <div key={group} className={cn(groupIndex > 0 && "mt-7")}>
              {collapsed ? (
                groupIndex > 0 ? (
                  <div className="mx-4 mb-4 h-px bg-sidebar-border" />
                ) : null
              ) : (
                <p className="mb-2 px-4 text-[0.68rem] font-semibold tracking-[0.2em] text-sidebar-primary/80 uppercase">
                  {t(`groups.${group}`)}
                </p>
              )}
              <div className="space-y-1">
                {groupItems.map((item) => {
                  const Icon = SCREEN_ICONS[item.key];
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group relative flex h-11 items-center gap-3.5 rounded-lg px-4 text-[0.95rem] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      {active ? (
                        <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-sidebar-primary" />
                      ) : null}
                      <Icon
                        className={cn(
                          "size-[1.15rem] shrink-0 transition-colors",
                          active
                            ? "text-sidebar-primary"
                            : "text-sidebar-muted group-hover:text-sidebar-primary",
                        )}
                      />
                      {collapsed ? (
                        <span className="sr-only">{item.label}</span>
                      ) : (
                        <span className="flex-1 truncate">{item.label}</span>
                      )}
                      {item.badge ? (
                        <span
                          data-testid={`nav-badge-${item.key}`}
                          aria-label={t("attention", { count: item.badge })}
                          className={cn(
                            "grid place-items-center rounded-full bg-destructive font-semibold text-white",
                            collapsed
                              ? "absolute end-2 top-1.5 size-2.5"
                              : "h-5 min-w-5 px-1.5 text-xs",
                          )}
                        >
                          {collapsed ? null : item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div
        className={cn(
          "shrink-0 border-t border-sidebar-border p-4",
          collapsed ? "flex flex-col items-center gap-3" : "flex items-center gap-3",
        )}
      >
        <Link
          href="/account"
          onClick={onNavigate}
          title={t("account")}
          aria-label={t("account")}
          className={cn(
            "flex min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            collapsed ? "" : "flex-1",
          )}
        >
          <span
            className="grid size-10 shrink-0 place-items-center rounded-full border border-sidebar-primary/50 bg-sidebar-accent font-serif text-lg text-sidebar-primary"
            title={collapsed ? user.displayName : undefined}
          >
            {initial}
          </span>
          {collapsed ? null : (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold text-sidebar-accent-foreground">
                {user.displayName}
              </span>
              {user.subtitle ? (
                <span className="block truncate text-xs text-sidebar-muted">{user.subtitle}</span>
              ) : null}
            </span>
          )}
        </Link>
        <div className={cn("flex items-center gap-0.5", collapsed && "flex-col")}>
          <LanguageSwitcher tone="sidebar" iconOnly />
          <SignOutButton tone="sidebar" iconOnly />
        </div>
      </div>

      {onToggleCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? t("expand") : t("collapse")}
          title={collapsed ? t("expand") : t("collapse")}
          className="absolute -end-3 top-12 z-10 grid size-6 place-items-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:bg-secondary"
        >
          <ChevronRight
            className={cn(
              "size-3.5 transition-transform",
              collapsed ? "rtl:rotate-180" : "ltr:rotate-180",
            )}
          />
        </button>
      ) : null}
    </div>
  );
}
