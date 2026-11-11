import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../db/connection";
import { seed } from "../db/seed";
import { getCooldown } from "./cooldown";
import { LiveReadPriorityClient } from "./live";
import { savePriorityConnection } from "./settings";

const SECRET = "test-secret-that-is-long-enough-1234567890";
let database: Database;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, { email: "boss@example.com", password: "Temp-1234", name: "Boss" });
  await savePriorityConnection(
    database.db,
    { baseUrl: "https://erp.example.com/odata/democo", apiUser: "TEST-KEY-1234567890" },
    { id: null, display: "test" },
    SECRET,
  );
}, 60_000);

function answering(forms: Record<string, unknown[] | number>) {
  const asked: string[] = [];
  const fetchImpl = (async (url: string) => {
    asked.push(url);
    const form = new URL(url).pathname.split("/").pop() ?? "";
    const answer = forms[form];
    if (typeof answer === "number") return new Response("{}", { status: answer });
    return new Response(JSON.stringify({ value: answer ?? [] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { asked, fetchImpl };
}

describe("the live read client", () => {
  it("maps items, keeping only active ones, in item number order", async () => {
    const { fetchImpl } = answering({
      LOGPART: [
        {
          PARTNAME: "M2",
          PARTDES: "ב",
          EPARTDES: "B",
          BARCODE: "2",
          FAMILYDES: "בשר",
          PRIZ_WKARTON: 15,
          STATDES: "פעיל",
          INVFLAG: "Y",
          PRIZ_LABTEXT: "",
        },
        {
          PARTNAME: "M1",
          PARTDES: "א",
          EPARTDES: "A",
          BARCODE: "1",
          FAMILYDES: "עוף",
          PRIZ_WKARTON: 0,
          STATDES: "פעיל",
          INVFLAG: "",
          PRIZ_LABTEXT: "קפוא",
        },
        { PARTNAME: "M0", PARTDES: "ישן", STATDES: "לא פעיל" },
      ],
    });
    const client = new LiveReadPriorityClient(database.db, () => SECRET, fetchImpl);
    const items = await client.getItems();
    expect(items.map((item) => item.itemNumber)).toEqual(["M1", "M2"]);
    expect(items[0]).toMatchObject({
      category: "עוף",
      weightKg: null,
      inventoryManaged: false,
      storageText: "קפוא",
    });
    expect(items[1]).toMatchObject({
      name: "ב",
      nameEn: "B",
      barcode: "2",
      weightKg: 15,
      inventoryManaged: true,
    });
  });

  it("maps stock boxes and takes the warehouses from them, asking Priority once", async () => {
    const { asked, fetchImpl } = answering({
      PARTBAL: [
        {
          ACTNAME: "3872935250106263",
          PARTNAME: "I1",
          PARTDES: "שקדים",
          WARHSNAME: "Main",
          BALANCE: 6.82,
          TOPP_EXPIRYDATE: "2028-05-31T00:00:00Z",
          LASTDATE: "2026-08-19T00:00:00Z",
        },
        {
          ACTNAME: "x2",
          PARTNAME: "I2",
          PARTDES: "ב",
          WARHSNAME: "200",
          BALANCE: 3,
          TOPP_EXPIRYDATE: null,
          LASTDATE: null,
        },
        { ACTNAME: "", PARTNAME: "I3", WARHSNAME: "Main", BALANCE: 1 },
      ],
    });
    const client = new LiveReadPriorityClient(database.db, () => SECRET, fetchImpl);
    const boxes = await client.getStockBoxes();
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toMatchObject({
      barcode: "3872935250106263",
      warehouseCode: "Main",
      weightKg: 6.82,
      expiryDate: "2028-05-31",
      enteredDate: "2026-08-19",
    });
    expect((await client.getWarehouses()).map((warehouse) => warehouse.code)).toEqual([
      "200",
      "Main",
    ]);
    // The stock lines were asked once for the boxes; the rooms add one question per screen.
    expect(asked.filter((url) => url.includes("BALANCE"))).toHaveLength(1);
  });

  it("gives each box its full barcode from the receipt lines, not the lot prefix the stock list keeps", async () => {
    const lot = "3872908760607260";
    const stock = (weight: number) => ({
      ACTNAME: lot,
      PARTNAME: "M2055F-C",
      WARHSNAME: "Main",
      BALANCE: weight,
    });
    const line = (weight: number, tail: string) => ({
      PARTNAME: "M2055F-C",
      TQUANT: weight,
      TOACTNAME: lot,
      TOPALLETNAME: lot + tail,
    });
    const { fetchImpl } = answering({
      PARTBAL: [stock(21.12), stock(15.81), stock(15.81)],
      DOCUMENTS_H: [
        { DOCNO: "A", TRANSORDER_H_SUBFORM: [line(21.12, "100001"), line(15.81, "100002")] },
        { DOCNO: "B", TRANSORDER_H_SUBFORM: [line(15.81, "100003")] },
        { DOCNO: "C" },
      ],
    });
    const client = new LiveReadPriorityClient(database.db, () => SECRET, fetchImpl);
    const barcodes = (await client.getStockBoxes()).map((box) => box.barcode);
    expect(barcodes).toEqual([lot + "100001", lot + "100002", lot + "100003"]);
  });

  it("falls back to the stock list's own number when the receipt lines are refused", async () => {
    const { fetchImpl } = answering({
      PARTBAL: [{ ACTNAME: "3872908760607260", PARTNAME: "I1", WARHSNAME: "Main", BALANCE: 2 }],
      DOCUMENTS_H: 400,
    });
    const client = new LiveReadPriorityClient(database.db, () => SECRET, fetchImpl);
    expect((await client.getStockBoxes()).map((box) => box.barcode)).toEqual(["3872908760607260"]);
  });

  it("names the rooms from the receipt documents, including rooms with no stock", async () => {
    const { fetchImpl } = answering({
      PARTBAL: [{ WARHSNAME: "Main" }],
      DOCUMENTS_H: [
        { WARHSNAME: "Main", WARHSDES: "מקרר בשר" },
        { WARHSNAME: "Main", WARHSDES: "" },
        { WARHSNAME: "FRZ", WARHSDES: "מקפיא" },
      ],
    });
    const client = new LiveReadPriorityClient(database.db, () => SECRET, fetchImpl);
    expect(await client.getWarehouses()).toEqual([
      { code: "FRZ", name: "מקפיא" },
      { code: "Main", name: "מקרר בשר" },
    ]);
  });

  it("reads the open receipt documents as orders, with their own storage room", async () => {
    const { fetchImpl } = answering({
      DOCUMENTS_H: [
        {
          DOCNO: "AS26000062",
          CURDATE: "2026-11-01T00:00:00Z",
          WARHSNAME: "200",
          ASSCODESTATUS: "טיוטא",
        },
        {
          DOCNO: "AS26000012",
          CURDATE: "2026-08-10T00:00:00Z",
          WARHSNAME: "Main",
          ASSCODESTATUS: "לביצוע",
        },
        {
          DOCNO: "AS26000020",
          CURDATE: "2026-08-11T00:00:00Z",
          WARHSNAME: "Main",
          ASSCODESTATUS: "סופית",
        },
      ],
    });
    const client = new LiveReadPriorityClient(database.db, () => SECRET, fetchImpl);
    const orders = await client.getOrders();
    expect(orders.map((o) => [o.docno, o.status, o.warehouseCode])).toEqual([
      ["AS26000062", "open", "200"],
      ["AS26000020", "סופית", "Main"],
      ["AS26000012", "open", "Main"],
    ]);
    expect(orders.every((o) => o.kind === "production" && o.itemNumber === null)).toBe(true);
  });

  it("keeps a box waiting, as not sent, until writing into Priority is switched on", async () => {
    const client = new LiveReadPriorityClient(database.db, () => SECRET, answering({}).fetchImpl);
    await expect(
      client.receiveBox({
        source: "production",
        docno: "AS26000001",
        barcode: "1",
        itemNumber: "M1",
        weightKg: 1,
        expiryDate: "2026-12-01",
        warehouseCode: "Main",
      }),
    ).rejects.toMatchObject({ code: "WRITE_NOT_OPEN" });
  });

  it("rests after a wrong key and does not ask again", async () => {
    const { asked, fetchImpl } = answering({ LOGPART: 401 });
    const client = new LiveReadPriorityClient(database.db, () => SECRET, fetchImpl);
    await expect(client.getItems()).rejects.toMatchObject({ code: "AUTH_FAILED" });
    expect(await getCooldown(database.db)).not.toBeNull();
    await expect(client.getItems()).rejects.toMatchObject({ code: "AUTH_FAILED" });
    expect(asked).toHaveLength(1);
  });
});
