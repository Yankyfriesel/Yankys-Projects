"use client";

import { ListChecks, Package, ScanLine, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatWeight } from "@/lib/i18n/format";
import type { InventoryRow } from "@/lib/inventory";
import { MAX_PALLET_BOXES } from "@/lib/pallets";
import { cn } from "@/lib/utils";

type Notice = { kind: "added" | "again" | "unknown" | "full"; text: string };

/**
 * Building a pallet: the boxes for it are picked by ticking them in the list, or by scanning them
 * with the scanner (each way has its own permission), and both land in the same list shown here,
 * where a box can be taken off again. The button at the top makes the pallet. It is open only
 * after "Build a pallet" was pressed, so boxes are never ticked by chance.
 */
export function PalletBuilder({
  rows,
  shown,
  selected,
  onSelect,
  onAdd,
  onRemove,
  onMake,
  onCancel,
  making,
  busy,
  canTick,
  canScan,
}: {
  /** Every box in stock: a scan finds its box among them, whatever the filters show. */
  rows: InventoryRow[];
  /** The boxes the filters show now, for "tick the shown". */
  shown: InventoryRow[];
  selected: Set<string>;
  onSelect: (barcodes: Set<string>) => void;
  onAdd: (barcode: string) => void;
  onRemove: (barcode: string) => void;
  onMake: () => void;
  /** Stops building: the boxes picked are let go and the ticks leave the list. */
  onCancel: () => void;
  making: boolean;
  /** A pallet is being made or its label printed: nothing can be changed meanwhile. */
  busy: boolean;
  canTick: boolean;
  canScan: boolean;
}) {
  const t = useTranslations("pallets.create");
  const common = useTranslations("common");
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);

  // The button that opens the builder is at the top of the screen: bring the builder into view,
  // ready for the first scan.
  useEffect(() => {
    panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    input.current?.focus({ preventScroll: true });
  }, []);

  const byBarcode = new Map(rows.map((row) => [row.barcode, row]));
  const picked = [...selected].flatMap((barcode) => {
    const row = byBarcode.get(barcode);
    return row ? [row] : [];
  });
  const kg = picked.reduce((sum, row) => sum + row.weightKg, 0);
  const tickable = Math.min(shown.length, MAX_PALLET_BOXES);

  function scan() {
    const code = text.trim();
    setText("");
    input.current?.focus();
    if (!code) return;
    const row =
      byBarcode.get(code) ?? rows.find((r) => r.barcode.toLowerCase() === code.toLowerCase());
    if (!row) return setNotice({ kind: "unknown", text: t("scan.unknown", { barcode: code }) });
    if (selected.has(row.barcode))
      return setNotice({ kind: "again", text: t("scan.again", { name: row.itemName }) });
    if (selected.size >= MAX_PALLET_BOXES)
      return setNotice({ kind: "full", text: t("scan.full", { max: MAX_PALLET_BOXES }) });
    onAdd(row.barcode);
    setNotice({
      kind: "added",
      text: t("scan.added", { name: row.itemName, weight: formatWeight(row.weightKg) }),
    });
  }

  return (
    <section
      ref={panel}
      className="rise scroll-mt-20 overflow-hidden rounded-2xl border border-border bg-card shadow-card"
      data-testid="pallet-toolbar"
    >
      {/* The pallet as it stands: how many boxes, their weight, and the button that makes it. */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold-soft text-gold">
            <Package className="size-5" aria-hidden />
          </span>
          <div className="space-y-0.5">
            <h2 className="font-serif text-lg leading-tight font-semibold">{t("title")}</h2>
            <p className="text-sm text-muted-foreground tabular-nums" data-testid="pallet-selected">
              {t("selected", { count: selected.size })}
              {selected.size > 0 ? ` · ${formatWeight(kg)} ${common("kg")}` : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            <X data-icon="inline-start" />
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={selected.size === 0 || selected.size > MAX_PALLET_BOXES || busy}
            onClick={onMake}
          >
            <Package data-icon="inline-start" />
            {making ? t("making") : t("create", { count: selected.size })}
          </Button>
        </div>
      </header>

      {/* The two ways of picking boxes, side by side. */}
      <div
        className={cn(
          "grid divide-y divide-border md:divide-y-0",
          canTick && canScan && "md:grid-cols-2 md:divide-x md:rtl:divide-x-reverse",
        )}
      >
        {canTick ? (
          <div className="space-y-3 px-5 py-4">
            <div className="flex items-start gap-2.5">
              <ListChecks className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold">{t("tick.title")}</h3>
                <p className="text-xs text-muted-foreground">{t("tick.hint")}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={shown.length === 0 || busy}
                onClick={() =>
                  onSelect(new Set(shown.slice(0, MAX_PALLET_BOXES).map((row) => row.barcode)))
                }
              >
                {t("selectShown", { count: tickable })}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={selected.size === 0 || busy}
                onClick={() => onSelect(new Set())}
              >
                {t("clear")}
              </Button>
            </div>
          </div>
        ) : null}

        {canScan ? (
          <div className="space-y-3 px-5 py-4" data-testid="pallet-scan">
            <div className="flex items-start gap-2.5">
              <ScanLine className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold">{t("scan.title")}</h3>
                <p className="text-xs text-muted-foreground">{t("scan.hint")}</p>
              </div>
            </div>
            {/* A barcode reads left to right, so the box and its icon do too. */}
            <div className="relative" dir="ltr">
              <ScanLine
                aria-hidden
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-primary"
              />
              <Input
                ref={input}
                autoComplete="off"
                aria-label={t("scan.label")}
                data-testid="pallet-scan-input"
                disabled={busy}
                value={text}
                placeholder={t("scan.placeholder")}
                className="h-10 border-primary/40 ps-9 focus-visible:border-primary"
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  scan();
                }}
              />
            </div>
            {notice ? (
              <p
                role="status"
                data-testid="pallet-scan-notice"
                data-kind={notice.kind}
                className={cn(
                  "text-sm",
                  notice.kind === "added" && "text-success",
                  notice.kind === "again" && "text-muted-foreground",
                  (notice.kind === "unknown" || notice.kind === "full") && "text-destructive",
                )}
              >
                {notice.text}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* The boxes picked so far, however they were picked. */}
      {picked.length > 0 ? (
        <div className="space-y-2 border-t border-border bg-muted/30 px-5 py-4">
          <h3 className="text-xs font-semibold text-muted-foreground">{t("picked")}</h3>
          <ul
            className="flex max-h-40 flex-wrap gap-2 overflow-y-auto"
            data-testid="pallet-scanned"
          >
            {picked.map((row) => (
              <li
                key={row.barcode}
                className="flex items-center gap-2 rounded-lg border border-border bg-card py-1 ps-3 pe-1 text-sm"
              >
                <span dir="auto" className="font-medium">
                  {row.itemName}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatWeight(row.weightKg)} {common("kg")}
                </span>
                <button
                  type="button"
                  aria-label={t("scan.remove", { name: row.itemName })}
                  disabled={busy}
                  onClick={() => onRemove(row.barcode)}
                  className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
