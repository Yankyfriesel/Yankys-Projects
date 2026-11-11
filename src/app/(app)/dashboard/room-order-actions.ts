"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { assertPermission, PermissionError } from "@/server/permissions";
import { RoomOrderError, setRoomOrder } from "@/server/room-order";

/** Saves the order the storage rooms are shown in for this person, on the dashboard and in the inventory. */
export async function saveRoomOrderAction(codes: string[]): Promise<{ ok: boolean }> {
  try {
    const access = await assertPermission("dashboard.reorder");
    const parsed = z.array(z.string().max(60)).max(200).parse(codes);
    await setRoomOrder(db, access.user.id, parsed, access.actor);
    revalidatePath("/dashboard");
    revalidatePath("/inventory");
    return { ok: true };
  } catch (error) {
    if (
      !(error instanceof PermissionError) &&
      !(error instanceof RoomOrderError) &&
      !(error instanceof z.ZodError)
    )
      console.error("[rooms] saving the order failed", error);
    return { ok: false };
  }
}
