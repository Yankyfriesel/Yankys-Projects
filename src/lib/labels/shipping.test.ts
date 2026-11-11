import { describe, expect, it } from "vitest";
import { layoutSchema } from "./model";
import {
  copiesFor,
  isValidPrint,
  labelOf,
  MAX_LABELS,
  parseOrderPayload,
  readShipDate,
  shippingLabelPages,
  shippingLabelValues,
  type ShippingOrder,
} from "./shipping";
import { STARTER_SHIPPING_LAYOUT } from "./starters";

const order: ShippingOrder = {
  orderNumber: "SO26000123",
  customerName: "מרכול הגליל",
  customerNumber: "C1042",
  address: "הרצל 15",
  city: "טבריה",
  phone: "04-6712345",
  shipDate: "09/11/2026",
  notes: "",
  labelCount: null,
};

describe("parseOrderPayload", () => {
  it("reads Priority's own column names", () => {
    const result = parseOrderPayload({
      ORDNAME: "SO26000123",
      CUSTNAME: "C1042",
      CDES: "מרכול הגליל",
      CURDATE: "2026-11-09T00:00:00+02:00",
    });
    expect(result).toEqual({
      ok: true,
      order: expect.objectContaining({
        orderNumber: "SO26000123",
        customerNumber: "C1042",
        customerName: "מרכול הגליל",
        shipDate: "09/11/2026",
      }),
    });
  });

  it("reads readable names, in any capitals, with spaces or underscores", () => {
    const result = parseOrderPayload({
      "Order Number": "A-7",
      customer_name: "Cohen",
      City: "Haifa",
      Phone: "04-1",
      Notes: "keep cold",
      labels: "12",
    });
    expect(result.ok && result.order).toEqual(
      expect.objectContaining({
        orderNumber: "A-7",
        customerName: "Cohen",
        city: "Haifa",
        phone: "04-1",
        notes: "keep cold",
        labelCount: 12,
      }),
    );
  });

  it("finds the order inside a nested body or a list of one order", () => {
    const nested = parseOrderPayload({ body: { value: [{ ordname: "N1", cdes: "Levi" }] } });
    expect(nested.ok && nested.order.orderNumber).toBe("N1");
    expect(nested.ok && nested.order.customerName).toBe("Levi");
  });

  it("joins a second address line", () => {
    const result = parseOrderPayload({ ordname: "N2", address: "Herzl 15", address2: "Floor 3" });
    expect(result.ok && result.order.address).toBe("Herzl 15, Floor 3");
  });

  it("fails only when there is no order number", () => {
    expect(parseOrderPayload({ cdes: "Levi" })).toEqual({ ok: false });
    expect(parseOrderPayload({})).toEqual({ ok: false });
    expect(parseOrderPayload(null)).toEqual({ ok: false });
    expect(parseOrderPayload("text")).toEqual({ ok: false });
    expect(parseOrderPayload({ ordname: "   " })).toEqual({ ok: false });
  });

  it("keeps the number of labels Priority asked for between 1 and the largest", () => {
    const labels = (value: unknown) => {
      const result = parseOrderPayload({ ordname: "N", labels: value });
      return result.ok ? result.order.labelCount : "failed";
    };
    expect(labels(10)).toBe(10);
    expect(labels("3")).toBe(3);
    expect(labels(0)).toBeNull();
    expect(labels(-4)).toBeNull();
    expect(labels("many")).toBeNull();
    expect(labels(100000)).toBe(MAX_LABELS);
  });

  it("cuts a very long text", () => {
    const result = parseOrderPayload({ ordname: "N", cdes: "x".repeat(5000) });
    expect(result.ok && result.order.customerName.length).toBe(200);
  });
});

describe("readShipDate", () => {
  it("writes dates as DD/MM/YYYY and leaves other text alone", () => {
    expect(readShipDate("2026-11-09")).toBe("09/11/2026");
    expect(readShipDate("2026-11-09T00:00:00+02:00")).toBe("09/11/2026");
    expect(readShipDate("9.11.2026")).toBe("09/11/2026");
    expect(readShipDate("next Tuesday")).toBe("next Tuesday");
    expect(readShipDate("")).toBe("");
  });
});

describe("the labels of an order", () => {
  it("numbers every label out of the total", () => {
    const pages = shippingLabelPages(order, 10);
    expect(pages).toHaveLength(10);
    expect(pages.map((page) => page.labelOf)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Box ${i + 1} of 10`),
    );
    expect(pages[2].labelNumber).toBe("3");
    expect(pages[2].labelCount).toBe("10");
    expect(labelOf(1, 1)).toBe("Box 1 of 1");
    expect(labelOf(3, 10, "pallet")).toBe("Pallet 3 of 10");
    expect(labelOf(3, 10, "box", "he")).toBe("ארגז 3 מתוך 10");
    expect(labelOf(1, 4, "pallet", "he")).toBe("משטח 1 מתוך 4");
    expect(shippingLabelPages(order, 2, "pallet")[1].labelOf).toBe("Pallet 2 of 2");
    expect(shippingLabelPages(order, 2, "pallet", "he")[1].unitName).toBe("משטח");
  });

  it("prints each pallet number on several labels in a row, and a box on one", () => {
    // 10 pallets, 4 labels for each: Pallet 1 of 10 four times, then Pallet 2 of 10 four times...
    const pallets = shippingLabelPages(order, 10, "pallet", "en", copiesFor("pallet", 4));
    expect(pallets).toHaveLength(40);
    expect(pallets.slice(0, 4).map((p) => p.labelOf)).toEqual(Array(4).fill("Pallet 1 of 10"));
    expect(pallets.slice(4, 8).map((p) => p.labelOf)).toEqual(Array(4).fill("Pallet 2 of 10"));
    expect(pallets[39].labelOf).toBe("Pallet 10 of 10");
    // Boxes: one label each, whatever the number of labels for a pallet is.
    expect(copiesFor("box", 4)).toBe(1);
    const boxes = shippingLabelPages(order, 10, "box", "en", copiesFor("box", 4));
    expect(boxes.map((p) => p.labelOf)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Box ${i + 1} of 10`),
    );
  });

  it("limits one print to a sensible number of labels", () => {
    expect(isValidPrint(10, 4)).toBe(true);
    expect(isValidPrint(200, 5)).toBe(true);
    expect(isValidPrint(200, 6)).toBe(false);
    expect(isValidPrint(0, 1)).toBe(false);
    expect(isValidPrint(5, 0)).toBe(false);
    expect(isValidPrint(5, 11)).toBe(false);
    expect(isValidPrint(1.5, 1)).toBe(false);
  });

  it("fills the order's details and leaves the fields of other labels empty", () => {
    const values = shippingLabelValues(order, 1, 4);
    expect(values.orderNumber).toBe("SO26000123");
    expect(values.customerName).toBe("מרכול הגליל");
    expect(values.city).toBe("טבריה");
    expect(values.name).toBe("");
    expect(values.palletNumber).toBe("");
    expect(values.qrItemLabel).toBe("");
  });

  it("starts from a valid layout that uses the order and the numbering", () => {
    expect(layoutSchema.safeParse(STARTER_SHIPPING_LAYOUT).success).toBe(true);
    const fields = STARTER_SHIPPING_LAYOUT.elements.flatMap((e) =>
      e.type === "field" || e.type === "barcode" ? [e.field] : [],
    );
    expect(fields).toContain("orderNumber");
    expect(fields).toContain("labelOf");
  });
});
