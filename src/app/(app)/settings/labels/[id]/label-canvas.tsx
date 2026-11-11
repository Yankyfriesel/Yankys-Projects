"use client";

import { useRef } from "react";
import { moveBox, moveBoxes, resizeBox, type Box, type Handle } from "@/lib/labels/geometry";
import type { LabelElement, LabelValues } from "@/lib/labels/model";
import { cn } from "@/lib/utils";
import { ElementView } from "@/components/labels/element-view";

const HANDLES: { handle: Handle; className: string; cursor: string }[] = [
  { handle: "nw", className: "-start-1 -top-1", cursor: "nwse-resize" },
  { handle: "n", className: "start-1/2 -top-1 -translate-x-1/2", cursor: "ns-resize" },
  { handle: "ne", className: "-end-1 -top-1", cursor: "nesw-resize" },
  { handle: "e", className: "-end-1 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { handle: "se", className: "-end-1 -bottom-1", cursor: "nwse-resize" },
  { handle: "s", className: "start-1/2 -bottom-1 -translate-x-1/2", cursor: "ns-resize" },
  { handle: "sw", className: "-start-1 -bottom-1", cursor: "nesw-resize" },
  { handle: "w", className: "-start-1 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

interface Gesture {
  /** The element that was grabbed. */
  id: string;
  kind: "move" | "resize";
  handle: Handle | null;
  startX: number;
  startY: number;
  /** Where every element that moves with the gesture was when it began. */
  starts: Record<string, Box>;
  started: boolean;
  /** Several were chosen and one of them was clicked: a click without a drag chooses just that one. */
  collapse: boolean;
}

/** Whether a key or click asks to add to the choice instead of replacing it. */
export const isAdditive = (event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) =>
  event.shiftKey || event.ctrlKey || event.metaKey;

/**
 * The label at real proportions (`scale` pixels per millimetre) with its elements.
 * A label is a physical object, so the canvas is always left to right, also in
 * Hebrew: x counts from the left edge of the label. Dragging an element moves it
 * (all the chosen ones, when it is one of several), dragging a handle resizes it
 * (one chosen element); both snap to half a millimetre. Shift or Ctrl with a click
 * adds an element to the choice or takes it out.
 */
export function LabelCanvas({
  name,
  widthMm,
  heightMm,
  elements,
  selectedIds,
  scale,
  values,
  readOnly,
  describe,
  onPick,
  onCollapse,
  onClear,
  onFocusElement,
  onGestureStart,
  onBoxes,
}: {
  name: string;
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
  selectedIds: string[];
  scale: number;
  values: LabelValues;
  readOnly: boolean;
  /** The accessible name of an element, for example "Field: Slaughter date". */
  describe: (element: LabelElement) => string;
  /** An element was clicked (or Space/Enter pressed on it); `additive` adds or removes it. */
  onPick: (id: string, additive: boolean) => void;
  /** One of several chosen elements was clicked without dragging: choose just that one. */
  onCollapse: (id: string) => void;
  /** The empty part of the label was clicked: choose nothing. */
  onClear: () => void;
  /** An element got the keyboard focus (Tab): choose just that one. */
  onFocusElement: (id: string) => void;
  /** Called once when a drag or resize really starts, so it can be undone as one step. */
  onGestureStart: () => void;
  /** Called while dragging with the new position and size of what moves. */
  onBoxes: (boxes: Record<string, Box>) => void;
}) {
  const gesture = useRef<Gesture | null>(null);
  // True while the pointer itself moves the focus, so that focusing does not change the choice.
  const focusingByPointer = useRef(false);
  const bounds = { width: widthMm, height: heightMm };
  const chosen = new Set(selectedIds);

  function begin(
    event: React.PointerEvent<HTMLElement>,
    element: LabelElement,
    kind: Gesture["kind"],
    handle: Handle | null,
  ) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();

    // The default is cancelled (no text selection while dragging), so the focus goes there by hand:
    // the keys (Delete, arrows, Ctrl+A) must work right after a click.
    focusingByPointer.current = true;
    (event.currentTarget.closest("[data-element-id]") as HTMLElement | null)?.focus({
      preventScroll: true,
    });
    focusingByPointer.current = false;

    if (kind === "move" && isAdditive(event)) return onPick(element.id, true);
    const group = kind === "move" && chosen.has(element.id) && chosen.size > 1;
    if (!group) onPick(element.id, false);
    if (readOnly) return;

    const moving = group ? elements.filter((e) => chosen.has(e.id)) : [element];
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      id: element.id,
      kind,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      starts: Object.fromEntries(
        moving.map((e) => [e.id, { x: e.x, y: e.y, w: e.w, h: e.h }] as const),
      ),
      started: false,
      collapse: group,
    };
  }

  function drag(event: React.PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g) return;
    const dx = (event.clientX - g.startX) / scale;
    const dy = (event.clientY - g.startY) / scale;
    const ids = Object.keys(g.starts);
    let next: Record<string, Box>;
    if (g.kind === "resize") {
      next = { [g.id]: resizeBox(g.starts[g.id], g.handle!, dx, dy, bounds) };
    } else if (ids.length === 1) {
      next = { [g.id]: moveBox(g.starts[g.id], dx, dy, bounds) };
    } else {
      const moved = moveBoxes(
        ids.map((id) => g.starts[id]),
        dx,
        dy,
        bounds,
      );
      next = Object.fromEntries(ids.map((id, i) => [id, moved[i]] as const));
    }
    const changed = ids.some((id) => {
      const a = next[id];
      const b = g.starts[id];
      return a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h;
    });
    if (!changed && !g.started) return;
    if (!g.started) {
      g.started = true;
      onGestureStart();
    }
    onBoxes(next);
  }

  function end() {
    const g = gesture.current;
    gesture.current = null;
    if (g && !g.started && g.collapse) onCollapse(g.id);
  }

  return (
    <div
      dir="ltr"
      role="group"
      aria-label={name}
      data-testid="label-canvas"
      className="relative shrink-0 bg-white shadow-card ring-1 ring-border"
      style={{ width: widthMm * scale, height: heightMm * scale }}
      onPointerDown={(event) => {
        if (!isAdditive(event)) onClear();
      }}
    >
      {elements.map((element) => (
        <ElementView key={element.id} element={element} scale={scale} values={values} />
      ))}

      {elements.map((element) => {
        const selected = chosen.has(element.id);
        const alone = selected && chosen.size === 1;
        return (
          <div
            key={element.id}
            data-element-id={element.id}
            role="button"
            tabIndex={0}
            aria-label={describe(element)}
            aria-pressed={selected}
            onPointerDown={(event) => begin(event, element, "move", null)}
            onPointerMove={drag}
            onPointerUp={end}
            onPointerCancel={end}
            onFocus={() => {
              if (!focusingByPointer.current) onFocusElement(element.id);
            }}
            onKeyDown={(event) => {
              // Space or Enter chooses the element; with Shift or Ctrl it is added to the choice.
              if (event.key !== " " && event.key !== "Enter") return;
              event.preventDefault();
              onPick(element.id, isAdditive(event));
            }}
            className={cn(
              "absolute touch-none outline-none",
              readOnly ? "cursor-default" : "cursor-move",
              selected
                ? "z-10 ring-2 ring-primary"
                : "outline-1 outline-transparent outline-dashed hover:outline-gold/70",
            )}
            style={{
              left: element.x * scale,
              top: element.y * scale,
              width: element.w * scale,
              height: element.h * scale,
              // A hairline is hard to catch with a pointer: keep a small hit area.
              minWidth: 6,
              minHeight: 6,
            }}
          >
            {alone && !readOnly
              ? HANDLES.map(({ handle, className, cursor }) => (
                  <span
                    key={handle}
                    data-handle={handle}
                    onPointerDown={(event) => begin(event, element, "resize", handle)}
                    onPointerMove={drag}
                    onPointerUp={end}
                    onPointerCancel={end}
                    className={cn(
                      "absolute size-2.5 touch-none rounded-[2px] border border-primary bg-white",
                      className,
                    )}
                    style={{ cursor }}
                  />
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}
