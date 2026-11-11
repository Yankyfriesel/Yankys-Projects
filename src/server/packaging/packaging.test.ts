import { beforeAll, describe, expect, it } from "vitest";
import { listActivity } from "../auth/admin-queries";
import { createDatabase, type Database } from "../db/connection";
import {
  addPackagingType,
  deletePackagingType,
  getItemPackaging,
  getPackagingTypes,
  getTare,
  netWeight,
  NO_TARE,
  PackagingError,
  setItemPackaging,
  updatePackagingType,
} from ".";

const actor = { id: null, display: "test" };
let database: Database;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
}, 60_000);

const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof PackagingError ? error.code : "OTHER";
  }
};

describe("netWeight", () => {
  it("is the scale reading less the carton, to the hundredth", () => {
    expect(netWeight(15, 0.5)).toBe(14.5);
    expect(netWeight(15, 0)).toBe(15);
    expect(netWeight(15, 0.515)).toBe(14.49);
    expect(netWeight(10.1, 0.1)).toBe(10);
  });
  it("is null when nothing remains", () => {
    expect(netWeight(0.5, 0.5)).toBeNull();
    expect(netWeight(0.4, 0.5)).toBeNull();
    expect(netWeight(0.504, 0.5)).toBeNull();
  });
});

describe("packaging types and items", () => {
  it("keeps cartons with their weight to the gram, and rejects bad input", async () => {
    const carton = await addPackagingType(database.db, { name: "Carton 15", weightKg: 0.5 }, actor);
    const light = await addPackagingType(
      database.db,
      { name: "Light tray", weightKg: 0.0154 },
      actor,
    );
    expect(light.weightKg).toBe(0.015);
    expect((await getPackagingTypes(database.db)).map((t) => t.name).sort()).toEqual([
      "Carton 15",
      "Light tray",
    ]);
    const add = (input: { name: string; weightKg: number }) =>
      code(addPackagingType(database.db, input, actor));
    expect(await add({ name: "  ", weightKg: 1 })).toBe("INVALID_NAME");
    expect(await add({ name: "X", weightKg: -1 })).toBe("INVALID_WEIGHT");
    expect(await add({ name: "X", weightKg: 21 })).toBe("INVALID_WEIGHT");
    expect(
      await code(updatePackagingType(database.db, "nope", { name: "X", weightKg: 1 }, actor)),
    ).toBe("NOT_FOUND");

    await updatePackagingType(
      database.db,
      carton.id,
      { name: "Carton 15 kg", weightKg: 0.55 },
      actor,
    );
    expect((await getPackagingTypes(database.db)).find((t) => t.id === carton.id)).toMatchObject({
      name: "Carton 15 kg",
      weightKg: 0.55,
    });
  });

  it("gives an item the weight of the packaging chosen for it", async () => {
    const carton = (await getPackagingTypes(database.db)).find((t) => t.name === "Carton 15 kg")!;
    expect(await getTare(database.db, "N2015D-S")).toEqual(NO_TARE);
    expect(await code(setItemPackaging(database.db, "N2015D-S", "nope", actor))).toBe("NOT_FOUND");

    await setItemPackaging(database.db, "N2015D-S", carton.id, actor);
    expect((await getTare(database.db, "N2015D-S")).totalKg).toBe(0.55);
    await setItemPackaging(database.db, "N2015D-S", null, actor);
    expect(await getTare(database.db, "N2015D-S")).toEqual(NO_TARE);
    await setItemPackaging(database.db, "N2015D-S", carton.id, actor);
  });

  it("removes a deleted type from the items that used it, and logs it", async () => {
    const carton = (await getPackagingTypes(database.db)).find((t) => t.name === "Carton 15 kg")!;
    expect(await deletePackagingType(database.db, carton.id, actor)).toBe(1);
    expect(await getItemPackaging(database.db)).toEqual({});
    expect(await getTare(database.db, "N2015D-S")).toEqual(NO_TARE);
    expect(await code(deletePackagingType(database.db, carton.id, actor))).toBe("NOT_FOUND");
    const log = await listActivity(database.db, {
      action: "settings.packagingTypeDeleted",
      page: 1,
    });
    expect(log.rows[0].details).toMatchObject({ name: "Carton 15 kg", items: 1 });
  });
});
