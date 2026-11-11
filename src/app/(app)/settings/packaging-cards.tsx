"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatPackingWeight } from "@/lib/i18n/format";
import type { PackagingType } from "@/server/packaging";
import {
  addPackagingTypeAction,
  deletePackagingTypeAction,
  updatePackagingTypeAction,
} from "./receiving-actions";

/** What a typed weight means: kilograms, with a comma or a point. Null when it is not a number. */
function parseKg(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) ? value : null;
}

/**
 * The kinds of packaging the goods are packed in, each with what one empty packaging weighs: a
 * small list, two to a row on a wide screen. Each item picks its type in the catalog; the scale
 * shows the box with its packaging, and the weight kept is without it.
 */
export function PackagingTypesCard({
  types,
  canEdit,
  index,
}: {
  types: PackagingType[];
  canEdit: boolean;
  index: number;
}) {
  const t = useTranslations("settings.packaging");
  const errors = useTranslations("settings.packaging.errors");
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");

  function add() {
    const kg = parseKg(weight);
    if (kg === null) return void toast.error(errors("INVALID_WEIGHT"));
    startTransition(async () => {
      const result = await addPackagingTypeAction(name, kg);
      if (!result.ok) return void toast.error(errors(result.error));
      setName("");
      setWeight("");
      toast.success(t("added"));
    });
  }

  return (
    <Card
      role="region"
      aria-label={t("title")}
      className="rise gap-0 overflow-hidden p-0"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border px-4 py-2.5">
        <h2 className="font-serif text-lg font-semibold">{t("title")}</h2>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </div>

      <div className="space-y-2 p-3">
        {types.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">{t("none")}</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2" data-testid="packaging-list">
            {types.map((type) => (
              <TypeRow
                key={`${type.id}:${type.name}:${type.weightKg}`}
                type={type}
                canEdit={canEdit}
              />
            ))}
          </ul>
        )}

        {canEdit ? (
          <form
            className="flex items-center gap-2 border-t border-border pt-2"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <Input
              value={name}
              maxLength={60}
              autoComplete="off"
              aria-label={t("name")}
              placeholder={t("example")}
              data-testid="packaging-name"
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
              className="h-8 min-w-0 flex-1 text-sm"
            />
            <Input
              dir="ltr"
              inputMode="decimal"
              value={weight}
              aria-label={t("weight")}
              placeholder={t("weight")}
              data-testid="packaging-weight"
              disabled={pending}
              onChange={(event) => setWeight(event.target.value)}
              className="h-8 w-24 text-sm"
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={pending || name.trim() === "" || weight.trim() === ""}
            >
              <Plus data-icon="inline-start" />
              {t("add")}
            </Button>
          </form>
        ) : null}
      </div>
    </Card>
  );
}

function TypeRow({ type, canEdit }: { type: PackagingType; canEdit: boolean }) {
  const t = useTranslations("settings.packaging");
  const errors = useTranslations("settings.packaging.errors");
  const common = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(type.name);
  const [weight, setWeight] = useState(String(type.weightKg));
  const [confirming, setConfirming] = useState(false);

  const kg = parseKg(weight);
  const changed = name.trim() !== type.name || kg !== type.weightKg;

  function save() {
    if (kg === null) return void toast.error(errors("INVALID_WEIGHT"));
    startTransition(async () => {
      const result = await updatePackagingTypeAction(type.id, name, kg);
      if (!result.ok) return void toast.error(errors(result.error));
      toast.success(t("saved"));
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deletePackagingTypeAction(type.id);
      if (!result.ok) return void toast.error(errors(result.error));
      toast.success(t("deleted", { count: result.items }));
    });
  }

  if (!canEdit) {
    return (
      <li className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
        <span dir="auto" className="truncate font-medium">
          {type.name}
        </span>
        <Badge variant="soft" className="tabular-nums">
          {formatPackingWeight(type.weightKg)} {common("kg")}
        </Badge>
      </li>
    );
  }

  return (
    <li
      className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5"
      data-testid="packaging-type"
    >
      <Input
        value={name}
        maxLength={60}
        aria-label={t("nameOf", { name: type.name })}
        disabled={pending}
        onChange={(event) => setName(event.target.value)}
        className="h-8 min-w-0 flex-1 text-sm"
      />
      <Input
        dir="ltr"
        inputMode="decimal"
        value={weight}
        aria-label={t("weightOf", { name: type.name })}
        disabled={pending}
        onChange={(event) => setWeight(event.target.value)}
        className="h-8 w-16 px-2 text-sm"
      />
      <span className="text-xs text-muted-foreground">{common("kg")}</span>
      {confirming ? (
        <span className="flex items-center gap-1">
          <Button
            type="button"
            size="xs"
            variant="destructive"
            title={t("confirmDelete")}
            disabled={pending}
            onClick={remove}
          >
            {t("yesDelete")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            {t("cancel")}
          </Button>
        </span>
      ) : (
        <span className="flex items-center">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={t("saveOf", { name: type.name })}
            disabled={pending || !changed || name.trim() === "" || kg === null}
            onClick={save}
          >
            <Save />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={t("deleteOf", { name: type.name })}
            disabled={pending}
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
          </Button>
        </span>
      )}
    </li>
  );
}
