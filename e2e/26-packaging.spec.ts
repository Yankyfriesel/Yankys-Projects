import { expect, test, type Page } from "@playwright/test";
import { signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

// The beef burger of the practice data.
const ITEM_NAME = "המבורגר בקר קלאסי 150 גר׳";
const ITEM_NUMBER = "N2015D-S";
const QR = "NF1|N2015D-S|CERT-88|201026|211026|011126";

async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    window.print = () => {};
  });
}

/** Opens the details window of the burger in the catalog. */
async function openItem(page: Page) {
  await page.goto("/catalog");
  await page.getByRole("searchbox", { name: "Search the catalog" }).fill(ITEM_NUMBER);
  await page.getByRole("button", { name: `Open ${ITEM_NAME}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("a packaging type is added in the settings with its weight", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/settings?section=receiving");

  await page.getByTestId("packaging-name").fill("E2E carton");
  await page.getByTestId("packaging-weight").fill("0,5");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByLabel("Name of E2E carton")).toHaveValue("E2E carton");
  await expect(page.getByLabel("Weight of E2E carton, in kilograms")).toHaveValue("0.5");

  // The packaging is chosen per item in the catalog, not per category here.
  await expect(page.getByTestId("category-carton")).toHaveCount(0);
});

test("the packaging of an item is chosen in its window in the catalog, and kept", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openItem(page);
  const choice = page.getByTestId("item-packaging");
  await expect(choice).toHaveValue("");
  await choice.selectOption({ label: "E2E carton · 0.50 kg" });
  await expect(page.getByText("Saved.").first()).toBeVisible();

  await page.reload();
  await openItem(page);
  await expect(page.getByTestId("item-packaging")).not.toHaveValue("");
});

test("pictures of the packaging settings, the catalog window and the weighing, in Hebrew", async ({
  page,
}) => {
  // Not a check: runs only with SCREENSHOTS=1, into data/screenshots.
  test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to take the pictures");
  await signInAsOwner(page);
  await page.getByTitle("עברית").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/settings?section=receiving");
  await expect(page.getByTestId("packaging-name")).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "data/screenshots/desktop-packaging-settings.png" });

  await page.goto("/catalog");
  await page.getByRole("searchbox").fill(ITEM_NUMBER);
  await page.getByRole("button", { name: `פתיחת ${ITEM_NAME}` }).click();
  await expect(page.getByTestId("item-packaging")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "data/screenshots/desktop-packaging-catalog.png" });

  await page.goto("/receiving");
  const scan = page.getByLabel("קוד QR שעל תווית הפריט");
  await scan.fill(QR);
  await scan.press("Enter");
  await page.getByLabel("משקל (משקל מדומה)").fill("15");
  await expect(page.getByTestId("packing-summary")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "data/screenshots/desktop-packaging-receiving.png" });
});

test("the box is recorded at the scale weight less its packaging", async ({ page }) => {
  await stubPrint(page);
  await signInAsOwner(page);
  await page.goto("/receiving");
  const scan = page.getByLabel("QR code on the item label");
  await scan.fill(QR);
  await scan.press("Enter");

  const weight = page.getByLabel("Weight (simulated scale)");
  await weight.fill("15");
  await expect(page.getByTestId("packing-summary")).toContainText("E2E carton");
  await expect(page.getByTestId("recorded-weight")).toContainText("14.50 kg");

  await weight.press("Enter");
  await expect(page.getByTestId("saved-notice")).toContainText("14.50");
  const row = page.getByTestId("today-table").getByRole("row").filter({ hasText: "14.50" });
  await expect(row.first()).toBeVisible();
});

test("a type in use can be deleted, and the item then has none", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/settings?section=receiving");
  await page.getByRole("button", { name: "Delete E2E carton" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete E2E carton" })).toHaveCount(0);

  await openItem(page);
  await expect(page.getByTestId("item-packaging")).toHaveValue("");

  await page.goto("/receiving");
  const scan = page.getByLabel("QR code on the item label");
  await scan.fill(QR);
  await scan.press("Enter");
  await page.getByLabel("Weight (simulated scale)").fill("15");
  await expect(page.getByTestId("packing-summary")).toHaveCount(0);
});
