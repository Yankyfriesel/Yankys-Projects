// `node scripts/serve-remote.mjs`: the built app (light and fast) on port 3001, for opening the
// system from another computer through a link. It uses the database of the running `pnpm dev`,
// so start that first. Build it once with: NEXT_DIST_DIR=.next-prod pnpm exec next build
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PGLITE_PORT || "54329";
const next = path.join(root, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [next, "start", "-p", "3001"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_DIST_DIR: ".next-prod",
    DATABASE_URL:
      process.env.DATABASE_URL || `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
