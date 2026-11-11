import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  casing: "snake_case",
  // Only used by `drizzle-kit studio` / `push`; `generate` needs no database.
  ...(process.env.DATABASE_URL
    ? { dbCredentials: { url: process.env.DATABASE_URL } }
    : { driver: "pglite" as const, dbCredentials: { url: "./data/pglite" } }),
});
