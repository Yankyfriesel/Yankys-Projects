import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Several test files boot their own in-memory PGlite (WASM); separate
    // processes keep those instances from aborting each other.
    pool: "forks",
  },
});
