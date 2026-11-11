/**
 * Phase 1 tables. Column names are snake_case in the database (drizzle `casing`),
 * camelCase here. The users/sessions/accounts/verifications tables follow the
 * shape Better Auth expects (step 4) with the system's own columns added.
 *
 * Tables prefixed fake_priority_ belong to the Priority stand-in only.
 */
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { LabelElement } from "../../lib/labels/model";

export const labelTypeEnum = pgEnum("label_type", ["item", "box", "pallet", "shipping"]);
export const deviceTypeEnum = pgEnum("device_type", ["desktop", "phone"]);
export const localeEnum = pgEnum("locale", ["he", "en"]);
export const priorityDocTypeEnum = pgEnum("priority_doc_type", ["production", "vendor"]);

export type DeviceType = (typeof deviceTypeEnum.enumValues)[number];

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Users, sessions, permissions
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  /** Full name (Better Auth requires a `name` field). */
  name: text().notNull(),
  displayName: text().notNull(),
  jobTitle: text().notNull().default(""),
  image: text(),
  locale: localeEnum().notNull().default("he"),
  isOwner: boolean().notNull().default(false),
  isDisabled: boolean().notNull().default(false),
  mustChangePassword: boolean().notNull().default(true),
  /** Whether a code from an authenticator app is asked for after the password. */
  twoFactorEnabled: boolean().notNull().default(false),
  ...timestamps,
});

/** The authenticator-app secret and backup codes of a user (encrypted by Better Auth). */
export const twoFactors = pgTable(
  "two_factors",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    /** False until the person has typed one correct code, proving the app is set up. */
    verified: boolean().notNull().default(true),
    failedVerificationCount: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
  },
  (t) => [index("two_factors_user_id_idx").on(t.userId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    deviceType: deviceTypeEnum().notNull().default("desktop"),
    ...timestamps,
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Provider-side id: the user id for "credential", the Google subject for "google". */
    accountId: text().notNull(),
    providerId: text().notNull(),
    /** Hashed password for the credential provider (see src/server/auth/password.ts). */
    password: text(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    ...timestamps,
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const userPermissions = pgTable(
  "user_permissions",
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.permission] })],
);

// ---------------------------------------------------------------------------
// Activity log and settings
// ---------------------------------------------------------------------------

export const activityLog = pgTable(
  "activity_log",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Null for events without a known user (for example a failed login for an unknown email). */
    userId: text().references(() => users.id, { onDelete: "restrict" }),
    /** Frozen at write time so the row reads the same after the user is renamed or disabled. */
    userDisplay: text().notNull(),
    deviceType: deviceTypeEnum(),
    action: text().notNull(),
    entityType: text(),
    entityId: text(),
    details: jsonb().$type<Record<string, unknown>>(),
    ip: text(),
  },
  (t) => [
    index("activity_log_at_idx").on(t.at),
    index("activity_log_user_id_idx").on(t.userId),
    index("activity_log_action_idx").on(t.action),
  ],
);

export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().$type<unknown>().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedBy: text(),
});

// ---------------------------------------------------------------------------
// Label layouts (phase 2)
// ---------------------------------------------------------------------------

export const labelLayouts = pgTable(
  "label_layouts",
  {
    id: id(),
    name: text().notNull(),
    /** Fixed at creation. There is exactly one "box" layout, the same for all items. */
    type: labelTypeEnum().notNull(),
    widthMm: numeric({ precision: 6, scale: 1, mode: "number" }).notNull(),
    heightMm: numeric({ precision: 6, scale: 1, mode: "number" }).notNull(),
    elements: jsonb().$type<LabelElement[]>().notNull().default([]),
    createdBy: text(),
    ...timestamps,
  },
  (t) => [uniqueIndex("label_layouts_name_idx").on(sql`lower(${t.name})`)],
);

/**
 * An order Priority sent for shipping labels. One row per order number: when Priority sends the
 * same order again, the row is updated (the labels are printed from the newest details).
 * `raw` is everything that was received, as sent.
 */
export const shippingOrders = pgTable(
  "shipping_orders",
  {
    id: id(),
    orderNumber: text().notNull(),
    customerName: text().notNull().default(""),
    customerNumber: text().notNull().default(""),
    address: text().notNull().default(""),
    city: text().notNull().default(""),
    phone: text().notNull().default(""),
    shipDate: text().notNull().default(""),
    notes: text().notNull().default(""),
    /** How many labels Priority asked for; null when it did not say. */
    labelCount: integer(),
    raw: jsonb().$type<unknown>(),
    /** True for the test order made from the settings, not sent by Priority. */
    isTest: boolean().notNull().default(false),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** How many times Priority sent this order. */
    timesReceived: integer().notNull().default(1),
    lastPrintedAt: timestamp({ withTimezone: true }),
    lastPrintedBy: text(),
    timesPrinted: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex("shipping_orders_number_idx").on(t.orderNumber),
    index("shipping_orders_received_idx").on(t.receivedAt),
  ],
);

