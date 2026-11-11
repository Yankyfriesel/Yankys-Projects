import { readFileSync } from "node:fs";
import path from "node:path";
import { and, count, eq } from "drizzle-orm";
import { addDays, buildBoxBarcode, itemNumberDigits, toISODate } from "../../lib/barcodes";
import {
  STARTER_LAYOUTS,
  STARTER_PALLET_LAYOUT,
  STARTER_SHIPPING_LAYOUT,
  STARTER_MEAT_ITEM_LAYOUT,
  STARTER_PREMIUM_ITEM_LAYOUT,
  type StarterLayout,
} from "../../lib/labels/starters";
import { hashPassword } from "../auth/password";
import type { Db } from "./connection";
import {
  accounts,
  fakePriorityInventory,
  fakePriorityItems,
  fakePriorityOrders,
  fakePriorityWarehouses,
  labelLayouts,
  settings,
  users,
} from "./schema";

const SEED_DIR = path.join(process.cwd(), "db", "seed", "priority");

export interface OwnerSeed {
  email: string;
  password: string;
  name: string;
}

/** Settings every installation starts with. Keys are read by later steps. */
export const DEFAULT_SETTINGS: Record<string, unknown> = {
  "fakePriority.behaviour": { mode: "normal", delayMs: 5000 },
  "vendorReceiving.orderDocno": "AS26000001",
};

export interface SeedReport {
  ownerCreated: boolean;
  settingsAdded: number;
  standInSeeded: boolean;
  boxes: number;
}

/**
 * Idempotent: creates the owner only when there are no users, the stand-in data
 * only when there are no items, and settings only for keys that are missing.
 */
export async function seed(db: Db, owner: OwnerSeed, now = new Date()): Promise<SeedReport> {
  const ownerCreated = await seedOwner(db, owner);
  const settingsAdded = await seedSettings(db);
  await seedLabelLayouts(db);
  await seedPalletLayout(db);
  await seedShippingLayout(db);
  await seedPremiumItemLayout(db);
  await seedMeatItemLayout(db);
  await resizePremiumItemLayout(db);
  const boxes = await seedPriorityStandIn(db, now);
  return { ownerCreated, settingsAdded, standInSeeded: boxes > 0, boxes };
}

export async function seedOwner(db: Db, owner: OwnerSeed): Promise<boolean> {
  const [{ value: userCount }] = await db.select({ value: count() }).from(users);
  if (userCount > 0) return false;

  const email = owner.email.trim().toLowerCase();
  const [created] = await db
    .insert(users)
    .values({
      email,
      emailVerified: true,
      name: owner.name,
      displayName: owner.name,
      jobTitle: "",
      locale: "he",
      isOwner: true,
      mustChangePassword: true,
    })
    .returning({ id: users.id });

  await db.insert(accounts).values({
    userId: created.id,
    accountId: created.id,
    providerId: "credential",
    password: await hashPassword(owner.password),
  });
  return true;
}

export async function seedSettings(db: Db): Promise<number> {
  const rows = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value }));
  const inserted = await db
    .insert(settings)
    .values(rows)
    .onConflictDoNothing()
    .returning({ key: settings.key });
  return inserted.length;
}

const LABEL_STARTERS_KEY = "labels.startersSeeded";

/**
 * Gives a new installation one item layout and the box layout to start from. Done
 * once (remembered in settings), so layouts that were deleted on purpose stay deleted.
 */
export async function seedLabelLayouts(db: Db): Promise<boolean> {
  const marked = await db
    .insert(settings)
    .values({ key: LABEL_STARTERS_KEY, value: true })
    .onConflictDoNothing()
    .returning({ key: settings.key });
  if (marked.length === 0) return false;

  const [{ value: existing }] = await db.select({ value: count() }).from(labelLayouts);
  if (existing > 0) return false;
  await db.insert(labelLayouts).values(STARTER_LAYOUTS);
  return true;
}

const PALLET_STARTER_KEY = "labels.palletStarterSeeded";

/**
 * Gives every installation, new or old, one pallet label to start from (pallets came after the
 * first release). Done once, so a pallet layout deleted on purpose stays deleted.
 */
export async function seedPalletLayout(db: Db): Promise<boolean> {
  const marked = await db
    .insert(settings)
    .values({ key: PALLET_STARTER_KEY, value: true })
    .onConflictDoNothing()
    .returning({ key: settings.key });
  if (marked.length === 0) return false;

  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(labelLayouts)
    .where(eq(labelLayouts.type, "pallet"));
  if (existing > 0) return false;
  await db.insert(labelLayouts).values(STARTER_PALLET_LAYOUT);
  return true;
}

const PREMIUM_STARTER_KEY = "labels.premiumStarterSeeded";

/**
 * Gives every installation the premium item label (for ready-printed stock) once, so one deleted
 * on purpose stays deleted. Skipped when a layout of that name is already there.
 */
export async function seedPremiumItemLayout(db: Db): Promise<boolean> {
  return seedLayoutOnce(db, PREMIUM_STARTER_KEY, STARTER_PREMIUM_ITEM_LAYOUT);
}

/** One shipping label to start from (shipping labels came after the first release), given once. */
export async function seedShippingLayout(db: Db): Promise<boolean> {
  return seedLayoutOnce(db, "labels.shippingStarterSeeded", STARTER_SHIPPING_LAYOUT);
}

/** The meat item label for ready-printed stock (100 × 160 mm), given once like the premium one. */
export async function seedMeatItemLayout(db: Db): Promise<boolean> {
  return seedLayoutOnce(db, "labels.meatStarterSeeded", STARTER_MEAT_ITEM_LAYOUT);
}

