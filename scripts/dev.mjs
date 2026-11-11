// `pnpm dev`: runs the embedded database (PGlite) in its own process and Next.js against it.
//
// `next dev` serves pages and API routes from two processes, and a PGlite folder can only be
// opened by one process at a time, so the database gets a process of its own (pglite-server)
// that both Next.js processes connect to through DATABASE_URL.
//
// The local database is disposable (the seed recreates it), so before starting this clears the
// lock a killed server leaves behind and, if the folder still cannot start, moves it aside.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = path.resolve(process.env.PGLITE_DIR || "data/pglite");
const port = process.env.PGLITE_PORT || "54329";

/** True when something already listens on the port (another `pnpm dev`, most likely). */
function portInUse(number) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: Number(number) });
    const done = (busy) => {
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(1500, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

// First of all, and before touching the database folder: a running server owns it, and
// clearing its lock or moving the folder aside would hurt that server.
if (await portInUse(port)) {
  console.error(
    `[dev] The database port ${port} is already in use. Another "pnpm dev" is probably running ` +
      `(look for its terminal, or stop the process that holds port ${port}). ` +
      `Nothing was changed.`,
  );
  process.exit(1);
}

const stalePid = path.join(dataDir, "postmaster.pid");
if (existsSync(stalePid)) rmSync(stalePid, { force: true });

if (existsSync(dataDir)) {
  // Tried in a separate process: a PGlite that aborted keeps the folder's files open, and
  // Windows will not rename a folder while any handle is open.
  const probe = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { PGlite } from "@electric-sql/pglite";
       const db = new PGlite(${JSON.stringify(dataDir)});
       await db.waitReady;
       await db.close();`,
    ],
    { encoding: "utf8", timeout: 120_000 },
  );
  if (probe.status !== 0) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = `${dataDir}.damaged-${stamp}`;
    renameSync(dataDir, target);
    console.warn(
      `[dev] PGlite could not start from ${dataDir} (${(probe.stderr || "").split("\n")[0].slice(0, 120)}). ` +
        `The folder was moved to ${target}; a fresh database will be created and seeded.`,
    );
  }
}

const server = fileURLToPath(
  new URL("../node_modules/@electric-sql/pglite-socket/dist/scripts/server.js", import.meta.url),
);
const child = spawn(
  process.execPath,
  [
    server,
    `--db=${dataDir}`,
    `--port=${port}`,
    "--max-connections=10",
    "--run",
    "node ./node_modules/next/dist/bin/next dev",
    "--include-database-url",
  ],
  { stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 0));
