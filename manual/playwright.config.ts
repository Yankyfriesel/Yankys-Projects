import { defineConfig, devices } from "@playwright/test";

// Takes the pictures for the manual from a private copy of the system with made-up data
// (started by manual/server.sh on port 3100). It never touches the live system.
export default defineConfig({
  testDir: ".",
  testMatch: "capture.spec.ts",
  workers: 1,
  reporter: [["list"]],
  timeout: 900_000,
  use: {
    baseURL: "http://localhost:3100",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.5,
    actionTimeout: 8000,
  },
});
