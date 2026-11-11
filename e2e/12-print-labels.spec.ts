import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { USER_NEW_PASSWORD } from "./constants";
import { choosePassword, createUser, ensureEnglish, signIn, signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

interface SeedItem {
  partname: string;
  partdes: string;
  familydes: string;
  expiredays: number;
}

const seed: SeedItem[] = JSON.parse(readFileSync("db/seed/priority/items.json", "utf8"));
const ITEM = seed.find((i) => i.partname === "N2015D-S")!; // a beef burger, shelf life 12 days
const STARTER_LAYOUT = "תווית פריט"; // 100 x 60 mm, the one the system starts with
const OTHER_LAYOUT = "E2E tray label"; // 60 x 40 mm, made by an earlier spec
const MM_TO_PT = 72 / 25.4;

/** The window asked to print is replaced by a note, so the page can be looked at while "printing". */
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

/** Opens the item; someone who may also see details then chooses to print. */
async function openPrintWindow(page: Page) {
  await page.goto("/catalog");
  await page.getByRole("button", { name: `Open ${ITEM.partdes}` }).click();
  const dialog = page.getByRole("dialog");
  // Either the item's details (with a print button) or, for someone who may only print, the form.
  await expect(
    dialog.getByRole("button", { name: "Print a label" }).or(dialog.getByLabel("Slaughter date")),
  ).toBeVisible();
  const printButton = dialog.getByRole("button", { name: "Print a label" });
  if (await printButton.isVisible()) await printButton.click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Print item label" }),
  ).toBeVisible();
}

/** The label type is chosen from the item layouts every time: nothing is chosen for you. */
async function chooseLayout(page: Page, name: string) {
  const option = page.getByRole("dialog").getByTestId("layout-option").filter({ hasText: name });
  await option.click();
  await expect(option).toHaveAttribute("data-chosen", "true");
}

async function fillForm(page: Page, { slaughter = "2026-10-20", certificate = "CERT-77" } = {}) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Slaughter date").fill(slaughter);
  await dialog.getByLabel("Production certificate number").fill(certificate);
}

