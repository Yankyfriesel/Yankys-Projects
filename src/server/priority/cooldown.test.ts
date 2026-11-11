import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../db/connection";
import { seed } from "../db/seed";
import { clearCooldown, getCooldown, minutesLeft, startCooldown, startsCooldown } from "./cooldown";
import { skippedProbe } from "./odata";
import { getPriorityConnection, savePriorityConnection } from "./settings";

const SECRET = "test-secret-that-is-long-enough-1234567890";
const actor = { id: null, display: "test" };
let database: Database;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, { email: "boss@example.com", password: "Temp-1234", name: "Boss" });
}, 60_000);

describe("the rest after Priority refuses", () => {
  const now = new Date("2026-10-28T10:00:00Z");

  it("is only started by a wrong key or a locked account", () => {
    expect(startsCooldown("AUTH_FAILED")).toBe(true);
    expect(startsCooldown("RATE_LIMITED")).toBe(true);
    for (const code of ["UNAVAILABLE", "NOT_FOUND", "BAD_REQUEST", null] as const)
      expect(startsCooldown(code)).toBe(false);
  });

  it("lasts 10 minutes after a wrong key and 30 after a lock, then is over", async () => {
    expect(await getCooldown(database.db, now)).toBeNull();

    const wrong = await startCooldown(database.db, "AUTH_FAILED", now);
    expect(wrong.until).toBe("2026-10-28T10:10:00.000Z");
    expect(await getCooldown(database.db, new Date("2026-10-28T10:09:59Z"))).toMatchObject({
      code: "AUTH_FAILED",
    });
    expect(await getCooldown(database.db, new Date("2026-10-28T10:10:00Z"))).toBeNull();

    const locked = await startCooldown(database.db, "RATE_LIMITED", now);
    expect(locked.until).toBe("2026-10-28T10:30:00.000Z");
    expect(minutesLeft(locked, now)).toBe(30);
    expect(minutesLeft(locked, new Date("2026-10-28T10:29:30Z"))).toBe(1);
    expect(minutesLeft(locked, new Date("2026-10-28T11:00:00Z"))).toBe(1);

    await clearCooldown(database.db);
    expect(await getCooldown(database.db, now)).toBeNull();
  });

  it("is cleared by saving a different key or address, not by saving the same ones", async () => {
    const future = new Date(Date.now() + 60 * 60_000);
    await savePriorityConnection(
      database.db,
      { baseUrl: "https://erp.example.com/odata", apiUser: "KEY-ONE" },
      actor,
      SECRET,
    );
    await startCooldown(database.db, "RATE_LIMITED", new Date());
    expect(await getCooldown(database.db)).not.toBeNull();

    // The same address, key untouched: still resting.
    await savePriorityConnection(
      database.db,
      { baseUrl: (await getPriorityConnection(database.db)).baseUrl },
      actor,
      SECRET,
    );
    expect(await getCooldown(database.db)).not.toBeNull();

    // A new key: a fresh try is allowed.
    await savePriorityConnection(
      database.db,
      { baseUrl: "https://erp.example.com/odata", apiUser: "KEY-TWO" },
      actor,
      SECRET,
    );
    expect(await getCooldown(database.db, future)).toBeNull();
    expect(await getCooldown(database.db)).toBeNull();

    // So is a new address.
    await startCooldown(database.db, "AUTH_FAILED", new Date());
    await savePriorityConnection(
      database.db,
      { baseUrl: "https://other.example.com/odata" },
      actor,
      SECRET,
    );
    expect(await getCooldown(database.db)).toBeNull();
  });
});

describe("a form that was not asked", () => {
  it("says so, without an answer", () => {
    expect(skippedProbe("PARTBAL")).toMatchObject({
      form: "PARTBAL",
      ok: false,
      skipped: true,
      status: null,
      error: null,
    });
  });
});
