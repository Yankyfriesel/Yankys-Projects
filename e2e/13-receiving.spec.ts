import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { USER_NEW_PASSWORD } from "./constants";
import { choosePassword, createUser, ensureEnglish, signIn, signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

interface SeedItem {
  partname: string;
  partdes: string;
}

const seed: SeedItem[] = JSON.parse(readFileSync("db/seed/priority/items.json", "utf8"));
const ITEM = seed.find((i) => i.partname === "N2015D-S")!; // a beef burger with an open production order
// Slaughtered 20 Oct 2026, produced 21 Oct, expires 1 Nov (shelf life 12 days).
const QR = "NF1|N2015D-S|CERT-77|201026|211026|011126";

/** The print window is replaced by a counter, so the page can be looked at while "printing". */
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

const finishPrint = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

async function open(page: Page) {
  await page.goto("/receiving");
  await expect(page.getByLabel("QR code on the item label")).toBeVisible();
}

async function scan(page: Page, text = QR) {
  const input = page.getByLabel("QR code on the item label");
  await input.fill(text);
  await input.press("Enter");
}

test("scan, weigh and save: the box is saved, its label printed and listed for today", async ({
  page,
}) => {
  await stubPrint(page);
  await signInAsOwner(page);
  await open(page);

  const save = page.getByRole("button", { name: "Save and print label" });
  await expect(save).toBeDisabled();

  await scan(page);
  const summary = page.getByTestId("pending-summary");
  await expect(summary).toContainText(ITEM.partdes);
  await expect(summary).toContainText("CERT-77");
  await expect(summary).toContainText("20/10/2026");
  await expect(summary).toContainText("01/11/2026");
  await expect(save).toBeDisabled(); // no weight yet

  const weight = page.getByLabel("Weight (simulated scale)");
  await expect(weight).toBeFocused(); // a scan moves on to the weight
  await weight.fill("14.02");
  await expect(page.getByTestId("weight-display")).toContainText("14.02");
  await expect(page.getByTestId("weight-state")).toHaveText("Stable");
  await weight.press("Enter"); // Enter does the same as the button

  await expect.poll(() => printed(page)).toBe(1);
  const sheet = page.locator("#label-print-root .label-copy");
  await expect(sheet).toHaveCount(1);
  await expect(sheet).toContainText(ITEM.partdes);
  await expect(sheet).toContainText("14.02");
  await expect(sheet).toContainText("20/10/2026");
  await expect(sheet).toContainText("01/11/2026");
  await finishPrint(page);

  await expect(page.getByTestId("saved-notice")).toContainText("14.02");
  await expect(page.getByLabel("QR code on the item label")).toHaveValue("");
  const row = page.getByTestId("today-table").getByRole("row").filter({ hasText: "14.02" });
  await expect(row.first()).toContainText(ITEM.partdes);
  await expect(row.first()).toContainText("Sent");
  await expect(row.first()).toContainText("E2E Owner");
  // The box's own barcode is on the list.
  await expect(row.first().getByTestId("today-barcode")).toHaveText(/^\d{20,}$/);
});

test("running numbers count up for the same item", async ({ page }) => {
  await stubPrint(page);
  await signInAsOwner(page);
  await open(page);
  const rows = page.getByTestId("today-table").getByRole("row");
  const before = await rows.count();

  await scan(page);
  await page.getByLabel("Weight (simulated scale)").fill("9.5");
  await page.getByRole("button", { name: "Save and print label" }).click();
  await expect.poll(() => printed(page)).toBe(1);
  await finishPrint(page);
  await expect(rows).toHaveCount(before + 1);

  // Newest first: this box has a higher number than the one under it.
  const numbers = await rows.evaluateAll((trs) =>
    trs.slice(1, 3).map((tr) => Number(tr.querySelectorAll("td")[2].textContent)),
  );
  expect(numbers[0]).toBe(numbers[1] + 1);
});

test("a scan that is not an item label QR code is refused, and a box needs a weight", async ({
  page,
}) => {
  await stubPrint(page);
  await signInAsOwner(page);
  await open(page);

  await scan(page, "hello");
  await expect(page.getByRole("alert").filter({ hasText: "not an item label" })).toBeVisible();

  await scan(page, "NF1|NOPE-ITEM|CERT-1|201026|211026|011126");
  await expect(page.getByRole("alert").filter({ hasText: "not in the catalog" })).toBeVisible();

  await scan(page);
  await page.getByLabel("Weight (simulated scale)").fill("150");
  await expect(page.getByTestId("weight-display")).toHaveText(/—/);
  await expect(page.getByRole("button", { name: "Save and print label" })).toBeDisabled();
  expect(await printed(page)).toBe(0);
});

test("a box with no QR code is entered by hand", async ({ page }) => {
  await stubPrint(page);
  await signInAsOwner(page);
  await open(page);

  await page.getByRole("button", { name: /No QR code/ }).click();
  // The catalog window opens by itself; the item is found and chosen there.
  const picker = page.getByTestId("item-picker");
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("group", { name: "Categories" })).toBeVisible();
  await picker.getByLabel("Search the catalog").fill("N2015D");
  await picker.getByRole("button", { name: /\(N2015D-S\)/ }).click();
  await expect(picker).toBeHidden();
  const manual = page.getByTestId("manual-entry");
  await expect(manual.getByTestId("manual-item")).toContainText("N2015D-S");
  await manual.getByLabel("Slaughter date").fill("2026-10-20");
  await manual.getByLabel("Production certificate number").fill("12 34");
  await manual.getByRole("button", { name: "Use these details" }).click();
  await expect(manual.getByRole("alert")).toBeVisible(); // a certificate with a space

  await manual.getByLabel("Production certificate number").fill("HAND-1");
  await manual.getByRole("button", { name: "Use these details" }).click();
  await expect(page.getByTestId("pending-summary")).toContainText("01/11/2026");

  await page.getByLabel("Weight (simulated scale)").fill("7.25");
  await page.getByRole("button", { name: "Save and print label" }).click();
  await expect.poll(() => printed(page)).toBe(1);
  await expect(page.locator("#label-print-root .label-copy")).toContainText("7.25");
  await finishPrint(page);
});

