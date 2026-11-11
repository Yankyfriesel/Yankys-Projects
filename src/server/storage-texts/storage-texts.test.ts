import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../db/connection";
import { seed } from "../db/seed";
import type { PriorityItem } from "../priority/types";
import {
  getStorageTexts,
  setCategoryStorageText,
  StorageTextError,
  withStorageTexts,
} from "./index";

let database: Database;
const actor = { id: null, display: "test" };

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, { email: "boss@example.com", password: "Temp-1234", name: "Boss" });
}, 60_000);

const item = (category: string, storageText: string) =>
  ({ itemNumber: "M1", category, storageText }) as PriorityItem;

describe("storage texts per category", () => {
  it("are saved, cleared with an empty text, and refused when too long", async () => {
    await setCategoryStorageText(database.db, "בשר קפוא", "  יש לשמור ב-18-  ", actor);
    expect(await getStorageTexts(database.db)).toEqual({ "בשר קפוא": "יש לשמור ב-18-" });
    await setCategoryStorageText(database.db, "בשר קפוא", "", actor);
    expect(await getStorageTexts(database.db)).toEqual({});
    await expect(
      setCategoryStorageText(database.db, "בשר קפוא", "x".repeat(301), actor),
    ).rejects.toBeInstanceOf(StorageTextError);
  });

  it("fill only the items Priority gives no storage text", () => {
    const texts = { קפוא: "לשמור בהקפאה" };
    const [own, filled, other] = withStorageTexts(
      [item("קפוא", "משלו"), item("קפוא", ""), item("טרי", "")],
      texts,
    );
    expect(own.storageText).toBe("משלו");
    expect(filled.storageText).toBe("לשמור בהקפאה");
    expect(other.storageText).toBe("");
  });
});
