import { expect, test } from "@playwright/test";
import { signInAsOwner } from "./helpers";

// Not a check: saves one picture of every screen at phone and desktop width, for looking at.
// Runs only with SCREENSHOTS=1 (after the other specs, which set up the owner), into data/screenshots.
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to take the pictures");

const SCREENS = [
  "dashboard",
  "catalog",
  "receiving",
  "vendor-receiving",
  "inventory",
  "settings",
  "admin",
  "admin?tab=log",
];

const SIZES = [
  { name: "phone", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

test("pictures of every screen in Hebrew, at phone and desktop width", async ({ page }) => {
  test.setTimeout(300_000);
  await signInAsOwner(page);
  // The owner is in English after the earlier specs; the real default is Hebrew.
  await page.getByTitle("עברית").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "he");

  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const screen of SCREENS) {
      await page.goto(`/${screen}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500); // let the entry animations finish
      const file = screen.replace(/[^a-z-]+/g, "-");
      await page.screenshot({
        path: `data/screenshots/${size.name}-${file}.png`,
        fullPage: true,
      });
    }
  }

  // The catalog's details window, at each width (the last width set above is the desktop one).
  for (const size of [SIZES[1], SIZES[0]]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/catalog");
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("button", { name: /^פתיחת / })
      .first()
      .click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `data/screenshots/${size.name}-catalog-details.png` });
  }

  // The print window of an item label, filled in.
  for (const size of [SIZES[1], SIZES[0]]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/catalog");
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("button", { name: /^פתיחת / })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "הפקת מדבקה" }).click();
    await dialog.getByLabel("תאריך שחיטה").fill("2026-10-20");
    await dialog.getByLabel("מספר תעודת יצור").fill("CERT-77");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `data/screenshots/${size.name}-print-dialog.png` });
  }

  // The dashboard with the first item that needs attention opened, at each width.
  for (const size of [SIZES[1], SIZES[0]]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("attention-list").first().locator("summary").first().click();
    await page.getByTestId("attention-line").first().locator("summary").click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: `data/screenshots/${size.name}-dashboard-open.png`,
      fullPage: true,
    });
  }

  // The pallet label in the designer (the pallets screen is photographed by spec 20, after pallets exist).
  await page.setViewportSize({ width: SIZES[1].width, height: SIZES[1].height });
  await page.goto("/settings/labels");
  await page.getByRole("link", { name: "תווית משטח", exact: true }).click();
  await page.getByTestId("label-canvas").waitFor();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: "data/screenshots/desktop-label-editor-pallet.png",
    fullPage: true,
  });

  // The weighing screen with a scanned label and a weight, at each width.
  for (const size of [SIZES[1], SIZES[0]]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/receiving");
    await page.waitForLoadState("networkidle");
    const scanInput = page.locator("#scan-input");
    await scanInput.fill("NF1|N2015D-S|CERT-77|201026|211026|011126");
    await scanInput.press("Enter");
    await page.locator("#simulated-weight").fill("14.02");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `data/screenshots/${size.name}-receiving.png`, fullPage: true });
  }

  // The label layouts list and the editor, with the starter item label open.
  for (const size of [SIZES[1], SIZES[0]]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/settings/labels");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: `data/screenshots/${size.name}-label-layouts.png`,
      fullPage: true,
    });
    await page.locator("table a").first().click();
    await page.getByTestId("label-canvas").waitFor();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await page.locator('[data-element-id="name"]').click();
    await page.screenshot({
      path: `data/screenshots/${size.name}-label-editor.png`,
      fullPage: true,
    });
  }

  // The box layout, which has a barcode.
  await page.setViewportSize({ width: SIZES[1].width, height: SIZES[1].height });
  await page.goto("/settings/labels");
  await page.getByRole("link", { name: "תווית ארגז", exact: true }).click();
  await page.getByTestId("label-canvas").waitFor();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "data/screenshots/desktop-label-editor-box.png", fullPage: true });

  await page.context().clearCookies();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "data/screenshots/phone-login.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "data/screenshots/desktop-login.png", fullPage: true });
});
