import { expect, test } from "@playwright/test";
import { signInAsOwner } from "./helpers";

// Not a check: pictures of the pallets screen once spec 19 has made a pallet. Runs only with
// SCREENSHOTS=1, into data/screenshots.
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to take the pictures");

test("pictures of the pallets screen with a pallet opened, in Hebrew", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByTitle("עברית").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "he");

  for (const size of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 375, height: 812 },
  ]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/inventory/pallets");
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("button", { name: /^פתיחת משטח/ })
      .first()
      .click();
    await expect(page.getByTestId("pallet-detail")).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `data/screenshots/${size.name}-pallets.png`, fullPage: true });
  }
});
