import { expect, test, type Page } from "@playwright/test";
import { USER_NEW_PASSWORD } from "./constants";
import {
  choosePassword,
  createUser,
  ensureEnglish,
  openBoxes,
  openItemWithBoxes,
  signIn,
  signInAsOwner,
} from "./helpers";

test.describe.configure({ mode: "serial" });

const MM_TO_PT = 72 / 25.4;

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

let palletNumber = 0;
let boxes: string[] = [];

test("boxes ticked in the inventory become a pallet, and its label prints on A5", async ({
  page,
}) => {
  await stubPrint(page);
  await signInAsOwner(page);
  await page.goto("/inventory");
  const total = await page.getByTestId("inventory-summary").innerText();

  // No ticks until building a pallet is started; Cancel takes them away again.
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Build a pallet" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: /^Make a pallet of/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Build a pallet" }).click();
  const makeButton = page.getByRole("button", { name: /^Make a pallet of/ });
  await expect(makeButton).toBeDisabled();

  await openItemWithBoxes(page, 3);
  const rows = openBoxes(page);
  boxes = [];
  for (const index of [0, 1, 2]) {
    const row = rows.nth(index);
    boxes.push((await row.getAttribute("data-barcode"))!);
    await row.getByRole("checkbox").check();
  }
  await expect(page.getByTestId("pallet-selected")).toContainText("3 boxes ticked");
  await rows.nth(1).getByRole("checkbox").uncheck();
  boxes.splice(1, 1);
  await expect(page.getByTestId("pallet-selected")).toContainText("2 boxes ticked");

  await makeButton.click();
  const toast = page.getByText(/Pallet \d+ made with 2 boxes\./).first();
  await expect(toast).toBeVisible();
  palletNumber = Number(/Pallet (\d+) made/.exec(await toast.innerText())![1]);
  expect(palletNumber).toBeGreaterThan(0);

  await expect.poll(() => printed(page)).toBe(1);
  const sheet = page.locator("#label-print-root .label-copy");
  await expect(sheet).toHaveCount(1);
  await expect(sheet).toContainText(String(palletNumber));
  await expect(sheet).toContainText("2"); // the boxes on it
  await expect(sheet.locator("svg")).toHaveCount(1); // the pallet's QR code

  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString("latin1");
  const box = pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/)!;
  expect(Math.abs(Number(box[1]) - 210 * MM_TO_PT)).toBeLessThan(1);
  expect(Math.abs(Number(box[2]) - 148 * MM_TO_PT)).toBeLessThan(1);
  await finishPrint(page);

  // The ticks are gone and no stock was touched.
  // Building is over: the panel closed and the ticks left the list.
  await expect(page.getByTestId("pallet-toolbar")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.reload();
  await expect.poll(() => page.getByTestId("inventory-summary").innerText()).toBe(total);
});

test("a pallet's QR code shows every box on it, and the latest pallets can print again", async ({
  page,
}) => {
  await stubPrint(page);
  await signInAsOwner(page);
  await page.goto("/inventory/pallets");

  const recent = page.getByTestId("pallets-recent");
  // Each pallet is a card with its number of boxes and their weight.
  const card = recent.getByRole("listitem").filter({ hasText: `Pallet ${palletNumber}` });
  await expect(card.getByTestId("pallet-boxes")).toHaveText("2");
  await expect(card).toContainText("Total weight");

  const scan = page.getByLabel("Pallet QR code");
  await scan.fill(`NFP1|${palletNumber}`);
  await scan.press("Enter");
  const detail = page.getByTestId("pallet-detail");
  await expect(detail).toContainText(`Pallet ${palletNumber}`);
  for (const barcode of boxes) await expect(detail).toContainText(barcode);
  await expect(detail.locator('[data-in-stock="true"]')).toHaveCount(2);

  await scan.fill("hello");
  await scan.press("Enter");
  await expect(page.getByTestId("pallet-error")).toContainText("not a pallet's QR code");
  await scan.fill("NFP1|99999");
  await scan.press("Enter");
  await expect(page.getByTestId("pallet-error")).toContainText("no such pallet");

  await page.getByRole("button", { name: `Print the label of pallet ${palletNumber}` }).click();
  await expect.poll(() => printed(page)).toBe(1);
  await expect(page.locator("#label-print-root .label-copy")).toContainText(String(palletNumber));
  await finishPrint(page);
});

test("the pallet label layout is a normal layout in the designer, with the pallet's fields", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await expect(page.getByRole("link", { name: "תווית משטח", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "תווית משטח", exact: true }).click();
  await expect(page.getByTestId("label-canvas")).toBeVisible();
  // It is drawn with a made-up pallet: the number and the QR code are there.
  await expect(page.getByTestId("label-canvas")).toContainText("12");
  await expect(page.getByTestId("label-canvas").locator("svg").first()).toBeVisible();
});

