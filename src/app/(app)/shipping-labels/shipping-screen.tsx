"use client";

import { Minus, PackageCheck, Plus, Printer, Search, Settings2, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { DialogTitleBlock } from "@/components/dialog-parts";
import { ElementView } from "@/components/labels/element-view";
import { LabelPrintSheet, printLabelSheet } from "@/components/labels/label-print";
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
import type { LabelElement } from "@/lib/labels/model";
import {
  copiesFor,
  isValidPrint,
  labelOf,
  MAX_LABELS,
  MAX_PALLET_COPIES,
  shippingLabelValues,
  SHIPPING_UNITS,
  type ShippingOrder,
  type ShippingUnit,
} from "@/lib/labels/shipping";
import { deleteShippingOrderAction, shippingPrintAction, type ShippingJobData } from "./actions";

export interface OrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  customerNumber: string;
  address: string;
  city: string;
  phone: string;
  shipDate: string;
  notes: string;
  labelCount: number | null;
  isTest: boolean;
  receivedAt: string;
  timesReceived: number;
  timesPrinted: number;
  lastPrintedAt: string | null;
  lastPrintedBy: string | null;
}

interface LayoutView {
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
}

function asOrder(row: OrderRow): ShippingOrder {
  return {
    orderNumber: row.orderNumber,
    customerName: row.customerName,
    customerNumber: row.customerNumber,
    address: row.address,
    city: row.city,
    phone: row.phone,
    shipDate: row.shipDate,
    notes: row.notes,
    labelCount: row.labelCount,
  };
}

