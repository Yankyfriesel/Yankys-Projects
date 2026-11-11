# Factory Weighing System

Browser app that sits beside Priority: weighs boxes on a connected scale, prints barcode labels, and sends each box to Priority as its own line.

## Stack

Next.js (App Router, TypeScript), Tailwind CSS v4, shadcn/ui (Base UI, RTL), next-intl, PostgreSQL with Drizzle, Better Auth.

## Run locally

Requirements: Node 22+ and pnpm (`npm i -g pnpm`).

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

With no `DATABASE_URL` the app uses an embedded Postgres (PGlite) stored in `./data/pglite`. `pnpm dev` (`scripts/dev.mjs`) runs that database in its own process (`pglite-server`, port 54329) and starts Next.js against it, because `next dev` serves pages and API routes from two processes and a PGlite folder can only be opened by one. `pnpm start` is a single process and opens the folder itself.

To use a real Postgres instead, run `docker compose up -d`, set `DATABASE_URL` in `.env.local` and start the app with `pnpm dev:app` (plain `next dev`; `pnpm dev` always uses PGlite).

On every server start the app applies pending migrations and runs the idempotent seed (`src/instrumentation.ts`): the owner account from `SEED_OWNER_*` when there are no users yet, default settings, and the Priority stand-in's sample items, warehouses, orders and boxes when the stand-in is empty. Delete `./data/pglite` to start over.

## Database

- Schema: `src/server/db/schema.ts` (Drizzle). Column names are snake_case in the database, camelCase in code.
- After changing the schema run `pnpm db:generate` to write a migration into `src/server/db/migrations`, and commit it.
- Sample data for the Priority stand-in lives in `db/seed/priority/*.json`; boxes are generated relative to today's date.

`pnpm-workspace.yaml` pins `@swc/core` to 1.16.0: newer releases refuse to load on Windows machines whose user folders carry extra ACL entries (error `ERR_SWC_NATIVE_CACHE`). The comment there explains when the pin can go.

## Scripts

| Script              | What it does                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm dev`          | Development server at `localhost:3000`, with the embedded database in its own process     |
| `pnpm dev:app`      | Plain `next dev`, for a real Postgres in `DATABASE_URL`                                   |
| `pnpm e2e`          | Playwright tests on a production build (`E2E_DEV=1` runs them against `pnpm dev`'s setup) |
| `pnpm build`        | Production build                                                                          |
| `pnpm start`        | Serve the production build                                                                |
| `pnpm lint`         | ESLint                                                                                    |
| `pnpm typecheck`    | Generate route types and run `tsc`                                                        |
| `pnpm format`       | Prettier (write)                                                                          |
| `pnpm format:check` | Prettier (check only)                                                                     |
| `pnpm test`         | Unit tests (Vitest)                                                                       |
| `pnpm db:generate`  | Write a migration from schema changes                                                     |
| `pnpm db:migrate`   | Apply migrations                                                                          |
| `pnpm db:seed`      | Migrate, then run the idempotent seed                                                     |
| `pnpm db:studio`    | Drizzle Studio (data browser)                                                             |
