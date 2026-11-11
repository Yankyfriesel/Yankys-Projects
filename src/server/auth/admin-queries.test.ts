import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../db/connection";
import { seed } from "../db/seed";
import { logActivity } from "../activity-log";
import { AdminError, createUser, deleteUser, setUserPermissions, updateUserProfile } from "./admin";
import { ACTIVITY_PAGE_SIZE, listActivity, listActivityActions, listUsers } from "./admin-queries";

const OWNER = { email: "boss@example.com", password: "Temp-1234", name: "Boss" };
const actor = { id: null, display: "test" };

let database: Database;
let ownerId: string;
let workerId: string;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, OWNER);
  const created = await createUser(
    database.db,
    {
      email: "worker@example.com",
      name: "Dana Cohen",
      displayName: "Dana",
      permissions: ["dashboard.view", "device.phone"],
    },
    actor,
  );
  workerId = created.id;
  const all = await listUsers(database.db);
  ownerId = all.find((u) => u.isOwner)!.id;
}, 60_000);

describe("listUsers", () => {
  it("puts the owner first and carries each user's permissions", async () => {
    const all = await listUsers(database.db);
    expect(all[0].isOwner).toBe(true);
    const worker = all.find((u) => u.id === workerId)!;
    expect(worker.permissions.sort()).toEqual(["dashboard.view", "device.phone"]);
    expect(worker.mustChangePassword).toBe(true);
    expect(worker.lastSeen).toBeNull();
  });
});

describe("updateUserProfile", () => {
  it("changes the details, keeps the email, and logs it", async () => {
    await updateUserProfile(
      database.db,
      workerId,
      { name: " Dana Levi ", displayName: "", jobTitle: "Packer", locale: "en" },
      actor,
    );
    const worker = (await listUsers(database.db)).find((u) => u.id === workerId)!;
    expect(worker.name).toBe("Dana Levi");
    expect(worker.displayName).toBe("Dana Levi");
    expect(worker.jobTitle).toBe("Packer");
    expect(worker.locale).toBe("en");
    expect(worker.email).toBe("worker@example.com");
    const log = await listActivity(database.db, { action: "admin.userEdited", page: 1 });
    expect(log.total).toBe(1);
  });
});

describe("setUserPermissions", () => {
  it("never changes the owner's permissions", async () => {
    await expect(
      setUserPermissions(database.db, ownerId, ["dashboard.view"], actor),
    ).rejects.toMatchObject({ code: "OWNER_PROTECTED" });
    await expect(setUserPermissions(database.db, ownerId, [], actor)).rejects.toBeInstanceOf(
      AdminError,
    );
  });

  it("replaces a user's set and rejects unknown keys", async () => {
    await setUserPermissions(database.db, workerId, ["catalog.view", "catalog.print"], actor);
    const worker = (await listUsers(database.db)).find((u) => u.id === workerId)!;
    expect(worker.permissions.sort()).toEqual(["catalog.print", "catalog.view"]);
    await expect(
      setUserPermissions(database.db, workerId, ["catalog.fly"], actor),
    ).rejects.toMatchObject({ code: "INVALID_PERMISSION" });
  });
});

describe("listActivity", () => {
  it("pages newest first and filters by user, action and day", async () => {
    for (let i = 0; i < ACTIVITY_PAGE_SIZE + 5; i++) {
      await logActivity(
        {
          action: "auth.login",
          userId: workerId,
          userDisplay: "Dana",
          details: { method: "password" },
        },
        database.db,
      );
    }
    const first = await listActivity(database.db, { userId: workerId, page: 1 });
    expect(first.rows).toHaveLength(ACTIVITY_PAGE_SIZE);
    expect(first.pageCount).toBe(2);
    const second = await listActivity(database.db, { userId: workerId, page: 2 });
    expect(second.rows.length).toBeGreaterThan(0);
    expect(first.rows[0].at.getTime()).toBeGreaterThanOrEqual(first.rows[1].at.getTime());

    const family = await listActivity(database.db, { action: "admin.", page: 1 });
    expect(family.rows.every((r) => r.action.startsWith("admin."))).toBe(true);

    const today = new Date().toISOString().slice(0, 10);
    const inRange = await listActivity(database.db, { from: today, to: today, page: 1 });
    expect(inRange.total).toBeGreaterThan(0);
    const past = await listActivity(database.db, { to: "2000-01-01", page: 1 });
    expect(past.total).toBe(0);
  });

  it("clamps an out-of-range page and lists the distinct actions", async () => {
    const result = await listActivity(database.db, { userId: workerId, page: 99 });
    expect(result.rows.length).toBeGreaterThan(0);
    expect(await listActivityActions(database.db)).toContain("auth.login");
  });
});

describe("deleteUser", () => {
  const code = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return null;
    } catch (error) {
      return error instanceof AdminError ? error.code : "OTHER";
    }
  };

  it("deletes a user with no history at once", async () => {
    const fresh = await createUser(
      database.db,
      { email: "fresh@example.com", name: "Fresh User", displayName: "Fresh" },
      actor,
    );
    await deleteUser(database.db, fresh.id, actor);
    expect((await listUsers(database.db)).some((u) => u.id === fresh.id)).toBe(false);
  });

  it("refuses a user with history until it is forced, then keeps the history unlinked", async () => {
    const busy = await createUser(
      database.db,
      { email: "busy@example.com", name: "Busy User", displayName: "Busy" },
      actor,
    );
    await logActivity(
      { action: "auth.login", userId: busy.id, userDisplay: "Busy", details: {} },
      database.db,
    );
    expect(await code(deleteUser(database.db, busy.id, actor))).toBe("HAS_HISTORY");
    expect((await listUsers(database.db)).some((u) => u.id === busy.id)).toBe(true);

    await deleteUser(database.db, busy.id, actor, { force: true });
    expect((await listUsers(database.db)).some((u) => u.id === busy.id)).toBe(false);
    const rows = await listActivity(database.db, { action: "auth.login", page: 1 });
    const kept = rows.rows.find((r) => r.userDisplay === "Busy");
    expect(kept).toBeDefined();
    expect(kept!.userId).toBeNull();
    const deleted = await listActivity(database.db, { action: "admin.userDeleted", page: 1 });
    expect(deleted.rows[0].details).toMatchObject({ email: "busy@example.com", historyRows: 1 });
  });

  it("still never deletes the owner or yourself, even when forced", async () => {
    expect(await code(deleteUser(database.db, ownerId, actor, { force: true }))).toBe(
      "OWNER_PROTECTED",
    );
    expect(
      await code(
        deleteUser(database.db, workerId, { id: workerId, display: "Dana" }, { force: true }),
      ),
    ).toBe("SELF_PROTECTED");
  });
});