/**
 * Which item layout a category of items prints with by default. The category is
 * Priority's own text ("" for items without one), so it has no table to point at.
 * Deleting a layout removes the defaults that used it.
 */
export const labelCategoryDefaults = pgTable("label_category_defaults", {
  category: text().primaryKey(),
  layoutId: text()
    .notNull()
    .references(() => labelLayouts.id, { onDelete: "cascade" }),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// Receiving (phase 4)
// ---------------------------------------------------------------------------

export const boxSourceEnum = pgEnum("box_source", ["production", "vendor"]);
export const sendStatusEnum = pgEnum("send_status", ["pending", "sent", "failed"]);

/**
 * Every box this system ever received, from its own label or a vendor's. The barcode is
 * unique forever: a received barcode stays blocked, so a box can never be counted twice.
 */
export const boxes = pgTable(
  "boxes",
  {
    id: id(),
    barcode: text().notNull().unique(),
    source: boxSourceEnum().notNull(),
    itemNumber: text().notNull(),
    /** In-house: our running number for the item. Vendor: the vendor's own number (5 digits). */
    running: text().notNull(),
    slaughterDate: date().notNull(),
    /** Null for vendor boxes (the vendor barcode does not carry it). */
    productionDate: date(),
    expiryDate: date().notNull(),
    certificateNo: text(),
    weightKg: numeric({ precision: 6, scale: 2, mode: "number" }).notNull(),
    /** The Priority order the box is sent under. */
    docno: text().notNull(),
    warehouseCode: text().notNull(),
    receivedBy: text().references(() => users.id, { onDelete: "restrict" }),
    /** Frozen at write time, like the activity log. */
    receivedByDisplay: text().notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("boxes_received_at_idx").on(t.receivedAt),
    index("boxes_item_idx").on(t.itemNumber),
  ],
);

/** The last running number given to each item (by its item digits), so a number is never reused. */
export const boxCounters = pgTable("box_counters", {
  itemDigits: text().primaryKey(),
  last: integer().notNull().default(0),
});

/**
 * The queue of boxes to send to Priority. A box is saved first, then sent; a failure
 * keeps the row for a retry. `failed` means the retries ran out and an admin must look.
 */
export const prioritySends = pgTable(
  "priority_sends",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    boxId: text()
      .notNull()
      .unique()
      .references(() => boxes.id, { onDelete: "cascade" }),
    status: sendStatusEnum().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    /** A Priority error code or a short message. */
    lastError: text(),
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("priority_sends_status_idx").on(t.status, t.nextAttemptAt)],
);

/**
 * The queue of box moves between warehouses to send to Priority. Like the receiving queue: a
 * move is saved first, then sent, and a failed send keeps its row for a retry. A box may be
 * moved many times, so the barcode is not unique here.
 */
export const priorityMoves = pgTable(
  "priority_moves",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    barcode: text().notNull(),
    fromWarehouse: text().notNull(),
    toWarehouse: text().notNull(),
    status: sendStatusEnum().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    lastError: text(),
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp({ withTimezone: true }),
    createdBy: text().references(() => users.id, { onDelete: "restrict" }),
    /** Frozen at write time, like the activity log. */
    createdByDisplay: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("priority_moves_status_idx").on(t.status, t.nextAttemptAt),
    index("priority_moves_barcode_idx").on(t.barcode),
  ],
);

/**
 * A pallet: a fixed list of boxes that one QR code names. It never changes stock. The number is
 * what the QR holds; a pallet is never deleted, so a printed number always means the same list.
 */
export const pallets = pgTable("pallets", {
  number: bigserial({ mode: "number" }).primaryKey(),
  createdBy: text().references(() => users.id, { onDelete: "restrict" }),
  /** Frozen at write time, like the activity log. */
  createdByDisplay: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** The boxes on a pallet, as they were when it was made (the live stock is read from Priority). */
export const palletBoxes = pgTable(
  "pallet_boxes",
  {
    palletNumber: bigint({ mode: "number" })
      .notNull()
      .references(() => pallets.number, { onDelete: "restrict" }),
    barcode: text().notNull(),
    itemNumber: text().notNull(),
    itemName: text().notNull(),
    weightKg: numeric({ precision: 6, scale: 2, mode: "number" }).notNull(),
    position: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.palletNumber, t.barcode] }),
    index("pallet_boxes_barcode_idx").on(t.barcode),
  ],
);

