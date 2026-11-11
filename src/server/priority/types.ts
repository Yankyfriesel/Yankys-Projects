/**
 * What the weighing system reads from Priority. Everything above this
 * interface is ignorant of whether the data comes from the stand-in
 * (phase 1) or from Priority's own API (phase 6). Phase 4 adds the writes
 * (receiving a box, moving a box); this is the read side the dashboard needs.
 */

export interface PriorityWarehouse {
  /** Priority's warehouse code, for example "Main" or "200". */
  code: string;
  /** Name as defined in Priority, shown exactly as is. */
  name: string;
}

/**
 * One item of the catalog, read only: the LOGPART fields the weighing system uses.
 * Text is shown exactly as Priority has it, whatever language the screen is in.
 */
export interface PriorityItem {
  /** מק״ט, for example "N2015D-S". */
  itemNumber: string;
  name: string;
  nameEn: string;
  /** The item's fixed barcode. */
  barcode: string;
  category: string;
  /** Average carton weight; null when Priority has none. */
  weightKg: number | null;
  shelfLifeDays: number;
  /** Storage text for labels (differs for fresh and frozen). */
  storageText: string;
  packingCode: string;
  origin: string;
  inventoryManaged: boolean;
}

/** One box in stock: a single line of inventory, down to the box barcode. */
export interface PriorityStockBox {
  barcode: string;
  itemNumber: string;
  itemName: string;
  itemNameEn: string;
  warehouseCode: string;
  weightKg: number;
  /** YYYY-MM-DD */
  expiryDate: string;
  /** YYYY-MM-DD */
  enteredDate: string;
}

/** A production order (הזמנת יצור) or the fixed vendor receiving order, read only. */
export interface PriorityOrder {
  docno: string;
  kind: "production" | "vendor";
  /** The item a production order makes; null for the vendor order. */
  itemNumber: string | null;
  /** YYYY-MM-DD */
  date: string;
  status: string;
  /** The storage room of the order's own document in Priority, when it has one. */
  warehouseCode?: string;
}

/** A box received into stock: one line on a receiving document, like TRANSORDER_H_SUBFORM in Priority. */
export interface ReceiveBoxInput {
  /** Whether it was weighed in the factory or bought from a vendor. */
  source: "production" | "vendor";
  /** The order or document the box belongs to. */
  docno: string;
  barcode: string;
  itemNumber: string;
  weightKg: number;
  /** YYYY-MM-DD */
  expiryDate: string;
  warehouseCode: string;
}

export type PriorityErrorCode =
  /** Priority does not answer (down, network, timeout). Safe to retry later. */
  | "UNAVAILABLE"
  /** Priority answered but does not accept the access key or password. */
  | "AUTH_FAILED"
  /** Priority turns requests away (an account locked after failed sign-ins, or too many requests). Not retried by itself. */
  | "RATE_LIMITED"
  /** Priority has no such form (or the address is wrong). */
  | "NOT_FOUND"
  /** Priority refused the request itself (a field or a value it does not know). */
  | "BAD_REQUEST"
  /** This system may not write to Priority yet (write permission is not open). The box waits. */
  | "WRITE_NOT_OPEN"
  | "DUPLICATE_BOX"
  | "UNKNOWN_BOX"
  | "UNKNOWN_ITEM"
  | "UNKNOWN_WAREHOUSE"
  | "UNKNOWN_ORDER";

export class PriorityError extends Error {
  constructor(public readonly code: PriorityErrorCode) {
    super(code);
    this.name = "PriorityError";
  }
}

export interface PriorityClient {
  /** The item catalog, ordered by item number. */
  getItems(): Promise<PriorityItem[]>;
  getWarehouses(): Promise<PriorityWarehouse[]>;
  getStockBoxes(): Promise<PriorityStockBox[]>;
  /** Production orders and the vendor order, newest first. */
  getOrders(): Promise<PriorityOrder[]>;
  /** Adds one box to stock. Throws PriorityError. */
  receiveBox(input: ReceiveBoxInput): Promise<void>;
}
