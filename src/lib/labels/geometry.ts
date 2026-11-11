/** Where an element sits on the label, in millimetres. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bounds {
  width: number;
  height: number;
}

export const GRID_MM = 0.5;

/** The smallest an element gets by dragging; thinner sizes are typed in. */
export const DRAG_MIN_MM = GRID_MM;

/** Rounds to the grid (default half a millimetre), and away from float noise. */
export function snap(value: number, step: number = GRID_MM): number {
  return Math.round(Math.round(value / step) * step * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Moves a box by (dx, dy), snapped, keeping it inside the label. */
export function moveBox(box: Box, dx: number, dy: number, bounds: Bounds): Box {
  return {
    ...box,
    x: clamp(snap(box.x + dx), 0, Math.max(0, bounds.width - box.w)),
    y: clamp(snap(box.y + dy), 0, Math.max(0, bounds.height - box.h)),
  };
}

/**
 * Moves several boxes together by (dx, dy), snapped. The group stays inside the label as a
 * whole, so the boxes keep their places relative to each other when the group reaches an edge.
 */
export function moveBoxes<T extends Box>(boxes: T[], dx: number, dy: number, bounds: Bounds): T[] {
  if (boxes.length === 0) return boxes;
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  const moveX = clamp(snap(dx), -left, Math.max(-left, bounds.width - right));
  const moveY = clamp(snap(dy), -top, Math.max(-top, bounds.height - bottom));
  return boxes.map((b) => ({
    ...b,
    x: Math.round((b.x + moveX) * 1000) / 1000,
    y: Math.round((b.y + moveY) * 1000) / 1000,
  }));
}

/** The eight handles around a selected element: n = top, e = right, and so on. */
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * Drags one handle by (dx, dy): the opposite edges stay where they are. The
 * result is snapped, at least DRAG_MIN_MM in each direction, and inside the label.
 */
export function resizeBox(box: Box, handle: Handle, dx: number, dy: number, bounds: Bounds): Box {
  let left = box.x;
  let top = box.y;
  let right = box.x + box.w;
  let bottom = box.y + box.h;

  if (handle.includes("w")) left = clamp(snap(left + dx), 0, right - DRAG_MIN_MM);
  if (handle.includes("e")) right = clamp(snap(right + dx), left + DRAG_MIN_MM, bounds.width);
  if (handle.includes("n")) top = clamp(snap(top + dy), 0, bottom - DRAG_MIN_MM);
  if (handle.includes("s")) bottom = clamp(snap(bottom + dy), top + DRAG_MIN_MM, bounds.height);

  return { x: left, y: top, w: snap(right - left), h: snap(bottom - top) };
}

/** Points to millimetres, for font sizes. */
export const MM_PER_POINT = 25.4 / 72;

export function pointsToMm(points: number): number {
  return points * MM_PER_POINT;
}
