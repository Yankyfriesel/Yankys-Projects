"use client";

import { ArrowLeft, Copy, Pencil, Plus, Star, Tag, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DialogTitleBlock } from "@/components/dialog-parts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/i18n/format";
import { LABEL_TYPES, type LabelType } from "@/lib/labels/model";
import { cn } from "@/lib/utils";
import {
  createLayoutAction,
  deleteLayoutAction,
  duplicateLayoutAction,
  setDefaultItemLayoutAction,
  type LabelsErrorCode,
} from "./actions";

export interface LayoutRow {
  id: string;
  name: string;
  type: LabelType;
  widthMm: number;
  heightMm: number;
  elementCount: number;
  updatedAt: string;
}

/** The list of layouts, with create, duplicate and delete. Opening one goes to its editor. */
export function LayoutsPanel({
  layouts,
  canEdit,
  defaultItemLayout,
}: {
  layouts: LayoutRow[];
  canEdit: boolean;
  /** The item layout chosen in advance when printing from the catalog. */
  defaultItemLayout: string | null;
}) {
  const t = useTranslations("labels");
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<LayoutRow | null>(null);
  const [pending, startTransition] = useTransition();

  const boxExists = layouts.some((l) => l.type === "box");

  function makeDefault(layout: LayoutRow) {
    const next = layout.id === defaultItemLayout ? null : layout.id;
    startTransition(async () => {
      const result = await setDefaultItemLayoutAction(next);
      if (!result.ok) return void toast.error(t(`errors.${result.error}`));
      toast.success(next ? t("list.defaultSet", { name: layout.name }) : t("list.defaultCleared"));
      router.refresh();
    });
  }

  function duplicate(layout: LayoutRow) {
    startTransition(async () => {
      const result = await duplicateLayoutAction(layout.id);
      if (!result.ok) return void toast.error(t(`errors.${result.error}`));
      router.push(`/settings/labels/${result.id}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="rise flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/settings" />}>
          <ArrowLeft data-icon="inline-start" className="rtl:rotate-180" />
          {t("back")}
        </Button>
        {canEdit ? (
          <Button onClick={() => setCreating(true)}>
            <Plus data-icon="inline-start" />
            {t("list.new")}
          </Button>
        ) : null}
      </div>

      <Card className="rise gap-0 overflow-hidden p-0" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="border-b border-border px-5 py-3 text-sm text-muted-foreground">
          <span role="status">{t("list.count", { count: layouts.length })}</span>
        </div>
        {layouts.length === 0 ? (
          <p className="px-6 py-12 text-center text-muted-foreground">{t("list.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="ps-5">{t("list.columns.name")}</TableHead>
                <TableHead>{t("list.columns.type")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("list.columns.size")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("list.columns.elements")}</TableHead>
                <TableHead className="hidden xl:table-cell">{t("list.columns.updated")}</TableHead>
                <TableHead className="pe-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {layouts.map((layout) => (
                <TableRow key={layout.id}>
                  <TableCell className="ps-5 font-medium">
                    <Link
                      href={`/settings/labels/${layout.id}`}
                      dir="auto"
                      className="rounded outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {layout.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={layout.type === "box" ? "info" : "soft"}>
                        {t(`types.${layout.type}`)}
                      </Badge>
                      {layout.id === defaultItemLayout ? (
                        <Badge variant="success" data-testid="default-layout">
                          {t("list.default")}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell">
                    <span dir="ltr">
                      {layout.widthMm} × {layout.heightMm}
                    </span>{" "}
                    {t("list.unit")}
                  </TableCell>
                  <TableCell className="hidden tabular-nums lg:table-cell">
                    {t("list.elements", { count: layout.elementCount })}
                  </TableCell>
                  <TableCell
                    dir="ltr"
                    className="hidden text-start text-muted-foreground tabular-nums xl:table-cell"
                  >
                    {formatDateTime(layout.updatedAt)}
                  </TableCell>
                  <TableCell className="pe-5">
                    <div className="flex justify-end gap-1">
                      {canEdit && layout.type === "item" ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          aria-pressed={layout.id === defaultItemLayout}
                          aria-label={
                            layout.id === defaultItemLayout
                              ? t("list.clearDefault", { name: layout.name })
                              : t("list.makeDefault", { name: layout.name })
                          }
                          title={
                            layout.id === defaultItemLayout
                              ? t("list.clearDefault", { name: layout.name })
                              : t("list.makeDefault", { name: layout.name })
                          }
                          onClick={() => makeDefault(layout)}
                        >
                          <Star
                            className={layout.id === defaultItemLayout ? "fill-gold text-gold" : ""}
                          />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        nativeButton={false}
                        aria-label={t("list.open", { name: layout.name })}
                        render={<Link href={`/settings/labels/${layout.id}`} />}
                      >
                        <Pencil />
                      </Button>
                      {canEdit && layout.type !== "box" ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          aria-label={t("list.duplicate", { name: layout.name })}
                          onClick={() => duplicate(layout)}
                        >
                          <Copy />
                        </Button>
                      ) : null}
                      {canEdit ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          aria-label={t("list.delete", { name: layout.name })}
                          onClick={() => setDeleting(layout)}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <CreateDialog open={creating} onClose={() => setCreating(false)} boxExists={boxExists} />
      <DeleteDialog layout={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function CreateDialog({
  open,
  onClose,
  boxExists,
}: {
  open: boolean;
  onClose: () => void;
  boxExists: boolean;
}) {
  const t = useTranslations("labels");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<LabelsErrorCode | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<LabelType>("item");
  const [width, setWidth] = useState("100");
  const [height, setHeight] = useState("60");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createLayoutAction({
        name,
        type,
        widthMm: Number(width),
        heightMm: Number(height),
      });
      if (!result.ok) return setError(result.error);
      onClose();
      router.push(`/settings/labels/${result.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next || pending ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitleBlock
          icon={<Tag />}
          title={t("create.title")}
          description={t("create.description")}
        />
        <form id="new-layout" onSubmit={submit} className="space-y-4" noValidate>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="layout-name">{t("create.name")}</Label>
            <Input
              id="layout-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label id="layout-type-label">{t("create.type")}</Label>
            <div
              role="radiogroup"
              aria-labelledby="layout-type-label"
              className="grid gap-2 sm:grid-cols-3"
            >
              {LABEL_TYPES.map((option) => {
                const taken = option === "box" && boxExists;
                const selected = type === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={taken}
                    onClick={() => setType(option)}
                    className={cn(
                      "rounded-xl border p-3 text-start text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:bg-secondary",
                    )}
                  >
                    <span className="block font-medium">{t(`types.${option}`)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {taken ? t("create.boxTaken") : t(`typeHints.${option}`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="layout-width">{t("create.width")}</Label>
              <Input
                id="layout-width"
                type="number"
                inputMode="decimal"
                min={10}
                max={300}
                step={0.5}
                dir="ltr"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="layout-height">{t("create.height")}</Label>
              <Input
                id="layout-height"
                type="number"
                inputMode="decimal"
                min={10}
                max={300}
                step={0.5}
                dir="ltr"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
            {t("create.cancel")}
          </Button>
          <Button
            type="submit"
            form="new-layout"
            size="lg"
            disabled={pending || name.trim() === ""}
          >
            {t("create.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ layout, onClose }: { layout: LayoutRow | null; onClose: () => void }) {
  const t = useTranslations("labels");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<LabelsErrorCode | null>(null);

  function close() {
    setError(null);
    onClose();
  }

  return (
    <Dialog open={layout !== null} onOpenChange={(next) => (next || pending ? undefined : close())}>
      <DialogContent className="sm:max-w-md">
        {layout ? (
          <>
            <DialogTitleBlock
              icon={<Trash2 />}
              title={t("confirmDelete.title")}
              description={t("confirmDelete.body", { name: layout.name })}
            />
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" onClick={close} disabled={pending}>
                {t("confirmDelete.cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="lg"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteLayoutAction(layout.id);
                    if (!result.ok) return setError(result.error);
                    close();
                    router.refresh();
                  })
                }
              >
                {t("confirmDelete.action")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
