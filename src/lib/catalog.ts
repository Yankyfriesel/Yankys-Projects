import type { PriorityItem } from "@/server/priority/types";

export interface CategoryCount {
  /** Priority's category text, "" for items without one. */
  category: string;
  count: number;
}

/** Alphabetical order of Priority's texts: Hebrew letters in order, numbers by their value ("2" before "10"). */
const ALPHABETICAL = new Intl.Collator("he", { numeric: true, sensitivity: "base" });

/** The items in alphabetical order of their name, so an item is easy to find; ties by item number. */
export function sortByName(items: readonly PriorityItem[]): PriorityItem[] {
  return [...items].sort(
    (a, b) =>
      ALPHABETICAL.compare(a.name, b.name) || ALPHABETICAL.compare(a.itemNumber, b.itemNumber),
  );
}

/** Categories with their item counts, in alphabetical order; items without a category come last. */
export function categoryCounts(items: readonly PriorityItem[]): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return [...counts]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => {
      if (a.category === "" || b.category === "") return a.category === "" ? 1 : -1;
      return ALPHABETICAL.compare(a.category, b.category);
    });
}

/**
 * The items of one category (null = all) that match the search text. The search
 * ignores case and looks at the item number, both names and the barcode; every
 * word typed must match somewhere, so "burger 150" finds "Classic beef burger 150 g".
 */
export function filterItems(
  items: readonly PriorityItem[],
  { category, query }: { category: string | null; query: string },
): PriorityItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (category !== null && item.category !== category) return false;
    if (words.length === 0) return true;
    const haystack = [item.itemNumber, item.name, item.nameEn, item.barcode]
      .join(" ")
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
