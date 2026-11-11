"use client";

import { Check, ChevronDown, Copy, KeyRound, PackageCheck, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  MAX_LABELS,
  MAX_PALLET_COPIES,
  ORDER_ALIASES,
  SHIPPING_UNITS,
  type ShippingUnit,
} from "@/lib/labels/shipping";
import {
  makeTestOrderAction,
  regenerateShippingKeyAction,
  saveShippingSettingsAction,
} from "./shipping-actions";

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 sm:w-72";

/** The names shown to the person who sets Priority up: the first few each detail may be sent under. */
const SHOWN_NAMES = 4;

const NAMED_DETAILS = [
  "orderNumber",
  "customerName",
  "customerNumber",
  "address",
  "city",
  "phone",
  "shipDate",
  "notes",
  "labelCount",
] as const;

const EXAMPLE = `{
  "ordname": "SO26000123",
  "cdes": "Customer name",
  "address": "15 Herzl St",
  "city": "Tiberias",
  "phone": "04-6712345",
  "curdate": "2026-11-09",
  "labels": 10
}`;

/**
 * Shipping labels, set up: the address Priority calls when an order is picked and confirmed, how
 * many labels a print starts with, and which layout prints. The address is a secret: the key in it
 * is the only thing that lets an order in, so it can be replaced at any time.
 */
