"use client";

import { Layers, Package, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { DialogTitleBlock } from "@/components/dialog-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { categoryCounts, filterItems, sortByName } from "@/lib/catalog";
import type { PriorityItem } from "@/server/priority/types";
import { CategoryCard, ItemCard } from "../catalog/catalog-browser";

/**
 * Choosing an item the way the catalog shows them: search, the categories as cards, and the
 * items as cards under their category. Choosing a category shows only its items. Picking an
 * item calls onPick (the caller closes the window); closing it without one calls onClose.
 */
export function ItemPicker({
  open,
  items,
  onPick,
  onClose,
}: {
  open: boolean;
  items: PriorityItem[];
  onPick: (item: PriorityItem) => void;
  onClose: () => void;
}) {
  const t = useTranslations("receiving.picker");
  const catalog = useTranslations("catalog");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => categoryCounts(items), [items]);
  const sorted = useMemo(() => sortByName(items), [items]);
  const shown = useMemo(() => filterItems(sorted, { category, query }), [sorted, category, query]);
  const sections = useMemo(
    () =>
      categories
        .map(({ category: name }) => ({
          category: name,
          items: shown.filter((item) => item.category === name),
        }))
        .filter((section) => section.items.length > 0),
    [categories, shown],
  );
  const categoryLabel = (value: string) => (value === "" ? catalog("uncategorized") : value);

  function close() {
    setQuery("");
    setCategory(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-6xl"
        data-testid="item-picker"
      >
        <DialogTitleBlock icon={<Package />} title={t("title")} description={t("description")} />

        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={catalog("searchPlaceholder")}
            aria-label={catalog("searchLabel")}
            className="ps-10"
            autoComplete="off"
          />
        </div>

        <div
          role="group"
          aria-label={catalog("categories")}
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
        >
          <CategoryCard
            active={category === null}
            label={catalog("allCategories")}
            count={items.length}
            onClick={() => setCategory(null)}
            ariaLabel={catalog("allCategoriesAction", { count: items.length })}
          />
          {categories.map(({ category: name, count }) => (
            <CategoryCard
              key={name || "none"}
              active={category === name}
              label={categoryLabel(name)}
              count={count}
              onClick={() => setCategory(name)}
              ariaLabel={catalog("openCategory", { category: categoryLabel(name), count })}
            />
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">{catalog("empty")}</p>
        ) : (
          sections.map((section) => (
            <section
              key={section.category || "none"}
              aria-label={categoryLabel(section.category)}
              className="space-y-3"
            >
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-4 py-2.5">
                <h3 className="flex min-w-0 items-center gap-2 font-semibold">
                  <Layers className="size-4 shrink-0 text-gold" aria-hidden />
                  <span dir="auto" className="truncate">
                    {categoryLabel(section.category)}
                  </span>
                </h3>
                <Badge variant="soft" className="tabular-nums">
                  {catalog("count", { count: section.items.length })}
                </Badge>
              </div>
              <ul className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {section.items.map((item) => (
                  <li key={item.itemNumber} className="min-w-0">
                    <ItemCard
                      item={item}
                      category={categoryLabel(item.category)}
                      openLabel={t("choose", { name: item.name, number: item.itemNumber })}
                      onOpen={() => {
                        setQuery("");
                        setCategory(null);
                        onPick(item);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        <DialogFooter>
          <Button type="button" variant="outline" size="lg" onClick={close}>
            {t("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