test("a label can be printed again from today's list, and the activity log has the box", async ({
  page,
}) => {
  await stubPrint(page);
  await signInAsOwner(page);
  await open(page);

  await page
    .getByRole("button", { name: /^Reprint the label of/ })
    .first()
    .click();
  await expect.poll(() => printed(page)).toBe(1);
  await expect(page.locator("#label-print-root .label-copy")).toHaveCount(1);
  await finishPrint(page);

  await page.goto("/admin?tab=log&action=receiving.boxReceived");
  await expect(page.getByRole("row", { name: /Received a box/ }).first()).toContainText(
    "E2E Owner",
  );
});

test("someone who may only scan has no hand entry, no list and no reprint", async ({ page }) => {
  await signInAsOwner(page);
  const temporary = await createUser(page, {
    name: "Wanda Weigher",
    email: "wanda.weigher@e2e.test",
    screens: {},
    actions: { "Goods receiving": ["Scan and weigh boxes"] },
    desktop: true,
    phone: false,
  });
  await page.context().clearCookies();

  await stubPrint(page);
  await signIn(page, "wanda.weigher@e2e.test", temporary);
  await choosePassword(page, temporary, USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/receiving/);
  await ensureEnglish(page);
  await expect(page.getByLabel("QR code on the item label")).toBeVisible();
  await expect(page.getByRole("button", { name: /No QR code/ })).toHaveCount(0);
  await expect(page.getByText("Boxes received today")).toHaveCount(0);
  await expect(page.getByLabel(/Print by itself/)).toHaveCount(0);

  // Scanning and saving still work.
  await scan(page);
  await page.getByLabel("Weight (simulated scale)").fill("11.1");
  await page.getByRole("button", { name: "Save and print label" }).click();
  await expect.poll(() => printed(page)).toBe(1);
  await finishPrint(page);
  await expect(page.getByTestId("saved-notice")).toContainText("11.1");
});

test("the scale is connected and disconnected in the system settings, not on the receiving screen", async ({
  page,
}) => {
  await signInAsOwner(page);
  await ensureEnglish(page);
  await page.goto("/receiving");
  await expect(page.getByRole("button", { name: "Connect the scale" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Connect it in System settings" })).toBeVisible();

  await page.goto("/settings?section=hardware");
  await expect(page.getByRole("button", { name: "Connect the scale" })).toBeVisible();
  await expect(page.getByTestId("scale-live-weight")).toBeVisible();
});
