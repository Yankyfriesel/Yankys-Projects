"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LogoMark } from "@/components/brand-logo";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SidebarContent, type NavItem, type ShellUser } from "./sidebar-content";

const COLLAPSE_COOKIE = "sidebar";

/**
 * The frame around every screen after login. Desktop (1024px and up): a fixed,
 * collapsible navy side menu at the reading start. Phone and tablet: a navy top
 * bar with a menu button that opens the same menu in a slide-in sheet.
 */
export function AppShell({
  items,
  user,
  company,
  defaultCollapsed,
  children,
}: {
  items: NavItem[];
  user: ShellUser;
  company: string;
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("shell");
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [sheetOpen, setSheetOpen] = useState(false);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    // Remembered per browser; the server reads it so the first paint is right.
    document.cookie = `${COLLAPSE_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <div className="flex min-h-dvh">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 transition-[width] duration-200 lg:block",
          collapsed ? "w-24" : "w-72",
        )}
      >
        <SidebarContent
          items={items}
          user={user}
          company={company}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex h-16 items-center gap-3 bg-sidebar px-4 text-white shadow-md lg:hidden">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={t("openMenu")}
            className="grid size-10 place-items-center rounded-xl text-white hover:bg-sidebar-accent"
          >
            <Menu className="size-6" />
          </button>
          <LogoMark className="size-9" />
          <span className="min-w-0 flex-1 truncate font-serif text-lg font-semibold">
            {company}
          </span>
        </div>

        <main className="mx-auto w-full max-w-[117rem] flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="start"
          showCloseButton={false}
          className="w-80 max-w-[85vw] border-0 bg-sidebar p-0"
        >
          <SheetTitle className="sr-only">{t("navigation")}</SheetTitle>
          <SheetDescription className="sr-only">{company}</SheetDescription>
          <SidebarContent
            items={items}
            user={user}
            company={company}
            onNavigate={() => setSheetOpen(false)}
            onClose={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
