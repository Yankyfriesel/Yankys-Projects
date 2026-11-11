"use client";

import { CloudOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  setCategoryAlertDaysAction,
  setCategoryShelfLifeAction,
  setCategoryStorageTextAction,
  setCategoryWarehouseAction,
  setVendorOrderAction,
} from "./receiving-actions";

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 sm:w-72";

function CardShell({
  title,
  description,
  index,
  children,
}: {
  title: string;
  description: string;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <Card
      role="region"
      aria-label={title}
      className="rise gap-0 overflow-hidden p-0"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="space-y-1 border-b border-border px-5 py-4">
        <h2 className="font-serif text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </Card>
  );
}

function Unavailable({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 border-b border-border bg-warning-soft px-5 py-3 text-sm text-warning">
      <CloudOff className="size-4 shrink-0" />
      {text}
    </p>
  );
}

/** Which storage room each category's boxes go into; a choice is saved at once. */
export function CategoryWarehousesCard({
  categories,
  warehouses,
  chosen: initial,
  defaultWarehouse,
  alertDays: initialDays,
  defaultAlertDays,
  storageTexts: initialTexts,
  shelfLives: initialLives,
  canEdit,
  priorityDown,
  index,
}: {
  categories: { category: string; count: number }[];
  warehouses: { code: string; name: string }[];
  chosen: Record<string, string>;
  defaultWarehouse: string;
  /** Days before expiry that count as "about to expire", for the categories that have their own. */
  alertDays: Record<string, number>;
  defaultAlertDays: number;
  /** The storage text each category's labels print when Priority gives the item none. */
  storageTexts: Record<string, string>;
  /** Days from the slaughter date to the expiry date, for the categories that have them. */
  shelfLives: Record<string, number>;
  canEdit: boolean;
  priorityDown: boolean;
  index: number;
}) {
  const t = useTranslations("settings.categoryWarehouses");
  const errors = useTranslations("settings.receivingErrors");
  const [chosen, setChosen] = useState(initial);
  const [pending, startTransition] = useTransition();

  function choose(category: string, code: string) {
    const before = chosen;
    setChosen((current) => {
      const next = { ...current };
      if (code) next[category] = code;
      else delete next[category];
      return next;
    });
    startTransition(async () => {
      const result = await setCategoryWarehouseAction(category, code);
      if (!result.ok) {
        setChosen(before);
        return void toast.error(errors(result.error));
      }
      toast.success(t("saved"));
    });
  }

  // Typing is local; the number is saved when the box is left. An empty box means the default.
  const [savedDays, setSavedDays] = useState(initialDays);
  const [days, setDays] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initialDays).map(([key, value]) => [key, String(value)])),
  );

  function saveDays(category: string) {
    const text = (days[category] ?? "").trim();
    const value = text === "" ? null : Number(text);
    const before = savedDays[category] ?? null;
    if (value === before) return;
    startTransition(async () => {
      const result = await setCategoryAlertDaysAction(category, value);
      if (!result.ok) {
        setDays((current) => ({ ...current, [category]: before === null ? "" : String(before) }));
        return void toast.error(
          result.error === "INVALID_DAYS" ? t("invalidDays") : errors(result.error),
        );
      }
      setSavedDays((current) => {
        const next = { ...current };
        if (value === null) delete next[category];
        else next[category] = value;
        return next;
      });
      toast.success(t("daysSaved"));
    });
  }

  // The shelf life: typed here, saved when the box is left. An empty box means none.
  const [savedLives, setSavedLives] = useState(initialLives);
  const [lives, setLives] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initialLives).map(([key, value]) => [key, String(value)])),
  );

  function saveLife(category: string) {
    const text = (lives[category] ?? "").trim();
    const value = text === "" ? null : Number(text);
    const before = savedLives[category] ?? null;
    if (value === before) return;
    startTransition(async () => {
      const result = await setCategoryShelfLifeAction(category, value);
      if (!result.ok) {
        setLives((current) => ({ ...current, [category]: before === null ? "" : String(before) }));
        return void toast.error(
          result.error === "INVALID_DAYS" ? t("invalidShelfLife") : errors(result.error),
        );
      }
      setSavedLives((current) => {
        const next = { ...current };
        if (value === null) delete next[category];
        else next[category] = value;
        return next;
      });
      toast.success(t("shelfLifeSaved"));
    });
  }

  // Like the days: typed here, saved when the box is left. An empty box means none.
  const [savedTexts, setSavedTexts] = useState(initialTexts);
  const [texts, setTexts] = useState(initialTexts);

  function saveText(category: string) {
    const value = (texts[category] ?? "").trim();
    const before = savedTexts[category] ?? "";
    if (value === before) return;
    startTransition(async () => {
      const result = await setCategoryStorageTextAction(category, value);
      if (!result.ok) {
        setTexts((current) => ({ ...current, [category]: before }));
        return void toast.error(
          result.error === "TOO_LONG" ? t("storageTooLong") : errors(result.error),
        );
      }
      setSavedTexts((current) => ({ ...current, [category]: value }));
      toast.success(t("storageSaved"));
    });
  }

  const label = (category: string) => (category === "" ? t("uncategorized") : category);
  return (
    <CardShell
      title={t("title")}
      description={t("description", { warehouse: defaultWarehouse, days: defaultAlertDays })}
      index={index}
    >
      {priorityDown ? <Unavailable text={t("unavailable")} /> : null}
      {categories.length === 0 ? (
        <p className="px-6 py-10 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {categories.map(({ category, count }) => (
            <li
              key={category || "none"}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span dir="auto" className="truncate font-medium">
                  {label(category)}
                </span>
                <Badge variant="soft" className="tabular-nums">
                  {t("items", { count })}
                </Badge>
              </div>
              <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  {t("shelfLife")}
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={3650}
                    dir="ltr"
                    aria-label={t("shelfLifeFor", { category: label(category) })}
                    placeholder="—"
                    value={lives[category] ?? ""}
                    disabled={!canEdit || pending}
                    onChange={(event) =>
                      setLives((current) => ({ ...current, [category]: event.target.value }))
                    }
                    onBlur={() => saveLife(category)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    className="h-10 w-24"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  {t("alertDays")}
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={365}
                    dir="ltr"
                    aria-label={t("alertDaysFor", { category: label(category) })}
                    placeholder={String(defaultAlertDays)}
                    value={days[category] ?? ""}
                    disabled={!canEdit || pending}
                    onChange={(event) =>
                      setDays((current) => ({ ...current, [category]: event.target.value }))
                    }
                    onBlur={() => saveDays(category)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    className="h-10 w-20"
                  />
                </label>
                <select
                  aria-label={t("choose", { category: label(category) })}
                  value={chosen[category] ?? ""}
                  disabled={!canEdit || pending || priorityDown}
                  onChange={(event) => choose(category, event.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">{t("automatic", { warehouse: defaultWarehouse })}</option>
                  {warehouses.map((w) => (
                    <option key={w.code} value={w.code}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="w-full space-y-1 text-sm text-muted-foreground">
                <span>{t("storageText")}</span>
                <textarea
                  dir="rtl"
                  rows={2}
                  maxLength={300}
                  aria-label={t("storageTextFor", { category: label(category) })}
                  placeholder={t("storagePlaceholder")}
                  value={texts[category] ?? ""}
                  disabled={!canEdit || pending}
                  onChange={(event) =>
                    setTexts((current) => ({ ...current, [category]: event.target.value }))
                  }
                  onBlur={() => saveText(category)}
                  className="block w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

/** The one order every vendor box is received under. */
export function VendorOrderCard({
  orders,
  chosen: initial,
  canEdit,
  priorityDown,
  index,
}: {
  orders: { docno: string; date: string }[];
  chosen: string;
  canEdit: boolean;
  priorityDown: boolean;
  index: number;
}) {
  const t = useTranslations("settings.vendorOrderCard");
  const errors = useTranslations("settings.receivingErrors");
  const [chosen, setChosen] = useState(initial);
  const [pending, startTransition] = useTransition();

  const [typed, setTyped] = useState("");

  function choose(docno: string, fromTyping = false) {
    const before = chosen;
    setChosen(docno);
    startTransition(async () => {
      const result = await setVendorOrderAction(docno);
      if (!result.ok) {
        setChosen(before);
        return void toast.error(errors(result.error));
      }
      if (fromTyping) setTyped("");
      // A number Priority does not list is saved all the same, with a word of care.
      if (result.listed === false) toast.warning(t("notListed"), { duration: 12_000 });
      else toast.success(t("saved"));
    });
  }

  return (
    <CardShell title={t("title")} description={t("description")} index={index}>
      {priorityDown ? <Unavailable text={t("unavailable")} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4">
        <label htmlFor="vendor-order" className="font-medium">
          {t("label")}
        </label>
        <select
          id="vendor-order"
          value={chosen}
          disabled={!canEdit || pending || priorityDown}
          onChange={(event) => choose(event.target.value)}
          className={SELECT_CLASS}
          dir="ltr"
        >
          <option value="">{t("automatic")}</option>
          {/* A number typed in, or chosen earlier, that Priority does not list stays in the list. */}
          {chosen && !orders.some((o) => o.docno === chosen) ? (
            <option value={chosen}>{chosen}</option>
          ) : null}
          {orders.map((o) => (
            <option key={o.docno} value={o.docno}>
              {o.docno}
            </option>
          ))}
        </select>
      </div>
      {canEdit ? (
        <form
          className="space-y-2 border-t border-border px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (typed.trim()) choose(typed.trim(), true);
          }}
        >
          <label htmlFor="vendor-order-custom" className="block font-medium">
            {t("customLabel")}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="vendor-order-custom"
              data-testid="vendor-order-custom"
              value={typed}
              maxLength={40}
              dir="ltr"
              autoComplete="off"
              placeholder={t("customPlaceholder")}
              disabled={pending}
              onChange={(event) => setTyped(event.target.value)}
              className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 sm:max-w-xs"
            />
            <Button type="submit" disabled={pending || typed.trim() === ""}>
              {t("customSave")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("customHint")}</p>
        </form>
      ) : null}
    </CardShell>
  );
}
