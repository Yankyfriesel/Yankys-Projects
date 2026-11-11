"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function SignOutButton({
  variant = "outline",
  size = "sm",
  tone = "light",
  iconOnly = false,
  className,
}: {
  variant?: "outline" | "ghost" | "secondary";
  size?: "sm" | "default";
  tone?: "light" | "sidebar";
  iconOnly?: boolean;
  className?: string;
}) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      await authClient.signOut();
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <Button
      variant={tone === "sidebar" ? "ghost" : variant}
      size={iconOnly ? "icon-sm" : size}
      onClick={onClick}
      disabled={pending}
      aria-label={t("signOut")}
      title={t("signOut")}
      className={cn(
        tone === "sidebar" &&
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        className,
      )}
    >
      <LogOut data-icon={iconOnly ? undefined : "inline-start"} className="rtl:-scale-x-100" />
      {iconOnly ? null : t("signOut")}
    </Button>
  );
}
