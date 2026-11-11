"use client";

import { Hourglass } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { readLastActivity as readLast, writeLastActivity as writeLast } from "@/lib/idle";

/** Activity moves this far in time before it is written down again. */
const WRITE_EVERY_MS = 1000;
/** The warning appears this long before signing out (less for very short limits). */
const WARNING_MS = 60_000;

const EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;

/**
 * Signs the person out after `minutes` without touching the screen (a mouse move, a key press, a
 * scan, a touch). A minute before, a notice offers to stay signed in. 0 turns it off. The time of
 * the last activity is kept in the browser, so a page opened again after the time has passed (a
 * computer that slept, a browser opened again) signs out at once.
 */
export function IdleLogout({ minutes }: { minutes: number }) {
  const t = useTranslations("auth.idle");
  const router = useRouter();
  const limit = minutes * 60_000;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const last = useRef(0);
  const warned = useRef(false);
  const stayRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (minutes <= 0) return;
    let leaving = false;
    const warning = Math.min(WARNING_MS, limit / 2);

    async function leave() {
      if (leaving) return;
      leaving = true;
      try {
        await authClient.signOut();
      } finally {
        router.push("/login?reason=idle");
        router.refresh();
      }
    }

    function touch() {
      // While the notice is up only its own button keeps the session, so a stray movement does not.
      if (warned.current) return;
      const now = Date.now();
      if (now - last.current < WRITE_EVERY_MS) return;
      last.current = now;
      writeLast(now);
    }

    function stay() {
      warned.current = false;
      last.current = Date.now();
      writeLast(last.current);
      setSecondsLeft(null);
    }
    stayRef.current = stay;

    function check() {
      // Another tab of the system may have been used since: its time counts too.
      last.current = Math.max(last.current, readLast() ?? 0);
      const idle = Date.now() - last.current;
      if (idle >= limit) return void leave();
      if (idle >= limit - warning) {
        warned.current = true;
        setSecondsLeft(Math.max(1, Math.ceil((limit - idle) / 1000)));
      } else if (warned.current) {
        // Activity in another tab while the notice was up.
        warned.current = false;
        setSecondsLeft(null);
      }
    }

    const stored = readLast();
    last.current = stored ?? Date.now();
    if (stored === null) writeLast(last.current);
    check();

    for (const name of EVENTS) window.addEventListener(name, touch, { passive: true });
    const timer = window.setInterval(check, 1000);
    document.addEventListener("visibilitychange", check);
    return () => {
      for (const name of EVENTS) window.removeEventListener(name, touch);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [minutes, limit, router]);

  return (
    <Dialog open={secondsLeft !== null} onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} data-testid="idle-warning">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold-soft text-gold">
              <Hourglass className="size-5" aria-hidden />
            </span>
            <DialogTitle className="font-serif text-xl">{t("title")}</DialogTitle>
          </div>
          <DialogDescription>{t("body", { seconds: secondsLeft ?? 0 })}</DialogDescription>
        </DialogHeader>
        <Button type="button" autoFocus onClick={() => stayRef.current()}>
          {t("stay")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
