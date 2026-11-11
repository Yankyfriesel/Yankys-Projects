import { eq } from "drizzle-orm";
import type { Db } from "../db/connection";
import { userPermissions } from "../db/schema";
import { isPermission, type Permission } from "./registry";

/** The keys granted to a user. Kept apart from index.ts so tests and scripts can use it without Next's server-only guard. */
export async function loadPermissionSet(database: Db, userId: string): Promise<Set<Permission>> {
  const rows = await database
    .select({ permission: userPermissions.permission })
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId));
  return new Set(
    rows.map((r) => r.permission).filter((key): key is Permission => isPermission(key)),
  );
}
