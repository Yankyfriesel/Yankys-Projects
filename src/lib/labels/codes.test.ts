import { describe, expect, it } from "vitest";
import { localDate } from "../barcodes";
import { barcodeSvg, buildItemLabelQr, parseItemLabelQr, qrSvg } from "./codes";
import { layoutSchema } from "./model";
import { STARTER_LAYOUTS } from "./starters";

describe("barcodeSvg", () => {
  it("draws the same text the same way and different text differently", () => {
    const a = barcodeSvg("000220151810261511261402", true);
    expect(a).toMatch(/^<svg /);
    expect(a).toBe(barcodeSvg("000220151810261511261402", true));
    expect(a).not.toBe(barcodeSvg("000230151810261511261403", true));
  });

  it("fills its box and leaves the digits out when asked to", () => {
    const withText = barcodeSvg("2000000002015", true)!;
    const bare = barcodeSvg("2000000002015", false)!;
    expect(withText).toContain('width="100%" height="100%"');
    expect(withText).toContain('preserveAspectRatio="none"');
    expect(bare.length).toBeLessThan(withText.length);
  });

  it("refuses what cannot be a barcode: empty, too long, or not plain ASCII", () => {
    expect(barcodeSvg("", true)).toBeNull();
    expect(barcodeSvg("1".repeat(81), true)).toBeNull();
    expect(barcodeSvg("המבורגר", true)).toBeNull();
  });
});

describe("qrSvg", () => {
  it("draws a square code that keeps its proportions", () => {
    const svg = qrSvg("NF1|N2015D-S|123456|231026|261026|041126");
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it("accepts Hebrew text and refuses empty or very long text", () => {
    expect(qrSvg("המבורגר בקר")).toMatch(/^<svg /);
    expect(qrSvg("")).toBeNull();
    expect(qrSvg("x".repeat(501))).toBeNull();
  });
});

describe("the item label QR text", () => {
  const label = {
    itemNumber: "N2015D-S",
    certificateNo: "123456",
    slaughterDate: localDate(2026, 10, 23),
    productionDate: localDate(2026, 10, 26),
    expiryDate: localDate(2026, 11, 4),
  };

  it("is one line with a version, the item, the certificate and three dates as DDMMYY", () => {
    expect(buildItemLabelQr(label)).toBe("NF1|N2015D-S|123456|231026|261026|041126");
  });

  it("reads back to the same fields", () => {
    expect(parseItemLabelQr(buildItemLabelQr(label))).toEqual(label);
    expect(parseItemLabelQr(`  ${buildItemLabelQr(label)}\n`)).toEqual(label);
  });

  it("will not build text it could not read back", () => {
    expect(() => buildItemLabelQr({ ...label, itemNumber: "M30 15" })).toThrow(RangeError);
    expect(() => buildItemLabelQr({ ...label, certificateNo: "12|34" })).toThrow(RangeError);
    expect(() => buildItemLabelQr({ ...label, certificateNo: "" })).toThrow(RangeError);
  });

  it("refuses text that is not an item label QR", () => {
    expect(parseItemLabelQr("2000000002015")).toBeNull();
    expect(parseItemLabelQr("NF2|N2015D-S|123456|231026|261026|041126")).toBeNull();
    expect(parseItemLabelQr("NF1|N2015D-S|123456|231026|261026")).toBeNull();
    expect(parseItemLabelQr("NF1|N2015D-S|123456|311326|261026|041126")).toBeNull();
    expect(parseItemLabelQr("NF1||123456|231026|261026|041126")).toBeNull();
  });
});

describe("the starter layouts", () => {
  it.each(STARTER_LAYOUTS)("$name is a valid layout that fits inside its label", (layout) => {
    expect(layoutSchema.parse(layout).elements.length).toBeGreaterThan(0);
    for (const element of layout.elements) {
      expect(element.x).toBeGreaterThanOrEqual(0);
      expect(element.y).toBeGreaterThanOrEqual(0);
      expect(element.x + element.w).toBeLessThanOrEqual(layout.widthMm);
      expect(element.y + element.h).toBeLessThanOrEqual(layout.heightMm);
    }
  });

  it("put a QR code on the item label and a barcode on the box label", () => {
    const [item, box] = STARTER_LAYOUTS;
    expect(item.elements.some((e) => e.type === "qr")).toBe(true);
    expect(box.elements.some((e) => e.type === "barcode")).toBe(true);
  });
});
