import { describe, expect, it } from "vitest";
import type { PriorityItem } from "@/server/priority/types";
import { parseItemLabelQr } from "./codes";
import {
  checkItemLabelInput,
  itemLabelDates,
  itemLabelValues,
  MAX_COPIES,
  parseIsoDate,
  type ItemLabelInput,
} from "./item-label";

const item: PriorityItem = {
  itemNumber: "N2015D-S",
  name: "המבורגר בקר קלאסי 150 גר׳",
  nameEn: "Classic beef burger 150 g",
  barcode: "2000000002015",
  category: "קציצות",
  weightKg: 12,
  shelfLifeDays: 12,
  storageText: "לשמור בקירור 0–4°C",
  packingCode: "קרטון",
  origin: "ישראל",
  inventoryManaged: true,
};

const good: ItemLabelInput = {
  slaughterDate: "2026-10-23",
  productionDate: "2026-10-26",
  certificateNo: "123456",
  copies: 3,
};

describe("parseIsoDate", () => {
  it("reads real calendar dates only", () => {
    expect(parseIsoDate("2026-10-23")?.toISOString()).toBe("2026-10-23T00:00:00.000Z");
    expect(parseIsoDate("2028-02-29")).not.toBeNull();
    expect(parseIsoDate("2026-02-29")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("23/10/2026")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
  });
});

describe("checkItemLabelInput", () => {
  it("accepts good input, and a production date on the slaughter date", () => {
    expect(checkItemLabelInput(good)).toEqual([]);
    expect(checkItemLabelInput({ ...good, productionDate: good.slaughterDate })).toEqual([]);
  });

  it("names every problem", () => {
    expect(checkItemLabelInput({ ...good, slaughterDate: "" })).toEqual(["SLAUGHTER_DATE"]);
    expect(checkItemLabelInput({ ...good, productionDate: "nope" })).toEqual(["PRODUCTION_DATE"]);
    expect(checkItemLabelInput({ ...good, productionDate: "2026-10-22" })).toEqual(["DATES_ORDER"]);
    expect(checkItemLabelInput({ ...good, certificateNo: "   " })).toEqual(["CERTIFICATE"]);
    expect(checkItemLabelInput({ ...good, certificateNo: "12 34" })).toEqual(["CERTIFICATE"]);
    expect(checkItemLabelInput({ ...good, certificateNo: "12|34" })).toEqual(["CERTIFICATE"]);
    expect(checkItemLabelInput({ ...good, certificateNo: "9".repeat(31) })).toEqual([
      "CERTIFICATE",
    ]);
    expect(checkItemLabelInput({ ...good, copies: 0 })).toEqual(["COPIES"]);
    expect(checkItemLabelInput({ ...good, copies: 1.5 })).toEqual(["COPIES"]);
    expect(checkItemLabelInput({ ...good, copies: MAX_COPIES + 1 })).toEqual(["COPIES"]);
    expect(
      checkItemLabelInput({ ...good, slaughterDate: "", certificateNo: "", copies: 0 }),
    ).toEqual(["SLAUGHTER_DATE", "CERTIFICATE", "COPIES"]);
  });

  it("ignores spaces around the certificate number", () => {
    expect(checkItemLabelInput({ ...good, certificateNo: "  123456 " })).toEqual([]);
  });

  it("needs the country of origin when printing labels, but not when reading one at receiving", () => {
    const printing = { originRequired: true };
    expect(checkItemLabelInput({ ...good, origin: "  " }, printing)).toEqual(["ORIGIN_MISSING"]);
    expect(checkItemLabelInput({ ...good }, printing)).toEqual(["ORIGIN_MISSING"]);
    expect(checkItemLabelInput({ ...good, origin: "Poland" }, printing)).toEqual([]);
    expect(checkItemLabelInput({ ...good, origin: "" })).toEqual([]);
  });
});

describe("the expiry date", () => {
  it("is the slaughter date plus the item's shelf life, across month ends and leap days", () => {
    const expiry = (slaughter: string, days: number) =>
      itemLabelDates(
        { ...item, shelfLifeDays: days },
        { slaughterDate: slaughter, productionDate: slaughter },
      )
        ?.expiry.toISOString()
        .slice(0, 10);
    expect(expiry("2026-10-23", 12)).toBe("2026-11-04");
    expect(expiry("2028-02-20", 10)).toBe("2028-03-01");
    expect(expiry("2026-12-25", 365)).toBe("2027-12-25");
    expect(expiry("2026-10-23", 0)).toBe("2026-10-23");
  });

  it("is unknown for a date that is not real", () => {
    expect(
      itemLabelDates(item, { slaughterDate: "2026-02-30", productionDate: "2026-03-01" }),
    ).toBeNull();
  });
});

describe("itemLabelValues", () => {
  it("copies Priority's item fields exactly and formats the three dates", () => {
    const values = itemLabelValues(item, good);
    expect(values).toMatchObject({
      name: item.name,
      nameEn: item.nameEn,
      itemNumber: "N2015D-S",
      itemBarcode: "2000000002015",
      storageText: item.storageText,
      origin: item.origin,
      slaughterDate: "23/10/2026",
      productionDate: "26/10/2026",
      expiryDate: "04/11/2026",
      certificateNo: "123456",
    });
  });

  it("leaves what an item label does not have empty", () => {
    const values = itemLabelValues(item, good);
    expect(values.weightKg).toBe("");
    expect(values.runningNumber).toBe("");
    expect(values.boxBarcode).toBe("");
  });

  it("holds a QR text that reads back to the same item, certificate and dates", () => {
    const parsed = parseItemLabelQr(itemLabelValues(item, good).qrItemLabel);
    expect(parsed?.itemNumber).toBe("N2015D-S");
    expect(parsed?.certificateNo).toBe("123456");
    expect(parsed?.slaughterDate.toISOString().slice(0, 10)).toBe("2026-10-23");
    expect(parsed?.productionDate.toISOString().slice(0, 10)).toBe("2026-10-26");
    expect(parsed?.expiryDate.toISOString().slice(0, 10)).toBe("2026-11-04");
  });

  it("refuses input that was not checked", () => {
    expect(() => itemLabelValues(item, { ...good, certificateNo: "" })).toThrow(RangeError);
  });
});
