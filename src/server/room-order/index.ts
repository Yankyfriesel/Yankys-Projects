import { logFor, type Actor } from "../activity-log";
import type { Db } from "../db/connection";
import { readSetting, writeSetting } from "../settings";

/**
 * The order the storage rooms are shown in on the dashboard and in the inventory, arranged by
 * hand. Every person has their own order, kept apart from everyone else's. A person who has not
 * arranged them yet sees the order saved before orders were personal (if there is one), and rooms
 * that are not in the saved order (new ones) come last, in Priority's order.
 */

/** The order saved before every person had their own: the starting point for those with none. */
const SHARED_KEY = "rooms.order";
/** A person's own order. Not under "rooms." so it is never copied to another system. */
const personalKey = (userId: string) => `userRooms.${userId}`;
const MAX_ROOMS = 200;

export class RoomOrderError extends Error {
  constructor(public readonly code: "INVALID_ORDER") {
    super(code);
    this.name = "RoomOrderError";
  }
}

/** The room codes in this person's order; empty until one is saved. */
export async function getRoomOrder(db: Db, userId: string): Promise<string[]> {
  const own = await readSetting<string[]>(db, personalKey(userId));
  if (Array.isArray(own?.value)) return own.value;
  const shared = await readSetting<string[]>(db, SHARED_KEY);
  return Array.isArray(shared?.value) ? shared.value : [];
}

/** Saves this person's order, each room once. Nobody else's order changes. */
export async function setRoomOrder(
  db: Db,
  userId: string,
  codes: string[],
  actor: Actor,
): Promise<void> {
  const unique = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
  if (unique.length === 0 || unique.length > MAX_ROOMS) throw new RoomOrderError("INVALID_ORDER");
  await writeSetting(db, personalKey(userId), unique, actor.id);
  await logFor(
    actor,
    "settings.roomOrderChanged",
    { entityType: "settings", entityId: personalKey(userId), details: { rooms: unique.length } },
    db,
  );
}

/** The rooms in the saved order; any not in it follow, in the order they came in. */
export function inRoomOrder<T extends { code: string }>(rooms: T[], order: string[]): T[] {
  const place = new Map(order.map((code, index) => [code, index]));
  return rooms
    .map((room, index) => ({ room, index }))
    .sort(
      (a, b) =>
        (place.get(a.room.code) ?? Infinity) - (place.get(b.room.code) ?? Infinity) ||
        a.index - b.index,
    )
    .map((entry) => entry.room);
}
