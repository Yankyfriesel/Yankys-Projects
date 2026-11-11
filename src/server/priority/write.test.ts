import { describe, expect, it } from "vitest";
import { OdataHttp } from "./odata";
import { postReceiptLine } from "./write";

const credentials = {
  baseUrl: "https://priority.test/odata/Priority/x.ini/democo",
  user: "key",
  password: null,
};
const box = {
  source: "production" as const,
  docno: "AS26000059",
  barcode: "000130150101260101271150",
  itemNumber: "N2015D-S",
  weightKg: 11.5,
  expiryDate: "2026-11-15",
  warehouseCode: "Main",
};

/** A Priority that answers each request in turn: [status, body]. */
function priority(answers: [number, unknown][]) {
  const asked: { method: string; url: string; body?: string }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    asked.push({ method: init?.method ?? "GET", url, body: init?.body as string | undefined });
    const [status, body] = answers.shift() ?? [500, {}];
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { asked, http: new OdataHttp(credentials, fetchImpl) };
}

const complaint = { FORM: { InterfaceErrors: { text: "composed quantity but no issues" } } };

describe("sending a box line to Priority", () => {
  it("adds the line with the composed quantity at zero and the box as the pallet", async () => {
    const { asked, http } = priority([
      [200, { value: [] }],
      [201, {}],
    ]);
    await postReceiptLine(http, box);
    const post = asked.find((a) => a.method === "POST")!;
    expect(post.url).toContain("DOCUMENTS_H(DOCNO='AS26000059',TYPE='H')/TRANSORDER_H_SUBFORM");
    expect(JSON.parse(post.body!)).toMatchObject({
      PARTNAME: "N2015D-S",
      TQUANT: 11.5,
      PQUANT: 0,
      PTQUANT: 0,
      TOPALLETNAME: box.barcode,
    });
  });

  it("counts the box as received when Priority complains but kept the line", async () => {
    const { http } = priority([
      [200, { value: [] }],
      [400, complaint],
      [200, { value: [{ KLINE: 1001 }] }],
    ]);
    await expect(postReceiptLine(http, box)).resolves.toBeUndefined();
  });

  it("refuses the box when Priority complained and has no such line", async () => {
    const { http } = priority([
      [200, { value: [] }],
      [400, complaint],
      [200, { value: [] }],
    ]);
    await expect(postReceiptLine(http, box)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("never adds a box that is already in the document", async () => {
    const { asked, http } = priority([[200, { value: [{ KLINE: 1 }] }]]);
    await postReceiptLine(http, box);
    expect(asked.some((a) => a.method === "POST")).toBe(false);
  });

  it("keeps the box waiting when Priority says writing is not allowed", async () => {
    const { http } = priority([
      [200, { value: [] }],
      [403, "no permission"],
    ]);
    await expect(postReceiptLine(http, box)).rejects.toMatchObject({ code: "WRITE_NOT_OPEN" });
  });
});
