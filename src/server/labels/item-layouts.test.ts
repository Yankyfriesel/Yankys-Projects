import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../db/connection";
import { STARTER_ITEM_LAYOUT } from "@/lib/labels/starters";
import { seed } from "../db/seed";
import { createLayout, listItemLayouts, listLayouts } from "./index";

const actor = { id: null, display: "test" };

let database: Database;
let starterItemId: string;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, { email: "boss@example.com", password: "Temp-1234", name: "Boss" });
  const layouts = await listLayouts(database.db);
  starterItemId = layouts.find((l) => l.name === STARTER_ITEM_LAYOUT.name)!.id;
}, 60_000);

describe("the item label types offered when printing", () => {
  it("lists only item layouts, oldest first, with their elements", async () => {
    await createLayout(
      database.db,
      { name: "Second item label", type: "item", widthMm: 80, heightMm: 50 },
      actor,
    );
    await createLayout(
      database.db,
      { name: "Pallet A5", type: "pallet", widthMm: 210, heightMm: 148 },
      actor,
    );

    const layouts = await listItemLayouts(database.db);
    expect(layouts.every((l) => l.type === "item")).toBe(true);
    expect(layouts.map((l) => l.name)).toContain("Second item label");
    expect(layouts.map((l) => l.name)).not.toContain("Pallet A5");
    expect(layouts[0].id).toBe(starterItemId);
    expect(layouts[0].elements.length).toBeGreaterThan(0);
    for (let i = 1; i < layouts.length; i++) {
      expect(layouts[i].createdAt.getTime()).toBeGreaterThanOrEqual(
        layouts[i - 1].createdAt.getTime(),
      );
    }
  });
});
