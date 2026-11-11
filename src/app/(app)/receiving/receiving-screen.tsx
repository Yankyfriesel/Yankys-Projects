"use client";

import {
  CalendarDays,
  Clock,
  CloudOff,
  Keyboard,
  LayoutGrid,
  Printer,
  QrCode,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { LabelPrintSheet, printLabelSheet } from "@/components/labels/label-print";
import { RealScale, type ScaleState } from "@/components/scale/real-scale";
import { SimulatedScale, parseWeight, useStable } from "@/components/scale/simulated-scale";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatPackingWeight, formatWeight, todayIso } from "@/lib/i18n/format";
import { parseItemLabelQr } from "@/lib/labels/codes";
import { addDays } from "@/lib/barcodes";
import { checkItemLabelInput, parseIsoDate } from "@/lib/labels/item-label";
import { netWeight } from "@/lib/packaging";
import { cn } from "@/lib/utils";
import type { PriorityItem } from "@/server/priority/types";
import type { PrintJobData } from "../catalog/actions";
import { ItemPicker } from "./item-picker";
import { TodayList, type TodayRow } from "./today-list";
import {
  receiveBoxAction,
  reprintBoxAction,
  type ReceiveErrorCode,
  type ReceiveResult,
} from "./actions";

/** The items as Priority has them, so hand entry can show them the way the catalog does. */
export type ScreenItem = PriorityItem;

/** The packaging an item is packed in, with what it weighs. */
export interface PackingInfo {
  totalKg: number;
  name: string;
}

/** What a scan or a hand entry has filled in, shown to the worker before weighing. */
interface Pending {
  itemNumber: string;
  certificateNo: string;
  slaughter: Date;
  production: Date;
  expiry: Date;
}

const AUTO_PRINT_AFTER_MS = 2000;
const AUTO_PRINT_KEY = "receiving.autoPrint";

/**
 * Goods receiving from production: scan the item label's QR code, put the box on the scale,
 * Enter saves the box and prints its label. The scale is simulated until phase 3.
 */
