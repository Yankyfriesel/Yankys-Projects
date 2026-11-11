import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { USER_NEW_PASSWORD } from "./constants";
import {
  choosePassword,
  createUser,
  ensureEnglish,
  openBoxes,
  openMoreFilters,
  signIn,
  signInAsOwner,
  summaryBoxes,
} from "./helpers";

test.describe.configure({ mode: "serial" });

const FREEZER = "מקפיא ראשי";
const items = (page: Page) => page.getByTestId("inventory-item");
const room = (page: Page, name: string) => page.getByTestId("room-card").filter({ hasText: name });

async function open(page: Page) {
  await page.goto("/inventory");
  await expect(items(page).first()).toBeVisible();
}

const statuses = (page: Page) =>
  openBoxes(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-status")));

test("the storage rooms are on top, then the items, and an item opens to its boxes", async ({
  page,
}) => {
  await signInAsOwner(page);
  await open(page);

  // "All storage rooms" first and chosen, then one card per room.
  const rooms = page.getByTestId("room-card");
  expect(await rooms.count()).toBeGreaterThan(2);
  await expect(rooms.first()).toContainText("All storage rooms");
  await expect(rooms.first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("inventory-summary")).toContainText(/\d+ boxes/);
  expect(await summaryBoxes(page)).toBeGreaterThan(10);

  // One line per item; the first one is open beside the list.
  expect(await items(page).count()).toBeGreaterThan(3);
  await expect(items(page).first()).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("item-details")).toBeVisible();

  // An item with expired boxes shows them first, coloured by expiry.
  const withExpired = items(page).filter({ hasText: "expired" }).first();
  await withExpired.click();
  await expect(withExpired).toHaveAttribute("aria-expanded", "true");
  await expect(openBoxes(page).first()).toHaveAttribute("data-status", "expired");
  const list = await statuses(page);
  if (list.includes("valid")) {
    expect(list.indexOf("valid")).toBeGreaterThan(list.lastIndexOf("expired"));
  }
  const number = await withExpired.getAttribute("data-item");
  await expect(page.getByTestId("item-details")).toContainText(number!);
});

test("the rooms and filters narrow the items, and the summary follows", async ({ page }) => {
  await signInAsOwner(page);
  await open(page);
  const total = await summaryBoxes(page);
  const allItems = await items(page).count();

  // One storage room.
  await room(page, FREEZER).click();
  await expect(room(page, FREEZER)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => summaryBoxes(page)).toBeLessThan(total);
  const inFreezer = await summaryBoxes(page);
  expect(inFreezer).toBeGreaterThan(0);
  const rooms = await openBoxes(page).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-warehouse")),
  );
  expect(new Set(rooms)).toEqual(new Set([FREEZER]));

  // Only expired boxes.
  await page.locator("#inv-status").selectOption({ value: "expired" });
  const expired = await summaryBoxes(page);
  expect(expired).toBeGreaterThan(0);
  await expect(page.getByTestId("inventory-summary")).toContainText(`${expired} expired`);
  expect(new Set(await statuses(page))).toEqual(new Set(["expired"]));

  // A part of one barcode finds that box.
  await page.getByRole("button", { name: "Clear the filters" }).click();
  await expect.poll(() => summaryBoxes(page)).toBe(total);
  await expect(room(page, "All storage rooms")).toHaveAttribute("aria-pressed", "true");
  const barcode = (await openBoxes(page).first().getAttribute("data-barcode"))!;
  await openMoreFilters(page);
  await page.locator("#inv-barcode").fill(barcode.slice(2, 14));
  await expect(items(page)).toHaveCount(1);
  await expect(openBoxes(page)).toHaveCount(1);
  await expect(openBoxes(page).first()).toContainText(barcode);

  // Dates: nothing expires before the year 2000.
  await page.getByRole("button", { name: "Clear the filters" }).click();
  await openMoreFilters(page);
  await page.locator("#inv-expiry-to").fill("2000-01-01");
  await expect(page.getByTestId("inventory-empty")).toContainText("No box matches these filters.");
  await page.getByRole("button", { name: "Clear the filters" }).click();
  await expect(items(page)).toHaveCount(allItems);

  // The item search finds by number.
  await page.locator("#inv-item").fill("N2015D");
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toHaveAttribute("data-item", "N2015D-S");
  expect(await summaryBoxes(page)).toBeLessThan(total);
});

test("the filtered boxes are exported to an Excel file", async ({ page }) => {
  await signInAsOwner(page);
  await open(page);
  await room(page, FREEZER).click();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export to Excel" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^inventory-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const path = await file.path();
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK"); // an .xlsx file is a zip
  expect(bytes.length).toBeGreaterThan(2000);
});

test("the filtered boxes are printed as a report that can be saved as a PDF", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __printed: number };
    w.__printed = 0;
    window.print = () => {
      w.__printed += 1;
    };
  });
  await signInAsOwner(page);
  await open(page);
  await page.locator("#inv-status").selectOption({ value: "expired" });
  const expired = await summaryBoxes(page);

  await page.getByRole("button", { name: "Export to PDF" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed))
    .toBe(1);
  const report = page.locator("#report-print-root");
  await expect(report).toContainText("Inventory report");
  await expect(report.locator("tbody tr")).toHaveCount(expired);
  await expect(page.locator("body")).toHaveClass(/printing-report/);

  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString("latin1");
  expect(pdf.startsWith("%PDF")).toBe(true);

  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("body")).not.toHaveClass(/printing-report/);
  await expect(report).toHaveCount(0);
});

test("on a phone an item opens under itself and nothing is cut off", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInAsOwner(page);
  await open(page);
  await expect(page.getByTestId("item-details")).toHaveCount(0);
  await items(page).first().click();
  await expect(items(page).first().locator("..").getByTestId("item-details")).toBeVisible();
  await items(page).first().click();
  await expect(page.getByTestId("item-details")).toHaveCount(0);
  await items(page).first().click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("someone who may only look at the inventory has no filters and no export", async ({
  page,
}) => {
  await signInAsOwner(page);
  const temporary = await createUser(page, {
    name: "Ivy Inventory",
    email: "ivy.inventory@e2e.test",
    screens: { "Inventory management": "View only" },
    desktop: true,
    phone: false,
  });
  await page.context().clearCookies();

  await signIn(page, "ivy.inventory@e2e.test", temporary);
  await choosePassword(page, temporary, USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/inventory/);
  await ensureEnglish(page);
  await expect(items(page).first()).toBeVisible();
  await expect(page.locator("#inv-item")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Export to/ })).toHaveCount(0);
});
