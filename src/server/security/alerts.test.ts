import { beforeAll, describe, expect, it } from "vitest";
import { logActivity } from "../activity-log";
import { createDatabase, type Database } from "../db/connection";
import {
  countUnseen,
  getAlertsSeenAt,
  getSecurityAlerts,
  getUnseenAlertCount,
  markAlertsSeen,
} from "./alerts";

let database: Database;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
}, 60_000);

const failed = (email: string, ip: string) =>
  logActivity(
    { action: "auth.loginFailed", userDisplay: email, ip, details: { email, code: "X" } },
    database.db,
  );

describe("security alerts", () => {
  it("has none while there are only a few wrong passwords", async () => {
    await failed("a@example.com", "1.1.1.1");
    await failed("a@example.com", "1.1.1.1");
    expect(await getSecurityAlerts(database.db)).toEqual([]);
    expect(await getUnseenAlertCount(database.db)).toBe(0);
  });

  it("warns when one email gets three wrong passwords in a day", async () => {
    await failed("A@example.com", "2.2.2.2");
    const alerts = await getSecurityAlerts(database.db);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "guessing", subject: "a@example.com", count: 3 });
    expect(alerts[0].ips.sort()).toEqual(["1.1.1.1", "2.2.2.2"]);
  });

  it("warns at once about a blocked sign-in and a refused Google sign-in", async () => {
    await logActivity(
      { action: "auth.loginBlocked", userDisplay: "boss@example.com", ip: "3.3.3.3" },
      database.db,
    );
    await logActivity(
      {
        action: "auth.googleRefused",
        userDisplay: "unknown",
        ip: "4.4.4.4",
        details: { code: "x" },
      },
      database.db,
    );
    const kinds = (await getSecurityAlerts(database.db)).map((a) => a.kind).sort();
    expect(kinds).toEqual(["google", "guessing", "locked"]);
  });

  it("counts only warnings newer than the last time they were marked seen", async () => {
    expect(await getUnseenAlertCount(database.db)).toBe(3);
    await markAlertsSeen(database.db, null, new Date(Date.now() + 1000));
    expect(await getAlertsSeenAt(database.db)).not.toBeNull();
    expect(await getUnseenAlertCount(database.db)).toBe(0);

    await logActivity(
      { action: "auth.loginBlocked", userDisplay: "boss@example.com", ip: "3.3.3.3" },
      database.db,
    );
    const alerts = await getSecurityAlerts(database.db);
    expect(countUnseen(alerts, new Date(0))).toBe(3);
  });
});