export function ShippingCard({
  origin,
  token: initialToken,
  canEdit,
  defaultCount: initialCount,
  defaultUnit: initialUnit,
  palletCopies: initialCopies,
  layoutId: initialLayout,
  layouts,
  received,
  lastReceivedAt,
  index,
}: {
  origin: string;
  /** Null for people who may look but not change: the key is not shown to them. */
  token: string | null;
  canEdit: boolean;
  defaultCount: number;
  defaultUnit: ShippingUnit;
  palletCopies: number;
  layoutId: string;
  layouts: { id: string; name: string }[];
  received: number;
  lastReceivedAt: string | null;
  index: number;
}) {
  const t = useTranslations("settings.shippingCard");
  const errors = useTranslations("settings.shippingErrors");
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [confirmKey, setConfirmKey] = useState(false);
  const [count, setCount] = useState(String(initialCount));
  const [layoutId, setLayoutId] = useState(initialLayout);
  const [unit, setUnit] = useState<ShippingUnit>(initialUnit);
  const [open, setOpen] = useState(false);
  const [copies, setCopies] = useState(String(initialCopies));
  const [pending, startTransition] = useTransition();

  const url = token ? `${origin}/api/shipping-labels/${token}` : "";
  const countNumber = Number(count);
  const copiesNumber = Number(copies);
  const copiesValid =
    Number.isInteger(copiesNumber) && copiesNumber >= 1 && copiesNumber <= MAX_PALLET_COPIES;
  const countValid = Number.isInteger(countNumber) && countNumber >= 1 && countNumber <= MAX_LABELS;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  function save() {
    if (!countValid || !copiesValid) return;
    startTransition(async () => {
      const result = await saveShippingSettingsAction({
        defaultCount: countNumber,
        defaultUnit: unit,
        palletCopies: copiesNumber,
        layoutId,
      });
      if (!result.ok) return void toast.error(errors(result.error));
      toast.success(t("saved"));
    });
  }

  function newKey() {
    startTransition(async () => {
      const result = await regenerateShippingKeyAction();
      setConfirmKey(false);
      if (!result.ok) return void toast.error(errors(result.error));
      setToken(result.token);
      toast.success(t("keyChanged"), { duration: 10_000 });
    });
  }

  function testOrder() {
    startTransition(async () => {
      const result = await makeTestOrderAction();
      if (!result.ok) return void toast.error(errors(result.error));
      toast.success(t("testMade"));
    });
  }

  return (
    <Card
      role="region"
      aria-label={t("title")}
      className="rise gap-0 overflow-hidden p-0"
      style={{ "--i": index } as React.CSSProperties}
      data-testid="shipping-card"
    >
      <div className="space-y-4 px-5 py-4">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold-soft text-gold [&_svg]:size-5">
            <PackageCheck />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 className="font-serif text-2xl font-semibold">{t("title")}</h2>
            <p className="text-sm text-muted-foreground">{t("description")}</p>
          </div>
        </div>
        <Button
          type="button"
          variant={open ? "outline" : "default"}
          aria-expanded={open}
          aria-controls="shipping-settings"
          data-testid="shipping-toggle"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? t("close") : t("open")}
          <ChevronDown
            data-icon="inline-end"
            className={open ? "rotate-180 transition-transform" : "transition-transform"}
          />
        </Button>
      </div>

      {open ? (
        <div id="shipping-settings" className="border-t border-border">
          <div className="space-y-2 px-5 py-4">
            <label htmlFor="shipping-url" className="block font-medium">
              {t("urlLabel")}
            </label>
            {token ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="shipping-url"
                    data-testid="shipping-url"
                    readOnly
                    dir="ltr"
                    value={url}
                    className="h-11 min-w-0 flex-1 font-mono text-xs"
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <Button type="button" onClick={copy} data-testid="shipping-copy">
                    {copied ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Copy data-icon="inline-start" />
                    )}
                    {copied ? t("copied") : t("copy")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("urlHint")}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("urlHidden")}</p>
            )}
          </div>

          {canEdit && token ? (
            <div className="space-y-2 border-t border-border px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium">{t("keyTitle")}</p>
                  <p className="text-sm text-muted-foreground">{t("keyHint")}</p>
                </div>
                {confirmKey ? (
                  <div className="flex items-center gap-2">
                    <Button variant="destructive" onClick={newKey} disabled={pending}>
                      <KeyRound data-icon="inline-start" />
                      {t("keyConfirm")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmKey(false)}
                      disabled={pending}
                    >
                      {t("cancel")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setConfirmKey(true)}
                    data-testid="shipping-new-key"
                  >
                    <KeyRound data-icon="inline-start" />
                    {t("keyNew")}
                  </Button>
                )}
              </div>
              {confirmKey ? <p className="text-sm text-warning">{t("keyWarning")}</p> : null}
            </div>
          ) : null}

          <div className="space-y-3 border-t border-border px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <label htmlFor="shipping-layout" className="font-medium">
                {t("layoutLabel")}
              </label>
              <select
                id="shipping-layout"
                value={layoutId}
                disabled={!canEdit || pending}
                onChange={(event) => setLayoutId(event.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">{t("layoutFirst")}</option>
                {layouts.map((layout) => (
                  <option key={layout.id} value={layout.id}>
                    {layout.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <label htmlFor="shipping-unit" className="font-medium">
                {t("unitLabel")}
              </label>
              <select
                id="shipping-unit"
                data-testid="shipping-unit"
                value={unit}
                disabled={!canEdit || pending}
                onChange={(event) => setUnit(event.target.value as ShippingUnit)}
                className={SELECT_CLASS}
              >
                {SHIPPING_UNITS.map((option) => (
                  <option key={option} value={option}>
                    {t(`units.${option}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <label htmlFor="shipping-default-count" className="font-medium">
                {t("countLabel")}
              </label>
              <Input
                id="shipping-default-count"
                data-testid="shipping-default-count"
                type="number"
                min={1}
                max={MAX_LABELS}
                inputMode="numeric"
                dir="ltr"
                value={count}
                disabled={!canEdit || pending}
                className="h-10 w-28"
                onChange={(event) => setCount(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <label htmlFor="shipping-pallet-copies" className="font-medium">
                {t("copiesLabel")}
              </label>
              <Input
                id="shipping-pallet-copies"
                data-testid="shipping-pallet-copies"
                type="number"
                min={1}
                max={MAX_PALLET_COPIES}
                inputMode="numeric"
                dir="ltr"
                value={copies}
                disabled={!canEdit || pending}
                className="h-10 w-28"
                onChange={(event) => setCopies(event.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("countHint")}</p>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit ? (
                <Button
                  onClick={save}
                  disabled={pending || !countValid || !copiesValid}
                  data-testid="shipping-save"
                >
                  {t("save")}
                </Button>
              ) : null}
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/settings/labels" />}
              >
                <Tag data-icon="inline-start" />
                {t("designer")}
              </Button>
              {canEdit ? (
                <Button
                  variant="outline"
                  onClick={testOrder}
                  disabled={pending}
                  data-testid="shipping-test"
                >
                  {t("test")}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2 border-t border-border px-5 py-4">
            <p className="font-medium">{t("statusTitle")}</p>
            <p className="text-sm text-muted-foreground" data-testid="shipping-status">
              {received === 0
                ? t("statusNone")
                : t("statusSome", { count: received, when: lastReceivedAt ?? "" })}
            </p>
          </div>

          <details className="border-t border-border px-5 py-4">
            <summary className="cursor-pointer font-medium">{t("namesTitle")}</summary>
            <div className="mt-3 space-y-3 text-sm">
              <p className="text-muted-foreground">{t("namesIntro")}</p>
              <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[minmax(10rem,auto)_1fr]">
                {NAMED_DETAILS.map((key) => (
                  <div key={key} className="contents">
                    <dt className="font-medium">
                      {t(`names.${key}`)}
                      {key === "orderNumber" ? ` (${t("required")})` : ""}
                    </dt>
                    <dd dir="ltr" className="font-mono text-xs text-muted-foreground sm:text-start">
                      {ORDER_ALIASES[key]
                        .filter((name) => /^[a-z0-9]+$/.test(name))
                        .slice(0, SHOWN_NAMES)
                        .join(", ")}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-muted-foreground">{t("namesExample")}</p>
              <pre
                dir="ltr"
                className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs"
              >
                {EXAMPLE}
              </pre>
            </div>
          </details>
        </div>
      ) : null}
    </Card>
  );
}
