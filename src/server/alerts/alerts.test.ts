import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../db/connection";
import { seed } from "../db/seed";
import { DEFAULT_ALERT_DAYS } from "../priority/summary";
import { AlertsError, alertDaysFor, getAlertSettings, setCategoryAlertDays } from "./index";

const actor = { id: null, display: "test" };
let database: Database;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, { email: "boss@example.com", password: "Temp-1234", name: "Boss" });
}, 60_000);

describe("alert days per category", () => {
  it("start at the default for every category", async () => {
    const settings = await getAlertSettings(database.db);
    expect(alertDaysFor(settings, "קציצות")).toBe(DEFAULT_ALERT_DAYS);
  });

  it("can be set for one category only, and cleared again", async () => {
    await setCategoryAlertDays(database.db, "קציצות", 3, actor);
    const settings = await getAlertSettings(database.db);
    expect(alertDaysFor(settings, "קציצות")).toBe(3);
    expect(alertDaysFor(settings, "שיפודי בקר")).toBe(DEFAULT_ALERT_DAYS);

    await setCategoryAlertDays(database.db, "קציצות", null, actor);
    expect(alertDaysFor(await getAlertSettings(database.db), "קציצות")).toBe(DEFAULT_ALERT_DAYS);
  });

  it("must be whole days from 1 to 365", async () => {
    for (const days of [0, -2, 366, 2.5, Number.NaN]) {
      await expect(setCategoryAlertDays(database.db, "שיפודי בקר", days, actor)).rejects.toBeInstanceOf(
        AlertsError,
      );
    }
  });
});
