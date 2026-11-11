import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { E2E_OWNER } from "./e2e/constants";

const PORT = 3100;

const WIPE_DATABASE = `node -e "require('node:fs').rmSync('data/e2e-pglite',{recursive:true,force:true})"`;

// E2E_DEV=1 runs the tests against `next dev` the way `pnpm dev` starts it (database in its own
// process), to check that setup. The default is a production build, which is faster to start.
const command = process.env.E2E_DEV
  ? `${WIPE_DATABASE} && pnpm exec pglite-server --db=data/e2e-pglite --port=54330 --max-connections=10 --run "node ./node_modules/next/dist/bin/next dev --port ${PORT}" --include-database-url`
  : `${WIPE_DATABASE} && pnpm exec next build && pnpm exec next start --port ${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // One embedded database, one server: tests share state, so run them in order.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `next dev` serves pages and API routes from two processes, and a file PGlite can only be
    // opened by one process at a time, so the default is a production build (one process).
    // The throwaway database lives under ./data (git-ignored) and is wiped before every run,
    // so the running dev server and its data are never touched.
    command,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      E2E_RELAXED_RATE_LIMIT: "1",
      PGLITE_DIR: path.join(process.cwd(), "data", "e2e-pglite"),
      // Empty means the embedded database; pglite-server fills it in for the dev run.
      ...(process.env.E2E_DEV ? {} : { DATABASE_URL: "" }),
      APP_URL: `http://localhost:${PORT}`,
      AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else-0123456789",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      PRIORITY_MODE: "fake",
      // The question helper talks to a pretend service that the specs start on this port.
      ANTHROPIC_API_KEY: "e2e-test-key",
      ANTHROPIC_BASE_URL: "http://127.0.0.1:3199",
      SEED_OWNER_EMAIL: E2E_OWNER.email,
      SEED_OWNER_PASSWORD: E2E_OWNER.password,
      SEED_OWNER_NAME: E2E_OWNER.name,
    },
  },
});
