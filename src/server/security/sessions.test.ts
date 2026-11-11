import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "../activity-log";
import { AdminError, createUser } from "../auth/admin";
import { createDatabase, type Database } from "../db/connection";
import { sessions, users } from "../db/schema";
import { endSession, listActiveSessions } from "./sessions";

let database: Database;
const actor: Actor = { id: null, display: "system", deviceType: null, ip: null };
const HOUR = 60 * 60 * 1000;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
}, 60_000);

async function addUser(email: string, isOwner = false): Promise<string> {
  const created = await createUser(
    database.db,
    { email, name: email, displayName: "", permissions: [] },
    actor,
  );
  if (isOwner) await database.db.update(users).set({ isOwner }).where(eq(users.id, created.id));
  return created.id;
}

async function addSession(userId: string, token: string, expiresInMs: number, ip: string) {
  const [row] = await database.db
    .insert(sessions)
    .values({
      userId,
      token,
      expiresAt: new Date(Date.now() + expiresInMs),
      ipAddress: ip,
      userAgent: "Mozilla/5.0 Chrome/126.0 Safari/537.36",
    })
    .returning({ id: sessions.id });
  return row.id;
}

describe("signed-in places", () => {
  it("lists the places still signed in, not the ones that ran out", async () => {
    const worker = await addUser("w@example.com");
    await addSession(worker, "live", HOUR, "1.1.1.1");
    await addSession(worker, "old", -HOUR, "2.2.2.2");

    const list = await listActiveSessions(database.db);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ userId: worker, email: "w@example.com", ip: "1.1.1.1" });
  });

  it("signs a place out and writes it to the log", async () => {
    const worker = await addUser("x@example.com");
    const id = await addSession(worker, "gone", HOUR, "3.3.3.3");

    await endSession(database.db, id, actor, { mayEndOwner: false });

    expect((await listActiveSessions(database.db)).some((row) => row.id === id)).toBe(false);
  });

  it("keeps the owner's places safe from anyone but the owner", async () => {
    const owner = await addUser("owner-x@example.com", true);
    const id = await addSession(owner, "owner-session", HOUR, "4.4.4.4");

    await expect(endSession(database.db, id, actor, { mayEndOwner: false })).rejects.toThrow(
      AdminError,
    );
    await endSession(database.db, id, actor, { mayEndOwner: true });
    expect((await listActiveSessions(database.db)).some((row) => row.id === id)).toBe(false);
  });
});
