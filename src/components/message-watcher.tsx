"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const EVERY = 45_000;

/**
 * For people who read the messages: looks now and then for a new one, and when one arrives shows
 * a notice with a button to open it, and refreshes the red number on the menu.
 */
export function MessageWatcher({ initialCount }: { initialCount: number }) {
  const t = useTranslations("contact");
  const router = useRouter();
  const last = useRef(initialCount);

  useEffect(() => {
    let stopped = false;
    async function check() {
      try {
        const response = await fetch("/api/messages/unread", { cache: "no-store" });
        if (!response.ok || stopped) return;
        const data = (await response.json()) as {
          count: number;
          latest: { from: string; kind: string; screen: string } | null;
        };
        if (stopped) return;
        if (data.count > last.current && data.latest) {
          toast(t("notice.title", { name: data.latest.from }), {
            description: t("notice.body", {
              kind: t(`message.kinds.${data.latest.kind}` as never),
              screen: t(`message.screens.${data.latest.screen}` as never),
            }),
            duration: 20_000,
            action: { label: t("notice.open"), onClick: () => router.push("/admin?tab=messages") },
          });
        }
        if (data.count !== last.current) {
          last.current = data.count;
          router.refresh();
        }
      } catch {
        // No connection for a moment: the next look tries again.
      }
    }
    const timer = setInterval(check, EVERY);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [router, t]);

  return null;
}