export function ReceivingScreen({
  items,
  packing,
  today,
  usingSavedCatalog,
  can,
}: {
  items: ScreenItem[];
  /** What the packaging of each item weighs, by item number. */
  packing: Record<string, PackingInfo>;
  /** Null when the user may not see today's list. */
  today: TodayRow[] | null;
  usingSavedCatalog: boolean;
  can: { manual: boolean; reprint: boolean; autoPrint: boolean };
}) {
  const t = useTranslations("receiving");
  const [saving, startSaving] = useTransition();
  const scanRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);

  const [scanText, setScanText] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [manual, setManual] = useState(false);
  const [weightText, setWeightText] = useState("");
  const [scaleState, setScaleState] = useState<ScaleState>("off");
  const [error, setError] = useState<ReceiveErrorCode | null>(null);
  const [notice, setNotice] = useState<{ name: string; weight: number; sent: string } | null>(null);
  const [job, setJob] = useState<PrintJobData | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);

  const stable = useStable(weightText);
  const weight = parseWeight(weightText);
  // The packing of the item being weighed: the scale shows it with its bag and box.
  const pack = pending ? packing[pending.itemNumber] : undefined;
  const itemName = (number: string) => items.find((i) => i.itemNumber === number)?.name ?? number;

  // The switch is a convenience of this computer: it is remembered here.
  useEffect(() => {
    try {
      setAutoPrint(localStorage.getItem(AUTO_PRINT_KEY) === "1"); // eslint-disable-line react-hooks/set-state-in-effect
    } catch {
      /* storage can be blocked; the switch just starts off */
    }
  }, []);
  function changeAutoPrint(on: boolean) {
    setAutoPrint(on);
    try {
      localStorage.setItem(AUTO_PRINT_KEY, on ? "1" : "0");
    } catch {
      /* not remembered */
    }
  }

  // Once the server has saved the box, its label is on the page: open the print window.
  useEffect(() => {
    if (!job) return;
    printLabelSheet(job.widthMm, job.heightMm, () => {
      setJob(null);
      scanRef.current?.focus();
    });
  }, [job]);

  function accept(result: ReceiveResult, reprint: boolean) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setJob(result.job);
    if (!reprint) {
      setNotice({
        name: result.box.itemName,
        weight: result.box.weightKg,
        sent: result.box.sent,
      });
      setPending(null);
      setManual(false);
      setScanText("");
      setWeightText("");
    }
  }

  function save() {
    if (saving || job) return;
    if (!pending) return setError("NOT_ITEM_QR");
    if (weight === null) return setError("INVALID_WEIGHT");
    setError(null);
    const base = { weightKg: weight };
    startSaving(async () => {
      const result = await receiveBoxAction(
        manual
          ? {
              mode: "manual",
              itemNumber: pending.itemNumber,
              certificateNo: pending.certificateNo,
              slaughterDate: pending.slaughter.toISOString().slice(0, 10),
              productionDate: pending.production.toISOString().slice(0, 10),
              ...base,
            }
          : { mode: "scan", qr: scanText, ...base },
      );
      accept(result, false);
    });
  }

  // Automatic printing: the box is saved about two seconds after the weight stops changing.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    if (!autoPrint || !pending || weight === null) return;
    const timer = setTimeout(() => saveRef.current(), AUTO_PRINT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [autoPrint, pending, weight, weightText]);

  function scan(text: string) {
    const qr = parseItemLabelQr(text);
    if (!qr) {
      setError("NOT_ITEM_QR");
      setScanText("");
      return;
    }
    if (!items.some((i) => i.itemNumber === qr.itemNumber)) {
      setError("UNKNOWN_ITEM");
      setScanText("");
      return;
    }
    setError(null);
    setNotice(null);
    setScanText(text.trim());
    setPending({
      itemNumber: qr.itemNumber,
      certificateNo: qr.certificateNo,
      slaughter: qr.slaughterDate,
      production: qr.productionDate,
      expiry: qr.expiryDate,
    });
    weightRef.current?.focus();
  }

  function clear() {
    setPending(null);
    setScanText("");
    setManual(false);
    setError(null);
    scanRef.current?.focus();
  }

  function reprint(barcode: string) {
    startSaving(async () => accept(await reprintBoxAction(barcode), true));
  }

  return (
    <div className="space-y-5">
      {usingSavedCatalog ? (
        <Alert>
          <CloudOff aria-hidden />
          <AlertDescription>{t("savedCatalog")}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert role="status" data-testid="saved-notice">
          <AlertDescription>
            {t("saved", { name: notice.name, weight: formatWeight(notice.weight) })}
            {notice.sent !== "sent" ? ` ${t("willSend")}` : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      <div
        className={cn(
          "grid items-start gap-5",
          today ? "lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]" : "max-w-2xl",
        )}
      >
        {/* The box: scan, check what the label says, weigh, save and print. */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Card className="gap-0 overflow-hidden p-0">
            <div className="space-y-3 border-b border-border bg-muted/40 p-5">
              <h2 className="font-serif text-lg font-semibold">{t("scanTitle")}</h2>
              {manual ? null : (
                <div className="space-y-1.5">
                  <Label htmlFor="scan-input" className="flex items-center gap-1.5 text-sm">
                    <QrCode className="size-4" aria-hidden />
                    {t("scanLabel")}
                  </Label>
                  <Input
                    id="scan-input"
                    ref={scanRef}
                    dir="ltr"
                    autoFocus
                    autoComplete="off"
                    className="h-12 bg-card text-base"
                    value={scanText}
                    placeholder={t("scanPlaceholder")}
                    onChange={(event) => setScanText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault(); // a scan is not a save
                      scan(scanText);
                    }}
                  />
                </div>
              )}
              {!pending && !manual && can.manual ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setManual(true)}
                >
                  <Keyboard data-icon="inline-start" />
                  {t("manualButton")}
                </Button>
              ) : null}
            </div>

            <div className="space-y-5 p-5">
              {pending ? (
                <PendingSummary
                  pending={pending}
                  name={itemName(pending.itemNumber)}
                  shelfLifeDays={
                    items.find((i) => i.itemNumber === pending.itemNumber)?.shelfLifeDays ?? null
                  }
                />
              ) : manual ? (
                <ManualEntry items={items} onReady={setPending} onCancel={clear} />
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                  <QrCode className="size-5 shrink-0" aria-hidden />
                  {t("waiting")}
                </div>
              )}

              <div className="space-y-3 border-t border-border pt-5">
                <h2 className="font-serif text-lg font-semibold">{t("weighTitle")}</h2>
                <RealScale onWeight={setWeightText} onStateChange={setScaleState} />
                <SimulatedScale
                  text={weightText}
                  onChange={setWeightText}
                  stable={stable}
                  inputRef={weightRef}
                  live={scaleState === "on"}
                  below={
                    pending || manual ? (
                      <RecordedWeight pack={pack ?? null} scaleKg={weight} />
                    ) : null
                  }
                />
                {can.autoPrint ? (
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm">
                    {t("autoPrint")}
                    <input
                      type="checkbox"
                      role="switch"
                      className="peer sr-only"
                      checked={autoPrint}
                      onChange={(event) => changeAutoPrint(event.target.checked)}
                    />
                    <span
                      aria-hidden
                      className="relative h-6 w-11 shrink-0 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 after:absolute after:start-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-card after:shadow after:transition-transform peer-checked:after:translate-x-5 rtl:peer-checked:after:-translate-x-5"
                    />
                  </label>
                ) : null}
              </div>
            </div>

            <div className="space-y-2 border-t border-border bg-muted/40 p-4">
              <div className="flex items-center gap-2">
                {pending || manual ? (
                  <Button type="button" variant="ghost" onClick={clear}>
                    <RotateCcw data-icon="inline-start" />
                    {t("clear")}
                  </Button>
                ) : null}
                <Button
                  type="submit"
                  size="lg"
                  className="flex-1"
                  disabled={saving || job !== null || !pending || weight === null}
                >
                  <Printer data-icon="inline-start" />
                  {saving ? t("saving") : t("save")}
                </Button>
              </div>
              <p className="text-center text-xs text-muted-foreground">{t("enterHint")}</p>
            </div>
          </Card>
        </form>

        {today ? (
          <TodayList
            rows={today}
            canReprint={can.reprint}
            busy={saving || job !== null}
            onReprint={reprint}
          />
        ) : null}
      </div>

      {job ? <LabelPrintSheet job={job} /> : null}
    </div>
  );
}

