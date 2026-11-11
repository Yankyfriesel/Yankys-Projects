"use client";

import { Check, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { DialogTitleBlock } from "@/components/dialog-parts";
import { ElementView } from "@/components/labels/element-view";
import { LabelPrintSheet, printLabelSheet } from "@/components/labels/label-print";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, todayIso } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import {
  MAX_COPIES,
  MAX_ORIGIN_CHARS,
  checkItemLabelInput,
  itemLabelDates,
  itemLabelValues,
  type ItemLabelProblem,
} from "@/lib/labels/item-label";
import type { LabelElement, LabelValues } from "@/lib/labels/model";
import type { PriorityItem } from "@/server/priority/types";
import { prepareItemLabelsAction, type PrintErrorCode, type PrintJobData } from "./actions";

export interface PrintableLayout {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
}

export interface PrintSettings {
  /** The item label types to choose from, every time. */
  layouts: PrintableLayout[];
  /** The item layout chosen in advance (set in the label layouts); it can still be changed. */
  defaultLayoutId: string | null;
  canChangeCopies: boolean;
}

/** The label type chosen when the print window opens: the default, or the only one there is. */
export function firstLayoutId(settings: PrintSettings): string {
  if (settings.defaultLayoutId && settings.layouts.some((l) => l.id === settings.defaultLayoutId))
    return settings.defaultLayoutId;
  return settings.layouts.length === 1 ? settings.layouts[0].id : "";
}

/**
 * Printing item labels, shown inside the item's window: the label type (chosen from the item
 * layouts every time, with one only when there is just one), the dates, the production
 * certificate number and the copies (one unless the user may change it). The expiry date is worked out from the shelf life. Everything
 * is checked again on the server, which also writes the print to the activity log.
 */
