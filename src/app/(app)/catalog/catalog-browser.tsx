"use client";

import { Check, Layers, ListChecks, Package, Printer, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { DialogTitleBlock } from "@/components/dialog-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { categoryCounts, filterItems, sortByName } from "@/lib/catalog";
import { formatWeight } from "@/lib/i18n/format";
import { MAX_BATCH_ITEMS } from "@/lib/labels/item-label";
import { cn } from "@/lib/utils";
import { ItemPackaging, type PackagingChoices } from "./item-packaging";
import type { PriorityItem } from "@/server/priority/types";
import { BatchPrintDialog } from "./batch-print";
import { PrintForm, type PrintSettings } from "./print-dialog";

/**
 * The catalog: search, every category as a card with its count (opening shows its items), and
 * every item as a card under its category. Opening an item shows its details and, for people who
 * may, prints its label. Read only; the names, categories and texts are Priority's own and are
 * shown as they are in either language. Every item is on the page already, so search is instant.
 */
export function CatalogBrowser({
  items,
  canOpenDetails,
  print,
  packaging,
}: {
  items: PriorityItem[];
  canOpenDetails: boolean;
  /** The packaging types and each item's choice; null for people who may not open the details. */
  packaging: PackagingChoices | null;
  /** Present for people who may print item labels: the layouts, and what else they may change. */
  print: PrintSettings | null;
}) {
  const t = useTranslations("catalog");
  const [query, setQuery] = useState("");
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<PriorityItem | null>(null);
  // Choosing several items to print their labels together: the chosen ones, in the order chosen.
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);

  // Categories, and the items inside each, always in alphabetical order so an item is easy to find.
  const categories = useMemo(() => categoryCounts(items), [items]);
  const sorted = useMemo(() => sortByName(items), [items]);
  const shown = useMemo(() => filterItems(sorted, { category: null, query }), [sorted, query]);
  // The shown items under their categories, in the order of the category cards.
  const sections = useMemo(
    () =>
      categories
        .map(({ category }) => ({
          category,
          items: shown.filter((item) => item.category === category),
        }))
        .filter((section) => section.items.length > 0),
    [categories, shown],
  );
  const categoryLabel = (value: string) => (value === "" ? t("uncategorized") : value);
  // An item opens only for someone who may see its details or print its label.
  const canOpen = canOpenDetails || print !== null;

  const byNumber = useMemo(() => new Map(items.map((item) => [item.itemNumber, item])), [items]);
  const chosenItems = chosen.flatMap((number) => byNumber.get(number) ?? []);

  function toggle(item: PriorityItem) {
    setChosen((current) =>
      current.includes(item.itemNumber)
        ? current.filter((number) => number !== item.itemNumber)
        : current.length >= MAX_BATCH_ITEMS
          ? current
          : [...current, item.itemNumber],
    );
  }

  function stopSelecting() {
    setSelecting(false);
    setChosen([]);
    setBatchOpen(false);
  }

  function chooseItem(item: PriorityItem) {
    if (selecting) return toggle(item);
    setOpenCategory(null);
    setOpenItem(item);
  }

  return (
    <div className="space-y-5">
      <div className="rise relative" style={{ "--i": 1 } as React.CSSProperties}>
        <Search
          aria-hidden
          className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="ps-10"
          autoComplete="off"
        />
      </div>

      <Card className="rise p-4" style={{ "--i": 2 } as React.CSSProperties}>
        <div
          role="group"
          aria-label={t("categories")}
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6"
        >
          <CategoryCard
            active
            label={t("allCategories")}
            count={items.length}
            onClick={() => setQuery("")}
            ariaLabel={t("allCategoriesAction", { count: items.length })}
          />
          {categories.map(({ category, count }) => (
            <CategoryCard
              key={category || "none"}
              label={categoryLabel(category)}
              count={count}
              onClick={() => setOpenCategory(category)}
              ariaLabel={t("openCategory", { category: categoryLabel(category), count })}
            />
          ))}
        </div>
      </Card>

      <div
        className="rise flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
        style={{ "--i": 3 } as React.CSSProperties}
      >
        <p className="text-sm text-muted-foreground">
          {selecting ? t("select.hint") : canOpen ? t("listHint") : t("listHintReadOnly")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {print !== null ? (
            <Button
              type="button"
              variant={selecting ? "default" : "outline"}
              size="sm"
              aria-pressed={selecting}
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            >
              {selecting ? <X data-icon="inline-start" /> : <ListChecks data-icon="inline-start" />}
              {selecting ? t("select.cancel") : t("select.start")}
            </Button>
          ) : null}
          <Badge variant="soft" className="tabular-nums">
            <span role="status">{t("totalShown", { count: shown.length })}</span>
          </Badge>
        </div>
      </div>

      {shown.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="text-muted-foreground">{t("empty")}</p>
          <Button variant="outline" onClick={() => setQuery("")}>
            {t("clear")}
          </Button>
        </Card>
      ) : (
        sections.map((section) => (
          <section
            key={section.category || "none"}
            aria-label={categoryLabel(section.category)}
            className="space-y-3"
            data-testid="catalog-section"
          >
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-4 py-2.5">
              <h2 className="flex min-w-0 items-center gap-2 font-semibold">
                <Layers className="size-4 shrink-0 text-gold" aria-hidden />
                <span dir="auto" className="truncate">
                  {categoryLabel(section.category)}
                </span>
              </h2>
              <Badge variant="soft" className="tabular-nums">
                {t("count", { count: section.items.length })}
              </Badge>
            </div>
            <ul className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-8">
              {section.items.map((item) => (
                <li key={item.itemNumber} className="min-w-0">
                  <ItemCard
                    item={item}
                    category={categoryLabel(item.category)}
                    onOpen={canOpen ? () => chooseItem(item) : null}
                    selected={selecting ? chosen.includes(item.itemNumber) : undefined}
                    openLabel={selecting ? t("select.selectItem", { name: item.name }) : undefined}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <CategoryDialog
        category={openCategory}
        label={openCategory === null ? "" : categoryLabel(openCategory)}
        items={openCategory === null ? [] : sorted.filter((i) => i.category === openCategory)}
        onOpenItem={canOpen ? chooseItem : null}
        chosen={selecting ? chosen : null}
        onClose={() => setOpenCategory(null)}
      />
      <ItemDialog
        packaging={packaging}
        item={openItem}
        canOpenDetails={canOpenDetails}
        print={print}
        onClose={() => setOpenItem(null)}
      />

      {selecting && print ? (
        <>
          <div
            className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-card px-4 py-3 shadow-lg"
            data-testid="select-bar"
          >
            <p className="text-sm font-semibold" role="status" data-testid="select-count">
              {t("select.count", { count: chosen.length })}
              {chosen.length >= MAX_BATCH_ITEMS ? (
                <span className="ms-2 font-normal text-muted-foreground">
                  {t("select.limit", { max: MAX_BATCH_ITEMS })}
                </span>
              ) : null}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={chosen.length === 0}
                onClick={() => setChosen([])}
              >
                {t("select.clear")}
              </Button>
              <Button
                type="button"
                disabled={chosen.length === 0}
                onClick={() => setBatchOpen(true)}
              >
                <Printer data-icon="inline-start" />
                {t("select.print")}
              </Button>
            </div>
          </div>
          <BatchPrintDialog
            items={batchOpen ? chosenItems : null}
            settings={print}
            onRemove={(number) => setChosen((current) => current.filter((n) => n !== number))}
            onClose={() => setBatchOpen(false)}
            onDone={stopSelecting}
          />
        </>
      ) : null}
    </div>
  );
}

export function CategoryCard({
  active = false,
  label,
  count,
  onClick,
  ariaLabel,
}: {
  active?: boolean;
  label: string;
  count: number;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-start text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-primary/40 bg-primary/5 text-primary"
          : "border-border bg-card text-foreground hover:border-gold/60 hover:bg-secondary/60",
      )}
    >
      <span dir="auto" className="min-w-0 truncate">
        {label}
      </span>
      <Badge variant={active ? "default" : "outline"} className="shrink-0 tabular-nums" aria-hidden>
        {count}
      </Badge>
    </button>
  );
}

/** One item: its category, both names, and the item number at the foot. */
export function ItemCard({
  item,
  category,
  onOpen,
  openLabel,
  selected,
}: {
  item: PriorityItem;
  category: string;
  onOpen: (() => void) | null;
  /** What the button says to a screen reader; opening the item's window by default. */
  openLabel?: string;
  /** Set while items are being chosen: whether this one is chosen. Left out when not choosing. */
  selected?: boolean;
}) {
  const t = useTranslations("catalog");
  const body = (
    <>
      <Badge variant="soft" className="max-w-full self-start truncate text-[0.7rem]">
        <span dir="auto" className="truncate">
          {category}
        </span>
      </Badge>
      {/* The name always has room for two lines and the English name for one, so every card is the same height. */}
      <span
        dir="auto"
        title={item.name}
        className="mt-2 line-clamp-2 min-h-[2lh] text-sm leading-snug font-semibold"
      >
        {item.name}
      </span>
      <span
        dir="auto"
        title={item.nameEn || undefined}
        className="mt-0.5 block min-h-[1lh] truncate text-xs text-muted-foreground"
      >
        {item.nameEn}
      </span>
      <span className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        <span>{t("itemNumberLabel")}</span>
        <span dir="ltr" className="font-mono text-foreground">
          {item.itemNumber}
        </span>
      </span>
    </>
  );
  const box = cn(
    "relative flex h-full w-full flex-col gap-1 rounded-xl border bg-card p-3 text-start shadow-card",
    selected ? "border-primary/60 bg-primary/5 ring-2 ring-primary/30" : "border-border",
  );
  if (!onOpen) return <div className={box}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={openLabel ?? t("openItem", { name: item.name })}
      aria-pressed={selected}
      data-selected={selected}
      className={cn(
        box,
        "transition-colors outline-none hover:border-gold/60 focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      {selected !== undefined ? (
        <span
          aria-hidden
          className={cn(
            "absolute end-2 top-2 grid size-5 place-items-center rounded-full border",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
          )}
        >
          {selected ? <Check className="size-3" /> : null}
        </span>
      ) : null}
      {body}
    </button>
  );
}

/** The items of one category, as small cards; opening one shows the item. */
function CategoryDialog({
  category,
  label,
  items,
  onOpenItem,
  chosen,
  onClose,
}: {
  category: string | null;
  label: string;
  items: PriorityItem[];
  onOpenItem: ((item: PriorityItem) => void) | null;
  /** The item numbers chosen for printing together while items are being chosen; otherwise null. */
  chosen: string[] | null;
  onClose: () => void;
}) {
  const t = useTranslations("catalog.categoryDialog");
  return (
    <Dialog open={category !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        {category !== null ? (
          <>
            <DialogTitleBlock
              icon={<Layers />}
              title={t("title", { category: label })}
              description={t("found", { count: items.length })}
            />
            <ul
              className="grid auto-rows-fr grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
              data-testid="category-items"
            >
              {items.map((item) => {
                const body = (
                  <>
                    {/* Room for two lines always, so every box is the same height. */}
                    <span
                      dir="auto"
                      title={item.name}
                      className="line-clamp-2 min-h-[2lh] text-sm leading-snug font-semibold"
                    >
                      {item.name}
                    </span>
                    <span dir="ltr" className="mt-1.5 block font-mono text-xs text-info">
                      {t("itemNumber", { number: item.itemNumber })}
                    </span>
                  </>
                );
                const picked = chosen?.includes(item.itemNumber);
                const box = cn(
                  "flex h-full w-full flex-col items-center justify-center rounded-xl border px-2.5 py-3 text-center",
                  picked
                    ? "border-primary/60 bg-primary/5 ring-2 ring-primary/30"
                    : "border-border bg-muted/40",
                );
                return (
                  <li key={item.itemNumber} className="min-w-0">
                    {onOpenItem ? (
                      <button
                        type="button"
                        onClick={() => onOpenItem(item)}
                        aria-pressed={chosen ? picked : undefined}
                        className={cn(
                          box,
                          "transition-colors outline-none hover:border-gold/60 hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50",
                        )}
                      >
                        {body}
                      </button>
                    ) : (
                      <div className={box}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
            <DialogFooter>
              <Button type="button" size="lg" onClick={onClose}>
                {t("close")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * One item's window: its details as Priority has them, and printing its label. Someone who may
 * only print goes straight to printing; someone who may only look sees the details.
 */
function ItemDialog({
  item,
  canOpenDetails,
  print,
  packaging,
  onClose,
}: {
  item: PriorityItem | null;
  canOpenDetails: boolean;
  packaging: PackagingChoices | null;
  print: PrintSettings | null;
  onClose: () => void;
}) {
  const [printing, setPrinting] = useState(false);
  const showPrint = print !== null && (printing || !canOpenDetails);

  function close() {
    setPrinting(false);
    onClose();
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent
        className={cn("max-h-[90vh] overflow-y-auto", showPrint ? "sm:max-w-3xl" : "sm:max-w-xl")}
      >
        {item && showPrint && print ? (
          <PrintForm
            key={item.itemNumber}
            item={item}
            settings={print}
            onDone={close}
            onCancel={canOpenDetails ? () => setPrinting(false) : close}
          />
        ) : item ? (
          <ItemDetails
            key={item.itemNumber}
            item={item}
            packaging={packaging}
            onPrint={print ? () => setPrinting(true) : null}
            onClose={close}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ItemDetails({
  item,
  packaging,
  onPrint,
  onClose,
}: {
  item: PriorityItem;
  packaging: PackagingChoices | null;
  onPrint: (() => void) | null;
  onClose: () => void;
}) {
  const t = useTranslations("catalog.details");
  const common = useTranslations("common");
  const catalog = useTranslations("catalog");

  const rows: { label: string; value: string; mono?: boolean; auto?: boolean }[] = [
    { label: t("fields.itemNumber"), value: item.itemNumber, mono: true },
    { label: t("fields.name"), value: item.name, auto: true },
    { label: t("fields.nameEn"), value: item.nameEn, auto: true },
    { label: t("fields.barcode"), value: item.barcode, mono: true },
    {
      label: t("fields.category"),
      value: item.category === "" ? catalog("uncategorized") : item.category,
      auto: true,
    },
    {
      label: t("fields.weight"),
      value: item.weightKg === null ? "" : `${formatWeight(item.weightKg)} ${common("kg")}`,
    },
    { label: t("fields.shelfLife"), value: catalog("shelfLifeDays", { days: item.shelfLifeDays }) },
    { label: t("fields.storage"), value: item.storageText, auto: true },
    { label: t("fields.packing"), value: item.packingCode, auto: true },
    { label: t("fields.origin"), value: item.origin, auto: true },
    {
      label: t("fields.inventoryManaged"),
      value: item.inventoryManaged ? common("yes") : common("no"),
    },
  ];

  return (
    <>
      <DialogTitleBlock icon={<Package />} title={item.name} description={t("readOnly")} />
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">{row.label}</dt>
            {/* The text keeps its own direction, but always lines up under its title. */}
            <dd className={cn("mt-0.5 break-words", row.mono && "font-mono text-sm")}>
              {row.value === "" ? (
                <span className="text-muted-foreground">{t("notSet")}</span>
              ) : (
                <span dir={row.mono ? "ltr" : row.auto ? "auto" : undefined}>{row.value}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {packaging ? <ItemPackaging itemNumber={item.itemNumber} choices={packaging} /> : null}
      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onClose}>
          {common("close")}
        </Button>
        {onPrint ? (
          <Button type="button" size="lg" onClick={onPrint}>
            <Printer data-icon="inline-start" />
            {t("printLabel")}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}
