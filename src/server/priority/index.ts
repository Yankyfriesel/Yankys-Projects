import { db } from "../db";
import { appSecret } from "../settings/secret";
import { getShelfLives, withShelfLives } from "../shelf-lives";
import { getStorageTexts, withStorageTexts } from "../storage-texts";
import { withReceivedDates } from "./entered-dates";
import { FakePriorityClient } from "./fake";
import { LiveReadPriorityClient } from "./live";
import type { PriorityClient } from "./types";

export { PriorityError } from "./types";
export type {
  PriorityClient,
  PriorityErrorCode,
  PriorityItem,
  PriorityOrder,
  PriorityStockBox,
  PriorityWarehouse,
  ReceiveBoxInput,
} from "./types";

let live: LiveReadPriorityClient | null = null;

/**
 * The Priority connection for this process, chosen by PRIORITY_MODE:
 * "fake" (the default) is the stand-in; "live" reads items, warehouses and stock from the real
 * Priority, keeps orders on the stand-in, and refuses writes until Priority allows them.
 */
export function getPriorityClient(): PriorityClient {
  const mode = process.env.PRIORITY_MODE || "fake";
  if (mode === "live") {
    if (!live) {
      live = new LiveReadPriorityClient(db, appSecret);
      // Read once at start, so the first page opened does not wait for Priority.
      void Promise.allSettled([live.getItems(), live.getStockBoxes()]);
    }
    return withCategoryTexts(live);
  }
  return withCategoryTexts(new FakePriorityClient(db));
}

/**
 * The same client, whose items take their category's storage text and shelf life (days from the
 * slaughter date to the expiry date) where Priority has none.
 */
function withCategoryTexts(client: PriorityClient): PriorityClient {
  return {
    getItems: async () => {
      const [items, texts, days] = await Promise.all([
        client.getItems(),
        getStorageTexts(db),
        getShelfLives(db),
      ]);
      return withShelfLives(withStorageTexts(items, texts), days);
    },
    getWarehouses: () => client.getWarehouses(),
    getStockBoxes: async () => withReceivedDates(db, await client.getStockBoxes()),
    getOrders: () => client.getOrders(),
    receiveBox: (input) => client.receiveBox(input),
  };
}
