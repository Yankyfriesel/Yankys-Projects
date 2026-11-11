import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

/** Driver-independent database handle used everywhere above this module. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DatabaseKind = "pglite" | "postgres";

export interface Database {
  db: Db;
  kind: DatabaseKind;
  /** Where the data lives: the connection URL or the PGlite directory ("memory"). */
  location: string;
  /** Applies pending migrations. For a file PGlite this also recovers a damaged directory first. */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "src", "server", "db", "migrations");
export const PGLITE_DIR = process.env.PGLITE_DIR || path.join(process.cwd(), "data", "pglite");

export interface CreateDatabaseOptions {
  /** Postgres URL. Undefined reads DATABASE_URL; null ignores it and uses PGlite. */
  url?: string | null;
  /** PGlite directory. Undefined uses ./data/pglite; null keeps everything in memory. */
  pgliteDataDir?: string | null;
}

/**
 * With DATABASE_URL set, a real Postgres through node-postgres.
 * Otherwise an embedded Postgres (PGlite) in ./data/pglite, so a fresh clone
 * runs with no database server installed. Same schema and migrations either way.
 */
export function createDatabase(options: CreateDatabaseOptions = {}): Database {
  const url = options.url === undefined ? process.env.DATABASE_URL || undefined : options.url;

  if (url) {
    // DATABASE_POOL_MAX caps connections per process; the PGlite socket server in
    // `pnpm dev` serves one query at a time per connection.
    const max = Number(process.env.DATABASE_POOL_MAX) || undefined;
    const pool = new Pool({ connectionString: url, max });
    const db = drizzleNodePg({ client: pool, schema, casing: "snake_case" });
    return {
      db: db as unknown as Db,
      kind: "postgres",
      location: redact(url),
      migrate: () => migrateNodePg(db, { migrationsFolder: MIGRATIONS_FOLDER }),
      close: () => pool.end(),
    };
  }

  const dataDir = options.pgliteDataDir === undefined ? PGLITE_DIR : options.pgliteDataDir;
  const holder = { client: openPglite(dataDir) };

  // Drizzle talks to the client through this forwarder, so a damaged data
  // directory can be replaced by a fresh instance without rebuilding `db`.
  const forwarding = new Proxy({} as PGlite, {
    get(_target, property) {
      const current = holder.client as unknown as Record<PropertyKey, unknown>;
      const value = current[property];
      return typeof value === "function" ? value.bind(holder.client) : value;
    },
  });
  const db = drizzlePglite({ client: forwarding, schema, casing: "snake_case" });

  async function ready(): Promise<void> {
    try {
      await holder.client.waitReady;
    } catch (error) {
      if (!dataDir) throw error;
      quarantine(dataDir, error);
      holder.client = openPglite(dataDir);
      await holder.client.waitReady;
    }
  }

  return {
    db: db as unknown as Db,
    kind: "pglite",
    location: dataDir ?? "memory",
    migrate: async () => {
      await ready();
      await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
    },
    close: () => holder.client.close(),
  };
}

function openPglite(dataDir: string | null): PGlite {
  if (!dataDir) return new PGlite();
  mkdirSync(dataDir, { recursive: true });
  // A PGlite directory serves one process at a time. A process that was killed
  // (dev server restart, Ctrl+C) leaves postmaster.pid behind, and the next
  // start aborts on it, so clear it. Only ever run one process against ./data.
  const stalePid = path.join(dataDir, "postmaster.pid");
  if (existsSync(stalePid)) rmSync(stalePid, { force: true });
  return new PGlite(dataDir);
}

/**
 * The local PGlite is disposable (the seed recreates it), so a directory that
 * Postgres can no longer start from, typically after the process was killed
 * mid-write, is moved aside rather than left to block every start.
 */
function quarantine(dataDir: string, error: unknown): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = `${dataDir}.damaged-${stamp}`;
  try {
    renameSync(dataDir, target);
  } catch {
    rmSync(dataDir, { recursive: true, force: true });
  }
  console.warn(
    `[db] PGlite could not start from ${dataDir} (${String(error).slice(0, 120)}). ` +
      `The directory was moved to ${target}; a fresh database will be created and seeded.`,
  );
}

function redact(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "postgres";
  }
}
