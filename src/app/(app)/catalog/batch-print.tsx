"use client";

import { Printer, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { DialogTitleBlock } from "@/components/dialog-parts";
import { LabelPrintSheet, printLabelSheet } from "@/components/labels/label-print";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, todayIso } from "@/lib/i18n/format";
import {
  MAX_COPIES,
  MAX_ORIGIN_CHARS,
  checkItemLabelInput,
  itemLabelDates,
  type ItemLabelInput,
  type ItemLabelProblem,
} from "@/lib/labels/item-label";
import type { PriorityItem } from "@/server/priority/types";
import { prepareBatchLabelsAction, type BatchPrintJobData, type PrintErrorCode } from "./actions";
import { firstLayoutId, LayoutChooser, type PrintSettings } from "./print-dialog";

/** What is typed for one item; the dates and the copies stay text until they are checked. */
interface Row {
  slaughterDate: string;
  productionDate: string;
  certificateNo: string;
  origin: string;
  copies: string;
}

/** A new row; the country of origin starts as the item's own, when Priority has one. */
const emptyRow = (item: PriorityItem): Row => ({
  slaughterDate: "",
  productionDate: todayIso(),
  certificateNo: "",
  origin: item.origin ?? "",
  copies: "1",
});

const asInput = (row: Row): ItemLabelInput => ({
  slaughterDate: row.slaughterDate,
  productionDate: row.productionDate,
  certificateNo: row.certificateNo.trim(),
  origin: row.origin.trim(),
  copies: Number(row.copies),
});

/**
 * Printing the labels of several items together: one label type for all of them (a print job
 * has one paper size), and for each item its own dates, certificate number and copies. The print
 * has an empty label between one item and the next. Everything is checked again on the server.
 */
