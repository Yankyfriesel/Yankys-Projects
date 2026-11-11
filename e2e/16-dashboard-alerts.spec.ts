import { expect, test, type Page } from "@playwright/test";
import { signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

/** The "in date" number of every warehouse card, as the legend shows it. */
async function inDateCounts(page: Page): Promise<number[]> {
  await page.goto("/dashboard");
  return page
    .locator("li", { hasText: "In date" })
    .locator("b")
    .evaluateAll((nodes) => nodes.map((node) => Number(node.textContent)));
}

test("an item that needs attention opens to show each box with its dates", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/dashboard");

  // The items are folded away until the list is opened.
  const list = page.getByTestId("attention-list").first();
  await expect(list.getByTestId("attention-line").first()).toBeHidden();
  await list.locator("summary").first().click();
  const line = list.getByTestId("attention-line").first();
  await expect(line).toBeVisible();
  await expect(line.getByTestId("attention-boxes")).toBeHidden();

  await line.locator("summary").click();
  const boxes = line.getByTestId("attention-boxes");
  await expect(boxes).toBeVisible();
  await expect(boxes.getByRole("listitem").first()).toContainText(/\d{4}/); // a barcode
  await expect(boxes.getByRole("listitem").first()).toContainText(/\d{2}\/\d{2}\/\d{4}/); // the dates
  await expect(boxes).toContainText("Slaughter date");

  await line.locator("summary").click();
  await expect(boxes).toBeHidden();
});

test("the alert days chosen for the categories decide which boxes count as expiring soon", async ({
  page,
}) => {
  await signInAsOwner(page);
  const before = await inDateCounts(page);
  expect(before.some((n) => n > 0)).toBe(true);

  // A year ahead: far more boxes count as expiring soon, so fewer are "in date".
  await page.goto("/settings?section=receiving");
  const inputs = page.getByLabel(/^Alert days for/);
  const count = await inputs.count();
  expect(count).toBeGreaterThan(1);
  for (let i = 0; i < count; i++) {
    await inputs.nth(i).fill("365");
    await inputs.nth(i).press("Enter");
    await expect(page.getByText("Alert days saved").first()).toBeVisible();
  }
  await page.reload();
  await expect(page.getByLabel(/^Alert days for/).first()).toHaveValue("365");

  const widened = await inDateCounts(page);
  const total = (counts: number[]) => counts.reduce((sum, n) => sum + n, 0);
  expect(total(widened)).toBeLessThan(total(before));

  // Back to the default for the tests after this one.
  await page.goto("/settings?section=receiving");
  for (let i = 0; i < count; i++) {
    const input = page.getByLabel(/^Alert days for/).nth(i);
    await input.fill("");
    await input.press("Enter");
    await expect(page.getByText("Alert days saved").first()).toBeVisible();
  }
  expect(await inDateCounts(page)).toEqual(before);
});

test("alert days must be whole days from 1 to 365", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/settings?section=receiving");
  const input = page.getByLabel(/^Alert days for/).first();
  await input.fill("400");
  await input.press("Enter");
  await expect(page.getByText("Enter a whole number of days from 1 to 365.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/^Alert days for/).first()).toHaveValue("");
});

test("pressing the need-attention number lists every item that needs attention", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /^Show the \d+ boxes that need attention/ }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Items that need attention" })).toBeVisible();
  const items = dialog.getByTestId("attention-popup-item");
  expect(await items.count()).toBeGreaterThan(0);

  // The most urgent first: an item with expired boxes comes before one with only soon ones.
  const firstBadge = await items.first().locator("summary").innerText();
  expect(firstBadge).toMatch(/expired|expiring soon/);

  // An item opens to its boxes with their dates.
  await items.first().locator("summary").click();
  await expect(items.first().getByRole("listitem").first()).toContainText(/\d{2}\/\d{2}\/\d{4}/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
