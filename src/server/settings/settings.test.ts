import { beforeAll, describe, expect, it } from "vitest";
import { listActivity } from "../auth/admin-queries";
import {
  BrandError,
  MAX_LOGO_BYTES,
  detectImage,
  getBrandImage,
  resetBrandImage,
  setBrandImage,
  brandStatus,
} from "../brand";
import { createDatabase, type Database } from "../db/connection";
import { seed } from "../db/seed";
import {
  PriorityConnectionError,
  getPriorityConnection,
  readPriorityCredentials,
  readPriorityPassword,
  savePriorityConnection,
} from "../priority/settings";
import { readSetting } from ".";
import { decryptSecret, encryptSecret } from "./secret";

const SECRET = "test-secret-that-is-long-enough-1234567890";
const actor = { id: null, display: "test" };

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

let database: Database;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, { email: "boss@example.com", password: "Temp-1234", name: "Boss" });
}, 60_000);

describe("secrets", () => {
  it("round-trips and gives a different ciphertext every time", () => {
    const a = encryptSecret("p@ss word", SECRET);
    const b = encryptSecret("p@ss word", SECRET);
    expect(a).not.toBe(b);
    expect(a).not.toContain("p@ss");
    expect(decryptSecret(a, SECRET)).toBe("p@ss word");
  });

  it("refuses another secret and tampered or malformed values", () => {
    const stored = encryptSecret("hello", SECRET);
    expect(decryptSecret(stored, "another-secret")).toBeNull();
    expect(decryptSecret(stored.slice(0, -2) + "AA", SECRET)).toBeNull();
    expect(decryptSecret("nonsense", SECRET)).toBeNull();
    expect(decryptSecret("", SECRET)).toBeNull();
  });
});