export function BatchPrintDialog({
  items,
  settings,
  onRemove,
  onClose,
  onDone,
}: {
  /** The chosen items in the order they print; null while the window is closed. */
  items: PriorityItem[] | null;
  settings: PrintSettings;
  /** Takes an item out of this print (and out of the choice). */
  onRemove: (itemNumber: string) => void;
  onClose: () => void;
  /** After the print window has closed. */
  onDone: () => void;
}) {
  return (
    <Dialog open={items !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {items ? (
          <BatchForm
            items={items}
            settings={settings}
            onRemove={onRemove}
            onCancel={onClose}
            onDone={onDone}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BatchForm({
  items,
  settings,
  onRemove,
  onCancel,
  onDone,
}: {
  items: PriorityItem[];
  settings: PrintSettings;
  onRemove: (itemNumber: string) => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("catalog.batch");
  const print = useTranslations("catalog.print");
  const [pending, startTransition] = useTransition();
  // With several label types nothing is chosen yet: the person picks one for every print.
  const [layoutId, setLayoutId] = useState(() => firstLayoutId(settings));
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<{ error: PrintErrorCode; item?: string } | null>(null);
  const [job, setJob] = useState<BatchPrintJobData | null>(null);

  const rowOf = (item: PriorityItem): Row => rows[item.itemNumber] ?? emptyRow(item);
  function change(item: PriorityItem, patch: Partial<Row>) {
    setRows((current) => ({ ...current, [item.itemNumber]: { ...rowOf(item), ...patch } }));
  }

  const layout = settings.layouts.find((l) => l.id === layoutId) ?? null;
  const problems = new Map(
    items.map((item) => [
      item.itemNumber,
      checkItemLabelInput(asInput(rowOf(item)), { originRequired: true }),
    ]),
  );
  const complete = [...problems.values()].every((list) => list.length === 0);
  const labels = items.reduce((sum, item) => {
    const copies = Number(rowOf(item).copies);
    return sum + (Number.isInteger(copies) && copies > 0 ? copies : 0);
  }, 0);
  const blanks = Math.max(0, items.length - 1);

  // Once the server has agreed, the labels are on the page: open the print window for them.
  useEffect(() => {
    if (!job) return;
    printLabelSheet(job.widthMm, job.heightMm, () => {
      setJob(null);
      onDone();
    });
  }, [job, onDone]);

  function submit() {
    setSubmitted(true);
    setFailure(null);
    if (!complete || !layout || items.length === 0) return;
    startTransition(async () => {
      const result = await prepareBatchLabelsAction({
        layoutId,
        items: items.map((item) => ({ itemNumber: item.itemNumber, ...asInput(rowOf(item)) })),
      });
      if (!result.ok) return setFailure({ error: result.error, item: result.itemNumber });
      setJob(result.job);
    });
  }

  const shown = (item: PriorityItem, problem: ItemLabelProblem) =>
    submitted && (problems.get(item.itemNumber) ?? []).includes(problem);

  return (
    <>
      <DialogTitleBlock icon={<Printer />} title={t("title")} description={t("description")} />

      {settings.layouts.length === 0 ? (
        <Alert variant="destructive">
          <AlertDescription>{print("noLayout")}</AlertDescription>
        </Alert>
      ) : null}
      {failure ? (
        <Alert variant="destructive" role="alert" data-testid="batch-failure">
          <AlertDescription>
            {failure.item
              ? t("itemProblem", { error: print(`errors.${failure.error}`), item: failure.item })
              : print(`errors.${failure.error}`)}
          </AlertDescription>
        </Alert>
      ) : null}

      <LayoutChooser
        layouts={settings.layouts}
        value={layoutId}
        onChange={setLayoutId}
        missing={submitted && !layout}
        name="batch-layout"
      />

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ol className="space-y-3" data-testid="batch-rows">
          {items.map((item, index) => {
            const row = rowOf(item);
            const dates = itemLabelDates(item, row);
            const id = `batch-${index}`;
            return (
              <li
                key={item.itemNumber}
                role="group"
                aria-label={item.name}
                data-testid="batch-row"
                data-item={item.itemNumber}
                className="space-y-3 rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p dir="auto" className="font-semibold">
                      {item.name}
                    </p>
                    <p dir="ltr" className="text-start font-mono text-xs text-muted-foreground">
                      {item.itemNumber}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("remove", { name: item.name })}
                    disabled={pending || job !== null}
                    onClick={() => onRemove(item.itemNumber)}
                  >
                    <X />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <RowField
                    id={`${id}-slaughter`}
                    label={print("fields.slaughter")}
                    problem={
                      shown(item, "SLAUGHTER_DATE") ? print("problems.SLAUGHTER_DATE") : null
                    }
                  >
                    <Input
                      id={`${id}-slaughter`}
                      type="date"
                      dir="ltr"
                      value={row.slaughterDate}
                      onChange={(e) => change(item, { slaughterDate: e.target.value })}
                      aria-invalid={shown(item, "SLAUGHTER_DATE") || shown(item, "DATES_ORDER")}
                    />
                  </RowField>
                  <RowField
                    id={`${id}-production`}
                    label={print("fields.production")}
                    problem={
                      shown(item, "PRODUCTION_DATE")
                        ? print("problems.PRODUCTION_DATE")
                        : shown(item, "DATES_ORDER")
                          ? print("problems.DATES_ORDER")
                          : null
                    }
                  >
                    <Input
                      id={`${id}-production`}
                      type="date"
                      dir="ltr"
                      value={row.productionDate}
                      onChange={(e) => change(item, { productionDate: e.target.value })}
                      aria-invalid={shown(item, "PRODUCTION_DATE") || shown(item, "DATES_ORDER")}
                    />
                  </RowField>
                  <RowField
                    id={`${id}-certificate`}
                    label={print("fields.certificate")}
                    problem={shown(item, "CERTIFICATE") ? print("problems.CERTIFICATE") : null}
                  >
                    <Input
                      id={`${id}-certificate`}
                      dir="ltr"
                      autoComplete="off"
                      value={row.certificateNo}
                      onChange={(e) => change(item, { certificateNo: e.target.value })}
                      aria-invalid={shown(item, "CERTIFICATE")}
                    />
                  </RowField>
                  <RowField
                    id={`${id}-origin`}
                    label={print("fields.origin")}
                    problem={
                      shown(item, "ORIGIN_MISSING")
                        ? print("problems.ORIGIN_MISSING")
                        : shown(item, "ORIGIN")
                          ? print("problems.ORIGIN", { max: MAX_ORIGIN_CHARS })
                          : null
                    }
                  >
                    <Input
                      id={`${id}-origin`}
                      dir="auto"
                      autoComplete="off"
                      placeholder={print("originHint")}
                      value={row.origin}
                      onChange={(e) => change(item, { origin: e.target.value })}
                      aria-invalid={shown(item, "ORIGIN") || shown(item, "ORIGIN_MISSING")}
                    />
                  </RowField>
                  <div className="grid grid-cols-2 gap-3">
                    <RowField
                      id={`${id}-copies`}
                      label={print("fields.copies")}
                      problem={
                        shown(item, "COPIES") ? print("problems.COPIES", { max: MAX_COPIES }) : null
                      }
                    >
                      <Input
                        id={`${id}-copies`}
                        type="number"
                        inputMode="numeric"
                        dir="ltr"
                        min={1}
                        max={MAX_COPIES}
                        step={1}
                        value={row.copies}
                        disabled={!settings.canChangeCopies}
                        onChange={(e) => change(item, { copies: e.target.value })}
                        aria-invalid={shown(item, "COPIES")}
                      />
                    </RowField>
                    <div className="space-y-1.5">
                      <Label className="text-sm">{print("fields.expiry")}</Label>
                      <p
                        dir="ltr"
                        data-testid="batch-expiry"
                        className="flex h-11 items-center rounded-lg border border-border bg-muted/50 px-3.5 text-start tabular-nums"
                      >
                        {dates ? formatDate(dates.expiry) : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <DialogFooter className="items-center sm:justify-between">
        <p className="text-sm text-muted-foreground" data-testid="batch-summary">
          {t("summary", { labels, items: items.length })}
          {blanks > 0 ? t("summaryBlanks", { blanks }) : ""}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onCancel}
            disabled={pending || job !== null}
          >
            {print("cancel")}
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={submit}
            disabled={
              pending || job !== null || items.length === 0 || settings.layouts.length === 0
            }
          >
            <Printer data-icon="inline-start" />
            {pending ? print("preparing") : print("submit")}
          </Button>
        </div>
      </DialogFooter>

      {job ? <LabelPrintSheet job={job} /> : null}
    </>
  );
}

function RowField({
  id,
  label,
  problem,
  children,
}: {
  id: string;
  label: string;
  problem: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      {children}
      {problem ? (
        <p role="alert" className="text-xs text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