/** Pages and the size of the first page, read from a PDF of the page as it prints. */
async function pdfPages(page: Page) {
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString("latin1");
  const box = pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  return {
    pages: (pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length,
    width: Number(box?.[1]),
    height: Number(box?.[2]),
  };
}

function near(actual: number, mm: number) {
  expect(Math.abs(actual - mm * MM_TO_PT)).toBeLessThan(1);
}

test("one label: the expiry follows the slaughter date, and what prints is that label", async ({
  page,
}) => {
  await stubPrint(page);
  await signInAsOwner(page);
  await openPrintWindow(page);
  const dialog = page.getByRole("dialog");

  await expect(page.getByTestId("expiry")).toHaveText("—");
  await fillForm(page);
  await expect(page.getByTestId("expiry")).toHaveText("01/11/2026"); // 20 October plus 12 days

  // Several label types exist and none is chosen: printing asks for one first.
  await expect(dialog.getByTestId("layout-option")).not.toHaveCount(1);
  await expect(dialog.locator("[data-chosen=true]")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Print", exact: true }).click();
  await expect(dialog.getByText("Choose the label type.")).toBeVisible();
  expect(await printed(page)).toBe(0);
  await chooseLayout(page, STARTER_LAYOUT);
  await expect(page.getByTestId("print-preview")).toContainText("CERT-77");
  await expect(page.getByTestId("print-preview")).toContainText("01/11/2026");

  await dialog.getByRole("button", { name: "Print", exact: true }).click();
  await expect.poll(() => printed(page)).toBe(1);
  await expect(page.locator("body")).toHaveClass(/printing-label/);

  const sheet = page.locator("#label-print-root .label-copy");
  await expect(sheet).toHaveCount(1);
  await expect(sheet).toContainText(ITEM.partdes);
  await expect(sheet).toContainText("CERT-77");
  await expect(sheet).toContainText("01/11/2026");
  await expect(sheet.locator("svg")).toHaveCount(1); // the QR code of the starter layout

  const { pages, width, height } = await pdfPages(page);
  expect(pages).toBe(1);
  near(width, 100);
  near(height, 60);

  // When the print window closes, the screen is back to normal and the form is gone.
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("body")).not.toHaveClass(/printing-label/);
  await expect(dialog).toBeHidden();
});

test("several copies are one page each, and the print is in the activity log", async ({ page }) => {
  await stubPrint(page);
  await signInAsOwner(page);
  await openPrintWindow(page);
  await fillForm(page);
  await chooseLayout(page, STARTER_LAYOUT);
  await page.getByRole("dialog").getByLabel("Copies").fill("3");
  await page.getByRole("dialog").getByRole("button", { name: "Print", exact: true }).click();
  await expect.poll(() => printed(page)).toBe(1);

  await expect(page.locator("#label-print-root .label-copy")).toHaveCount(3);
  expect((await pdfPages(page)).pages).toBe(3);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

  await page.goto("/admin?tab=log&action=catalog.itemLabelPrinted");
  const rows = page.getByRole("row", { name: /Printed item labels/ });
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toContainText("E2E Owner");
});

test("a form that is not complete does not print, and says what is missing", async ({ page }) => {
  await stubPrint(page);
  await signInAsOwner(page);
  await openPrintWindow(page);
  const dialog = page.getByRole("dialog");

  await dialog.getByRole("button", { name: "Print", exact: true }).click();
  await expect(dialog.getByText("Enter the slaughter date.")).toBeVisible();
  await expect(dialog.getByText(/Enter the production certificate number/)).toBeVisible();

  await dialog.getByLabel("Slaughter date").fill("2026-10-25");
  await dialog.getByLabel("Production date").fill("2026-10-24");
  await expect(
    dialog.getByText("The production date cannot be before the slaughter date."),
  ).toBeVisible();

  await dialog.getByLabel("Production certificate number").fill("12 34");
  await expect(dialog.getByText(/one word of up to 30 characters/)).toBeVisible();
  expect(await printed(page)).toBe(0);
});

test("the label type is chosen from the item layouts each time, and prints on its own paper", async ({
  page,
}) => {
  await stubPrint(page);
  await signInAsOwner(page);
  await openPrintWindow(page);
  await fillForm(page);
  const dialog = page.getByRole("dialog");

  // Only item layouts are offered: not the box layout, and no pallet layout.
  const names = await dialog.getByTestId("layout-option").allTextContents();
  expect(names.some((n) => n.includes(STARTER_LAYOUT))).toBe(true);
  expect(names.some((n) => n.includes(OTHER_LAYOUT))).toBe(true);
  expect(names.some((n) => n.includes("תווית ארגז"))).toBe(false);
  expect(names.some((n) => n.includes("60 × 40"))).toBe(true); // each shows its size

  // The choice can be changed before printing, and the one chosen last is the one that prints.
  await chooseLayout(page, STARTER_LAYOUT);
  await chooseLayout(page, OTHER_LAYOUT);
  await expect(dialog.locator("[data-chosen=true]")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Print", exact: true }).click();
  await expect.poll(() => printed(page)).toBe(1);
  const { pages, width, height } = await pdfPages(page);
  expect(pages).toBe(1);
  near(width, 60);
  near(height, 40);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

  // The next print starts with nothing chosen again.
  await page.goto("/catalog");
  await page.getByRole("button", { name: `Open ${ITEM.partdes}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Print a label" }).click();
  await expect(page.getByRole("dialog").locator("[data-chosen=true]")).toHaveCount(0);
});
test("someone who may only print chooses the label type too, gets one copy, and the server holds them to it", async ({
  page,
}) => {
  await signInAsOwner(page);
  const temporary = await createUser(page, {
    name: "Pia Printer",
    email: "pia.printer@e2e.test",
    screens: {},
    actions: { "Item catalog": ["Print item labels"] },
    desktop: true,
    phone: false,
  });
  await page.context().clearCookies();

  await stubPrint(page);
  await signIn(page, "pia.printer@e2e.test", temporary);
  await choosePassword(page, temporary, USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/catalog/);
  await ensureEnglish(page);
  await openPrintWindow(page);
  const dialog = page.getByRole("dialog");

  // The label type is chosen like for anyone else; the copies are fixed at one.
  await expect(dialog.getByTestId("layout-option").first()).toBeVisible();
  await expect(dialog.getByLabel("Copies")).toBeDisabled();
  await expect(dialog.getByLabel("Copies")).toHaveValue("1");

  // Even if the page is tampered with, the server refuses more than one copy.
  await fillForm(page);
  await chooseLayout(page, STARTER_LAYOUT);
  await dialog.getByLabel("Copies").evaluate((input) => input.removeAttribute("disabled"));
  await dialog.getByLabel("Copies").fill("3");
  await dialog.getByRole("button", { name: "Print", exact: true }).click();
  await expect(dialog.getByText("You do not have permission for this.")).toBeVisible();
  expect(await printed(page)).toBe(0);

  // One copy goes through.
  await dialog.getByLabel("Copies").fill("1");
  await dialog.getByRole("button", { name: "Print", exact: true }).click();
  await expect.poll(() => printed(page)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
});

test("someone who may only look at the catalog has no item to open", async ({ page }) => {
  await signIn(page, "cleo@e2e.test", USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/catalog/);
  await ensureEnglish(page);
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Open / })).toHaveCount(0);
});
