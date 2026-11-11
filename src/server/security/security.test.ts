import { beforeAll, describe, expect, it } from "vitest";
import { listActivity } from "../auth/admin-queries";
import { createDatabase, type Database } from "../db/connection";
import {
  DEFAULT_IDLE_MINUTES,
  getIdleMinutes,
  isIdleMinutes,
  MAX_IDLE_MINUTES,
  setIdleMinutes,
} from ".";

let database: Database;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
}, 60_000);

describe("idle sign-out time", () => {
  it("is half an hour until someone chooses another time", async () => {
    expect(await getIdleMinutes(database.db)).toBe(DEFAULT_IDLE_MINUTES);
  });

  it("keeps the chosen time, including 0 for never, and logs each change", async () => {
    const actor = { id: null, display: "test" };
    await setIdleMinutes(database.db, 10, actor);
    expect(await getIdleMinutes(database.db)).toBe(10);
    await setIdleMinutes(database.db, 0, actor);
    expect(await getIdleMinutes(database.db)).toBe(0);
    const log = await listActivity(database.db, { action: "settings.idleTimeoutChanged", page: 1 });
    expect(log.rows.map((r) => r.details)).toEqual([
      { from: 10, to: 0 },
      { from: 30, to: 10 },
    ]);
  });

  it("accepts only whole minutes from 0 to a day", () => {
    expect(isIdleMinutes(0)).toBe(true);
    expect(isIdleMinutes(MAX_IDLE_MINUTES)).toBe(true);
    expect(isIdleMinutes(MAX_IDLE_MINUTES + 1)).toBe(false);
    expect(isIdleMinutes(-1)).toBe(false);
    expect(isIdleMinutes(2.5)).toBe(false);
    expect(isIdleMinutes("10")).toBe(false);
  });
});
