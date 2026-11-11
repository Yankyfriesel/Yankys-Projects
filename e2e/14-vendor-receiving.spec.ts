import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { USER_NEW_PASSWORD } from "./constants";
import { choosePassword, createUser, ensureEnglish, signIn, signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

interface SeedItem {
  partname: string;
  partdes: string;
  barcode: string;
  familydes: string;
}

const seed: SeedItem[] = JSON.parse(readFileSync("db/seed/priority/items.json", "utf8"));
const ITEM = seed.find((i) => i.partname === "N2015D-S")!;
const TAIL = ITEM.barcode.slice(-7);

/** A vendor barcode: 38, the item's last 7 digits, two dates, the vendor's number and the weight. */
const vendorCode = (running: string, weight = "1998") => `38${TAIL}100726090728${running}${weight}`;

async function open(page: Page) {
  await page.goto("/vendor-receiving");
  await expect(page.getByLabel("Vendor barcode on the box")).toBeVisible();
}

async function scan(page: Page, text: string) {
  const input = page.getByLabel("Vendor barcode on the box");
  await input.fill(text);
  await input.press("Enter");
}

test("a vendor box is received once, and the same barcode is refused with who and when", async ({
  page,
}) => {
  await signInAsOwner(page);
  await open(page);

  await scan(page, vendorCode("63430"));
  const saved = page.getByTestId("vendor-saved");
  await expect(saved).toContainText(ITEM.partdes);
  await expect(saved).toContainText("19.98");
  await expect(saved).toContainText("09/07/2028");
  // The box is listed under its item, with the item's 7 digits in the group's heading.
  const group = page.getByTestId("vendor-group").filter({ hasText: ITEM.partdes });
  await expect(group).toContainText(TAIL);
  const row = group.getByTestId("today-box").filter({ hasText: "19.98" });
  await expect(row.first()).toContainText("Sent");
  await expect(row.first()).toContainText("09/07/2028");
  await expect(page.getByLabel("Vendor barcode on the box")).toBeFocused();

  await scan(page, vendorCode("63430"));
  const error = page.getByTestId("vendor-error");
  await expect(error).toContainText("already received");
  await expect(error).toContainText("E2E Owner");
  await expect(error).toContainText(/\d{2}\/\d{2}\/\d{4}/);
});

test("scans that are not a readable vendor barcode are refused", async ({ page }) => {
  await signInAsOwner(page);
  await open(page);

  await scan(page, "000212345671234561234561402");
  await expect(page.getByTestId("vendor-error")).toContainText("must start with 38");

  await scan(page, "3812345");
  await expect(page.getByTestId("vendor-error")).toContainText("not readable");

  await scan(page, vendorCode("00001").replace(TAIL, "0000000"));
  await expect(page.getByTestId("vendor-error")).toContainText("No item matches");

  await scan(page, `38${TAIL}311326090728634301998`);
  await expect(page.getByTestId("vendor-error")).toContainText("not readable");
});

test("the settings choose the vendor order and a storage room per category, and keep them", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/settings?section=receiving");

  const order = page.getByLabel("Order", { exact: true });
  await order.selectOption({ label: "AS26000001" });
  await expect(page.getByText("Vendor order saved")).toBeVisible();

  const room = page.getByLabel(`Storage room for ${ITEM.familydes}`);
  await room.selectOption({ label: "מקפיא ראשי" });
  await expect(page.getByText("Storage room saved")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Order", { exact: true })).toHaveValue("AS26000001");
  await expect(
    page.getByLabel(`Storage room for ${ITEM.familydes}`).locator("option:checked"),
  ).toHaveText("מקפיא ראשי");

  // Any order number can be typed; one Priority does not list is saved with a warning.
  await page.getByTestId("vendor-order-custom").fill("AS26000099");
  await page.getByRole("button", { name: "Use this number" }).click();
  await expect(page.getByText(/Priority does not list this number/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Order", { exact: true })).toHaveValue("AS26000099");

  // Put both back to automatic for the tests after this one.
  await page.getByLabel("Order", { exact: true }).selectOption({ label: "Automatic" });
  await expect(page.getByText("Vendor order saved").first()).toBeVisible();
  await page
    .getByLabel(`Storage room for ${ITEM.familydes}`)
    .selectOption({ label: "Automatic (מקרר ראשי)" });
  await expect(page.getByText("Storage room saved").first()).toBeVisible();

  await page.goto("/admin?tab=log&action=settings.vendorOrderChanged");
  await expect(
    page.getByRole("row", { name: /Changed the vendor receiving order/ }).first(),
  ).toBeVisible();
});

test("someone who may only scan vendor boxes can scan, but sees no list and no settings", async ({
  page,
}) => {
  await signInAsOwner(page);
  const temporary = await createUser(page, {
    name: "Vera Vendor",
    email: "vera.vendor@e2e.test",
    screens: {},
    actions: { "Vendor receiving": ["Scan vendor boxes"] },
    desktop: true,
    phone: false,
  });
  await page.context().clearCookies();

  await signIn(page, "vera.vendor@e2e.test", temporary);
  await choosePassword(page, temporary, USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/vendor-receiving/);
  await ensureEnglish(page);
  await expect(page.getByText("Boxes received today")).toHaveCount(0);

  await scan(page, vendorCode("77777", "0850"));
  await expect(page.getByTestId("vendor-saved")).toContainText("8.5");
});

test("scans are taken without waiting, and three sounds tell recorded, refused and not received", async ({
  page,
}) => {
  await signInAsOwner(page);
  // Remember the pitch of every beep the screen makes.
  await page.addInitScript(() => {
    const heard: number[] = [];
    (window as unknown as { heard: number[] }).heard = heard;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args: [number?]) {
      heard.push(Math.round(this.frequency.value));
      return start.apply(this, args);
    };
  });
  const pitches = (hz: number) =>
    page.evaluate(
      (wanted) =>
        (window as unknown as { heard: number[] }).heard.filter((h) => h === wanted).length,
      hz,
    );
  await open(page);

  // Three scans one right after the other, without waiting for the screen: none is lost.
  const input = page.getByLabel("Vendor barcode on the box");
  for (const running of ["71001", "71002", "71003"]) {
    await input.fill(vendorCode(running, "1000"));
    await input.press("Enter");
  }
  await expect.poll(() => pitches(1318)).toBe(3); // a high beep for each recorded box
  await expect(page.getByTestId("vendor-problem")).toHaveCount(0);

  // The same box again: refused, two low beeps, and it stays in the list of what was not recorded.
  await scan(page, vendorCode("71001", "1000"));
  await expect.poll(() => pitches(560)).toBe(2);
  await expect(page.getByTestId("vendor-problem")).toHaveCount(1);
  await expect(page.getByTestId("vendor-problem").first()).toHaveAttribute("data-kind", "refused");

  // The scan cannot reach the system: a long low buzz, and a Retry that records it later.
  await page.route("**/vendor-receiving", (route) => route.abort());
  await scan(page, vendorCode("71004", "1000"));
  await expect.poll(() => pitches(170)).toBe(1);
  const lost = page.getByTestId("vendor-problem").first();
  await expect(lost).toHaveAttribute("data-kind", "unreached");
  await page.unroute("**/vendor-receiving");
  await lost.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("vendor-saved")).toBeVisible();
  await expect.poll(() => pitches(1318)).toBe(4);
  await expect(page.getByTestId("vendor-problem")).toHaveCount(1); // only the refused one is left

  // The sounds can be turned off.
  await page.getByTestId("vendor-sound").click();
  await scan(page, vendorCode("71005", "1000"));
  await expect(page.getByTestId("vendor-saved")).toBeVisible();
  expect(await pitches(1318)).toBe(4);
  await page.getByTestId("vendor-sound").click();
});

test("clearing the list of unrecorded scans does not stop the scanning", async ({ page }) => {
  await signInAsOwner(page);
  await open(page);
  const input = page.getByLabel("Vendor barcode on the box");

  await scan(page, "3800000"); // refused: it lands in the list
  await expect(page.getByTestId("vendor-problem")).toHaveCount(1);

  // Clear the list with the mouse, then type the next scan without clicking the scan box.
  await page.getByRole("button", { name: "Clear the list" }).click();
  await expect(page.getByTestId("vendor-problems")).toHaveCount(0);
  await expect(input).toBeFocused();
  await page.keyboard.type(vendorCode("72001", "1000"));
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("vendor-saved")).toBeVisible();

  // Even when the focus was lost to the page, the scanner's keys go into the scan box.
  await input.evaluate((element) => (element as HTMLInputElement).blur());
  await page.keyboard.type(vendorCode("72002", "1000"));
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("vendor-group").first()).toContainText("72002");
});
