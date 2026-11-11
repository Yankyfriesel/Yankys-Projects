"use client";

import { Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_BOX_WEIGHT_KG } from "@/lib/barcodes";

/** How long the weight must stay the same to count as stable. */
export const STABLE_AFTER_MS = 1000;

/** The weight typed or read, as a number, or null when it is empty or outside what a box can weigh. */
export function parseWeight(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  if (!Number.isFinite(value) || value <= 0 || value > MAX_BOX_WEIGHT_KG) return null;
  return Math.round(value * 100) / 100;
}

/** True once `text` has not changed for STABLE_AFTER_MS. */
export function useStable(text: string): boolean {
  const [stableText, setStableText] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setStableText(text), STABLE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [text]);
  return text !== "" && stableText === text;
}

/**
 * The scale until the real one is connected (phase 3): the weight is typed here, and shown
 * the way the live reading will be. The real scale replaces only this component.
 */
export function SimulatedScale({
  text,
  onChange,
  stable,
  inputRef,
  live = false,
  below,
}: {
  text: string;
  onChange: (text: string) => void;
  stable: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  /** True while the real scale is connected: the weight comes from it, so it is not typed. */
  live?: boolean;
  /** Shown right under the scale's display, before the box for typing the weight. */
  below?: React.ReactNode;
}) {
  const t = useTranslations("receiving.scale");
  const common = useTranslations("common");
  const weight = parseWeight(text);
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4 rounded-xl bg-sidebar px-5 py-4 text-sidebar-foreground shadow-sm">
        <div className="space-y-1">
          <p className="text-xs text-sidebar-foreground/70">{t("display")}</p>
          <span
            dir="ltr"
            data-testid="weight-display"
            className="block font-serif text-5xl font-semibold tabular-nums sm:text-6xl"
          >
            {weight === null ? "—" : weight.toFixed(2)}
            <span className="ms-2 text-2xl font-normal text-sidebar-foreground/70">
              {common("kg")}
            </span>
          </span>
        </div>
        <span
          data-testid="weight-state"
          className={
            stable && weight !== null
              ? "rounded-full bg-success px-2.5 py-0.5 text-xs font-semibold text-white"
              : "text-xs text-sidebar-foreground/70"
          }
        >
          {weight === null ? t("none") : stable ? t("stable") : t("settling")}
        </span>
      </div>
      {below}
      {live ? null : (
        <div className="space-y-1.5">
          <Label htmlFor="simulated-weight" className="flex items-center gap-1.5 text-sm">
            <Scale className="size-4" aria-hidden />
            {t("simulated")}
          </Label>
          <Input
            id="simulated-weight"
            ref={inputRef}
            dir="ltr"
            inputMode="decimal"
            autoComplete="off"
            placeholder="14.02"
            value={text}
            onChange={(event) => onChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("simulatedHint")}</p>
        </div>
      )}
    </div>
  );
}
