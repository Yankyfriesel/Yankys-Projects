import { asc, desc, eq } from "drizzle-orm";
import { todayIso } from "../../lib/i18n/format";
import type { Db } from "../db/connection";
import {
  fakePriorityInventory,
  fakePriorityItems,
  fakePriorityOrders,
  fakePriorityReceivedLines,
  fakePriorityWarehouses,
} from "../db/schema";
import { applyBehaviour } from "./behaviour";
import {
  PriorityError,
  type PriorityClient,
  type PriorityItem,
  type PriorityOrder,
  type PriorityStockBox,
  type PriorityWarehouse,
  type ReceiveBoxInput,
} from "./types";

/**
 * The Priority stand-in: reads and writes the sample data in the fake_priority_*
 * tables. Every call first obeys the stand-in behaviour (normal, slow, down).
 */
export class FakePriorityClient implements PriorityClient {
  constructor(private readonly db: Db) {}

  async getItems(): Promise<PriorityItem[]> {
    await applyBehaviour(this.db);
    const rows = await this.db
      .select()
      .from(fakePriorityItems)
      .orderBy(asc(fakePriorityItems.partname));
    return rows.map((r) => ({
      itemNumber: r.partname,
      name: r.partdes,
      nameEn: r.epartdes,
      barcode: r.barcode,
      category: r.familydes,
      weightKg: r.weight,
      shelfLifeDays: r.expiredays,
      storageText: r.specs,
      packingCode: r.packingcode,
      origin: r.originname,
      inventoryManaged: r.inventorymanaged,
    }));
  }

  async getWarehouses(): Promise<PriorityWarehouse[]> {
    await applyBehaviour(this.db);
    const rows = await this.db
      .select()
      .from(fakePriorityWarehouses)
      .orderBy(asc(fakePriorityWarehouses.warhsdes));
    return rows.map((r) => ({ code: r.warhsname, name: r.warhsdes }));
  }

  async getStockBoxes(): Promise<PriorityStockBox[]> {
    await applyBehaviour(this.db);
    const rows = await this.db
      .select({
        barcode: fakePriorityInventory.actname,
        itemNumber: fakePriorityInventory.partname,
        itemName: fakePriorityItems.partdes,
        itemNameEn: fakePriorityItems.epartdes,
        warehouseCode: fakePriorityInventory.warhsname,
        weightKg: fakePriorityInventory.tbalance,
        expiryDate: fakePriorityInventory.expirydate,
        enteredDate: fakePriorityInventory.curdate,
      })
      .from(fakePriorityInventory)
      .innerJoin(fakePriorityItems, eq(fakePriorityInventory.partname, fakePriorityItems.partname))
      .orderBy(asc(fakePriorityInventory.expirydate));
    return rows;
  }

  async getOrders(): Promise<PriorityOrder[]> {
    await applyBehaviour(this.db);
    const rows = await this.db
      .select()
      .from(fakePriorityOrders)
      .orderBy(desc(fakePriorityOrders.curdate), desc(fakePriorityOrders.docno));
    return rows.map((r) => ({
      docno: r.docno,
      kind: r.doctype,
      itemNumber: r.partname,
      date: r.curdate,
      status: r.status,
    }));
  }

  async receiveBox(input: ReceiveBoxInput): Promise<void> {
    await applyBehaviour(this.db);
    await this.db.transaction(async (tx) => {
      const [order] = await tx
        .select({ docno: fakePriorityOrders.docno })
        .from(fakePriorityOrders)
        .where(eq(fakePriorityOrders.docno, input.docno))
        .limit(1);
      if (!order) throw new PriorityError("UNKNOWN_ORDER");

      const [item] = await tx
        .select()
        .from(fakePriorityItems)
        .where(eq(fakePriorityItems.partname, input.itemNumber))
        .limit(1);
      if (!item) throw new PriorityError("UNKNOWN_ITEM");

      const [warehouse] = await tx
        .select({ code: fakePriorityWarehouses.warhsname })
        .from(fakePriorityWarehouses)
        .where(eq(fakePriorityWarehouses.warhsname, input.warehouseCode))
        .limit(1);
      if (!warehouse) throw new PriorityError("UNKNOWN_WAREHOUSE");

      const [existing] = await tx
        .select({ id: fakePriorityInventory.id })
        .from(fakePriorityInventory)
        .where(eq(fakePriorityInventory.actname, input.barcode))
        .limit(1);
      if (existing) throw new PriorityError("DUPLICATE_BOX");

      await tx.insert(fakePriorityReceivedLines).values({
        docno: input.docno,
        topalletname: input.barcode,
        tquant: input.weightKg,
        partname: input.itemNumber,
        barcode: item.barcode,
        pdes: item.partdes,
        toppExpirydate: input.expiryDate,
        warhsname: input.warehouseCode,
      });
      await tx.insert(fakePriorityInventory).values({
        partname: input.itemNumber,
        warhsname: input.warehouseCode,
        actname: input.barcode,
        tbalance: input.weightKg,
        expirydate: input.expiryDate,
        curdate: todayIso(),
      });
    });
  }
}