/**
 * The weight that goes into stock, as large as the scale's own reading and right under it: the
 * scale's weight, less the packaging when the item has one (then the packaging is named).
 */
function RecordedWeight({ pack, scaleKg }: { pack: PackingInfo | null; scaleKg: number | null }) {
  const t = useTranslations("receiving");
  const packaging = useTranslations("receiving.packaging");
  const common = useTranslations("common");
  const taken = pack && pack.totalKg > 0 ? pack.totalKg : 0;
  const recorded = scaleKg === null ? null : netWeight(scaleKg, taken);
  return (
    <div
      data-testid={taken > 0 ? "packing-summary" : "recorded-box"}
      className="space-y-1 rounded-xl border-2 border-gold/50 bg-gold-soft px-5 py-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs font-semibold text-muted-foreground">{t("scale.recorded")}</p>
        {taken > 0 && pack ? (
          <p className="flex gap-3 text-xs text-muted-foreground">
            <span dir="auto">{packaging("carton", { name: pack.name })}</span>
            <span dir="ltr" className="tabular-nums">
              {packaging("taken", { weight: formatPackingWeight(taken), kg: common("kg") })}
            </span>
          </p>
        ) : null}
      </div>
      <span
        dir="ltr"
        data-testid="recorded-weight"
        className="block font-serif text-5xl font-semibold tabular-nums sm:text-6xl"
      >
        {recorded === null ? "—" : formatWeight(recorded)}{" "}
        <span className="ms-2 text-2xl font-normal text-muted-foreground">{common("kg")}</span>
      </span>
    </div>
  );
}

