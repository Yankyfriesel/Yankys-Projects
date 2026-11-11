import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_STYLE, layoutSchema, type LabelElement } from "@/lib/labels/model";
import {
  STARTER_LAYOUTS,
  STARTER_MEAT_ITEM_LAYOUT,
  STARTER_PALLET_LAYOUT,
  STARTER_PREMIUM_ITEM_LAYOUT,
  STARTER_SHIPPING_LAYOUT,
} from "@/lib/labels/starters";
import { listActivity } from "../auth/admin-queries";
import { createDatabase, type Database } from "../db/connection";
import { eq } from "drizzle-orm";
import { labelLayouts, settings } from "../db/schema";
import {
  resizePremiumItemLayout,
  seedShippingLayout,
  seed,
  seedLabelLayouts,
  seedMeatItemLayout,
  seedPalletLayout,
  seedPremiumItemLayout,
} from "../db/seed";
import {
  createLayout,
  deleteLayout,
  duplicateLayout,
  getDefaultItemLayout,
  getLayout,
  LabelLayoutError,
  listLayouts,
  saveLayout,
  setDefaultItemLayout,
} from "./index";

const actor = { id: null, display: "test" };

let database: Database;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, { email: "boss@example.com", password: "Temp-1234", name: "Boss" });
}, 60_000);

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(LabelLayoutError);
    return (error as LabelLayoutError).code;
  }
  throw new Error("expected a LabelLayoutError");
}

const field: LabelElement = {
  id: "f1",
  type: "field",
  field: "name",
  x: 2,
  y: 2,
  w: 50,
  h: 8,
  style: DEFAULT_STYLE,
};

describe("the starter layouts", () => {
  it("are an item layout, the box layout, a pallet layout and the premium item layout, valid and seeded once", async () => {
    const layouts = await listLayouts(database.db);
    const byName = (name: string) => layouts.find((l) => l.name === name)!;
    expect(layouts.map((l) => l.type)).toEqual([
      "item",
      "item",
      "item",
      "box",
      "pallet",
      "shipping",
    ]);
    expect(layouts.map((l) => l.name).sort()).toEqual(
      [
        ...STARTER_LAYOUTS.map((l) => l.name),
        STARTER_PALLET_LAYOUT.name,
        STARTER_SHIPPING_LAYOUT.name,
        STARTER_PREMIUM_ITEM_LAYOUT.name,
        STARTER_MEAT_ITEM_LAYOUT.name,
      ].sort(),
    );
    expect(byName(STARTER_LAYOUTS[1].name)).toMatchObject({ widthMm: 100, heightMm: 100 });
    expect(byName(STARTER_PALLET_LAYOUT.name)).toMatchObject({ widthMm: 210, heightMm: 148 }); // A5 across the page
    expect(byName(STARTER_PREMIUM_ITEM_LAYOUT.name)).toMatchObject({ widthMm: 77, heightMm: 245 });

    // Every starter is a layout the designer accepts, and the pallet one carries the pallet's QR.
    for (const starter of [
      ...STARTER_LAYOUTS,
      STARTER_PALLET_LAYOUT,
      STARTER_SHIPPING_LAYOUT,
      STARTER_PREMIUM_ITEM_LAYOUT,
      STARTER_MEAT_ITEM_LAYOUT,
    ]) {
      expect(layoutSchema.safeParse(starter).success).toBe(true);
    }
    expect(
      STARTER_PALLET_LAYOUT.elements.some((e) => e.type === "qr" && e.source === "pallet"),
    ).toBe(true);

    // Running the seeds again, or deleting them, never brings them back.
    expect(await seedLabelLayouts(database.db)).toBe(false);
    expect(await seedPalletLayout(database.db)).toBe(false);
    expect(await seedShippingLayout(database.db)).toBe(false);
    expect(await seedPremiumItemLayout(database.db)).toBe(false);
    expect(await seedMeatItemLayout(database.db)).toBe(false);
    expect((await listLayouts(database.db)).length).toBe(6);
  });
});

describe("the premium label for ready-printed paper", () => {
  it("is moved once from the first guessed size to the real paper, unless changed by hand", async () => {
    const db = database.db;
    const named = eq(labelLayouts.name, STARTER_PREMIUM_ITEM_LAYOUT.name);
    const size = async () =>
      (await db.select().from(labelLayouts).where(named)).map((l) => [l.widthMm, l.heightMm])[0];
    await db.update(labelLayouts).set({ widthMm: 100, heightMm: 300 }).where(named);
    await db.delete(settings).where(eq(settings.key, "labels.premiumStarterResized"));
    expect(await resizePremiumItemLayout(db)).toBe(true);
    expect(await size()).toEqual([77, 245]);
    // Once only: a later size of its own stays.
    await db.update(labelLayouts).set({ widthMm: 100, heightMm: 300 }).where(named);
    expect(await resizePremiumItemLayout(db)).toBe(false);
    expect(await size()).toEqual([100, 300]);
    await db.update(labelLayouts).set({ widthMm: 77, heightMm: 245 }).where(named);
  });
});

