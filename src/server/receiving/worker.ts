import type { Db } from "../db/connection";
import type { PriorityClient } from "../priority/types";
import { sendDue } from "./index";

const EVERY_MS = 30_000;
const STARTED = Symbol.for("northfield.sendWorker");

/**
 * Retries the sends to Priority that are due, every 30 seconds, for as long as the server
 * runs, so boxes saved while Priority was down reach it without anyone opening a screen.
 * Safe next to other processes (`pnpm dev` runs two): a send is claimed before it is tried.
 * Started once per process.
 */
export function startSendWorker(db: Db, priority: () => PriorityClient, everyMs = EVERY_MS): void {
  const registry = globalThis as unknown as Record<symbol, boolean>;
  if (registry[STARTED]) return;
  registry[STARTED] = true;

  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const client = priority();
      const sent = await sendDue(db, client);
      if (sent > 0) console.log(`[receiving] sent ${sent} waiting box(es) to Priority`);
    } catch (error) {
      console.error("[receiving] the send timer failed", error);
    } finally {
      running = false;
    }
  }, everyMs);
  timer.unref();
}
