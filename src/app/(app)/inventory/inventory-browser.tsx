"use client";

import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  FilterX,
  Package,
  Search,
  SlidersHorizontal,
  Warehouse,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { LabelPrintSheet, printLabelSheet } from "@/components/labels/label-print";
import { ArrangeBar, ArrangeSlot, useRoomArranger } from "@/components/room-arranger";
import { ReportPrintSheet, printReport } from "@/components/report-print";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatInteger, formatWeight } from "@/lib/i18n/format";
import {
  NO_FILTERS,
  filterRows,
  groupByItem,
  hasFilters,
  totals,
  type InventoryFilters,
  type InventoryRow,
  type ItemGroup,
  type StatusFilter,
} from "@/lib/inventory";
import { cn } from "@/lib/utils";
import type { PrintJobData } from "../catalog/actions";
import { BUILD_PARAM, setBuilding } from "./build-pallet-button";
import { PalletBuilder } from "./pallet-builder";
import { createPalletAction } from "./pallets/actions";
import { downloadInventoryExcel } from "./export-excel";

const PAGE = 100;
const SELECT_CLASS =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const STATUSES: StatusFilter[] = ["all", "attention", "expired", "soon", "valid"];
/** From this width the items and the chosen item's boxes stand side by side. */
const WIDE = "(min-width: 1024px)";

/** True on screens wide enough for two columns. Starts wide, like the server render. */
function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

/**
 * The stock in three steps: the storage rooms on top, the items of the chosen room, and the
 * boxes of the chosen item. The search and the other filters narrow all three. Read only.
 * Every box is on the page already, so choosing and filtering are instant.
 */