describe("the default item label", () => {
  it("is an item layout chosen in advance, can be cleared, and never a box or pallet layout", async () => {
    const layouts = await listLayouts(database.db);
    const item = layouts.find((l) => l.type === "item")!;
    const box = layouts.find((l) => l.type === "box")!;
    expect(await getDefaultItemLayout(database.db)).toBeNull();
    await setDefaultItemLayout(database.db, item.id, actor);
    expect(await getDefaultItemLayout(database.db)).toBe(item.id);
    await expect(setDefaultItemLayout(database.db, box.id, actor)).rejects.toBeInstanceOf(
      LabelLayoutError,
    );
    expect(await getDefaultItemLayout(database.db)).toBe(item.id);
    await setDefaultItemLayout(database.db, null, actor);
    expect(await getDefaultItemLayout(database.db)).toBeNull();
  });
});

describe("creating layouts", () => {
  it("starts empty at the typed size", async () => {
    const layout = await createLayout(
      database.db,
      { name: "Small tray", type: "item", widthMm: 60, heightMm: 40 },
      actor,
    );
    expect(layout).toMatchObject({ name: "Small tray", type: "item", widthMm: 60, heightMm: 40 });
    expect(layout.elements).toEqual([]);
    expect((await getLayout(database.db, layout.id))?.name).toBe("Small tray");
  });

  it("refuses a name that is taken, ignoring case, and a second box layout", async () => {
    expect(
      await code(
        createLayout(
          database.db,
          { name: "SMALL TRAY", type: "item", widthMm: 60, heightMm: 40 },
          actor,
        ),
      ),
    ).toBe("NAME_TAKEN");
    expect(
      await code(
        createLayout(
          database.db,
          { name: "Another box", type: "box", widthMm: 100, heightMm: 100 },
          actor,
        ),
      ),
    ).toBe("BOX_EXISTS");
  });

  it("rejects an impossible size", async () => {
    await expect(
      createLayout(database.db, { name: "Tiny", type: "item", widthMm: 3, heightMm: 40 }, actor),
    ).rejects.toThrow();
  });
});

describe("saving layouts", () => {
  it("replaces the name, size and elements, and keeps the type", async () => {
    const layout = await createLayout(
      database.db,
      { name: "To edit", type: "pallet", widthMm: 210, heightMm: 148 },
      actor,
    );
    const saved = await saveLayout(
      database.db,
      layout.id,
      { name: "Edited", widthMm: 200, heightMm: 100, elements: [field] },
      actor,
    );
    expect(saved).toMatchObject({ name: "Edited", type: "pallet", widthMm: 200, heightMm: 100 });
    expect(saved.elements).toEqual([field]);
    expect((await getLayout(database.db, layout.id))?.elements).toHaveLength(1);
  });

  it("lets a layout keep its own name, refuses another's, and reports a missing one", async () => {
    const [first, second] = (await listLayouts(database.db)).filter((l) => l.type !== "box");
    const same = {
      name: first.name,
      widthMm: first.widthMm,
      heightMm: first.heightMm,
      elements: [],
    };
    await expect(saveLayout(database.db, first.id, same, actor)).resolves.toBeTruthy();
    expect(
      await code(saveLayout(database.db, first.id, { ...same, name: second.name }, actor)),
    ).toBe("NAME_TAKEN");
    expect(await code(saveLayout(database.db, "missing", same, actor))).toBe("NOT_FOUND");
  });
});

describe("duplicating and deleting layouts", () => {
  it("copies an item layout under a new name, and again under the next one", async () => {
    const source = (await listLayouts(database.db)).find(
      (l) => l.name === STARTER_LAYOUTS[0].name,
    )!;
    const one = await duplicateLayout(database.db, source.id, actor);
    const two = await duplicateLayout(database.db, source.id, actor);
    expect(one.name).toBe(`${source.name} (copy)`);
    expect(two.name).toBe(`${source.name} (copy 2)`);
    expect(one.elements.length).toBeGreaterThan(0);
    expect(one.id).not.toBe(source.id);
  });

  it("never copies the box layout: there is only one", async () => {
    const box = (await listLayouts(database.db)).find((l) => l.type === "box")!;
    expect(await code(duplicateLayout(database.db, box.id, actor))).toBe("BOX_EXISTS");
  });

  it("deletes a layout, and reports one that is gone", async () => {
    const layout = await createLayout(
      database.db,
      { name: "Short lived", type: "item", widthMm: 50, heightMm: 30 },
      actor,
    );
    await deleteLayout(database.db, layout.id, actor);
    expect(await getLayout(database.db, layout.id)).toBeNull();
    expect(await code(deleteLayout(database.db, layout.id, actor))).toBe("NOT_FOUND");
  });
});

describe("the activity log", () => {
  it("records creating, saving, duplicating and deleting", async () => {
    const log = await listActivity(database.db, { page: 1 });
    const actions = new Set(log.rows.map((r) => r.action));
    for (const action of [
      "settings.labelLayoutCreated",
      "settings.labelLayoutSaved",
      "settings.labelLayoutDeleted",
    ]) {
      expect(actions).toContain(action);
    }
  });
});
