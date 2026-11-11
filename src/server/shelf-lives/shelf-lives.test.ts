import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../db/connection";
import { seed } from "../db/seed";
import type { PriorityItem } from "../priority/types";
import { getShelfLives, setCategoryShelfLife, ShelfLifeError, withShelfLives } from "./index";

let database: Database;
const actor = { id: null, display: "test" };

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, { email: "boss@example.com", password: "Temp-1234", name: "Boss" });
}, 60_000);

const item = (category: string, shelfLifeDays: number) =>
  ({ itemNumber: "M1", category, shelfLifeDays }) as PriorityItem;

describe("shelf life per category", () => {
  it("is saved, cleared, and refused when not whole days from 1 to 3650", async () => {
    await setCategoryShelfLife(database.db, "בשר טרי", 12, actor);
    expect(await getShelfLives(database.db)).toEqual({ "בשר טרי": 12 });
    await setCategoryShelfLife(database.db, "בשר טרי", null, actor);
    expect(await getShelfLives(database.db)).toEqual({});
    for (const bad of [0, -3, 1.5, 3651]) {
      await expect(setCategoryShelfLife(database.db, "בשר טרי", bad, actor)).rejects.toBeInstanceOf(
        ShelfLifeError,
      );
    }
  });

  it("fills only the items that Priority gives no days", () => {
    const days = { קפוא: 540 };
    const [own, filled, other] = withShelfLives(
      [item("קפוא", 30), item("קפוא", 0), item("טרי", 0)],
      days,
    );
    expect(own.shelfLifeDays).toBe(30);
    expect(filled.shelfLifeDays).toBe(540);
    expect(other.shelfLifeDays).toBe(0);
  });
});