test("someone who may not make pallets sees no ticks and no pallet screen", async ({ page }) => {
  await signInAsOwner(page);
  const temporary = await createUser(page, {
    name: "Vic Viewer",
    email: "vic.pallets@e2e.test",
    screens: { "Inventory management": "View only" },
    desktop: true,
    phone: false,
  });
  await page.context().clearCookies();

  await signIn(page, "vic.pallets@e2e.test", temporary);
  await choosePassword(page, temporary, USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/inventory/);
  await ensureEnglish(page);
  await expect(page.getByTestId("inventory-box").first()).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pallets" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Build a pallet" })).toHaveCount(0);
  const response = await page.goto("/inventory/pallets");
  expect(response?.status()).toBe(404);
});

test("boxes scanned with the scanner are added to the pallet, and one can be taken off again", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/inventory");
  await openItemWithBoxes(page, 2);
  const rows = openBoxes(page);
  const first = (await rows.nth(0).getAttribute("data-barcode"))!;
  const second = (await rows.nth(1).getAttribute("data-barcode"))!;

  await page.getByRole("button", { name: "Build a pallet" }).click();
  const scan = page.getByTestId("pallet-scan-input");
  const notice = page.getByTestId("pallet-scan-notice");
  const selected = page.getByTestId("pallet-selected");

  await scan.fill(first);
  await scan.press("Enter");
  await expect(notice).toHaveAttribute("data-kind", "added");
  await expect(selected).toContainText("1 box ticked");
  await expect(scan).toHaveValue("");

  // The same box again, and something that is not a box in stock: nothing is added.
  await scan.fill(first);
  await scan.press("Enter");
  await expect(notice).toHaveAttribute("data-kind", "again");
  await scan.fill("NOT-A-BOX-123");
  await scan.press("Enter");
  await expect(notice).toHaveAttribute("data-kind", "unknown");
  await expect(selected).toContainText("1 box ticked");

  await scan.fill(second);
  await scan.press("Enter");
  await expect(selected).toContainText("2 boxes ticked");
  await expect(page.getByTestId("pallet-scanned").getByRole("listitem")).toHaveCount(2);
  // The scanned boxes are ticked in the list too.
  await expect(rows.nth(0).getByRole("checkbox")).toBeChecked();

  await page
    .getByTestId("pallet-scanned")
    .getByRole("button", { name: /^Take .* off the pallet$/ })
    .first()
    .click();
  await expect(selected).toContainText("1 box ticked");
  await expect(page.getByRole("button", { name: "Make a pallet of 1" })).toBeEnabled();
});

test("someone who may only build pallets by scanning gets the scan box and no ticks", async ({
  page,
}) => {
  await signInAsOwner(page);
  const temporary = await createUser(page, {
    name: "Sam Scanner",
    email: "sam.pallets@e2e.test",
    screens: { "Inventory management": "View only" },
    actions: { "Inventory management": ["Build pallets by scanning boxes with the scanner"] },
    desktop: true,
    phone: false,
  });
  await page.context().clearCookies();

  await signIn(page, "sam.pallets@e2e.test", temporary);
  await choosePassword(page, temporary, USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/inventory/);
  await ensureEnglish(page);
  await expect(page.getByTestId("inventory-box").first()).toBeVisible();
  await page.getByRole("button", { name: "Build a pallet" }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByTestId("pallet-scan-input")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Tick the/ })).toHaveCount(0);

  const barcode = (await page.getByTestId("inventory-box").first().getAttribute("data-barcode"))!;
  await page.getByTestId("pallet-scan-input").fill(barcode);
  await page.getByTestId("pallet-scan-input").press("Enter");
  await expect(page.getByTestId("pallet-selected")).toContainText("1 box ticked");
});

test("someone who may only build pallets by ticking gets the ticks and no scan box", async ({
  page,
}) => {
  await signInAsOwner(page);
  const temporary = await createUser(page, {
    name: "Tina Ticker",
    email: "tina.pallets@e2e.test",
    screens: { "Inventory management": "View only" },
    actions: { "Inventory management": ["Build pallets by ticking boxes in the system"] },
    desktop: true,
    phone: false,
  });
  await page.context().clearCookies();

  await signIn(page, "tina.pallets@e2e.test", temporary);
  await choosePassword(page, temporary, USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/inventory/);
  await ensureEnglish(page);
  await expect(page.getByTestId("inventory-box").first()).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Build a pallet" }).click();
  await expect(page.getByRole("checkbox").first()).toBeVisible();
  await expect(page.getByTestId("pallet-scan-input")).toHaveCount(0);
});
