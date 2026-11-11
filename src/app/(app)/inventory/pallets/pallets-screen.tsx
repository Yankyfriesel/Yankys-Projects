"use client";

import { Eye, Package, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { LabelPrintSheet, printLabelSheet } from "@/components/labels/label-print";
import { ScanBar } from "@/components/scan-bar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, formatDateTime, formatWeight } from "@/lib/i18n/format";
import type { PrintJobData } from "../../catalog/actions";
import {
  openPalletAction,
  palletLabelAction,
  type PalletActionError,
  type PalletViewData,
} from "./actions";

export interface RecentPallet {
  number: number;
  createdAt: string;
  createdBy: string;
  boxes: number;
  kg: number;
}

/**
 * Pallets: scan a pallet's QR code to see every box on it (with where each one is now, and which
 * are no longer in stock), and print the label of the latest pallets again.
 */
export function PalletsScreen({
  recent,
  warehouses,
}: {
  recent: RecentPallet[];
  warehouses: { code: string; name: string }[];
}) {
  const t = useTranslations("pallets");
  const detail = useTranslations("pallets.detail");
  const common = useTranslations("common");
  const [text, setText] = useState("");
  const [pallet, setPallet] = useState<PalletViewData | null>(null);
  const [error, setError] = useState<PalletActionError | null>(null);
  const [job, setJob] = useState<PrintJobData | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  // Once the label is on the page, open the print window for it.
  useEffect(() => {
    if (!job) return;
    printLabelSheet(job.widthMm, job.heightMm, () => setJob(null));
  }, [job]);

  useEffect(() => {
    if (!pending) input.current?.focus();
  }, [pending]);

  function open(value: string) {
    if (!value.trim()) return;
    startTransition(async () => {
      const result = await openPalletAction(value);
      setText("");
      if (!result.ok) {
        setPallet(null);
        return setError(result.error);
      }
      setError(null);
      setPallet(result.pallet);
    });
  }

  function printLabel(number: number) {
    startTransition(async () => {
      const result = await palletLabelAction(number);
      if (!result.ok) return setError(result.error);
      setError(null);
      setJob(result.job);
    });
  }

  return (
    <div className="space-y-5">
      <ScanBar
        id="pallet-scan"
        label={t("scan.label")}
        title={t("scan.title")}
        hint={t("scan.hint")}
        placeholder={t("scan.placeholder")}
        inputRef={input}
        disabled={pending}
        value={text}
        onChange={setText}
        onEnter={() => open(text)}
      >
        {error ? (
          <Alert variant="destructive" role="alert" data-testid="pallet-error">
            <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
          </Alert>
        ) : null}
      </ScanBar>

      {pallet ? (
        <PalletDetail
          pallet={pallet}
          warehouses={warehouses}
          busy={pending || job !== null}
          onPrint={() => printLabel(pallet.number)}
        />
      ) : null}

      <section className="space-y-3">
        <h2 className="font-serif text-xl font-semibold">{t("recent.title")}</h2>
        {recent.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center"
            data-testid="pallets-empty"
          >
            <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
              <Package className="size-5" />
            </span>
            <p className="text-muted-foreground">{t("recent.empty")}</p>
          </div>
        ) : (
          <ul
            className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3"
            data-testid="pallets-recent"
          >
            {recent.map((item) => (
              <li
                key={item.number}
                className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold-soft text-gold">
                    <Package className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="font-serif text-lg font-semibold">
                      {t("recent.pallet", { number: item.number })}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {detail("made", { date: formatDateTime(item.createdAt), by: item.createdBy })}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-muted/50 px-3 py-2">
                    <p
                      className="font-serif text-xl font-semibold tabular-nums"
                      data-testid="pallet-boxes"
                    >
                      {item.boxes}
                    </p>
                    <p className="text-xs text-muted-foreground">{t("stat.boxes")}</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 px-3 py-2">
                    <p className="font-serif text-xl font-semibold tabular-nums">
                      <span dir="ltr">{formatWeight(item.kg)}</span>{" "}
                      <span className="font-sans text-sm font-normal text-muted-foreground">
                        {common("kg")}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">{t("stat.weight")}</p>
                  </div>
                </div>
                <div className="mt-auto flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={pending}
                    onClick={() => open(String(item.number))}
                    aria-label={t("recent.openFor", { number: item.number })}
                  >
                    <Eye data-icon="inline-start" />
                    {t("recent.open")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={pending || job !== null}
                    onClick={() => printLabel(item.number)}
                    aria-label={t("recent.printFor", { number: item.number })}
                  >
                    <Printer data-icon="inline-start" />
                    {t("recent.print")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {job ? <LabelPrintSheet job={job} /> : null}
    </div>
  );
}

function PalletDetail({
  pallet,
  warehouses,
  busy,
  onPrint,
}: {
  pallet: PalletViewData;
  warehouses: { code: string; name: string }[];
  busy: boolean;
  onPrint: () => void;
}) {
  const t = useTranslations("pallets.detail");
  const common = useTranslations("common");
  const nameOf = (code: string) => warehouses.find((w) => w.code === code)?.name ?? code;
  const gone = pallet.boxes.filter((box) => !box.inStock).length;
  const kg = pallet.boxes.reduce((sum, box) => sum + Math.round(box.weightKg * 1000), 0) / 1000;

  return (
    <Card className="gap-0 overflow-hidden p-0" data-testid="pallet-detail">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl font-semibold">
            {t("title", { number: pallet.number })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("made", { date: formatDateTime(pallet.createdAt), by: pallet.createdBy })}
          </p>
          <p className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline">{t("boxes", { count: pallet.boxes.length })}</Badge>
            <Badge variant="outline">
              {formatWeight(kg)} {common("kg")}
            </Badge>
            {gone > 0 ? <Badge variant="warning">{t("gone", { count: gone })}</Badge> : null}
          </p>
        </div>
        <Button type="button" variant="outline" disabled={busy} onClick={onPrint}>
          <Printer data-icon="inline-start" />
          {t("print")}
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {pallet.boxes.map((box) => (
          <li
            key={box.barcode}
            data-in-stock={box.inStock}
            className={
              box.inStock
                ? "space-y-1 px-5 py-3"
                : "space-y-1 bg-muted/60 px-5 py-3 text-muted-foreground"
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p dir="auto" className="font-medium">
                {box.itemName}
              </p>
              {box.inStock ? null : <Badge variant="warning">{t("notInStock")}</Badge>}
            </div>
            <p dir="ltr" className="text-start font-mono text-xs break-all">
              {box.barcode}
            </p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span dir="ltr" className="tabular-nums">
                {formatWeight(box.weightKg)} {common("kg")}
              </span>
              {box.warehouseCode ? (
                <span dir="auto">{t("in", { warehouse: nameOf(box.warehouseCode) })}</span>
              ) : null}
              {box.expiryDate ? (
                <span dir="ltr" className="tabular-nums">
                  {t("expires", { date: formatDate(box.expiryDate) })}
                </span>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
