import { expect, test, type Page } from "@playwright/test";
import { signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

let apiUrl = "";

/** The shipping section starts closed, like the labels one; press its button to open it. */
async function openShippingCard(page: Page) {
  const toggle = page.getByTestId("shipping-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("shipping-url")).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

/** The address Priority is given, as the settings show it. */
async function readAddress(page: Page): Promise<string> {
  await page.goto("/settings");
  await openShippingCard(page);
  const field = page.getByTestId("shipping-url");
  await expect(field).toBeVisible();
  return field.inputValue();
}

test("the settings show the address to give Priority, with a key inside it", async ({ page }) => {
  await signInAsOwner(page);
  apiUrl = await readAddress(page);
  expect(apiUrl).toMatch(/^http:\/\/localhost:3100\/api\/shipping-labels\/[A-Za-z0-9_-]{30,}$/);
  await expect(page.getByTestId("shipping-status")).toContainText("No order has arrived");
});

test("Priority can send an order without signing in, as JSON, as form fields or in the address", async ({
  request,
}) => {
  // The wrong key is refused, and tells nothing.
  const wrong = await request.post(apiUrl.replace(/\/[^/]+$/, "/not-the-key"), {
    data: { ordname: "SO900" },
  });
  expect(wrong.status()).toBe(404);

  // Priority's own column names, as JSON.
  const json = await request.post(apiUrl, {
    data: {
      ORDNAME: "SO900",
      CUSTNAME: "C77",
      CDES: "Cohen Foods",
      ADDRESS: "15 Herzl St",
      STATE: "Tiberias",
      CURDATE: "2026-11-09T00:00:00+02:00",
      labels: 3,
    },
  });
  expect(json.status()).toBe(200);
  expect(await json.json()).toEqual({ ok: true, order: "SO900", updated: false });

  // Form fields.
  const form = await request.post(apiUrl, {
    form: { orderNumber: "SO901", customerName: "Levi Market", city: "Haifa" },
  });
  expect(form.status()).toBe(200);

  // In the address itself.
  const query = await request.get(`${apiUrl}?docno=SO902&cdes=Mizrahi`);
  expect(query.status()).toBe(200);

  // The same order again updates it.
  const again = await request.post(apiUrl, { data: { ordname: "SO900", city: "Haifa" } });
  expect((await again.json()).updated).toBe(true);

  // No order number, nothing to print.
  const empty = await request.post(apiUrl, { data: { cdes: "Nobody" } });
  expect(empty.status()).toBe(422);
  expect((await empty.json()).error).toBe("NO_ORDER_NUMBER");
  const broken = await request.post(apiUrl, {
    headers: { "content-type": "application/json" },
    data: Buffer.from("{not json"),
  });
  expect(broken.status()).toBe(400);
});

test("the orders wait in the list, and their labels print numbered Box 1 of 3, Box 2 of 3, Box 3 of 3", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.addInitScript(() => {
    window.print = () => {
      const copies = [...document.querySelectorAll("#label-print-root .label-copy")];
      (window as unknown as { __labels: string[] }).__labels = copies.map(
        (copy) => (copy as HTMLElement).innerText,
      );
      window.dispatchEvent(new Event("afterprint"));
    };
  });
  await page.goto("/shipping-labels");
  const rows = page.getByTestId("shipping-order");
  await expect(rows).toHaveCount(3);

  const row = rows.filter({ hasText: "SO900" });
  await expect(row).toContainText("Cohen Foods");
  await expect(row).toContainText("Haifa");
  await expect(row.getByTestId("shipping-not-printed")).toBeVisible();

  // Search.
  await page.getByLabel("Search the orders").fill("levi");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("SO901");
  await page.goto("/shipping-labels");

  await row.getByTestId("shipping-print").click();
  const dialog = page.getByRole("dialog");
  // Priority asked for 3 labels, so that is the number to start from.
  await expect(dialog.getByTestId("shipping-count")).toHaveValue("3");
  await expect(dialog.getByTestId("shipping-sequence")).toContainText(
    "Box 1 of 3, Box 2 of 3, Box 3 of 3",
  );
  await expect(dialog.getByTestId("shipping-preview")).toContainText("SO900");
  await expect(dialog.getByTestId("shipping-preview")).toContainText("Box 1 of 3");

  // Ten labels instead.
  await dialog.getByTestId("shipping-count").fill("10");
  await expect(dialog.getByTestId("shipping-sequence")).toContainText("Box 10 of 10");
  await dialog.getByTestId("shipping-do-print").click();

  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __labels?: string[] }).__labels?.length),
    )
    .toBe(10);
  const labels = await page.evaluate(() => (window as unknown as { __labels: string[] }).__labels);
  labels.forEach((text, index) => {
    expect(text).toContain(`Box ${index + 1} of 10`);
    expect(text).toContain("SO900");
    expect(text).toContain("Cohen Foods");
  });

  // The list now says it was printed.
  await expect(row.getByTestId("shipping-printed")).toContainText("Printed once");
  await expect(rows.filter({ hasText: "SO901" }).getByTestId("shipping-not-printed")).toBeVisible();

  // Boxes get one label each, so there is no number of labels per box to choose.
  await row.getByTestId("shipping-print").click();
  await expect(dialog.getByTestId("shipping-copies")).toHaveCount(0);
  await expect(dialog.getByTestId("shipping-sequence")).toContainText("One label for each box");

  // Pallets: the word changes, and each pallet number gets 4 labels (the default).
  await dialog.getByTestId("shipping-unit-pallet").click();
  await dialog.getByTestId("shipping-count").fill("2");
  await expect(dialog.getByTestId("shipping-copies")).toHaveValue("4");
  await expect(dialog.getByTestId("shipping-sequence")).toContainText(
    "4 labels for each pallet: Pallet 1 of 2, Pallet 2 of 2 (8 labels in all)",
  );
  await expect(dialog.getByTestId("shipping-do-print")).toContainText("Print 8 labels");
  await dialog.getByTestId("shipping-do-print").click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __labels?: string[] }).__labels?.length),
    )
    .toBe(8);
  const pallets = await page.evaluate(() => (window as unknown as { __labels: string[] }).__labels);
  pallets.slice(0, 4).forEach((text) => expect(text).toContain("Pallet 1 of 2"));
  pallets.slice(4).forEach((text) => expect(text).toContain("Pallet 2 of 2"));

  // 10 pallets with 4 labels each is 40 labels, 4 of each number in a row.
  await row.getByTestId("shipping-print").click();
  await dialog.getByTestId("shipping-unit-pallet").click();
  await dialog.getByTestId("shipping-count").fill("10");
  await dialog.getByTestId("shipping-do-print").click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __labels?: string[] }).__labels?.length),
    )
    .toBe(40);
  const forty = await page.evaluate(() => (window as unknown as { __labels: string[] }).__labels);
  expect(forty[3]).toContain("Pallet 1 of 10");
  expect(forty[4]).toContain("Pallet 2 of 10");
  expect(forty[39]).toContain("Pallet 10 of 10");

  // A bad number cannot be printed.
  await row.getByTestId("shipping-print").click();
  await dialog.getByTestId("shipping-count").fill("0");
  await expect(dialog.getByTestId("shipping-do-print")).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("the starting number of labels and a test order are set in the settings", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/settings");
  await openShippingCard(page);
  await page.getByTestId("shipping-default-count").fill("6");
  await page.getByTestId("shipping-pallet-copies").fill("2");
  await page.getByTestId("shipping-save").click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.getByTestId("shipping-test").click();
  await expect(page.getByText("TEST-0001")).toBeVisible();

  await page.goto("/shipping-labels");
  const test = page.getByTestId("shipping-order").filter({ hasText: "TEST-0001" });
  await test.getByTestId("shipping-print").click();
  // The test order names no number of its own, so it starts from the setting (6 here, 1 by default).
  await expect(page.getByTestId("shipping-count")).toHaveValue("6");
  await page.getByRole("button", { name: "Cancel" }).click();

  // An order that does not say how many starts from the number in the settings.
  const rows = page.getByTestId("shipping-order");
  await rows.filter({ hasText: "SO901" }).getByTestId("shipping-print").click();
  await expect(page.getByTestId("shipping-count")).toHaveValue("6");
  // The labels for each pallet start from the number in the settings too.
  await page.getByTestId("shipping-unit-pallet").click();
  await expect(page.getByTestId("shipping-copies")).toHaveValue("2");
  await page.getByRole("button", { name: "Cancel" }).click();

  // An order can be deleted from the list.
  await rows.filter({ hasText: "SO902" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(rows.filter({ hasText: "SO902" })).toHaveCount(0);
});

test("a shipping label is designed in the label designer, with the order's details to place", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await expect(page.getByText("Shipping label", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "תווית משלוח" }).click();
  await expect(page.getByText("Order details (sent by Priority)")).toBeVisible();
  await expect(
    page.getByText("This label out of all, with the word (Box 3 of 10)").first(),
  ).toBeVisible();
  // An item label's details are not offered on a shipping label.
  await expect(page.getByText("Item details (from Priority)")).toHaveCount(0);
});

test("a new address makes the old one stop working at once", async ({ page, request }) => {
  await signInAsOwner(page);
  await page.goto("/settings");
  await openShippingCard(page);
  await page.getByTestId("shipping-new-key").click();
  await page.getByRole("button", { name: "Yes, make a new one" }).click();
  await expect(page.getByText("A new address was made")).toBeVisible();
  const fresh = await page.getByTestId("shipping-url").inputValue();
  expect(fresh).not.toBe(apiUrl);

  expect((await request.post(apiUrl, { data: { ordname: "SO950" } })).status()).toBe(404);
  expect((await request.post(fresh, { data: { ordname: "SO950" } })).status()).toBe(200);
});
