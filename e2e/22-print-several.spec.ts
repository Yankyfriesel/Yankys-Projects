import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { USER_NEW_PASSWORD } from "./constants";
import { ensureEnglish, signIn, signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

interface SeedItem {
  partname: string;
  partdes: string;
  expiredays: number;
}

const seed: SeedItem[] = JSON.parse(readFileSync("db/seed/priority/items.json", "utf8"));
const FIRST = seed.find((i) => i.partname === "N2015D-S")!; // shelf life 12 days
const SECOND = seed.find((i) => i.partname !== FIRST.partname && i.partdes !== FIRST.partdes)!;
const STARTER_LAYOUT = "תווית פריט"; // 100 x 60 mm, the one the system starts with

/** The window asked to print is replaced by a counter, so the page can be looked at while "printing". */
async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __printed: number };
    w.__printed = 0;
    window.print = () => {
      w.__printed += 1;
    };
  });
}

const printed = (page: Page) =>
  page.evaluate(() => (window as unknown as { __printed: number }).__printed);

/** dd/mm/yyyy of a day plus a shelf life, as the label shows the expiry. */
function expiry(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(date.getUTCDate())}/${two(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/** Starts choosing items, picks them, and opens the window that prints them together. */
async function openBatch(page: Page, names: string[]) {
  await page.goto("/catalog");
  await page.getByRole("button", { name: "Print several items" }).click();
  for (const name of names) {
    await page.getByRole("button", { name: `Select ${name}`, exact: true }).click();
  }
  await expect(page.getByTestId("select-count")).toContainText(`${names.length} items selected`);
  await page.getByTestId("select-bar").getByRole("button", { name: "Print labels" }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Print labels for several items" }),
  ).toBeVisible();
}

const rowOf = (page: Page, item: SeedItem) =>
  page.getByRole("dialog").getByTestId("batch-row").filter({ hasText: item.partname });

async function fillRow(
  row: ReturnType<typeof rowOf>,
  { slaughter, certificate, copies }: { slaughter: string; certificate: string; copies?: string },
) {
  await row.getByLabel("Slaughter date").fill(slaughter);
  await row.getByLabel("Production certificate number").fill(certificate);
  if (copies) await row.getByLabel("Copies").fill(copies);
}

async function chooseLayout(page: Page, name: string) {
  const option = page.getByRole("dialog").getByTestId("layout-option").filter({ hasText: name });
  await option.click();
  await expect(option).toHaveAttribute("data-chosen", "true");
}

test("several items print together, each with its own details, and an empty label between them", async ({
  page,
}) => {
  await stubPrint(page);
  await signInAsOwner(page);
  await openBatch(page, [FIRST.partdes, SECOND.partdes]);
  const dialog = page.getByRole("dialog");

  // One row for each item, in the order they were chosen.
  await expect(dialog.getByTestId("batch-row")).toHaveCount(2);
  await expect(dialog.getByTestId("batch-row").first()).toContainText(FIRST.partname);

  await chooseLayout(page, STARTER_LAYOUT);
  await fillRow(rowOf(page, FIRST), { slaughter: "2026-10-20", certificate: "ORD-1", copies: "2" });
  await fillRow(rowOf(page, SECOND), { slaughter: "2026-10-22", certificate: "ORD-2" });

  // Each row works out its own expiry date from its own slaughter date and shelf life.
  await expect(rowOf(page, FIRST).getByTestId("batch-expiry")).toHaveText(expiry("2026-10-20", 12));
  await expect(rowOf(page, SECOND).getByTestId("batch-expiry")).toHaveText(
    expiry("2026-10-22", SECOND.expiredays),
  );
  await expect(dialog.getByTestId("batch-summary")).toHaveText(
    "3 labels for 2 items, plus 1 empty label between the items",
  );

  await dialog.getByRole("button", { name: "Print", exact: true }).click();
  await expect.poll(() => printed(page)).toBe(1);

  // Item one twice, an empty label, then item two.
  const pages = page.locator("#label-print-root .label-copy");
  await expect(pages).toHaveCount(4);
  await expect(pages.nth(0)).toContainText(FIRST.partdes);
  await expect(pages.nth(0)).toContainText("ORD-1");
  await expect(pages.nth(0)).toContainText(expiry("2026-10-20", 12));
  await expect(pages.nth(1)).toContainText("ORD-1");
  await expect(pages.nth(2)).toHaveAttribute("data-blank", "true");
  await expect(pages.nth(2)).toHaveText("");
  await expect(pages.nth(2).locator("svg")).toHaveCount(0);
  await expect(pages.nth(3)).toContainText(SECOND.partdes);
  await expect(pages.nth(3)).toContainText("ORD-2");
  await expect(pages.nth(3)).not.toContainText("ORD-1");

  // The empty label is a page of its own, the size of the others.
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString("latin1");
  expect((pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length).toBe(4);

  // When the print window closes, the choice is over and the catalog is back to normal.
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("select-bar")).toBeHidden();
  await expect(page.getByRole("button", { name: "Print several items" })).toBeVisible();

  // Each item is in the activity log.
  await page.goto("/admin?tab=log&action=catalog.itemLabelPrinted");
  await expect(page.getByRole("row", { name: /Printed item labels/ }).first()).toContainText(
    "E2E Owner",
  );
});

test("nothing prints until the label type and every item's details are right", async ({ page }) => {
  await stubPrint(page);
  await signInAsOwner(page);
  await openBatch(page, [FIRST.partdes, SECOND.partdes]);
  const dialog = page.getByRole("dialog");

  // Nothing is chosen for you, and every item needs its own details.
  await expect(dialog.locator("[data-chosen=true]")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Print", exact: true }).click();
  await expect(dialog.getByText("Choose the label type.")).toBeVisible();
  await expect(rowOf(page, FIRST).getByText("Enter the slaughter date.")).toBeVisible();
  await expect(rowOf(page, SECOND).getByText("Enter the slaughter date.")).toBeVisible();
  expect(await printed(page)).toBe(0);

  // The first item is right; the second still is not.
  await chooseLayout(page, STARTER_LAYOUT);
  await fillRow(rowOf(page, FIRST), { slaughter: "2026-10-20", certificate: "ORD-1" });
  await dialog.getByRole("button", { name: "Print", exact: true }).click();
  await expect(rowOf(page, FIRST).getByRole("alert")).toHaveCount(0);
  await expect(rowOf(page, SECOND).getByText("Enter the slaughter date.")).toBeVisible();
  expect(await printed(page)).toBe(0);

  // An item taken out leaves one: no empty label is needed, and it prints.
  await dialog.getByRole("button", { name: `Take ${SECOND.partdes} out of this print` }).click();
  await expect(dialog.getByTestId("batch-row")).toHaveCount(1);
  await expect(dialog.getByTestId("batch-summary")).toHaveText("1 label for 1 item");
  await dialog.getByRole("button", { name: "Print", exact: true }).click();
  await expect.poll(() => printed(page)).toBe(1);
  const pages = page.locator("#label-print-root .label-copy");
  await expect(pages).toHaveCount(1);
  await expect(pages.first()).not.toHaveAttribute("data-blank", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
});

test("someone who may only print gets one copy of each item, and the server holds them to it", async ({
  page,
}) => {
  await stubPrint(page);
  await signIn(page, "pia.printer@e2e.test", USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/catalog/);
  await ensureEnglish(page);
  await openBatch(page, [FIRST.partdes, SECOND.partdes]);
  const dialog = page.getByRole("dialog");

  await chooseLayout(page, STARTER_LAYOUT);
  await fillRow(rowOf(page, FIRST), { slaughter: "2026-10-20", certificate: "ORD-1" });
  await fillRow(rowOf(page, SECOND), { slaughter: "2026-10-22", certificate: "ORD-2" });
  await expect(rowOf(page, FIRST).getByLabel("Copies")).toBeDisabled();
  await expect(rowOf(page, SECOND).getByLabel("Copies")).toBeDisabled();

  // Even if the page is tampered with, the server refuses more than one copy of an item.
  const copies = rowOf(page, SECOND).getByLabel("Copies");
  await copies.evaluate((input) => input.removeAttribute("disabled"));
  await copies.fill("3");
  await dialog.getByRole("button", { name: "Print", exact: true }).click();
  await expect(dialog.getByText("You do not have permission for this.")).toBeVisible();
  expect(await printed(page)).toBe(0);

  // One copy of each goes through.
  await copies.fill("1");
  await dialog.getByRole("button", { name: "Print", exact: true }).click();
  await expect.poll(() => printed(page)).toBe(1);
  await expect(page.locator("#label-print-root .label-copy")).toHaveCount(3); // two items and one empty label
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
});

test("someone who may only look at the catalog cannot choose items to print", async ({ page }) => {
  await signIn(page, "cleo@e2e.test", USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/catalog/);
  await ensureEnglish(page);
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print several items" })).toHaveCount(0);
});
