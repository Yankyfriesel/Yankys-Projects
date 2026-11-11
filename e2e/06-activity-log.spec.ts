import { expect, test } from "@playwright/test";
import { USER_NEW_PASSWORD } from "./constants";
import { ensureEnglish, signIn, signInAsOwner } from "./helpers";

// Runs after the earlier specs, so the log already holds their sign-ins, user creations and reset.

test("the owner sees what happened, with who did it and from which device", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/admin?tab=log");
  await expect(page.getByRole("heading", { name: "Activity log" })).toBeVisible();

  // The log holds 25 entries a page, so look each action up through its filter.
  for (const [key, label] of [
    ["auth.login", "Signed in"],
    ["auth.loginFailed", "Failed sign-in"],
    ["auth.passwordChanged", "Changed password"],
    ["admin.userCreated", "Created a user"],
    ["admin.passwordReset", "Reset a password"],
  ]) {
    await page.goto(`/admin?tab=log&action=${key}`);
    await expect(page.getByRole("row", { name: new RegExp(label) }).first()).toBeVisible();
  }

  // An owner's action carries the owner's name and the device it came from.
  await page.goto("/admin?tab=log&action=admin.userCreated");
  const created = page.getByRole("row", { name: /Created a user/ }).first();
  await expect(created).toContainText("E2E Owner");
  // The device column is an icon (monitor for a desktop) with the device named for screen readers.
  await expect(created.locator("svg.lucide-monitor")).toBeVisible();
  await expect(created).toContainText("Desktop");
});

test("the log is printed as a report of every entry that matches the filters", async ({ page }) => {
  await signInAsOwner(page);
  await page.addInitScript(() => {
    window.print = () => {
      const root = document.getElementById("report-print-root");
      (window as unknown as { __report: string }).__report = root?.innerText ?? "";
      window.dispatchEvent(new Event("afterprint"));
    };
  });
  await page.goto("/admin?tab=log&action=admin.userCreated");
  await page.getByRole("button", { name: "Print report" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __report?: string }).__report ?? ""))
    .toContain("Created a user");
  const report = await page.evaluate(() => (window as unknown as { __report: string }).__report);
  expect(report).toContain("Activity log");
  expect(report).toContain("E2E Owner");
  // Only what the filter keeps is in it.
  expect(report).not.toContain("Failed sign-in");
});

test("a user without the log permission cannot open it", async ({ page }) => {
  await signIn(page, "dana@e2e.test", USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/);
  await ensureEnglish(page);
  await page.goto("/admin?tab=log");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