/** The item the label belongs to and what the label says, read only. */
function PendingSummary({
  pending,
  name,
  shelfLifeDays,
}: {
  pending: Pending;
  name: string;
  shelfLifeDays: number | null;
}) {
  const t = useTranslations("receiving");
  return (
    <div data-testid="pending-summary" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Badge variant="success">{t("facts.item")}</Badge>
          <p dir="auto" className="text-xl leading-tight font-semibold">
            {name}
          </p>
          <p dir="ltr" className="text-start font-mono text-xs text-muted-foreground">
            {pending.itemNumber}
          </p>
        </div>
        {shelfLifeDays ? (
          <span className="shrink-0 text-xs font-semibold text-destructive">
            {t("facts.shelfLife", { days: shelfLifeDays })}
          </span>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <Fact
          icon={<CalendarDays />}
          label={t("facts.slaughter")}
          value={formatDate(pending.slaughter)}
        />
        <Fact
          icon={<CalendarDays />}
          label={t("facts.production")}
          value={formatDate(pending.production)}
        />
        <Fact
          icon={<ShieldCheck />}
          label={t("facts.certificate")}
          value={pending.certificateNo}
          className="col-span-2"
        />
        <div className="col-span-2 flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
          <div>
            <dt className="text-xs font-semibold text-destructive">{t("facts.expiry")}</dt>
            <dd dir="ltr" className="text-start text-lg font-semibold tabular-nums">
              {formatDate(pending.expiry)}
            </dd>
          </div>
          <Clock className="size-5 text-destructive" aria-hidden />
        </div>
      </dl>
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd
        dir="ltr"
        className="rounded-lg border border-input bg-muted/30 px-3 py-2 text-start font-semibold tabular-nums"
      >
        {value}
      </dd>
    </div>
  );
}

/** Picking the item and typing the dates and certificate, for a box with no QR code. */
function ManualEntry({
  items,
  onReady,
  onCancel,
}: {
  items: ScreenItem[];
  onReady: (pending: Pending) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("receiving.manual");
  const catalog = useTranslations("catalog");
  // The catalog window opens at once: choosing the item is the first thing to do.
  const [picking, setPicking] = useState(true);
  const [itemNumber, setItemNumber] = useState("");
  const [slaughter, setSlaughter] = useState("");
  const [production, setProduction] = useState(todayIso());
  const [certificate, setCertificate] = useState("");
  const [problem, setProblem] = useState(false);

  const chosen = items.find((i) => i.itemNumber === itemNumber) ?? null;

  function use() {
    const item = items.find((i) => i.itemNumber === itemNumber);
    const input = {
      slaughterDate: slaughter,
      productionDate: production,
      certificateNo: certificate,
      copies: 1,
    };
    const slaughterDate = parseIsoDate(slaughter);
    const productionDate = parseIsoDate(production);
    if (!item || !slaughterDate || !productionDate || checkItemLabelInput(input).length > 0)
      return setProblem(true);
    setProblem(false);
    onReady({
      itemNumber: item.itemNumber,
      certificateNo: certificate.trim(),
      slaughter: slaughterDate,
      production: productionDate,
      expiry: addDays(slaughterDate, item.shelfLifeDays),
    });
  }

  return (
    <div className="space-y-3" data-testid="manual-entry">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("item")}</p>
        {chosen ? (
          <div
            className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
            data-testid="manual-item"
          >
            <div className="min-w-0 space-y-1">
              <Badge variant="soft" className="max-w-full truncate text-[0.7rem]">
                <span dir="auto" className="truncate">
                  {chosen.category === "" ? catalog("uncategorized") : chosen.category}
                </span>
              </Badge>
              <p dir="auto" className="font-semibold">
                {chosen.name}
              </p>
              <p dir="ltr" className="text-start font-mono text-xs text-muted-foreground">
                {chosen.itemNumber}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
              {t("change")}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full"
            onClick={() => setPicking(true)}
          >
            <LayoutGrid data-icon="inline-start" />
            {t("pick")}
          </Button>
        )}
        <ItemPicker
          open={picking}
          items={items}
          onPick={(item) => {
            setItemNumber(item.itemNumber);
            setPicking(false);
          }}
          onClose={() => {
            setPicking(false);
            // Closing the window without an item goes back to scanning.
            if (!itemNumber) onCancel();
          }}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="manual-slaughter" className="text-sm">
            {t("slaughter")}
          </Label>
          <Input
            id="manual-slaughter"
            type="date"
            dir="ltr"
            value={slaughter}
            onChange={(event) => setSlaughter(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manual-production" className="text-sm">
            {t("production")}
          </Label>
          <Input
            id="manual-production"
            type="date"
            dir="ltr"
            value={production}
            onChange={(event) => setProduction(event.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="manual-certificate" className="text-sm">
          {t("certificate")}
        </Label>
        <Input
          id="manual-certificate"
          dir="ltr"
          autoComplete="off"
          value={certificate}
          onChange={(event) => setCertificate(event.target.value)}
        />
      </div>
      {problem ? (
        <p role="alert" className="text-xs text-destructive">
          {t("problem")}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" onClick={use}>
          {t("use")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          <RotateCcw data-icon="inline-start" />
          {t("back")}
        </Button>
      </div>
    </div>
  );
}
