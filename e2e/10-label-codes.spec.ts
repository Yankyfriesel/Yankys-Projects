import { expect, test, type Page } from "@playwright/test";
import { signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

const LAYOUT = "E2E codes label";

const canvasOf = (page: Page) => page.getByTestId("label-canvas");
const selectedPanel = (page: Page) => page.getByRole("region", { name: "Selected element" });

test("barcode, QR code and logo elements are added, drawn, changed and saved", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await page.getByRole("button", { name: "New layout" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(LAYOUT);
  await dialog.getByRole("button", { name: "Create and open" }).click();
  await expect(canvasOf(page)).toBeVisible();

  // A barcode of the item barcode (an item label), drawn as a picture with the digits.
  await page.getByRole("button", { name: "Barcode", exact: true }).click();
  const barcode = canvasOf(page).getByRole("button", { name: "Barcode: Item barcode" });
  await expect(barcode).toBeVisible();
  const withDigits = await canvasOf(page).locator("svg").first().innerHTML();

  // The digits can be switched off: the picture gets simpler.
  await selectedPanel(page).getByRole("button", { name: "Show the digits under the bars" }).click();
  const bare = await canvasOf(page).locator("svg").first().innerHTML();
  expect(bare.length).toBeLessThan(withDigits.length);

  // A QR code holds the whole item label by default; choosing another source changes the picture.
  await page.getByRole("button", { name: "QR code", exact: true }).click();
  await expect(
    canvasOf(page).getByRole("button", { name: "QR code: The whole item label" }),
  ).toBeVisible();
  await expect(canvasOf(page).locator("svg")).toHaveCount(2);
  const qrWhole = await canvasOf(page).locator("svg").nth(1).innerHTML();
  await selectedPanel(page).getByLabel("The QR code holds").selectOption({ label: "Item barcode" });
  const qrBarcode = await canvasOf(page).locator("svg").nth(1).innerHTML();
  expect(qrBarcode).not.toBe(qrWhole);

  // The logo is the company's own image from the server, and it loads.
  await page.getByRole("button", { name: "Logo", exact: true }).click();
  const logo = canvasOf(page).locator("img[src='/api/brand/full']");
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await selectedPanel(page).getByRole("radio", { name: "Mark" }).click();
  await expect(canvasOf(page).locator("img[src='/api/brand/mark']")).toBeVisible();

  // Saved, they come back as they were left.
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Layout saved")).toBeVisible();
  await page.reload();
  await expect(canvasOf(page).getByRole("button", { name: "Barcode: Item barcode" })).toBeVisible();
  await expect(canvasOf(page).getByRole("button", { name: "QR code: Item barcode" })).toBeVisible();
  await expect(canvasOf(page).locator("img[src='/api/brand/mark']")).toBeVisible();
  await expect(canvasOf(page).locator("svg")).toHaveCount(2);
});

test("a barcode of a field with nothing to encode shows an empty dashed box, not an error", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await page.getByRole("link", { name: LAYOUT, exact: true }).click();
  // Other elements lie over it on the label, so it is picked from the list of elements.
  await page
    .getByRole("region", { name: "Elements on the label" })
    .getByRole("button", { name: "Barcode: Item barcode" })
    .click();

  // The Hebrew name cannot be a Code 128 barcode (plain ASCII only).
  await selectedPanel(page).getByLabel("Shows").selectOption({ label: "Name (Hebrew)" });
  await expect(canvasOf(page).locator("svg")).toHaveCount(1); // only the QR code is left
  await expect(canvasOf(page).locator("div.border-dashed")).toHaveCount(1);
});

test("the test print is the label itself, on a page of exactly its size", async ({ page }) => {
  // The print window cannot be driven, so it is replaced by a note that it was asked for.
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed += 1;
    };
  });
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await page.getByRole("link", { name: LAYOUT, exact: true }).click();
  await expect(canvasOf(page)).toBeVisible();

  await page.getByRole("button", { name: "Test print" }).click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  await expect(page.locator("body")).toHaveClass(/printing-label/);

  // While printing, the page is the label: one page, as big as the label (100 x 60 mm).
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString("latin1");
  const pages = pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? [];
  expect(pages).toHaveLength(1);
  const box = pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  expect(box).not.toBeNull();
  // Chromium rounds the page to whole device pixels: within a point (a third of a millimetre).
  expect(Math.abs(Number(box![1]) - (100 / 25.4) * 72)).toBeLessThan(1);
  expect(Math.abs(Number(box![2]) - (60 / 25.4) * 72)).toBeLessThan(1);

  // When printing ends, the screen is back to normal.
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("body")).not.toHaveClass(/printing-label/);
  await expect(canvasOf(page)).toBeVisible();
});