// ---------------------------------------------------------------------------
// Priority stand-in (column names follow the Priority fields in PLAN.md)
// ---------------------------------------------------------------------------

export const fakePriorityItems = pgTable("fake_priority_items", {
  partname: text().primaryKey(),
  partdes: text().notNull(),
  epartdes: text().notNull().default(""),
  barcode: text().notNull().default(""),
  familydes: text().notNull().default(""),
  weight: numeric({ precision: 10, scale: 2, mode: "number" }),
  expiredays: integer().notNull().default(0),
  specs: text().notNull().default(""),
  packingcode: text().notNull().default(""),
  originname: text().notNull().default(""),
  inventorymanaged: boolean().notNull().default(true),
});

export const fakePriorityWarehouses = pgTable("fake_priority_warehouses", {
  warhsname: text().primaryKey(),
  warhsdes: text().notNull(),
});

export const fakePriorityInventory = pgTable(
  "fake_priority_inventory",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    partname: text()
      .notNull()
      .references(() => fakePriorityItems.partname),
    warhsname: text()
      .notNull()
      .references(() => fakePriorityWarehouses.warhsname),
    /** Box barcode (lot / pallet number in Priority). */
    actname: text().notNull().unique(),
    tbalance: numeric({ precision: 10, scale: 2, mode: "number" }).notNull(),
    tunitname: text().notNull().default('ק"ג'),
    expirydate: date().notNull(),
    /** Date the box entered stock. */
    curdate: date().notNull(),
  },
  (t) => [
    index("fake_priority_inventory_partname_idx").on(t.partname),
    index("fake_priority_inventory_warhsname_idx").on(t.warhsname),
  ],
);

export const fakePriorityOrders = pgTable("fake_priority_orders", {
  docno: text().primaryKey(),
  doctype: priorityDocTypeEnum().notNull().default("production"),
  partname: text().references(() => fakePriorityItems.partname),
  curdate: date().notNull(),
  quant: numeric({ precision: 10, scale: 2, mode: "number" }),
  status: text().notNull().default("open"),
});

/** Lines written by receiving (phase 4); one per box, like TRANSORDER_H_SUBFORM. */
export const fakePriorityReceivedLines = pgTable("fake_priority_received_lines", {
  id: bigserial({ mode: "number" }).primaryKey(),
  docno: text()
    .notNull()
    .references(() => fakePriorityOrders.docno),
  topalletname: text().notNull().unique(),
  tquant: numeric({ precision: 10, scale: 2, mode: "number" }).notNull(),
  partname: text()
    .notNull()
    .references(() => fakePriorityItems.partname),
  barcode: text().notNull().default(""),
  pdes: text().notNull().default(""),
  toppExpirydate: date().notNull(),
  warhsname: text()
    .notNull()
    .references(() => fakePriorityWarehouses.warhsname),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Messages from people to the administrators
// ---------------------------------------------------------------------------

export const messageKindEnum = pgEnum("message_kind", [
  "question",
  "request",
  "problem",
  "suggestion",
]);
export const messageStatusEnum = pgEnum("message_status", ["new", "done"]);

/**
 * A question, request, problem or suggestion a person sends from any page. It is divided by kind,
 * by the screen it is about and by what about it, so the reader sees exactly what is meant.
 */
export const adminMessages = pgTable(
  "admin_messages",
  {
    id: id(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    senderId: text().references(() => users.id, { onDelete: "set null" }),
    /** Frozen at write time, like the activity log. */
    senderDisplay: text().notNull(),
    kind: messageKindEnum().notNull(),
    /** A screen key (dashboard, catalog…), or "signin" / "other". */
    screen: text().notNull(),
    /** What about it: a key from the list of its kind (howTo, permission, printing…). */
    subject: text().notNull(),
    urgent: boolean().notNull().default(false),
    details: text().notNull(),
    /** The page the person was on. */
    pagePath: text().notNull().default(""),
    deviceType: deviceTypeEnum(),
    locale: localeEnum().notNull().default("he"),
    status: messageStatusEnum().notNull().default("new"),
    handledBy: text().references(() => users.id, { onDelete: "set null" }),
    handledByDisplay: text(),
    handledAt: timestamp({ withTimezone: true }),
    /** The administrator's answer, shown to the sender. */
    reply: text(),
  },
  (t) => [
    index("admin_messages_status_idx").on(t.status, t.createdAt),
    index("admin_messages_sender_idx").on(t.senderId, t.createdAt),
  ],
);
