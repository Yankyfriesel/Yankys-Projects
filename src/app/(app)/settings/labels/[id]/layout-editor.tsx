"use client";

import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  ArrowLeft,
  Barcode,
  Bold,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Copy,
  Image as ImageIcon,
  Keyboard,
  Languages,
  LayoutTemplate,
  Minus,
  Plus,
  QrCode,
  Redo2,
  Rows3,
  Save,
  Square,
  Trash2,
  TriangleAlert,
  Type,
  Undo2,
  Variable,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHelp } from "@/components/page-help";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { moveBox, moveBoxes, snap, type Box } from "@/lib/labels/geometry";
import {
  ALIGNS,
  DEFAULT_STYLE,
  DIRECTIONS,
  FONTS,
  ITEM_FIELDS,
  ORDER_FIELDS,
  LABEL_FIELDS,
  LINE_SEPARATORS,
  LOGO_VARIANTS,
  MAX_BOX_LINES,
  newElementId,
  QR_SOURCES,
  type BoxLine,
  type ElementStyle,
  type FieldKey,
  type LabelElement,
  type LabelType,
  type LabelValues,
  type LineSource,
  type LineSeparator,
  type LogoVariant,
  type QrSource,
} from "@/lib/labels/model";
import { cn } from "@/lib/utils";
import { saveLayoutAction } from "../actions";
import { NumberField, Segmented, SelectField } from "./fields";
import { isAdditive, LabelCanvas } from "./label-canvas";
import { TestPrint } from "./test-print";

interface Doc {
  name: string;
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
}

export interface Preview {
  itemNumber: string;
  label: string;
  values: LabelValues;
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];
/** The keys the designer understands, in the order the help lists them. */
const KEY_HELP = [
  "tab",
  "selectAll",
  "multiple",
  "layers",
  "move",
  "delete",
  "copy",
  "duplicate",
  "undo",
  "save",
  "clear",
] as const;
const HISTORY_LIMIT = 50;

/** How each detail looks when it is put on the label with one press: the size and the writing. */
const FIELD_STYLES: Partial<Record<FieldKey, Partial<ElementStyle>>> = {
  name: { fontSize: 16, bold: true, align: "center", dir: "rtl", font: "serif" },
  nameEn: { fontSize: 10, align: "center", dir: "ltr" },
  slaughterDate: { fontSize: 11, bold: true, dir: "ltr" },
  productionDate: { fontSize: 11, bold: true, dir: "ltr" },
  expiryDate: { fontSize: 11, bold: true, dir: "ltr" },
  certificateNo: { bold: true, dir: "ltr", font: "mono" },
  itemNumber: { dir: "ltr", font: "mono" },
};
const FIELD_SIZES: Partial<Record<FieldKey, [number, number]>> = {
  name: [60, 8],
  nameEn: [60, 5],
  slaughterDate: [30, 6],
  productionDate: [30, 6],
  expiryDate: [30, 6],
};

/** A line of a lines box, written the way the printed dates are. */
const boxLine = (
  label: string,
  source: LineSource,
  style: Partial<ElementStyle> = {},
): BoxLine => ({ label, source, text: "", style: { ...DEFAULT_STYLE, fontSize: 9, ...style } });

/** The time, for telling quick typing from separate changes. Read only inside event handlers. */
const clock = () => Date.now();

function sizedWithin(doc: Doc, w: number, h: number): { w: number; h: number } {
  return {
    w: Math.min(w, Math.max(1, doc.widthMm - 4)),
    h: Math.min(h, Math.max(1, doc.heightMm - 4)),
  };
}