/** The orders Priority sent, newest first, each with its labels to print. */
export function ShippingScreen({
  orders,
  search,
  defaultCount,
  defaultUnit,
  palletCopies,
  layout,
  canPrint,
  canDelete,
  canSetUp,
}: {
  orders: OrderRow[];
  search: string;
  defaultCount: number;
  defaultUnit: ShippingUnit;
  palletCopies: number;
  layout: LayoutView | null;
  canPrint: boolean;
  canDelete: boolean;
  canSetUp: boolean;
}) {
  const t = useTranslations("shipping");
  const router = useRouter();
  const [text, setText] = useState(search);
  const [printing, setPrinting] = useState<OrderRow | null>(null);
  const [deleting, setDeleting] = useState<OrderRow | null>(null);
  const [job, setJob] = useState<ShippingJobData | null>(null);

  // Once the labels are on the page, open the print window for them.
  useEffect(() => {
    if (!job) return;
    printLabelSheet(job.widthMm, job.heightMm, () => {
      setJob(null);
      setPrinting(null);
      router.refresh();
    });
  }, [job, router]);

  function find(event: React.FormEvent) {
    event.preventDefault();
    const query = text.trim();
    router.push(query ? `/shipping-labels?q=${encodeURIComponent(query)}` : "/shipping-labels");
  }

  return (
    <div className="space-y-5">
      {!layout ? (
        <Alert variant="destructive" role="alert" data-testid="shipping-no-layout">
          <AlertDescription>{t("noLayout")}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="rise gap-0 overflow-hidden p-0" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <form onSubmit={find} className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md">
            <Label htmlFor="shipping-search" className="sr-only">
              {t("searchLabel")}
            </Label>
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="shipping-search"
                value={text}
                placeholder={t("searchPlaceholder")}
                className="ps-9"
                autoComplete="off"
                onChange={(event) => setText(event.target.value)}
              />
            </div>
            <Button type="submit" variant="outline">
              {t("search")}
            </Button>
          </form>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground" role="status">
              {t("count", { count: orders.length })}
            </span>
            {canSetUp ? (
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href="/settings" />}
              >
                <Settings2 data-icon="inline-start" />
                {t("setup")}
              </Button>
            ) : null}
          </div>
        </div>

        {orders.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2 px-6 py-14 text-center"
            data-testid="shipping-empty"
          >
            <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
              <PackageCheck className="size-5" />
            </span>
            <p className="font-medium">{search ? t("noMatch") : t("empty")}</p>
            {search ? null : (
              <p className="max-w-md text-sm text-muted-foreground">{t("emptyHint")}</p>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="ps-5">{t("columns.order")}</TableHead>
                <TableHead>{t("columns.customer")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("columns.city")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("columns.shipDate")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("columns.received")}</TableHead>
                <TableHead>{t("columns.printed")}</TableHead>
                <TableHead className="pe-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow
                  key={order.id}
                  data-testid="shipping-order"
                  data-order={order.orderNumber}
                >
                  <TableCell className="ps-5 font-medium">
                    <span dir="ltr" className="font-mono">
                      {order.orderNumber}
                    </span>
                    {order.isTest ? (
                      <Badge variant="soft" className="ms-2">
                        {t("test")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell dir="auto">{order.customerName || "—"}</TableCell>
                  <TableCell className="hidden md:table-cell" dir="auto">
                    {order.city || "—"}
                  </TableCell>
                  <TableCell className="hidden tabular-nums lg:table-cell" dir="ltr">
                    {order.shipDate || "—"}
                  </TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell" dir="ltr">
                    {formatDateTime(order.receivedAt)}
                  </TableCell>
                  <TableCell>
                    {order.timesPrinted > 0 && order.lastPrintedAt ? (
                      <Badge variant="success" data-testid="shipping-printed">
                        {t("printedTimes", { count: order.timesPrinted })}
                      </Badge>
                    ) : (
                      <Badge variant="warning" data-testid="shipping-not-printed">
                        {t("notPrinted")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="pe-5">
                    <div className="flex justify-end gap-1.5">
                      {canPrint ? (
                        <Button
                          size="sm"
                          disabled={!layout}
                          data-testid="shipping-print"
                          onClick={() => setPrinting(order)}
                        >
                          <Printer data-icon="inline-start" />
                          {t("print")}
                        </Button>
                      ) : null}
                      {canDelete ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={t("delete")}
                          onClick={() => setDeleting(order)}
                        >
                          <Trash2 aria-hidden />
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

      <PrintDialog
        order={printing}
        layout={layout}
        defaultCount={defaultCount}
        defaultUnit={defaultUnit}
        palletCopies={palletCopies}
        busy={job !== null}
        onClose={() => setPrinting(null)}
        onJob={setJob}
      />
      <DeleteDialog order={deleting} onClose={() => setDeleting(null)} />
      {job ? <LabelPrintSheet job={job} /> : null}
    </div>
  );
}

/** The labels in order, shortened: "Box 1 of 3, Box 2 of 3, Box 3 of 3" or "Box 1 of 10, Box 2 of 10 … Box 10 of 10". */
function numbering(count: number, unit: ShippingUnit, language: "he" | "en"): string {
  const one = (n: number) => labelOf(n, count, unit, language);
  if (count <= 3) return Array.from({ length: count }, (_, i) => one(i + 1)).join(", ");
  return `${one(1)}, ${one(2)} … ${one(count)}`;
}

/** How many labels, with a look at the first one, then the print window. */
function PrintDialog({
  order,
  layout,
  defaultCount,
  defaultUnit,
  palletCopies,
  busy,
  onClose,
  onJob,
}: {
  order: OrderRow | null;
  layout: LayoutView | null;
  defaultCount: number;
  defaultUnit: ShippingUnit;
  palletCopies: number;
  busy: boolean;
  onClose: () => void;
  onJob: (job: ShippingJobData) => void;
}) {
  const t = useTranslations("shipping");
  const language = useLocale() === "en" ? "en" : "he";
  const [unit, setUnit] = useState<ShippingUnit>(defaultUnit);
  const [typed, setTyped] = useState("1");
  const [copiesTyped, setCopiesTyped] = useState(String(palletCopies));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // Each time the window opens on an order, start from the number Priority asked for, or the default.
  if (order && openedFor !== order.id) {
    setOpenedFor(order.id);
    setTyped(String(order.labelCount ?? defaultCount));
    setUnit(defaultUnit);
    setCopiesTyped(String(palletCopies));
    setError(null);
  }
  if (!order && openedFor !== null) setOpenedFor(null);

  const count = Number(typed);
  const palletLabels = Number(copiesTyped);
  // A box gets one label; a pallet gets as many as asked (4 to start with).
  const copies = copiesFor(unit, palletLabels);
  const valid = isValidPrint(count, copies);
  const total = valid ? count * copies : 0;

  function step(by: number) {
    const base = Number.isInteger(count) && count >= 1 ? count : 1;
    setTyped(String(Math.min(MAX_LABELS, Math.max(1, base + by))));
  }

  function print() {
    if (!order || !valid) return;
    setError(null);
    startTransition(async () => {
      const result = await shippingPrintAction(order.id, count, unit, palletLabels);
      if (!result.ok) return setError(t(`errors.${result.error}`));
      onJob(result.job);
    });
  }

  const scale = layout ? Math.min(2.4, 300 / layout.widthMm, 380 / layout.heightMm) : 1;

  return (
    <Dialog
      open={order !== null}
      onOpenChange={(next) => (next || pending || busy ? undefined : onClose())}
    >
      <DialogContent className="sm:max-w-2xl">
        {order ? (
          <>
            <DialogTitleBlock
              icon={<Printer />}
              title={t("printTitle", { order: order.orderNumber })}
              description={[order.customerName, order.city].filter(Boolean).join(" · ")}
            />
            {error ? (
              <Alert variant="destructive" role="alert" data-testid="shipping-print-error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
              {layout ? (
                <div
                  className="relative mx-auto shrink-0 overflow-hidden border border-border bg-white shadow-card"
                  style={{ width: layout.widthMm * scale, height: layout.heightMm * scale }}
                  data-testid="shipping-preview"
                  aria-hidden
                >
                  {layout.elements.map((element) => (
                    <ElementView
                      key={element.id}
                      element={element}
                      scale={scale}
                      values={shippingLabelValues(
                        asOrder(order),
                        1,
                        valid ? count : 1,
                        unit,
                        language,
                      )}
                    />
                  ))}
                </div>
              ) : null}
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t("unitLabel")}</p>
                  <div className="flex gap-2" role="group" aria-label={t("unitLabel")}>
                    {SHIPPING_UNITS.map((option) => (
                      <Button
                        key={option}
                        type="button"
                        variant={unit === option ? "default" : "outline"}
                        aria-pressed={unit === option}
                        data-testid={`shipping-unit-${option}`}
                        onClick={() => setUnit(option)}
                      >
                        {t(`units.${option}`)}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shipping-count">
                    {unit === "pallet" ? t("howManyPallets") : t("howManyBoxes")}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-11"
                      aria-label={t("fewer")}
                      onClick={() => step(-1)}
                    >
                      <Minus aria-hidden />
                    </Button>
                    <Input
                      id="shipping-count"
                      data-testid="shipping-count"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_LABELS}
                      dir="ltr"
                      value={typed}
                      className="h-11 w-24 text-center text-lg"
                      onChange={(event) => setTyped(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          print();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-11"
                      aria-label={t("more")}
                      onClick={() => step(1)}
                    >
                      <Plus aria-hidden />
                    </Button>
                  </div>
                  {order.labelCount ? (
                    <p className="text-xs text-muted-foreground">
                      {t("askedByPriority", { count: order.labelCount })}
                    </p>
                  ) : null}
                </div>
                {unit === "pallet" ? (
                  <div className="space-y-2">
                    <Label htmlFor="shipping-copies">{t("copiesLabel")}</Label>
                    <Input
                      id="shipping-copies"
                      data-testid="shipping-copies"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_PALLET_COPIES}
                      dir="ltr"
                      value={copiesTyped}
                      className="h-11 w-24 text-center text-lg"
                      onChange={(event) => setCopiesTyped(event.target.value)}
                    />
                  </div>
                ) : null}
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="shipping-sequence"
                  dir="auto"
                >
                  {valid ? (
                    <>
                      {unit === "pallet" ? t("sequencePallet", { copies }) : t("sequenceBox")}{" "}
                      <bdi dir="ltr" className="font-medium text-foreground">
                        {numbering(count, unit, language)}
                      </bdi>
                      {copies > 1 ? ` (${t("inAll", { total })})` : ""}
                    </>
                  ) : (
                    t("invalidCount", { max: MAX_LABELS })
                  )}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={pending || busy}>
                {t("cancel")}
              </Button>
              <Button
                onClick={print}
                disabled={!valid || pending || busy || !layout}
                data-testid="shipping-do-print"
              >
                <Printer data-icon="inline-start" />
                {valid ? t("printN", { count: total }) : t("print")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ order, onClose }: { order: OrderRow | null; onClose: () => void }) {
  const t = useTranslations("shipping");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!order) return;
    startTransition(async () => {
      const result = await deleteShippingOrderAction(order.id);
      if (!result.ok) return void toast.error(t(`errors.${result.error}`));
      toast.success(t("deleted"));
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={order !== null}
      onOpenChange={(next) => (next || pending ? undefined : onClose())}
    >
      <DialogContent className="sm:max-w-md">
        {order ? (
          <>
            <DialogTitleBlock
              icon={<Trash2 />}
              title={t("confirmDelete.title")}
              description={t("confirmDelete.body", { order: order.orderNumber })}
            />
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={pending}>
                {t("cancel")}
              </Button>
              <Button variant="destructive" onClick={remove} disabled={pending}>
                {t("delete")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
