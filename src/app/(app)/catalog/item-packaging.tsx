"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { formatPackingWeight } from "@/lib/i18n/format";
import type { PackagingType } from "@/server/packaging";
import { setItemPackagingAction } from "./actions";

/** What the catalog knows about packaging: the kinds there are, and the one chosen for each item. */
export interface PackagingChoices {
  types: PackagingType[];
  byItem: Record<string, string>;
  /** Whether this person may choose the packaging of an item. */
  canEdit: boolean;
}

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

/**
 * The packaging an item is packed in, chosen from the list kept in the system settings. A box of
 * this item is recorded at the scale weight less the weight of its packaging. A choice is saved
 * at once.
 */
export function ItemPackaging({
  itemNumber,
  choices,
}: {
  itemNumber: string;
  choices: PackagingChoices;
}) {
  const t = useTranslations("catalog.packaging");
  const errors = useTranslations("settings.packaging.errors");
  const common = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const initial = choices.byItem[itemNumber] ?? "";
  const [chosen, setChosen] = useState(
    choices.types.some((type) => type.id === initial) ? initial : "",
  );

  const label = (type: PackagingType) =>
    `${type.name} · ${formatPackingWeight(type.weightKg)} ${common("kg")}`;
  const current = choices.types.find((type) => type.id === chosen);

  function choose(typeId: string) {
    const before = chosen;
    setChosen(typeId);
    startTransition(async () => {
      const result = await setItemPackagingAction(itemNumber, typeId);
      if (!result.ok) {
        setChosen(before);
        return void toast.error(errors(result.error));
      }
      toast.success(t("saved"));
    });
  }

  return (
    <div className="space-y-1.5 rounded-xl border border-border bg-muted/30 px-4 py-3">
      <Label htmlFor="item-packaging" className="text-xs font-medium text-muted-foreground">
        {t("label")}
      </Label>
      {choices.canEdit ? (
        <select
          id="item-packaging"
          data-testid="item-packaging"
          value={chosen}
          disabled={pending}
          onChange={(event) => choose(event.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">{t("none")}</option>
          {choices.types.map((type) => (
            <option key={type.id} value={type.id}>
              {label(type)}
            </option>
          ))}
        </select>
      ) : (
        <p data-testid="item-packaging-readonly">
          {current ? label(current) : <span className="text-muted-foreground">{t("none")}</span>}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </div>
  );
}