/** The visual label designer: the label at real proportions, drag and resize, properties on the side. */
export function LayoutEditor({
  layoutId,
  initial,
  previews,
  canEdit,
  backLabel,
}: {
  layoutId: string;
  initial: Doc & { type: LabelType };
  previews: Preview[];
  canEdit: boolean;
  backLabel: string;
}) {
  const t = useTranslations("labels");
  const [doc, setDoc] = useState<Doc>({
    name: initial.name,
    widthMm: initial.widthMm,
    heightMm: initial.heightMm,
    elements: initial.elements,
  });
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(doc));
  const [previewItem, setPreviewItem] = useState(previews[0].itemNumber);
  const [zoomIndex, setZoomIndex] = useState(2);
  const [areaWidth, setAreaWidth] = useState(640);
  const [saving, startSaving] = useTransition();

  const area = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // The element a range of layers grows from, and what Ctrl+C took (pasted again and again, a step further each time).
  const anchor = useRef<string | null>(null);
  const clipboard = useRef<LabelElement[]>([]);
  const pastes = useRef(0);
  const lastKey = useRef<string | null>(null);
  const lastTime = useRef(0);

  const readOnly = !canEdit;
  const dirty = JSON.stringify(doc) !== savedJson;
  const values = (previews.find((p) => p.itemNumber === previewItem) ?? previews[0]).values;
  // The chosen elements in the order of the label, and the one when exactly one is chosen.
  const picked = doc.elements.filter((e) => selectedIds.includes(e.id));
  const pickedIds = picked.map((e) => e.id);
  const selected = picked.length === 1 ? picked[0] : null;
  const bounds = { width: doc.widthMm, height: doc.heightMm };
  // Every detail that can go on the label, in groups; a pallet's own details only on pallet labels.
  const detailGroups: {
    key: "item" | "label" | "pallet" | "order";
    fields: readonly FieldKey[];
  }[] = [
    // A shipping label is about an order, not about an item: it has no item or box details.
    ...(initial.type === "shipping"
      ? [{ key: "order" as const, fields: ORDER_FIELDS }]
      : [
          { key: "item" as const, fields: ITEM_FIELDS },
          {
            key: "label" as const,
            fields: LABEL_FIELDS.filter((field) => !field.startsWith("pallet")),
          },
        ]),
    ...(initial.type === "pallet"
      ? [
          {
            key: "pallet" as const,
            fields: LABEL_FIELDS.filter((field) => field.startsWith("pallet")),
          },
        ]
      : []),
  ];

  const fit = Math.min(8, Math.max(2, (areaWidth - 48) / doc.widthMm));
  const scale = fit * ZOOMS[zoomIndex];

  useEffect(() => {
    const node = area.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setAreaWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ---- history ------------------------------------------------------------

  function remember() {
    setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), doc]);
    setFuture([]);
  }

  /** One undoable change. Changes with the same key in quick succession (typing a number) count as one. */
  function change(next: Doc, key?: string) {
    const now = clock();
    const same = key !== undefined && lastKey.current === key && now - lastTime.current < 1200;
    if (!same) remember();
    lastKey.current = key ?? null;
    lastTime.current = now;
    setDoc(next);
  }

  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setPast(past.slice(0, -1));
    setFuture([doc, ...future]);
    setDoc(previous);
    lastKey.current = null;
  }

  function redo() {
    const [next, ...rest] = future;
    if (!next) return;
    setFuture(rest);
    setPast([...past, doc]);
    setDoc(next);
    lastKey.current = null;
  }

  // ---- elements -----------------------------------------------------------

  function updateElement(
    id: string,
    update: (element: LabelElement) => LabelElement,
    key?: string,
  ) {
    change(
      { ...doc, elements: doc.elements.map((e) => (e.id === id ? update(e) : e)) },
      key ? `${id}:${key}` : undefined,
    );
  }

  function setBoxes(boxes: Record<string, Box>) {
    setDoc((current) => ({
      ...current,
      elements: current.elements.map((e) => (boxes[e.id] ? { ...e, ...boxes[e.id] } : e)),
    }));
  }

  // ---- choosing elements ----------------------------------------------------

  function selectOnly(id: string | null) {
    setSelectedIds(id ? [id] : []);
    anchor.current = id;
  }

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id],
    );
    anchor.current = id;
  }

  function selectAll() {
    setSelectedIds(doc.elements.map((e) => e.id));
  }

  /** The elements from the anchor to this one, in the order of the label. */
  function selectRange(id: string) {
    const to = doc.elements.findIndex((e) => e.id === id);
    if (to < 0) return;
    const from = doc.elements.findIndex((e) => e.id === (anchor.current ?? id));
    const [first, last] = from < 0 ? [to, to] : [Math.min(from, to), Math.max(from, to)];
    setSelectedIds(doc.elements.slice(first, last + 1).map((e) => e.id));
  }

  function pick(id: string, additive: boolean) {
    if (additive) toggle(id);
    else if (!selectedIds.includes(id)) selectOnly(id);
  }

  /** Back to nothing chosen, with the keyboard focus inside the editor so the keys keep working. */
  function clearChoice() {
    selectOnly(null);
    root.current?.focus({ preventScroll: true });
  }

  function addElement(kind: "text" | "field" | "line" | "box" | "barcode" | "qr" | "logo") {
    const id = newElementId();
    const row = doc.elements.length % 10;
    const make = (w: number, h: number) => {
      const size = sizedWithin(doc, w, h);
      return {
        id,
        ...size,
        x: snap((doc.widthMm - size.w) / 2),
        y: snap(Math.min(2 + row * 2, doc.heightMm - size.h)),
      };
    };
    let element: LabelElement;
    if (kind === "text") {
      element = { ...make(40, 6), type: "text", text: t("editor.newText"), style: DEFAULT_STYLE };
    } else if (kind === "field") {
      element = { ...make(40, 6), type: "field", field: "name", style: DEFAULT_STYLE };
    } else if (kind === "line") {
      element = { ...make(40, 0.3), type: "line" };
    } else if (kind === "barcode") {
      const field: FieldKey =
        initial.type === "item"
          ? "itemBarcode"
          : initial.type === "pallet"
            ? "palletNumber"
            : initial.type === "shipping"
              ? "orderNumber"
              : "boxBarcode";
      element = { ...make(60, 12), type: "barcode", field, showText: true };
    } else if (kind === "qr") {
      const source: QrSource =
        initial.type === "item" ? "itemLabel" : initial.type === "pallet" ? "pallet" : "boxBarcode";
      element = { ...make(20, 20), type: "qr", source };
    } else if (kind === "logo") {
      element = { ...make(24, 12), type: "logo", variant: "full" };
    } else {
      element = { ...make(30, 20), type: "box", borderMm: 0.4 };
    }
    change({ ...doc, elements: [...doc.elements, element] });
    selectOnly(id);
  }

  /** A place for a new element: centred, a little lower for each element already on the label. */
  function placeBox(w: number, h: number) {
    const size = sizedWithin(doc, w, h);
    const row = doc.elements.length % 10;
    return {
      id: newElementId(),
      ...size,
      x: snap((doc.widthMm - size.w) / 2),
      y: snap(Math.min(2 + row * 2, doc.heightMm - size.h)),
    };
  }

  /** One detail (the item name, a date, the certificate number ...) as a field, written the way it usually is. */
  function addDetail(field: FieldKey) {
    const [w, h] = FIELD_SIZES[field] ?? [40, 6];
    const element: LabelElement = {
      ...placeBox(w, h),
      type: "field",
      field,
      style: { ...DEFAULT_STYLE, ...FIELD_STYLES[field] },
    };
    change({ ...doc, elements: [...doc.elements, element] });
    selectOnly(element.id);
  }

  /** A ready-made section: the dates together in one frame, a warning, or a box of lines. */
  function addSection(kind: "dates" | "warning" | "lines") {
    const frame = { borderMm: 0.4, radiusMm: 2 };
    let element: LabelElement;
    if (kind === "dates") {
      element = {
        ...placeBox(46, 15),
        type: "lines",
        ...frame,
        separator: "dotted",
        lines: [
          boxLine("תאריך שחיטה:", "slaughterDate", { bold: true }),
          boxLine("תאריך ייצור:", "productionDate", { bold: true }),
          boxLine("תאריך תפוגה:", "expiryDate", { bold: true }),
        ],
      };
    } else if (kind === "warning") {
      element = {
        ...placeBox(46, 9),
        type: "lines",
        ...frame,
        separator: "none",
        lines: [boxLine("אזהרה:", "storageText")],
      };
    } else {
      element = {
        ...placeBox(46, 10),
        type: "lines",
        ...frame,
        separator: "dotted",
        lines: [
          boxLine("", "name", { align: "center" }),
          boxLine("", "nameEn", { dir: "ltr", align: "center" }),
        ],
      };
    }
    change({ ...doc, elements: [...doc.elements, element] });
    selectOnly(element.id);
  }

  /**
   * A whole box label, 100 × 100 mm: the item name on top, the weight and the dates side by side,
   * the box barcode, and the storage text at the bottom. Replaces what is on the label (undoable).
   */
  function applyBoxLabel() {
    if (doc.elements.length > 0 && !window.confirm(t("editor.sections.boxLabelConfirm"))) return;
    const frame = { borderMm: 0.4, radiusMm: 3 };
    const elements: LabelElement[] = [
      {
        id: newElementId(),
        x: 3,
        y: 4,
        w: 94,
        h: 14,
        type: "field",
        field: "name",
        style: { ...DEFAULT_STYLE, fontSize: 24, bold: true, align: "start", dir: "rtl" },
      },
      {
        id: newElementId(),
        x: 3,
        y: 23,
        w: 38,
        h: 24,
        type: "lines",
        ...frame,
        separator: "none",
        lines: [
          { ...boxLine("", "text", { fontSize: 12, bold: true, align: "center" }), text: "משקל" },
          boxLine("ק״ג", "weightKg", { fontSize: 18, bold: true, font: "mono", dir: "rtl" }),
        ],
      },
      {
        id: newElementId(),
        x: 44,
        y: 23,
        w: 53,
        h: 24,
        type: "lines",
        ...frame,
        separator: "dotted",
        lines: [
          boxLine("תאריך שחיטה:", "slaughterDate", { fontSize: 10, bold: true, dir: "rtl" }),
          boxLine("תאריך ייצור:", "productionDate", { fontSize: 10, bold: true, dir: "rtl" }),
          boxLine("תאריך תפוגה:", "expiryDate", { fontSize: 10, bold: true, dir: "rtl" }),
        ],
      },
      {
        id: newElementId(),
        x: 3,
        y: 51,
        w: 94,
        h: 22,
        type: "barcode",
        field: "boxBarcode",
        showText: true,
      },
      {
        id: newElementId(),
        x: 3,
        y: 77,
        w: 94,
        h: 20,
        type: "lines",
        ...frame,
        separator: "none",
        lines: [
          boxLine("", "storageText", { fontSize: 10, bold: true, align: "center", dir: "rtl" }),
        ],
      },
    ];
    change({ ...doc, widthMm: 100, heightMm: 100, elements });
    selectOnly(null);
  }

  function duplicateSelected() {
    if (picked.length === 0) return;
    const copies = picked.map((e) => ({ ...e, ...moveBox(e, 2, 2, bounds), id: newElementId() }));
    change({ ...doc, elements: [...doc.elements, ...copies] });
    setSelectedIds(copies.map((e) => e.id));
  }

  function deleteSelected() {
    if (picked.length === 0) return;
    const gone = new Set(pickedIds);
    change({ ...doc, elements: doc.elements.filter((e) => !gone.has(e.id)) });
    selectOnly(null);
    // The element that had the focus is gone: keep the focus in the editor so Ctrl+Z still works.
    root.current?.focus({ preventScroll: true });
  }

  /** Ctrl+C and Ctrl+X: the chosen elements are kept to be pasted. */
  function copySelected() {
    if (picked.length === 0) return false;
    clipboard.current = picked.map((e) => structuredClone(e));
    pastes.current = 0;
    return true;
  }

  /** Ctrl+V: a copy of what was kept, a little further down and to the side each time. */
  function paste() {
    if (clipboard.current.length === 0) return;
    pastes.current += 1;
    const shift = 2 * pastes.current;
    const copies = clipboard.current.map((e) => ({
      ...structuredClone(e),
      ...moveBox(e, shift, shift, bounds),
      id: newElementId(),
    }));
    change({ ...doc, elements: [...doc.elements, ...copies] });
    setSelectedIds(copies.map((e) => e.id));
  }

  /** Puts what is chosen (as one group) in the middle of the label, across or up and down. */
  function centerSelected(axis: "x" | "y") {
    if (picked.length === 0) return;
    const start = Math.min(...picked.map((e) => (axis === "x" ? e.x : e.y)));
    const end = Math.max(...picked.map((e) => (axis === "x" ? e.x + e.w : e.y + e.h)));
    const size = axis === "x" ? doc.widthMm : doc.heightMm;
    const shift = Math.round(((size - (end - start)) / 2 - start) * 100) / 100;
    if (shift === 0) return;
    const ids = new Set(pickedIds);
    change({
      ...doc,
      elements: doc.elements.map((e) =>
        ids.has(e.id) ? { ...e, [axis]: Math.round((e[axis] + shift) * 100) / 100 } : e,
      ),
    });
  }

  /** Moves everything chosen together; the group stops at the edge of the label. */
  function nudge(dx: number, dy: number) {
    if (picked.length === 0) return;
    if (picked.length === 1) {
      const box = moveBox(picked[0], dx, dy, bounds);
      return updateElement(picked[0].id, (e) => ({ ...e, ...box }), "nudge");
    }
    const moved = moveBoxes(picked, dx, dy, bounds);
    const byId = new Map(picked.map((e, i) => [e.id, moved[i]] as const));
    change(
      { ...doc, elements: doc.elements.map((e) => byId.get(e.id) ?? e) },
      `nudge:${pickedIds.join(",")}`,
    );
  }
  function describe(element: LabelElement): string {
    const kind = t(`editor.kinds.${element.type}`);
    let detail = "";
    if (element.type === "text") detail = element.text;
    else if (element.type === "field" || element.type === "barcode")
      detail = t(`fields.${element.field}`);
    else if (element.type === "qr") detail = t(`editor.qrSources.${element.source}`);
    else if (element.type === "logo") detail = t(`editor.logoVariants.${element.variant}`);
    else if (element.type === "lines") {
      detail = element.lines
        .map(
          (line) =>
            line.label.replace(/[:\s]+$/, "") ||
            (line.source === "text" ? line.text : t(`fields.${line.source}`)),
        )
        .join(", ");
    }
    return detail ? t("editor.elementOf", { kind, detail }) : kind;
  }

  // ---- saving and keys ----------------------------------------------------

  function save() {
    if (readOnly || saving || !dirty) return;
    const snapshot = JSON.stringify(doc);
    startSaving(async () => {
      const result = await saveLayoutAction(layoutId, doc);
      if (!result.ok) return void toast.error(t(`errors.${result.error}`));
      setSavedJson(snapshot);
      toast.success(t("editor.saved"));
    });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable]")) return;
    const command = event.ctrlKey || event.metaKey;
    // The letter is read from the physical key, so the shortcuts work with a Hebrew keyboard too
    // (there Ctrl+Z gives the letter "ז", not "z").
    const letter = event.code.startsWith("Key") ? event.code.slice(3).toLowerCase() : "";

    if (command && letter === "s") {
      event.preventDefault();
      return save();
    }
    if (command && letter === "a") {
      event.preventDefault();
      return selectAll();
    }
    if (event.key === "Escape") return selectOnly(null);
    if (readOnly) return;
    if (command && letter === "z") {
      event.preventDefault();
      return event.shiftKey ? redo() : undo();
    }
    if (command && letter === "y") {
      event.preventDefault();
      return redo();
    }
    if (command && letter === "v") {
      event.preventDefault();
      return paste();
    }
    if (picked.length === 0) return;
    if (command && letter === "d") {
      event.preventDefault();
      return duplicateSelected();
    }
    if (command && letter === "c") {
      event.preventDefault();
      return void copySelected();
    }
    if (command && letter === "x") {
      event.preventDefault();
      if (copySelected()) deleteSelected();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      return deleteSelected();
    }

    // In the list of layers the arrows walk the list; they do not move the elements.
    if (target.closest("[data-layer-list]")) return;
    const step = event.shiftKey ? 5 : 0.5;
    const nudges: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = nudges[event.key];
    if (move) {
      event.preventDefault();
      nudge(move[0], move[1]);
    }
  }

  /** A click on a layer: Shift extends from the anchor, Ctrl adds or removes, nothing chooses just it. */
  function pickLayer(id: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
    if (event.shiftKey) selectRange(id);
    else if (event.ctrlKey || event.metaKey) toggle(id);
    else selectOnly(id);
  }

  /** Up and Down walk the layers (and choose the one reached); with Shift they extend the choice. */
  function onLayersKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    // Ctrl or Shift with Space or Enter: the browser does not press a button then, so it is done here.
    if ((event.key === "Enter" || event.key === " ") && isAdditive(event)) {
      const id = (event.target as HTMLElement).closest<HTMLElement>("[data-layer-id]")?.dataset
        .layerId;
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      return pickLayer(id, event);
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-layer-id]")];
    const here = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = here < 0 ? undefined : buttons[here + (event.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    next.focus();
    pickLayer(next.dataset.layerId!, { shiftKey: event.shiftKey, ctrlKey: false, metaKey: false });
  }
  const typeLabel = t(`types.${initial.type}`);

  return (
    <div ref={root} tabIndex={-1} className="space-y-4 outline-none" onKeyDown={onKeyDown}>
      <div className="rise flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/settings/labels" />}
        >
          <ArrowLeft data-icon="inline-start" className="rtl:rotate-180" />
          {backLabel}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? <Badge variant="warning">{t("editor.unsaved")}</Badge> : null}
          {!readOnly ? (
            <>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={undo}
                disabled={past.length === 0}
                aria-label={t("editor.undo")}
                title={t("editor.undo")}
              >
                <Undo2 />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={redo}
                disabled={future.length === 0}
                aria-label={t("editor.redo")}
                title={t("editor.redo")}
              >
                <Redo2 />
              </Button>
            </>
          ) : null}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
            disabled={zoomIndex === 0}
            aria-label={t("editor.zoomOut")}
            title={t("editor.zoomOut")}
          >
            <ZoomOut />
          </Button>
          <span className="w-12 text-center text-sm text-muted-foreground tabular-nums" dir="ltr">
            {Math.round(ZOOMS[zoomIndex] * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setZoomIndex((i) => Math.min(ZOOMS.length - 1, i + 1))}
            disabled={zoomIndex === ZOOMS.length - 1}
            aria-label={t("editor.zoomIn")}
            title={t("editor.zoomIn")}
          >
            <ZoomIn />
          </Button>
          <TestPrint
            widthMm={doc.widthMm}
            heightMm={doc.heightMm}
            elements={doc.elements}
            values={values}
          />
          {!readOnly ? (
            <Button onClick={save} disabled={!dirty || saving}>
              <Save data-icon="inline-start" />
              {saving ? t("editor.saving") : t("editor.save")}
            </Button>
          ) : null}
          <PageHelp topic="labelEditor" />
        </div>
      </div>

      {readOnly ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {t("editor.readOnly")}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* The label stays in view while the panels at the side are scrolled. */}
        <Card
          className="rise min-w-0 p-3 lg:sticky lg:top-4 lg:self-start"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          <div
            ref={area}
            className="overflow-auto rounded-xl bg-muted/60 p-6 lg:max-h-[calc(100vh-7rem)]"
          >
            <div className="mx-auto w-fit">
              <LabelCanvas
                name={t("editor.canvas", {
                  name: doc.name,
                  width: doc.widthMm,
                  height: doc.heightMm,
                })}
                widthMm={doc.widthMm}
                heightMm={doc.heightMm}
                elements={doc.elements}
                selectedIds={pickedIds}
                scale={scale}
                values={values}
                readOnly={readOnly}
                describe={describe}
                onPick={pick}
                onCollapse={selectOnly}
                onClear={clearChoice}
                onFocusElement={selectOnly}
                onGestureStart={() => {
                  remember();
                  lastKey.current = null;
                }}
                onBoxes={setBoxes}
              />
            </div>
          </div>
          {doc.elements.length === 0 ? (
            <p className="px-2 pt-3 text-center text-sm text-muted-foreground">
              {t("editor.noElements")}
            </p>
          ) : null}
        </Card>

        <div className="space-y-4">
          <Panel title={t("editor.label")} badge={typeLabel} index={2}>
            <div className="space-y-1">
              <Label htmlFor="layout-name-field" className="text-xs text-muted-foreground">
                {t("editor.name")}
              </Label>
              <Input
                id="layout-name-field"
                className="h-9"
                value={doc.name}
                disabled={readOnly}
                maxLength={80}
                onChange={(e) => change({ ...doc, name: e.target.value }, "name")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label={t("editor.width")}
                value={doc.widthMm}
                min={10}
                max={300}
                disabled={readOnly}
                onChange={(v) => change({ ...doc, widthMm: v }, "width")}
              />
              <NumberField
                label={t("editor.height")}
                value={doc.heightMm}
                min={10}
                max={300}
                disabled={readOnly}
                onChange={(v) => change({ ...doc, heightMm: v }, "height")}
              />
            </div>
            <SelectField
              label={t("editor.previewItem")}
              value={previewItem}
              onChange={setPreviewItem}
            >
              {previews.map((p) => (
                <option key={p.itemNumber} value={p.itemNumber}>
                  {p.label}
                </option>
              ))}
            </SelectField>
            <p className="text-xs text-muted-foreground">{t("editor.previewHint")}</p>
          </Panel>

          {!readOnly ? (
            <Panel title={t("editor.add")} index={3}>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("editor.addSections")}
                </p>
                {initial.type === "box" ? (
                  <Button
                    size="sm"
                    className="h-auto min-h-9 w-full justify-start py-1.5 text-start whitespace-normal"
                    onClick={applyBoxLabel}
                  >
                    <LayoutTemplate data-icon="inline-start" />
                    {t("editor.sections.boxLabel")}
                  </Button>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-8 justify-start py-1 text-start whitespace-normal"
                    onClick={() => addSection("dates")}
                  >
                    <CalendarDays data-icon="inline-start" />
                    {t("editor.sections.dates")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-8 justify-start py-1 text-start whitespace-normal"
                    onClick={() => addSection("warning")}
                  >
                    <TriangleAlert data-icon="inline-start" />
                    {t("editor.sections.warning")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-8 justify-start py-1 text-start whitespace-normal"
                    onClick={() => addDetail("name")}
                  >
                    <Languages data-icon="inline-start" />
                    {t("editor.sections.nameHe")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-8 justify-start py-1 text-start whitespace-normal"
                    onClick={() => addDetail("nameEn")}
                  >
                    <Languages data-icon="inline-start" />
                    {t("editor.sections.nameEn")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-8 justify-start py-1 text-start whitespace-normal"
                    onClick={() => addSection("lines")}
                  >
                    <Rows3 data-icon="inline-start" />
                    {t("editor.sections.lines")}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{t("editor.addBasics")}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => addElement("text")}>
                    <Type data-icon="inline-start" />
                    {t("editor.addText")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addElement("field")}>
                    <Variable data-icon="inline-start" />
                    {t("editor.addField")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addElement("line")}>
                    <Minus data-icon="inline-start" />
                    {t("editor.addLine")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addElement("box")}>
                    <Square data-icon="inline-start" />
                    {t("editor.addBox")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addElement("barcode")}>
                    <Barcode data-icon="inline-start" />
                    {t("editor.addBarcode")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addElement("qr")}>
                    <QrCode data-icon="inline-start" />
                    {t("editor.addQr")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addElement("logo")}>
                    <ImageIcon data-icon="inline-start" />
                    {t("editor.addLogo")}
                  </Button>
                </div>
              </div>

              <details className="group rounded-xl border border-border" open>
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                  <Variable className="size-4 text-gold" aria-hidden />
                  {t("editor.addDetails")}
                  <ChevronDown
                    className="ms-auto size-4 text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="space-y-3 border-t border-border p-3" data-testid="add-details">
                  <p className="text-xs text-muted-foreground">{t("editor.addDetailsHint")}</p>
                  {detailGroups.map((group) => (
                    <div key={group.key} className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t(`editor.detailGroups.${group.key}`)}
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {group.fields.map((field) => (
                          <Button
                            key={field}
                            variant="outline"
                            size="sm"
                            data-detail={field}
                            className="h-auto min-h-8 justify-start py-1 text-start whitespace-normal"
                            onClick={() => addDetail(field)}
                          >
                            {t(`fields.${field}`)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </Panel>
          ) : null}

          <Panel
            title={t("editor.selected")}
            badge={
              selected
                ? t(`editor.kinds.${selected.type}`)
                : picked.length > 1
                  ? t("editor.multiple", { count: picked.length })
                  : undefined
            }
            index={4}
          >
            {picked.length > 0 && !readOnly ? (
              <div className="mb-3 grid grid-cols-2 gap-2" data-testid="center-buttons">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-8 py-1 whitespace-normal"
                  onClick={() => centerSelected("x")}
                >
                  <AlignHorizontalJustifyCenter data-icon="inline-start" />
                  {t("editor.centerAcross")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-8 py-1 whitespace-normal"
                  onClick={() => centerSelected("y")}
                >
                  <AlignVerticalJustifyCenter data-icon="inline-start" />
                  {t("editor.centerUpDown")}
                </Button>
              </div>
            ) : null}
            {selected ? (
              <ElementProperties
                element={selected}
                disabled={readOnly}
                onChange={(update, key) => updateElement(selected.id, update, key)}
                onDuplicate={duplicateSelected}
                onDelete={deleteSelected}
              />
            ) : picked.length > 1 ? (
              <div className="space-y-3" data-testid="multiple-selected">
                <p className="text-sm text-muted-foreground">{t("editor.multipleHint")}</p>
                {!readOnly ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={duplicateSelected}
                    >
                      <Copy data-icon="inline-start" />
                      {t("editor.props.duplicate")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-destructive"
                      onClick={deleteSelected}
                    >
                      <Trash2 data-icon="inline-start" />
                      {t("editor.props.delete")}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("editor.nothingSelected")}</p>
            )}
          </Panel>

          <Panel title={t("editor.layers")} index={5}>
            <ul className="space-y-1" data-layer-list onKeyDown={onLayersKeyDown}>
              {doc.elements.map((element) => (
                <li key={element.id}>
                  <button
                    type="button"
                    data-layer-id={element.id}
                    aria-pressed={pickedIds.includes(element.id)}
                    onClick={(event) => pickLayer(element.id, event)}
                    className={cn(
                      "w-full truncate rounded-lg px-2.5 py-1.5 text-start text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      pickedIds.includes(element.id)
                        ? "bg-primary/10 font-medium"
                        : "hover:bg-secondary",
                    )}
                    dir="auto"
                  >
                    {describe(element)}
                  </button>
                </li>
              ))}
            </ul>
            {doc.elements.length > 1 ? (
              <p className="text-xs text-muted-foreground">{t("editor.layersHint")}</p>
            ) : null}
          </Panel>

          <Panel title={t("editor.keys.title")} badge={undefined} index={6}>
            <details className="group" open={false}>
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                <Keyboard className="size-4 text-gold" aria-hidden />
                {t("editor.keys.show")}
              </summary>
              <dl className="mt-3 space-y-2 text-sm" data-testid="keyboard-help">
                {KEY_HELP.map((id) => (
                  <div key={id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <dt>
                      <kbd
                        dir="ltr"
                        className="inline-block rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs"
                      >
                        {t(`editor.keys.${id}.keys`)}
                      </kbd>
                    </dt>
                    <dd className="text-muted-foreground">{t(`editor.keys.${id}.does`)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  badge,
  index,
  children,
}: {
  title: string;
  badge?: string;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <Card
      role="region"
      aria-label={title}
      className="rise gap-3 p-4"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">{title}</h2>
        {badge ? <Badge variant="soft">{badge}</Badge> : null}
      </div>
      {children}
    </Card>
  );
}

function ElementProperties({
  element,
  disabled,
  onChange,
  onDuplicate,
  onDelete,
}: {
  element: LabelElement;
  disabled: boolean;
  onChange: (update: (element: LabelElement) => LabelElement, key?: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("labels");

  function patchStyle(patch: Partial<ElementStyle>, key: string) {
    onChange(
      (e) =>
        e.type === "text" || e.type === "field" ? { ...e, style: { ...e.style, ...patch } } : e,
      key,
    );
  }

  const heightLabel = element.type === "line" ? t("editor.props.thickness") : t("editor.props.h");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label={t("editor.props.x")}
          value={element.x}
          disabled={disabled}
          onChange={(v) => onChange((e) => ({ ...e, x: v }), "x")}
        />
        <NumberField
          label={t("editor.props.y")}
          value={element.y}
          disabled={disabled}
          onChange={(v) => onChange((e) => ({ ...e, y: v }), "y")}
        />
        <NumberField
          label={t("editor.props.w")}
          value={element.w}
          min={0.2}
          disabled={disabled}
          onChange={(v) => onChange((e) => ({ ...e, w: v }), "w")}
        />
        <NumberField
          label={heightLabel}
          value={element.h}
          step={element.type === "line" ? 0.1 : 0.5}
          min={0.2}
          disabled={disabled}
          onChange={(v) => onChange((e) => ({ ...e, h: v }), "h")}
        />
      </div>

      {element.type === "text" ? (
        <div className="space-y-1">
          <Label htmlFor="element-text" className="text-xs text-muted-foreground">
            {t("editor.props.text")}
          </Label>
          <textarea
            id="element-text"
            rows={2}
            dir="auto"
            value={element.text}
            disabled={disabled}
            maxLength={500}
            onChange={(event) =>
              onChange((e) => (e.type === "text" ? { ...e, text: event.target.value } : e), "text")
            }
            className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          />
        </div>
      ) : null}

      {element.type === "field" || element.type === "barcode" ? (
        <SelectField
          label={t("editor.props.field")}
          value={element.field}
          disabled={disabled}
          onChange={(value) =>
            onChange(
              (e) =>
                e.type === "field" || e.type === "barcode" ? { ...e, field: value as FieldKey } : e,
              "field",
            )
          }
        >
          <optgroup label={t("editor.fieldGroups.item")}>
            {ITEM_FIELDS.map((key) => (
              <option key={key} value={key}>
                {t(`fields.${key}`)}
              </option>
            ))}
          </optgroup>
          <optgroup label={t("editor.fieldGroups.label")}>
            {LABEL_FIELDS.map((key) => (
              <option key={key} value={key}>
                {t(`fields.${key}`)}
              </option>
            ))}
          </optgroup>
        </SelectField>
      ) : null}

      {element.type === "barcode" ? (
        <Button
          type="button"
          variant={element.showText ? "default" : "outline"}
          size="sm"
          aria-pressed={element.showText}
          disabled={disabled}
          onClick={() =>
            onChange(
              (e) => (e.type === "barcode" ? { ...e, showText: !e.showText } : e),
              "showText",
            )
          }
        >
          {t("editor.props.showText")}
        </Button>
      ) : null}

      {element.type === "qr" ? (
        <SelectField
          label={t("editor.props.qrSource")}
          value={element.source}
          disabled={disabled}
          onChange={(value) =>
            onChange((e) => (e.type === "qr" ? { ...e, source: value as QrSource } : e), "source")
          }
        >
          {QR_SOURCES.map((source) => (
            <option key={source} value={source}>
              {t(`editor.qrSources.${source}`)}
            </option>
          ))}
        </SelectField>
      ) : null}

      {element.type === "logo" ? (
        <Segmented
          label={t("editor.props.logoVariant")}
          value={element.variant}
          disabled={disabled}
          options={LOGO_VARIANTS.map((variant) => ({
            value: variant,
            label: t(`editor.logoVariants.${variant}`),
          }))}
          onChange={(variant: LogoVariant) =>
            onChange((e) => (e.type === "logo" ? { ...e, variant } : e), "variant")
          }
        />
      ) : null}

      {element.type === "text" || element.type === "field" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label={t("editor.props.font")}
              value={element.style.font}
              disabled={disabled}
              onChange={(value) => patchStyle({ font: value as ElementStyle["font"] }, "font")}
            >
              {FONTS.map((font) => (
                <option key={font} value={font}>
                  {t(`editor.fonts.${font}`)}
                </option>
              ))}
            </SelectField>
            <NumberField
              label={t("editor.props.size")}
              value={element.style.fontSize}
              step={1}
              min={4}
              max={120}
              disabled={disabled}
              onChange={(v) => patchStyle({ fontSize: v }, "size")}
            />
          </div>
          <Button
            type="button"
            variant={element.style.bold ? "default" : "outline"}
            size="sm"
            aria-pressed={element.style.bold}
            disabled={disabled}
            onClick={() => patchStyle({ bold: !element.style.bold }, "bold")}
          >
            <Bold data-icon="inline-start" />
            {t("editor.props.bold")}
          </Button>
          <Segmented
            label={t("editor.props.align")}
            value={element.style.align}
            disabled={disabled}
            options={ALIGNS.map((a) => ({ value: a, label: t(`editor.aligns.${a}`) }))}
            onChange={(v) => patchStyle({ align: v }, "align")}
          />
          <Segmented
            label={t("editor.props.dir")}
            value={element.style.dir}
            disabled={disabled}
            options={DIRECTIONS.map((d) => ({ value: d, label: t(`editor.dirs.${d}`) }))}
            onChange={(v) => patchStyle({ dir: v }, "dir")}
          />
        </>
      ) : null}

      {element.type === "box" ? (
        <NumberField
          label={t("editor.props.border")}
          value={element.borderMm}
          step={0.1}
          min={0.1}
          max={5}
          disabled={disabled}
          onChange={(v) =>
            onChange((e) => (e.type === "box" ? { ...e, borderMm: v } : e), "border")
          }
        />
      ) : null}

      {element.type === "lines" ? (
        <LinesProperties element={element} disabled={disabled} onChange={onChange} />
      ) : null}

      {!disabled ? (
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1" onClick={onDuplicate}>
            <Copy data-icon="inline-start" />
            {t("editor.props.duplicate")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-destructive"
            onClick={onDelete}
          >
            <Trash2 data-icon="inline-start" />
            {t("editor.props.delete")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type LinesElement = Extract<LabelElement, { type: "lines" }>;

/**
 * The settings of a lines box: its frame, and each line (the words before the value, what the value
 * is, and how the line is written). Lines can be added, removed and moved.
 */
function LinesProperties({
  element,
  disabled,
  onChange,
}: {
  element: LinesElement;
  disabled: boolean;
  onChange: (update: (element: LabelElement) => LabelElement, key?: string) => void;
}) {
  const t = useTranslations("labels");

  const patch = (change: (e: LinesElement) => LinesElement, key: string) =>
    onChange((e) => (e.type === "lines" ? change(e) : e), key);
  const patchLine = (index: number, change: (line: BoxLine) => BoxLine, key: string) =>
    patch(
      (e) => ({ ...e, lines: e.lines.map((line, i) => (i === index ? change(line) : line)) }),
      `line${index}:${key}`,
    );

  function move(index: number, by: -1 | 1) {
    patch((e) => {
      const lines = [...e.lines];
      const [moved] = lines.splice(index, 1);
      lines.splice(index + by, 0, moved);
      return { ...e, lines };
    }, `move${index}`);
  }

  const separators: Record<LineSeparator, string> = {
    none: t("editor.props.lines.separators.none"),
    dotted: t("editor.props.lines.separators.dotted"),
    solid: t("editor.props.lines.separators.solid"),
  };

  return (
    <div className="space-y-3" data-testid="lines-properties">
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label={t("editor.props.lines.frame")}
          value={element.borderMm}
          step={0.1}
          min={0}
          max={5}
          disabled={disabled}
          onChange={(v) => patch((e) => ({ ...e, borderMm: v }), "frame")}
        />
        <NumberField
          label={t("editor.props.lines.radius")}
          value={element.radiusMm}
          step={0.5}
          min={0}
          max={20}
          disabled={disabled}
          onChange={(v) => patch((e) => ({ ...e, radiusMm: v }), "radius")}
        />
      </div>
      <Segmented
        label={t("editor.props.lines.separator")}
        value={element.separator}
        disabled={disabled}
        options={LINE_SEPARATORS.map((value) => ({ value, label: separators[value] }))}
        onChange={(separator: LineSeparator) => patch((e) => ({ ...e, separator }), "separator")}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("editor.props.lines.title")}</p>
        {element.lines.map((line, index) => (
          <LineCard
            // The lines have no ids of their own: they are told apart by their place.
            key={index}
            line={line}
            number={index + 1}
            disabled={disabled}
            canRemove={element.lines.length > 1}
            canUp={index > 0}
            canDown={index < element.lines.length - 1}
            onChange={(change, key) => patchLine(index, change, key)}
            onMove={(by) => move(index, by)}
            onRemove={() =>
              patch(
                (e) => ({ ...e, lines: e.lines.filter((_, i) => i !== index) }),
                `remove${index}`,
              )
            }
          />
        ))}
        {!disabled && element.lines.length < MAX_BOX_LINES ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() =>
              patch(
                (e) => ({
                  ...e,
                  lines: [...e.lines, boxLine("", "name", { align: "center" })],
                }),
                "add",
              )
            }
          >
            <Plus data-icon="inline-start" />
            {t("editor.props.lines.add")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function LineCard({
  line,
  number,
  disabled,
  canRemove,
  canUp,
  canDown,
  onChange,
  onMove,
  onRemove,
}: {
  line: BoxLine;
  number: number;
  disabled: boolean;
  canRemove: boolean;
  canUp: boolean;
  canDown: boolean;
  onChange: (change: (line: BoxLine) => BoxLine, key: string) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("labels");
  const id = useId();
  const style = (patch: Partial<ElementStyle>, key: string) =>
    onChange((l) => ({ ...l, style: { ...l.style, ...patch } }), key);

  return (
    <div
      role="group"
      aria-label={t("editor.props.lines.line", { number })}
      className="space-y-3 rounded-xl border border-border bg-muted/30 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{t("editor.props.lines.line", { number })}</p>
        {!disabled ? (
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!canUp}
              aria-label={t("editor.props.lines.up", { number })}
              onClick={() => onMove(-1)}
            >
              <ChevronUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!canDown}
              aria-label={t("editor.props.lines.down", { number })}
              onClick={() => onMove(1)}
            >
              <ChevronDown />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive"
              disabled={!canRemove}
              aria-label={t("editor.props.lines.remove", { number })}
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${id}-label`} className="text-xs text-muted-foreground">
          {t("editor.props.lines.label")}
        </Label>
        <Input
          id={`${id}-label`}
          className="h-9"
          dir="auto"
          maxLength={100}
          value={line.label}
          disabled={disabled}
          onChange={(event) => onChange((l) => ({ ...l, label: event.target.value }), "label")}
        />
      </div>

      <SelectField
        label={t("editor.props.lines.source")}
        value={line.source}
        disabled={disabled}
        onChange={(value) => onChange((l) => ({ ...l, source: value as LineSource }), "source")}
      >
        <optgroup label={t("editor.fieldGroups.item")}>
          {ITEM_FIELDS.map((key) => (
            <option key={key} value={key}>
              {t(`fields.${key}`)}
            </option>
          ))}
        </optgroup>
        <optgroup label={t("editor.fieldGroups.label")}>
          {LABEL_FIELDS.map((key) => (
            <option key={key} value={key}>
              {t(`fields.${key}`)}
            </option>
          ))}
        </optgroup>
        <option value="text">{t("editor.props.lines.sourceText")}</option>
      </SelectField>

      {line.source === "text" ? (
        <div className="space-y-1">
          <Label htmlFor={`${id}-text`} className="text-xs text-muted-foreground">
            {t("editor.props.lines.text")}
          </Label>
          <Input
            id={`${id}-text`}
            className="h-9"
            dir="auto"
            maxLength={500}
            value={line.text}
            disabled={disabled}
            onChange={(event) => onChange((l) => ({ ...l, text: event.target.value }), "text")}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label={t("editor.props.font")}
          value={line.style.font}
          disabled={disabled}
          onChange={(value) => style({ font: value as ElementStyle["font"] }, "font")}
        >
          {FONTS.map((font) => (
            <option key={font} value={font}>
              {t(`editor.fonts.${font}`)}
            </option>
          ))}
        </SelectField>
        <NumberField
          label={t("editor.props.size")}
          value={line.style.fontSize}
          step={1}
          min={4}
          max={120}
          disabled={disabled}
          onChange={(v) => style({ fontSize: v }, "size")}
        />
      </div>
      <Button
        type="button"
        variant={line.style.bold ? "default" : "outline"}
        size="sm"
        aria-pressed={line.style.bold}
        disabled={disabled}
        onClick={() => style({ bold: !line.style.bold }, "bold")}
      >
        <Bold data-icon="inline-start" />
        {t("editor.props.bold")}
      </Button>
      <Segmented
        label={t("editor.props.dir")}
        value={line.style.dir}
        disabled={disabled}
        options={DIRECTIONS.map((d) => ({ value: d, label: t(`editor.dirs.${d}`) }))}
        onChange={(v) => style({ dir: v }, "dir")}
      />
      {line.label === "" ? (
        <Segmented
          label={t("editor.props.align")}
          value={line.style.align}
          disabled={disabled}
          options={ALIGNS.map((a) => ({ value: a, label: t(`editor.aligns.${a}`) }))}
          onChange={(v) => style({ align: v }, "align")}
        />
      ) : (
        // With words before the value: spread across the line, or the two together in the centre.
        <Segmented
          label={t("editor.props.align")}
          value={line.style.align === "center" ? "center" : "start"}
          disabled={disabled}
          options={[
            { value: "start" as const, label: t("editor.aligns.spread") },
            { value: "center" as const, label: t("editor.aligns.center") },
          ]}
          onChange={(v) => style({ align: v }, "align")}
        />
      )}
    </div>
  );
}