/** Adds a layout once (remembered under `key`), unless one of that name is already there. */
async function seedLayoutOnce(db: Db, key: string, layout: StarterLayout): Promise<boolean> {
  const marked = await db
    .insert(settings)
    .values({ key, value: true })
    .onConflictDoNothing()
    .returning({ key: settings.key });
  if (marked.length === 0) return false;

  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(labelLayouts)
    .where(eq(labelLayouts.name, layout.name));
  if (existing > 0) return false;
  await db.insert(labelLayouts).values(layout);
  return true;
}

const PREMIUM_RESIZE_KEY = "labels.premiumStarterResized";

/**
 * The premium label first came out at a guessed 100 × 300 mm; the paper is 77 × 245 mm. Done
 * once, and only to a layout still at the guessed size, so one changed by hand is left alone.
 */
export async function resizePremiumItemLayout(db: Db): Promise<boolean> {
  const marked = await db
    .insert(settings)
    .values({ key: PREMIUM_RESIZE_KEY, value: true })
    .onConflictDoNothing()
    .returning({ key: settings.key });
  if (marked.length === 0) return false;

  const updated = await db
    .update(labelLayouts)
    .set({
      widthMm: STARTER_PREMIUM_ITEM_LAYOUT.widthMm,
      heightMm: STARTER_PREMIUM_ITEM_LAYOUT.heightMm,
      elements: STARTER_PREMIUM_ITEM_LAYOUT.elements,
    })
    .where(
      and(
        eq(labelLayouts.name, STARTER_PREMIUM_ITEM_LAYOUT.name),
        eq(labelLayouts.widthMm, 100),
        eq(labelLayouts.heightMm, 300),
      ),
    )
    .returning({ id: labelLayouts.id });
  return updated.length > 0;
}

interface ItemSeed {
  partname: string;
  partdes: string;
  epartdes: string;
  barcode: string;
  familydes: string;
  weight: number;
  expiredays: number;
  specs: string;
  packingcode: string;
  originname: string;
}

interface WarehouseSeed {
  warhsname: string;
  warhsdes: string;
}

interface OrderSeed {
  docno: string;
  doctype: "production" | "vendor";
  partname: string | null;
  curdate: string;
  quant: number | null;
  status: string;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(SEED_DIR, file), "utf8")) as T;
}

/** Returns the number of boxes created, 0 when the stand-in already had items. */
export async function seedPriorityStandIn(db: Db, now: Date): Promise<number> {
  const [{ value: itemCount }] = await db.select({ value: count() }).from(fakePriorityItems);
  if (itemCount > 0) return 0;

  const items = readJson<ItemSeed[]>("items.json");
  const warehouses = readJson<WarehouseSeed[]>("warehouses.json");
  const orders = readJson<OrderSeed[]>("orders.json");

  assertUniqueCatalog(items);

  await db.insert(fakePriorityWarehouses).values(warehouses);
  await db.insert(fakePriorityItems).values(items.map((i) => ({ ...i, inventorymanaged: true })));
  await db.insert(fakePriorityOrders).values(orders);

  const boxes = generateBoxes(items, now);
  await db.insert(fakePriorityInventory).values(boxes);
  return boxes.length;
}

/** The checks the plan asks for whenever the catalog is pulled: unique item digits and unique last-7 barcode digits. */
function assertUniqueCatalog(items: ItemSeed[]): void {
  const digits = new Map<string, string>();
  const last7 = new Map<string, string>();
  for (const item of items) {
    const d = itemNumberDigits(item.partname);
    if (digits.has(d))
      throw new Error(`Seed: item digits ${d} shared by ${digits.get(d)} and ${item.partname}`);
    digits.set(d, item.partname);
    const l = item.barcode.slice(-7);
    if (last7.has(l))
      throw new Error(`Seed: barcode tail ${l} shared by ${last7.get(l)} and ${item.partname}`);
    last7.set(l, item.partname);
  }
}

type BoxRow = typeof fakePriorityInventory.$inferInsert;

/**
 * Boxes for every item, deterministic for a given day: a few expired, a few
 * close to expiry, most fine. Fresh items (D in the item number) sit in Main,
 * frozen ones (F) in 200.
 */
function generateBoxes(items: ItemSeed[], now: Date): BoxRow[] {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const random = mulberry32(20261022);
  const rows: BoxRow[] = [];

  for (const item of items) {
    const frozen = /F/.test(item.partname.replace(/^M/, ""));
    const warhsname = frozen ? "200" : "Main";
    const boxCount = 3 + Math.floor(random() * 6);
    const shelf = item.expiredays;

    for (let running = 1; running <= boxCount; running++) {
      // Age in days as a share of shelf life: ~15% expired, ~20% expiring within a week.
      const roll = random();
      const ageDays =
        roll < 0.15
          ? shelf + 1 + Math.floor(random() * 10)
          : roll < 0.35
            ? Math.max(0, shelf - 1 - Math.floor(random() * 6))
            : Math.floor(random() * Math.max(1, shelf - 7));
      const slaughterDate = addDays(today, -ageDays);
      const expiryDate = addDays(slaughterDate, shelf);
      const weightKg = Math.round(item.weight * (0.85 + random() * 0.3) * 100) / 100;
      const actname = buildBoxBarcode({
        running,
        itemDigits: itemNumberDigits(item.partname),
        slaughterDate,
        expiryDate,
        weightKg,
      });
      rows.push({
        partname: item.partname,
        warhsname,
        actname,
        tbalance: weightKg,
        expirydate: toISODate(expiryDate),
        curdate: toISODate(addDays(slaughterDate, 1)),
      });
    }
  }
  return rows;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function hasOwner(db: Db): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isOwner, true))
    .limit(1);
  return rows.length > 0;
}
