/**
 * Runs once when the Next.js server starts: applies pending migrations and the
 * idempotent seed, so a fresh clone works with `pnpm dev` alone. Everything
 * Node-specific sits behind dynamic imports because this file is also compiled
 * for the Edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { prepareDatabase } = await import("./server/db/prepare");
  const { getDatabase } = await import("./server/db");

  const report = await prepareDatabase();
  const database = getDatabase();
  const seeded = report.ownerCreated || report.standInSeeded;
  console.log(
    `[db] ${database.kind} at ${database.location}: migrations applied` +
      (seeded
        ? `, seeded (owner=${report.ownerCreated}, boxes=${report.boxes}, settings=${report.settingsAdded})`
        : ""),
  );

  const { startSendWorker } = await import("./server/receiving/worker");
  const { getPriorityClient } = await import("./server/priority");
  startSendWorker(database.db, getPriorityClient);
}