export function PrintForm({
  item,
  settings,
  onDone,
  onCancel,
}: {
  item: PriorityItem;
  settings: PrintSettings;
  /** After the print window has closed. */
  onDone: () => void;
  /** The cancel button: back to the item's details, or closing the window. */
  onCancel: () => void;
}) {
  const t = useTranslations("catalog.print");
  const [pending, startTransition] = useTransition();

  const today = todayIso();
  const [slaughterDate, setSlaughterDate] = useState("");
  const [productionDate, setProductionDate] = useState(today);
  const [certificateNo, setCertificateNo] = useState("");
  // Starts as the item's own country of origin when Priority has one; it must not stay empty.
  const [origin, setOrigin] = useState(item.origin ?? "");
  // With several label types nothing is chosen yet: the person picks one for every print.
  const [layoutId, setLayoutId] = useState(() => firstLayoutId(settings));
  const [copies, setCopies] = useState("1");
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<PrintErrorCode | null>(null);
  const [job, setJob] = useState<PrintJobData | null>(null);

  const layout = settings.layouts.find((l) => l.id === layoutId) ?? null;
  const input = { slaughterDate, productionDate, certificateNo, origin, copies: Number(copies) };
  const problems = checkItemLabelInput(input, { originRequired: true });
  const dates = itemLabelDates(item, input);

  // The preview shows the real label once the form is complete, and sample values before.
  const complete = problems.length === 0;
  // An item number with a space or "|" cannot go into the QR text: that item cannot be printed.
  let previewValues: LabelValues | null = null;
  try {
    previewValues = itemLabelValues(item, {
      slaughterDate: complete ? slaughterDate : productionDate || today,
      productionDate: complete ? productionDate : productionDate || today,
      certificateNo: complete ? certificateNo : "000000",
      origin: origin.length <= MAX_ORIGIN_CHARS ? origin : "",
      copies: 1,
    });
  } catch {
    previewValues = null;
  }

  // Once the server has agreed, the labels are on the page: open the print window for them.
  useEffect(() => {
    if (!job) return;
    printLabelSheet(job.widthMm, job.heightMm, () => {
      setJob(null);
      onDone();
    });
  }, [job, onDone]);

  function print() {
    setSubmitted(true);
    setFailure(null);
    if (!complete || !layout || !previewValues) return;
    startTransition(async () => {
      const result = await prepareItemLabelsAction({
        itemNumber: item.itemNumber,
        slaughterDate,
        productionDate,
        certificateNo: certificateNo.trim(),
        origin: origin.trim(),
        layoutId,
        copies: input.copies,
      });
      if (!result.ok) return setFailure(result.problems?.length ? "INVALID_INPUT" : result.error);
      setJob(result.job);
    });
  }

  const shown = (problem: ItemLabelProblem) => submitted && problems.includes(problem);

  return (
    <>
      <DialogTitleBlock
        icon={<Printer />}
        title={t("title")}
        description={`${item.itemNumber} · ${item.name}`}
      />

      {settings.layouts.length === 0 ? (
        <Alert variant="destructive">
          <AlertDescription>{t("noLayout")}</AlertDescription>
        </Alert>
      ) : null}
      {previewValues === null ? (
        <Alert variant="destructive">
          <AlertDescription>{t("errors.ITEM_NOT_PRINTABLE")}</AlertDescription>
        </Alert>
      ) : null}
      {failure ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${failure}`)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <div className="min-w-0 space-y-4">
          <LayoutChooser
            layouts={settings.layouts}
            value={layoutId}
            onChange={setLayoutId}
            missing={submitted && !layout}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t("fields.slaughter")}
              id="print-slaughter"
              problem={shown("SLAUGHTER_DATE") ? t("problems.SLAUGHTER_DATE") : null}
            >
              <Input
                id="print-slaughter"
                type="date"
                dir="ltr"
                value={slaughterDate}
                onChange={(e) => setSlaughterDate(e.target.value)}
                aria-invalid={shown("SLAUGHTER_DATE") || shown("DATES_ORDER")}
              />
            </Field>
            <Field
              label={t("fields.production")}
              id="print-production"
              problem={
                shown("PRODUCTION_DATE")
                  ? t("problems.PRODUCTION_DATE")
                  : shown("DATES_ORDER")
                    ? t("problems.DATES_ORDER")
                    : null
              }
            >
              <Input
                id="print-production"
                type="date"
                dir="ltr"
                value={productionDate}
                onChange={(e) => setProductionDate(e.target.value)}
                aria-invalid={shown("PRODUCTION_DATE") || shown("DATES_ORDER")}
              />
            </Field>
          </div>

          <Field
            label={t("fields.certificate")}
            id="print-certificate"
            problem={shown("CERTIFICATE") ? t("problems.CERTIFICATE") : null}
          >
            <Input
              id="print-certificate"
              dir="ltr"
              autoComplete="off"
              value={certificateNo}
              onChange={(e) => setCertificateNo(e.target.value)}
              aria-invalid={shown("CERTIFICATE")}
            />
          </Field>

          <Field
            label={t("fields.origin")}
            id="print-origin"
            problem={
              shown("ORIGIN_MISSING")
                ? t("problems.ORIGIN_MISSING")
                : shown("ORIGIN")
                  ? t("problems.ORIGIN", { max: MAX_ORIGIN_CHARS })
                  : null
            }
          >
            <Input
              id="print-origin"
              dir="auto"
              autoComplete="off"
              placeholder={t("originHint")}
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              aria-invalid={shown("ORIGIN") || shown("ORIGIN_MISSING")}
            />
          </Field>

          <div className="space-y-1.5">
            <Label className="text-sm">{t("fields.expiry")}</Label>
            <p
              data-testid="expiry"
              dir="ltr"
              className="flex h-11 items-center rounded-lg border border-border bg-muted/50 px-3.5 text-start tabular-nums"
            >
              {dates ? formatDate(dates.expiry) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {dates ? t("expiryHint", { days: item.shelfLifeDays }) : t("expiryUnknown")}
            </p>
          </div>

          <div className="max-w-40">
            <Field
              label={t("fields.copies")}
              id="print-copies"
              problem={shown("COPIES") ? t("problems.COPIES", { max: MAX_COPIES }) : null}
            >
              <Input
                id="print-copies"
                type="number"
                inputMode="numeric"
                dir="ltr"
                min={1}
                max={MAX_COPIES}
                step={1}
                value={copies}
                disabled={!settings.canChangeCopies}
                onChange={(e) => setCopies(e.target.value)}
                aria-invalid={shown("COPIES")}
              />
            </Field>
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <p className="text-sm font-medium">{t("preview")}</p>
          {layout && previewValues ? (
            <LabelPreview layout={layout} values={previewValues} />
          ) : (
            <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
              {t("previewChoose")}
            </p>
          )}
          {layout && !complete ? (
            <p className="text-xs text-muted-foreground">{t("previewIncomplete")}</p>
          ) : null}
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onCancel}
          disabled={pending || job !== null}
        >
          {t("cancel")}
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={print}
          disabled={pending || job !== null || settings.layouts.length === 0 || !previewValues}
        >
          <Printer data-icon="inline-start" />
          {pending ? t("preparing") : t("submit")}
        </Button>
      </DialogFooter>

      {job ? <LabelPrintSheet job={job} /> : null}
    </>
  );
}

/**
 * The item label types to choose from, one tapped for this print. Nothing is chosen for you when
 * there are several, so the person decides at every print; with a single type it is chosen already.
 */
export function LayoutChooser({
  layouts,
  value,
  onChange,
  missing,
  name = "print-layout",
}: {
  layouts: PrintableLayout[];
  value: string;
  onChange: (id: string) => void;
  /** Show that a choice is still needed. */
  missing: boolean;
  name?: string;
}) {
  const t = useTranslations("catalog.print");
  const unit = useTranslations("labels.list");
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t("fields.layout")}</legend>
      <p className="text-xs text-muted-foreground">{t("layoutHint")}</p>
      <div role="radiogroup" aria-label={t("fields.layout")} className="grid gap-2">
        {layouts.map((option) => {
          const chosen = option.id === value;
          return (
            <label
              key={option.id}
              data-testid="layout-option"
              data-chosen={chosen}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                chosen
                  ? "border-primary/50 bg-primary/5"
                  : "border-border bg-card hover:border-gold/60",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={chosen}
                onChange={() => onChange(option.id)}
                className="sr-only"
              />
              <span dir="auto" className="min-w-0 truncate font-medium">
                {option.name}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
                <span>
                  <span dir="ltr">
                    {t("size", { width: option.widthMm, height: option.heightMm })}
                  </span>{" "}
                  {unit("unit")}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "grid size-5 place-items-center rounded-full border",
                    chosen ? "border-primary bg-primary text-primary-foreground" : "border-input",
                  )}
                >
                  {chosen ? <Check className="size-3" /> : null}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {missing ? (
        <p role="alert" className="text-xs text-destructive">
          {t("problems.LAYOUT")}
        </p>
      ) : null}
    </fieldset>
  );
}

function Field({
  label,
  id,
  problem,
  children,
}: {
  label: string;
  id: string;
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

/** The label as it will print, scaled to the width of the box it is in. */
function LabelPreview({ layout, values }: { layout: PrintableLayout; values: LabelValues }) {
  const box = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(280);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(6, Math.max(1, boxWidth / layout.widthMm));
  return (
    <div ref={box} className="rounded-xl bg-muted/60 p-3">
      <div
        dir="ltr"
        data-testid="print-preview"
        className="relative mx-auto bg-white shadow-card ring-1 ring-border"
        style={{ width: layout.widthMm * scale, height: layout.heightMm * scale }}
      >
        {layout.elements.map((element) => (
          <ElementView key={element.id} element={element} scale={scale} values={values} />
        ))}
      </div>
    </div>
  );
}