export function InventoryBrowser({
  rows,
  warehouses,
  canArrange,
  today,
  can,
}: {
  rows: InventoryRow[];
  warehouses: { code: string; name: string }[];
  /** Whether this person may arrange the order of the storage rooms. */
  canArrange: boolean;
  today: string;
  can: { filters: boolean; export: boolean; pallets: boolean; palletsScan: boolean };
}) {
  const t = useTranslations("inventory");
  const common = useTranslations("common");
  const locale = useLocale();
  const wide = useWide();
  const [filters, setFilters] = useState<InventoryFilters>(NO_FILTERS);
  const [chosenItem, setChosenItem] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [printing, setPrinting] = useState(false);
  // Boxes ticked to make a pallet of, and the pallet label that is being printed.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // The ticks and the scan box are there only while a pallet is being built (opened by the
  // "Build a pallet" button at the top of the screen).
  const params = useSearchParams();
  const building = (can.pallets || can.palletsScan) && params.get(BUILD_PARAM) === "1";
  const [palletJob, setPalletJob] = useState<PrintJobData | null>(null);
  const [making, startMaking] = useTransition();
  const palletErrors = useTranslations("pallets.errors");
  const pallets = useTranslations("pallets.create");

  useEffect(() => {
    if (!palletJob) return;
    printLabelSheet(palletJob.widthMm, palletJob.heightMm, () => setPalletJob(null));
  }, [palletJob]);

  function toggle(barcode: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(barcode)) next.delete(barcode);
      else next.add(barcode);
      return next;
    });
  }

  function addScanned(barcode: string) {
    setSelected((current) => new Set(current).add(barcode));
  }

  function makePallet() {
    const barcodes = [...selected];
    startMaking(async () => {
      // Boxes that were only scanned need only the scan permission; ticking needs the other one.
      const result = await createPalletAction(barcodes, can.pallets ? "select" : "scan");
      if (!result.ok) return void toast.error(palletErrors(result.error));
      setSelected(new Set());
      setBuilding(false);
      setPalletJob(result.job);
      toast.success(pallets("made", { number: result.number, count: result.boxes }));
    });
  }

  const filtered = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const sums = useMemo(() => totals(filtered), [filtered]);
  const groups = useMemo(() => groupByItem(filtered), [filtered]);

  // Each room with its whole stock, whatever the other filters say, in the order set by hand.
  const arranger = useRoomArranger(warehouses.map((w) => w.code));
  const rooms = useMemo(() => {
    const byCode = new Map(warehouses.map((w) => [w.code, w]));
    return arranger.order.flatMap((code) => {
      const w = byCode.get(code);
      return w ? [{ ...w, sums: totals(rows.filter((row) => row.warehouseCode === w.code)) }] : [];
    });
  }, [rows, warehouses, arranger.order]);

  // On wide screens one item is always open; on phones only the one tapped.
  const openItem =
    groups.find((group) => group.itemNumber === chosenItem)?.itemNumber ??
    (wide ? (groups[0]?.itemNumber ?? null) : null);
  const openGroup = groups.find((group) => group.itemNumber === openItem) ?? null;

  function change<K extends keyof InventoryFilters>(key: K, value: InventoryFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setShown(PAGE);
  }

  function choose(itemNumber: string) {
    setChosenItem(!wide && openItem === itemNumber ? null : itemNumber);
    setShown(PAGE);
  }

  const statusWord = (status: InventoryRow["status"]) => t(`status.${status}`);

  async function excel() {
    try {
      await downloadInventoryExcel(
        filtered,
        {
          sheet: t("title"),
          columns: {
            itemNumber: t("columns.itemNumber"),
            item: t("columns.item"),
            category: t("columns.category"),
            warehouse: t("columns.warehouse"),
            barcode: t("columns.barcode"),
            weight: t("columns.weight"),
            slaughter: t("columns.slaughter"),
            expiry: t("columns.expiry"),
            entered: t("columns.entered"),
            status: t("columns.status"),
          },
          status: {
            valid: statusWord("valid"),
            soon: statusWord("soon"),
            expired: statusWord("expired"),
          },
        },
        locale === "he",
        `inventory-${today}.xlsx`,
      );
    } catch (error) {
      console.error("[inventory] the Excel file could not be made", error);
      toast.error(t("exportFailed"));
    }
  }

  function pdf() {
    setPrinting(true);
    // Let the report reach the page, then open the print window (choose "Save as PDF" in it).
    requestAnimationFrame(() => printReport(() => setPrinting(false)));
  }

  const moreFilters =
    filters.barcode ||
    filters.expiryFrom ||
    filters.expiryTo ||
    filters.enteredFrom ||
    filters.enteredTo;

  const details = openGroup ? (
    <ItemDetails
      group={openGroup}
      showRoom={!filters.warehouse}
      shown={shown}
      onMore={() => setShown((n) => n + PAGE)}
      pick={
        can.pallets && building
          ? { selected, toggle, label: (b) => pallets("pick", { barcode: b }) }
          : null
      }
    />
  ) : null;

  return (
    <div className="space-y-5">
      {canArrange && warehouses.length > 1 ? <ArrangeBar arranger={arranger} /> : null}
      {/* The storage rooms: choosing one shows only its items. */}
      <div
        // On a wide screen all the rooms stand in one line, side by side.
        className="rise grid gap-3 sm:grid-cols-2 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none"
        style={{ "--i": 1 } as React.CSSProperties}
        data-testid="room-cards"
      >
        <RoomCard
          name={t("rooms.all")}
          sums={totals(rows)}
          active={filters.warehouse === ""}
          onClick={() => change("warehouse", "")}
          icon={<Boxes className="size-5" />}
        />
        {rooms.map((room) => (
          <ArrangeSlot key={room.code} arranger={arranger} code={room.code} name={room.name}>
            <RoomCard
              name={room.name}
              code={room.code}
              sums={room.sums}
              active={filters.warehouse === room.code}
              onClick={() => (arranger.editing ? undefined : change("warehouse", room.code))}
              icon={<Warehouse className="size-5" />}
            />
          </ArrangeSlot>
        ))}
      </div>

      {/* Search and filters, the totals of what they show, and the exports. */}
      <Card className="rise gap-0 p-0" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center gap-3 p-4">
          {can.filters ? (
            <>
              <div className="relative min-w-56 flex-1">
                <Label htmlFor="inv-item" className="sr-only">
                  {t("filters.item")}
                </Label>
                <Search
                  aria-hidden
                  className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="inv-item"
                  type="search"
                  autoComplete="off"
                  className="ps-10"
                  placeholder={t("filters.itemPlaceholder")}
                  value={filters.item}
                  onChange={(event) => change("item", event.target.value)}
                />
              </div>
              <div className="w-full sm:w-52">
                <Label htmlFor="inv-status" className="sr-only">
                  {t("filters.status")}
                </Label>
                <select
                  id="inv-status"
                  className={SELECT_CLASS}
                  value={filters.status}
                  onChange={(event) => change("status", event.target.value as StatusFilter)}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {t(`filters.statuses.${status}`)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
          {can.export ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={excel}
                disabled={filtered.length === 0}
              >
                <FileSpreadsheet data-icon="inline-start" />
                {t("export.excel")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={pdf}
                disabled={filtered.length === 0 || printing}
              >
                <FileText data-icon="inline-start" />
                {t("export.pdf")}
              </Button>
            </div>
          ) : null}
        </div>

        {can.filters ? (
          <details
            className="group/more border-t border-border"
            open={moreFilters ? true : undefined}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground outline-none marker:hidden hover:text-foreground focus-visible:bg-muted [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal className="size-4" />
              {t("filters.more")}
              <ChevronDown className="size-4 transition-transform group-open/more:rotate-180" />
            </summary>
            <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-barcode" className="text-sm">
                  {t("filters.barcode")}
                </Label>
                <Input
                  id="inv-barcode"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="off"
                  value={filters.barcode}
                  onChange={(event) => change("barcode", event.target.value)}
                />
              </div>
              <DateRange
                label={t("filters.expiry")}
                from={filters.expiryFrom}
                to={filters.expiryTo}
                onFrom={(value) => change("expiryFrom", value)}
                onTo={(value) => change("expiryTo", value)}
                id="inv-expiry"
              />
              <DateRange
                label={t("filters.entered")}
                from={filters.enteredFrom}
                to={filters.enteredTo}
                onFrom={(value) => change("enteredFrom", value)}
                onTo={(value) => change("enteredTo", value)}
                id="inv-entered"
              />
            </div>
          </details>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-4 py-2.5">
          <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="inventory-summary">
            <Badge variant="outline">{t("summary.boxes", { count: sums.boxes })}</Badge>
            <Badge variant="outline">
              {formatWeight(sums.kg)} {common("kg")}
            </Badge>
            {sums.expired > 0 ? (
              <Badge variant="destructive">{t("summary.expired", { count: sums.expired })}</Badge>
            ) : null}
            {sums.soon > 0 ? (
              <Badge variant="warning">{t("summary.soon", { count: sums.soon })}</Badge>
            ) : null}
          </p>
          {hasFilters(filters) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ms-auto"
              onClick={() => {
                setFilters(NO_FILTERS);
                setShown(PAGE);
              }}
            >
              <FilterX data-icon="inline-start" />
              {t("filters.clear")}
            </Button>
          ) : null}
        </div>
      </Card>

      {building ? (
        <PalletBuilder
          rows={rows}
          shown={filtered}
          selected={selected}
          onSelect={setSelected}
          onAdd={addScanned}
          onRemove={toggle}
          onMake={makePallet}
          onCancel={() => {
            setSelected(new Set());
            setBuilding(false);
          }}
          making={making}
          busy={making || palletJob !== null}
          canTick={can.pallets}
          canScan={can.palletsScan}
        />
      ) : null}

      {filtered.length === 0 ? (
        <Card className="rise p-10 text-center text-muted-foreground" data-testid="inventory-empty">
          {rows.length === 0 ? t("noStock") : t("noMatch")}
        </Card>
      ) : (
        <div
          className="rise grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
          style={{ "--i": 3 } as React.CSSProperties}
        >
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-semibold text-muted-foreground">
              {t("items.title", { count: groups.length })}
            </h2>
            <ul
              className="space-y-2 lg:max-h-[75vh] lg:overflow-y-auto lg:p-1"
              data-testid="inventory-items"
            >
              {groups.map((group) => (
                <li key={group.itemNumber} className="space-y-2">
                  <ItemButton
                    group={group}
                    open={group.itemNumber === openItem}
                    onClick={() => choose(group.itemNumber)}
                  />
                  {!wide && group.itemNumber === openItem ? details : null}
                </li>
              ))}
            </ul>
          </section>
          {wide ? <div className="lg:sticky lg:top-4">{details}</div> : null}
        </div>
      )}

      {palletJob ? <LabelPrintSheet job={palletJob} /> : null}

      {printing ? (
        <ReportPrintSheet dir={locale === "he" ? "rtl" : "ltr"}>
          <ReportBody rows={filtered} sums={sums} today={today} filters={filters} />
        </ReportPrintSheet>
      ) : null}
    </div>
  );
}

function RoomCard({
  name,
  code,
  sums,
  active,
  onClick,
  icon,
}: {
  name: string;
  code?: string;
  sums: ReturnType<typeof totals>;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  const t = useTranslations("inventory");
  const common = useTranslations("common");
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      data-testid="room-card"
      className={cn(
        "flex size-full items-start justify-between gap-3 rounded-2xl border p-4 text-start transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-md"
          : "border-border bg-card hover:border-gold/60 hover:bg-gold-soft/40",
      )}
    >
      <div className="min-w-0 space-y-1">
        <p dir="auto" className="text-start text-lg leading-tight font-semibold">
          {name}
        </p>
        {code ? (
          <p
            dir="ltr"
            className={cn(
              "text-start font-mono text-xs",
              active ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {code}
          </p>
        ) : null}
        <p
          className={cn(
            "flex flex-wrap gap-x-3 gap-y-0.5 pt-1 text-sm tabular-nums",
            active ? "text-primary-foreground/85" : "text-muted-foreground",
          )}
        >
          <span>{t("summary.boxes", { count: sums.boxes })}</span>
          <span>
            {formatWeight(sums.kg)} {common("kg")}
          </span>
          {sums.expired > 0 ? (
            <span className={cn("font-semibold", !active && "text-destructive")}>
              {t("summary.expired", { count: sums.expired })}
            </span>
          ) : null}
        </p>
      </div>
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full",
          active
            ? "bg-primary-foreground/15 text-primary-foreground"
            : "border border-gold/40 bg-gold-soft text-gold",
        )}
      >
        {icon}
      </span>
    </button>
  );
}

function ItemButton({
  group,
  open,
  onClick,
}: {
  group: ItemGroup;
  open: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("inventory");
  const common = useTranslations("common");
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      data-testid="inventory-item"
      data-item={group.itemNumber}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-start transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        // The chosen item: its outline drawn inside the card, so the edge of the list never cuts it.
        open
          ? "border-primary bg-gold-soft/40 shadow-sm ring-1 ring-primary ring-inset"
          : cn(
              "hover:border-gold/60",
              group.sums.expired > 0 ? "border-destructive/30 bg-destructive/5" : "border-border",
            ),
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          <span dir="auto" className="font-semibold">
            {group.itemName}
          </span>
          {group.category ? (
            <Badge variant="outline" className="font-normal">
              {group.category}
            </Badge>
          ) : null}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span dir="ltr">{group.itemNumber}</span>
          {group.sums.expired > 0 ? (
            <Badge variant="destructive">
              <AlertTriangle />
              {t("summary.expired", { count: group.sums.expired })}
            </Badge>
          ) : null}
          {group.sums.soon > 0 ? (
            <Badge variant="warning">{t("summary.soon", { count: group.sums.soon })}</Badge>
          ) : null}
        </p>
      </div>
      <div className="shrink-0 text-end">
        <p className="font-semibold tabular-nums">
          {formatWeight(group.sums.kg)}{" "}
          <span className="text-xs font-normal text-muted-foreground">{common("kg")}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {t("summary.boxes", { count: group.sums.boxes })}
        </p>
      </div>
    </button>
  );
}

/** The chosen item: its totals and every one of its boxes. */
function ItemDetails({
  group,
  showRoom,
  shown,
  onMore,
  pick,
}: {
  group: ItemGroup;
  showRoom: boolean;
  shown: number;
  onMore: () => void;
  pick: {
    selected: Set<string>;
    toggle: (barcode: string) => void;
    label: (barcode: string) => string;
  } | null;
}) {
  const t = useTranslations("inventory");
  const common = useTranslations("common");
  const visible = group.rows.slice(0, shown);
  const roomNames = [...new Set(group.rows.map((row) => row.warehouseName))];
  return (
    <Card className="gap-0 overflow-hidden p-0" data-testid="item-details">
      <div className="space-y-4 border-b border-border p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold-soft text-gold">
            <Package className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 dir="auto" className="font-serif text-xl font-semibold">
              {group.itemName}
            </h3>
            <p dir="ltr" className="text-start text-xs text-muted-foreground">
              {group.itemNumber}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label={t("items.weight")}>
            {formatWeight(group.sums.kg)} {common("kg")}
          </Stat>
          <Stat label={t("items.boxes")}>{t("summary.boxes", { count: group.sums.boxes })}</Stat>
          <Stat label={t("items.rooms")} className="col-span-2 sm:col-span-1">
            <span dir="auto">{roomNames.join(", ")}</span>
          </Stat>
        </dl>
      </div>

      <p className="px-4 pt-3 text-sm font-semibold text-muted-foreground">
        {t("items.boxList", { count: group.rows.length })}
      </p>
      <ul className="space-y-2 p-3" data-testid="inventory-boxes">
        {visible.map((row, index) => (
          <li
            key={`${row.barcode}-${index}`}
            data-testid="inventory-box"
            data-status={row.status}
            data-barcode={row.barcode}
            data-warehouse={row.warehouseName}
            className={cn(
              "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-border px-3 py-2.5",
              row.status === "expired" && "border-destructive/25 bg-destructive/5",
              row.status === "soon" && "border-warning/30 bg-warning-soft/70",
            )}
          >
            <div className="min-w-0 space-y-0.5">
              <p dir="ltr" className="text-start font-mono text-sm break-all">
                {row.barcode}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {t("columns.weight")}:{" "}
                <b dir="ltr" className="font-semibold text-foreground">
                  {formatWeight(row.weightKg)}
                </b>
                {showRoom ? (
                  <>
                    {" · "}
                    <span dir="auto">{row.warehouseName}</span>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="space-y-0.5 text-end text-xs text-muted-foreground tabular-nums">
                <p>
                  {t("columns.expiry")}:{" "}
                  <b
                    dir="ltr"
                    className={cn(
                      "font-semibold text-foreground",
                      row.status === "expired" && "text-destructive",
                      row.status === "soon" && "text-warning",
                    )}
                  >
                    {formatDate(row.expiryDate)}
                  </b>
                </p>
                <p>
                  {t("columns.entered")}: <span dir="ltr">{formatDate(row.enteredDate)}</span>
                  {row.slaughterDate ? (
                    <>
                      {" · "}
                      {t("columns.slaughter")}:{" "}
                      <span dir="ltr">{formatDate(row.slaughterDate)}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <StatusNote row={row} />
              {pick ? (
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  aria-label={pick.label(row.barcode)}
                  checked={pick.selected.has(row.barcode)}
                  onChange={() => pick.toggle(row.barcode)}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {group.rows.length > visible.length ? (
        <div className="border-t border-border bg-muted/40 p-3 text-center">
          <Button type="button" variant="outline" onClick={onMore}>
            {t("showMore", { shown: visible.length, total: group.rows.length })}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function Stat({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border px-3 py-2", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function StatusNote({ row }: { row: InventoryRow }) {
  const t = useTranslations("inventory");
  if (row.status === "valid") return null;
  return (
    <Badge variant={row.status === "expired" ? "destructive" : "warning"}>
      {row.status === "expired"
        ? t("expiredAgo", { count: -row.daysLeft })
        : row.daysLeft === 0
          ? t("expiresToday")
          : t("expiresIn", { count: row.daysLeft })}
    </Badge>
  );
}

function DateRange({
  label,
  from,
  to,
  onFrom,
  onTo,
  id,
}: {
  label: string;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  id: string;
}) {
  const t = useTranslations("inventory.filters");
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm leading-none font-medium">{label}</legend>
      <div className="grid grid-cols-2 gap-3">
        <Input
          id={`${id}-from`}
          type="date"
          dir="ltr"
          aria-label={`${label}: ${t("from")}`}
          value={from}
          onChange={(event) => onFrom(event.target.value)}
        />
        <Input
          id={`${id}-to`}
          type="date"
          dir="ltr"
          aria-label={`${label}: ${t("to")}`}
          value={to}
          onChange={(event) => onTo(event.target.value)}
        />
      </div>
    </fieldset>
  );
}

/** What the PDF holds: a heading, what was filtered, the totals and every box in plain black on white. */
function ReportBody({
  rows,
  sums,
  today,
  filters,
}: {
  rows: InventoryRow[];
  sums: ReturnType<typeof totals>;
  today: string;
  filters: InventoryFilters;
}) {
  const t = useTranslations("inventory");
  const common = useTranslations("common");
  const cell = "border border-neutral-400 px-2 py-1 text-start align-top";
  return (
    <div style={{ fontSize: "10pt", fontFamily: "inherit" }}>
      <h1 style={{ fontSize: "16pt", fontWeight: 700 }}>{t("report.title")}</h1>
      <p>
        {t("report.date", { date: formatDate(today) })} ·{" "}
        {t("summary.boxes", { count: sums.boxes })} · {formatWeight(sums.kg)} {common("kg")} ·{" "}
        {t("summary.expired", { count: sums.expired })} · {t("summary.soon", { count: sums.soon })}
      </p>
      {hasFilters(filters) ? <p>{t("report.filtered")}</p> : null}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "6mm" }}>
        <thead>
          <tr style={{ background: "#eee" }}>
            {(
              ["item", "warehouse", "barcode", "weight", "slaughter", "expiry", "entered"] as const
            ).map((column) => (
              <th key={column} className={cell}>
                {t(`columns.${column}`)}
              </th>
            ))}
            <th className={cell}>{t("columns.status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${row.barcode}-${index}`}
              style={{
                background:
                  row.status === "expired"
                    ? "#fbe3e1"
                    : row.status === "soon"
                      ? "#fcf1dc"
                      : undefined,
              }}
            >
              <td className={cell}>
                {row.itemName} <span dir="ltr">({row.itemNumber})</span>
              </td>
              <td className={cell}>{row.warehouseName}</td>
              <td className={cell} dir="ltr">
                {row.barcode}
              </td>
              <td className={cell} dir="ltr">
                {formatWeight(row.weightKg)}
              </td>
              <td className={cell} dir="ltr">
                {row.slaughterDate ? formatDate(row.slaughterDate) : "—"}
              </td>
              <td className={cell} dir="ltr">
                {formatDate(row.expiryDate)}
              </td>
              <td className={cell} dir="ltr">
                {formatDate(row.enteredDate)}
              </td>
              <td className={cell}>{t(`status.${row.status}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: "4mm" }}>{t("report.count", { count: formatInteger(rows.length) })}</p>
    </div>
  );
}
