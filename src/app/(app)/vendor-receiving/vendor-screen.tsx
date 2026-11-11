"use client";

import { ScanLine, Volume2, VolumeX, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatDateTime, formatWeight } from "@/lib/i18n/format";
import {
  playScanSound,
  prepareSound,
  readSoundOn,
  saveSoundOn,
  subscribeSound,
} from "@/lib/scan-sounds";
import { receiveVendorBoxAction, type VendorErrorCode, type VendorResult } from "./actions";
import { VendorHistory, type VendorRow } from "./vendor-history";

/** A scan that was not recorded: refused by the system, or never able to reach it. */
interface Problem {
  id: number;
  barcode: string;
  kind: "refused" | "unreached";
  error?: VendorErrorCode;
  existing?: { receivedAt: string; receivedBy: string };
}

/**
 * Receiving vendor boxes as they are: scan the barcode the vendor printed, and the box is
 * saved and sent to Priority. No label is printed (the box has the vendor's own).
 *
 * Scans are taken without waiting: the scan box is never locked, and the scans wait in line and
 * are saved one after the other. Three sounds tell the result: recorded, refused, not received.
 */
export function VendorScreen({
  today,
  usingSavedCatalog,
}: {
  today: VendorRow[] | null;
  usingSavedCatalog: boolean;
}) {
  const t = useTranslations("vendor");
  const receiving = useTranslations("receiving");
  const [text, setText] = useState("");
  const [result, setResult] = useState<VendorResult | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [waiting, setWaiting] = useState(0);
  const soundOn = useSyncExternalStore(subscribeSound, readSoundOn, () => true);
  const input = useRef<HTMLInputElement>(null);
  const queue = useRef<string[]>([]);
  const running = useRef(false);
  const counter = useRef(0);

  function sound(kind: "saved" | "refused" | "unreached") {
    if (readSoundOn()) playScanSound(kind);
  }

  async function drain() {
    if (running.current) return;
    running.current = true;
    while (queue.current.length > 0) {
      const barcode = queue.current.shift() as string;
      setWaiting(queue.current.length + 1);
      let answer: VendorResult | null;
      try {
        answer = await receiveVendorBoxAction(barcode);
      } catch {
        answer = null; // the scan never reached the system
      }
      if (answer === null) {
        sound("unreached");
        setResult(null);
        setProblems((all) => [
          { id: ++counter.current, barcode, kind: "unreached" as const },
          ...all.slice(0, 19),
        ]);
      } else if (answer.ok) {
        sound("saved");
        setResult(answer);
      } else {
        sound("refused");
        setResult(answer);
        const failed = answer;
        setProblems((all) => [
          {
            id: ++counter.current,
            barcode,
            kind: "refused" as const,
            error: failed.error,
            existing: failed.existing,
          },
          ...all.slice(0, 19),
        ]);
      }
    }
    running.current = false;
    setWaiting(0);
  }

  function submit() {
    const scanned = text.trim();
    if (!scanned) return;
    setText("");
    queue.current.push(scanned);
    void drain();
  }

  function retry(problem: Problem) {
    setProblems((all) => all.filter((p) => p.id !== problem.id));
    queue.current.push(problem.barcode);
    void drain();
    input.current?.focus();
  }

  // The scanner types into whatever has the focus. After a click on a button (or on the page), the
  // focus is no longer in the scan box, and the scans would go nowhere: so any key that is typed
  // while the focus is not in a field goes into the scan box.
  useEffect(() => {
    function keep(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);
      if (typing || document.querySelector("[role=dialog]")) return;
      if (event.key.length === 1 || event.key === "Enter") input.current?.focus();
    }
    document.addEventListener("keydown", keep);
    return () => document.removeEventListener("keydown", keep);
  }, []);

  function toggleSound() {
    const next = !soundOn;
    saveSoundOn(next);
    if (next) playScanSound("saved");
    input.current?.focus();
  }

  function reason(problem: Problem): string {
    if (problem.kind === "unreached") return t("unreached");
    if (problem.error === "ALREADY_RECEIVED" && problem.existing)
      return t("alreadyReceived", {
        when: formatDateTime(problem.existing.receivedAt),
        by: problem.existing.receivedBy,
      });
    return receiving(`errors.${problem.error}` as never);
  }

  return (
    <div className="space-y-5">
      {usingSavedCatalog ? (
        <Alert>
          <AlertDescription>{receiving("savedCatalog")}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="space-y-4 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <ScanLine className="size-6" aria-hidden />
            </span>
            <div className="min-w-0 space-y-0.5">
              <h2 className="font-serif text-lg font-semibold">{t("scanTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("hint")}</p>
            </div>
          </div>
          <div className="flex w-full items-center gap-2 md:max-w-lg">
            <div className="relative min-w-0 flex-1">
              <Label htmlFor="vendor-scan" className="sr-only">
                {t("scanLabel")}
              </Label>
              <ScanLine
                aria-hidden
                className="pointer-events-none absolute end-3.5 top-1/2 size-5 -translate-y-1/2 text-primary"
              />
              <Input
                id="vendor-scan"
                ref={input}
                dir="ltr"
                autoFocus
                autoComplete="off"
                value={text}
                placeholder={t("scanPlaceholder")}
                className="h-12 border-primary/40 pe-11 text-base focus-visible:border-primary"
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  prepareSound();
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  submit();
                }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-12 shrink-0"
              data-testid="vendor-sound"
              aria-pressed={soundOn}
              aria-label={soundOn ? t("soundOn") : t("soundOff")}
              title={soundOn ? t("soundOn") : t("soundOff")}
              onClick={toggleSound}
            >
              {soundOn ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
            </Button>
          </div>
        </div>

        {waiting > 1 ? (
          <p className="text-sm text-muted-foreground" data-testid="vendor-waiting">
            {t("waiting", { count: waiting })}
          </p>
        ) : null}

        {result?.ok ? (
          <Alert role="status" data-testid="vendor-saved">
            <AlertDescription>
              {t("saved", {
                name: result.box.itemName,
                weight: formatWeight(result.box.weightKg),
                expiry: formatDate(result.box.expiryDate),
              })}
              {result.box.sent !== "sent" ? ` ${receiving("willSend")}` : ""}
            </AlertDescription>
          </Alert>
        ) : null}
        {result && !result.ok ? (
          <Alert variant="destructive" role="alert" data-testid="vendor-error">
            <AlertDescription>
              {result.error === "ALREADY_RECEIVED" && result.existing
                ? t("alreadyReceived", {
                    when: formatDateTime(result.existing.receivedAt),
                    by: result.existing.receivedBy,
                  })
                : receiving(`errors.${result.error}` as never)}
            </AlertDescription>
          </Alert>
        ) : null}

        {problems.length > 0 ? (
          <div className="space-y-2" data-testid="vendor-problems">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{t("problemsTitle")}</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setProblems([]);
                  input.current?.focus();
                }}
              >
                {t("problemsClear")}
              </Button>
            </div>
            <ul className="space-y-1.5">
              {problems.map((problem) => (
                <li
                  key={problem.id}
                  data-testid="vendor-problem"
                  data-kind={problem.kind}
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p dir="ltr" className="font-mono text-xs break-all text-foreground">
                      {problem.barcode}
                    </p>
                    <p className="text-destructive">{reason(problem)}</p>
                  </div>
                  {problem.kind === "unreached" ? (
                    <Button type="button" size="sm" onClick={() => retry(problem)}>
                      {t("retry")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    aria-label={t("dismiss")}
                    onClick={() => {
                      setProblems((all) => all.filter((p) => p.id !== problem.id));
                      input.current?.focus();
                    }}
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {today ? <VendorHistory rows={today} /> : null}
    </div>
  );
}
