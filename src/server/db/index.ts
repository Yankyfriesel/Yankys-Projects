import { createDatabase, type Database, type Db } from "./connection";
export * as schema from "./schema";
export type { Db } from "./connection";

// One database per process. Cached on globalThis so Next's dev server does not
// open a second PGlite on the same directory after a hot reload.
const globalRef = globalThis as unknown as {
  __weighingDatabase?: Database;
  __weighingShutdownHooked?: boolean;
};

export function getDatabase(): Database {
  if (!globalRef.__weighingDatabase) {
    globalRef.__weighingDatabase = createDatabase();
    closeOnShutdown(globalRef.__weighingDatabase);
  }
  return globalRef.__weighingDatabase;
}

/**
 * Closes this process's database and forgets it; the next use opens it again.
 * Next runs the startup hook (migrations, seed) in a different process from the
 * one that serves requests, and a file PGlite serves one process at a time, so
 * the startup process lets go before requests arrive.
 */
export async function closeDatabase(): Promise<void> {
  const database = globalRef.__weighingDatabase;
  globalRef.__weighingDatabase = undefined;
  await database?.close();
}

/**
 * Closes the embedded database before the process ends on Ctrl+C or a
 * termination signal, so the PGlite files stay consistent across restarts.
 * Registered by every process that opens the database, once.
 */
function closeOnShutdown(database: Database): void {
  if (database.kind !== "pglite" || globalRef.__weighingShutdownHooked) return;
  globalRef.__weighingShutdownHooked = true;

  let closing = false;
  const closeAndExit = (signal: NodeJS.Signals) => {
    if (closing) return;
    closing = true;
    closeDatabase()
      .catch(() => undefined)
      .finally(() => process.kill(process.pid, signal));
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => closeAndExit(signal));
  }
}

/**
 * The application's database handle. Lazy on purpose: importing this module
 * must not open a database (tests build their own in-memory one, and a file
 * PGlite serves one process at a time). The real handle is created on first use.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, property) {
    const real = getDatabase().db as unknown as Record<PropertyKey, unknown>;
    const value = real[property];
    return typeof value === "function" ? value.bind(real) : value;
  },
});