describe("logo", () => {
  it("recognises images by their first bytes and refuses SVG and anything else", () => {
    expect(detectImage(PNG)).toBe("image/png");
    expect(detectImage(JPEG)).toBe("image/jpeg");
    expect(detectImage(WEBP)).toBe("image/webp");
    expect(
      detectImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull();
    expect(detectImage(new TextEncoder().encode("GIF89a"))).toBeNull();
  });

  it("serves the factory's own file until replaced, then the upload, then the original again", async () => {
    const original = await getBrandImage(database.db, "mark");
    expect(original.custom).toBe(false);
    expect(original.mime).toBe("image/png");
    expect(original.bytes.length).toBeGreaterThan(100);

    await setBrandImage(database.db, "mark", PNG, actor);
    const replaced = await getBrandImage(database.db, "mark");
    expect(replaced.custom).toBe(true);
    expect(Array.from(replaced.bytes)).toEqual(Array.from(PNG));
    expect((await brandStatus(database.db)).mark.custom).toBe(true);
    expect((await brandStatus(database.db)).light.custom).toBe(false);

    await resetBrandImage(database.db, "mark", actor);
    expect((await getBrandImage(database.db, "mark")).custom).toBe(false);

    const log = await listActivity(database.db, { action: "settings.", page: 1 });
    expect(log.rows.map((r) => r.action).sort()).toEqual([
      "settings.logoChanged",
      "settings.logoRestored",
    ]);
  });

  it("rejects empty, oversized and wrongly typed files without storing them", async () => {
    await expect(
      setBrandImage(database.db, "light", new Uint8Array(), actor),
    ).rejects.toMatchObject({ code: "EMPTY" });
    const big = new Uint8Array(MAX_LOGO_BYTES + 1);
    big.set(PNG);
    await expect(setBrandImage(database.db, "light", big, actor)).rejects.toMatchObject({
      code: "TOO_LARGE",
    });
    await expect(
      setBrandImage(database.db, "light", new Uint8Array([1, 2, 3]), actor),
    ).rejects.toBeInstanceOf(BrandError);
    expect((await brandStatus(database.db)).light.custom).toBe(false);
  });
});

describe("Priority connection", () => {
  it("starts empty", async () => {
    const connection = await getPriorityConnection(database.db);
    expect(connection).toMatchObject({ baseUrl: "", apiUserEnc: null, passwordEnc: null });
    expect(readPriorityCredentials(connection, SECRET)).toBeNull();
  });

  it("rejects an address that is not http or https", async () => {
    for (const baseUrl of ["priority.local", "ftp://priority.local", "javascript:alert(1)"]) {
      await expect(
        savePriorityConnection(database.db, { baseUrl, apiUser: "key" }, actor, SECRET),
      ).rejects.toBeInstanceOf(PriorityConnectionError);
    }
  });

  it("stores the key and the password encrypted, keeps them when omitted, removes them on request, and never logs them", async () => {
    await savePriorityConnection(
      database.db,
      {
        baseUrl: " https://erp.example.com/odata/ ",
        apiUser: " KEY-0123456789ABCDEF ",
        password: "S3cret!",
      },
      actor,
      SECRET,
    );
    let connection = await getPriorityConnection(database.db);
    expect(connection.baseUrl).toBe("https://erp.example.com/odata");
    for (const stored of [connection.apiUserEnc, connection.passwordEnc]) {
      expect(stored).not.toBeNull();
      expect(stored).not.toContain("S3cret");
      expect(stored).not.toContain("KEY-0123");
    }
    expect(readPriorityPassword(connection, SECRET)).toBe("S3cret!");
    expect(readPriorityCredentials(connection, SECRET)).toEqual({
      baseUrl: "https://erp.example.com/odata",
      user: "KEY-0123456789ABCDEF",
      password: "S3cret!",
    });
    const raw = JSON.stringify((await readSetting(database.db, "priority.connection"))?.value);
    expect(raw).not.toContain("S3cret");
    expect(raw).not.toContain("KEY-0123");

    // Left out: both unchanged, only the address changes.
    await savePriorityConnection(
      database.db,
      { baseUrl: "https://erp.example.com/odata/other" },
      actor,
      SECRET,
    );
    connection = await getPriorityConnection(database.db);
    expect(readPriorityCredentials(connection, SECRET)).toMatchObject({
      baseUrl: "https://erp.example.com/odata/other",
      user: "KEY-0123456789ABCDEF",
      password: "S3cret!",
    });

    // An empty password is removed: an access key then signs in with no password of its own.
    await savePriorityConnection(
      database.db,
      { baseUrl: connection.baseUrl, password: "" },
      actor,
      SECRET,
    );
    connection = await getPriorityConnection(database.db);
    expect(connection.passwordEnc).toBeNull();
    expect(readPriorityCredentials(connection, SECRET)).toMatchObject({
      user: "KEY-0123456789ABCDEF",
      password: null,
    });

    // A new key replaces the old one; an empty key removes it, and then nothing can be called.
    await savePriorityConnection(
      database.db,
      { baseUrl: connection.baseUrl, apiUser: "NEW-KEY" },
      actor,
      SECRET,
    );
    expect(readPriorityCredentials(await getPriorityConnection(database.db), SECRET)?.user).toBe(
      "NEW-KEY",
    );
    await savePriorityConnection(
      database.db,
      { baseUrl: connection.baseUrl, apiUser: "" },
      actor,
      SECRET,
    );
    expect(readPriorityCredentials(await getPriorityConnection(database.db), SECRET)).toBeNull();

    const log = await listActivity(database.db, { action: "settings.priorityChanged", page: 1 });
    expect(log.total).toBe(5);
    const logged = JSON.stringify(log.rows.map((r) => r.details));
    expect(logged).not.toContain("S3cret");
    expect(logged).not.toContain("KEY-0123");
    expect(logged).not.toContain("NEW-KEY");
  });

  it("cannot be read with another secret", async () => {
    await savePriorityConnection(
      database.db,
      { baseUrl: "https://erp.example.com/odata", apiUser: "KEY-X" },
      actor,
      SECRET,
    );
    const connection = await getPriorityConnection(database.db);
    expect(
      readPriorityCredentials(connection, "another-secret-entirely-different-0000"),
    ).toBeNull();
  });
});
