import { describe, expect, it } from "vitest";
import {
  addDays,
  buildBoxBarcode,
  fromDDMMYY,
  itemNumberDigits,
  localDate,
  parseBoxBarcode,
  parseVendorBarcode,
  slaughterDateOf,
  toDDMMYY,
  toISODate,
} from "./barcodes";

describe("slaughter date of a barcode", () => {
  it("is read from our own box barcode and from a vendor's, and nothing else", () => {
    expect(slaughterDateOf("000220151810261511261402")).toBe("2026-10-18");
    expect(slaughterDateOf("380009001100726090728634301998")).toBe("2026-07-10");
    expect(slaughterDateOf("TEST-BOX-0001")).toBeNull();
    expect(slaughterDateOf("")).toBeNull();
  });
});

describe("vendor barcode", () => {
  it("splits the example in PLAN.md", () => {
    const r = parseVendorBarcode("380009001100726090728634301998");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.itemBarcodeTail).toBe("0009001");
    expect(toDDMMYY(r.value.slaughterDate)).toBe("100726");
    expect(toDDMMYY(r.value.expiryDate)).toBe("090728");
    expect(r.value.vendorRunning).toBe("63430");
    expect(r.value.weightKg).toBe(19.98);
  });

  it("refuses anything that does not start with 38", () => {
    expect(parseVendorBarcode("000212345671234561234561402")).toEqual({
      ok: false,
      problem: "NOT_VENDOR",
    });
    expect(parseVendorBarcode("")).toEqual({ ok: false, problem: "NOT_VENDOR" });
  });

  it("refuses wrong lengths, letters and impossible dates", () => {
    expect(parseVendorBarcode("38000900110072609072863430199")).toEqual({
      ok: false,
      problem: "BAD_SHAPE",
    });
    expect(parseVendorBarcode("38000900110072609072863430199x")).toEqual({
      ok: false,
      problem: "BAD_SHAPE",
    });
    expect(parseVendorBarcode("380009001311326090728634301998")).toEqual({
      ok: false,
      problem: "BAD_DATE",
    });
  });
});

describe("item number digits", () => {
  it("keeps only the digits, never padded", () => {
    expect(itemNumberDigits("N2015D-S")).toBe("2015");
    expect(itemNumberDigits("N15234F-C")).toBe("15234");
  });
});

describe("box barcode", () => {
  const slaughter = localDate(2026, 10, 18);
  const expiry = localDate(2026, 11, 15);

  it("matches the example in PLAN.md", () => {
    expect(
      buildBoxBarcode({
        running: 2,
        itemDigits: "2015",
        slaughterDate: slaughter,
        expiryDate: expiry,
        weightKg: 14.02,
      }),
    ).toBe("000220151810261511261402");
  });

  it("is 25 digits for a 5-digit item number and parses back", () => {
    const code = buildBoxBarcode({
      running: 17,
      itemDigits: "15234",
      slaughterDate: slaughter,
      expiryDate: expiry,
      weightKg: 9.5,
    });
    expect(code).toHaveLength(25);
    expect(parseBoxBarcode(code)).toEqual({
      running: 17,
      itemDigits: "15234",
      slaughterDate: slaughter,
      expiryDate: expiry,
      weightKg: 9.5,
    });
  });

  it("rejects weights of 100 kg and more, and bad running numbers", () => {
    const base = { itemDigits: "2015", slaughterDate: slaughter, expiryDate: expiry };
    expect(() => buildBoxBarcode({ ...base, running: 1, weightKg: 100 })).toThrow(RangeError);
    expect(() => buildBoxBarcode({ ...base, running: 0, weightKg: 1 })).toThrow(RangeError);
    expect(() => buildBoxBarcode({ ...base, running: 10000, weightKg: 1 })).toThrow(RangeError);
  });

  it("returns null for codes of the wrong shape or impossible dates", () => {
    expect(parseBoxBarcode("12345")).toBe(null);
    expect(parseBoxBarcode("0002301532102615112614020")).toBe(null);
  });
});

describe("date helpers", () => {
  it("formats and parses DDMMYY", () => {
    expect(toDDMMYY(localDate(2026, 1, 5))).toBe("050126");
    expect(fromDDMMYY("050126")).toEqual(localDate(2026, 1, 5));
    expect(fromDDMMYY("310226")).toBe(null);
  });

  it("adds days and formats ISO dates", () => {
    expect(toISODate(addDays(localDate(2026, 12, 30), 3))).toBe("2027-01-02");
  });
});
