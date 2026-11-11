import { expect, test, type Page } from "@playwright/test";
import { signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

/** The codes of the storage rooms on the dashboard, in the order shown. */
async function dashboardOrder(page: Page): Promise<string[]> {
  await page.goto("/dashboard");
  return page
    .getByTestId("dashboard-rooms")
    .getByTestId("room-slot")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-code") ?? ""));
}

/** The codes of the storage rooms in the inventory, in the order shown (without "All rooms"). */
async function inventoryOrder(page: Page): Promise<string[]> {
  await page.goto("/inventory");
  return page
    .getByTestId("room-cards")
    .getByTestId("room-slot")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-code") ?? ""));
}

test("the storage rooms are arranged with the arrows and the order is kept on both screens", async ({
  page,
}) => {
  await signInAsOwner(page);
  const before = await dashboardOrder(page);
  expect(before.length).toBeGreaterThan(1);

  await page.getByRole("button", { name: "Arrange the rooms" }).click();
  const second = page.getByTestId("dashboard-rooms").getByTestId("room-slot").nth(1);
  await second.getByRole("button", { name: /Move .* earlier/ }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("The order of the rooms was saved")).toBeVisible();

  const expected = [before[1], before[0], ...before.slice(2)];
  await expect.poll(() => dashboardOrder(page)).toEqual(expected);
  // The inventory shows the same order.
  expect(await inventoryOrder(page)).toEqual(expected);
});

test("a room is dragged to a new place, and Cancel leaves the order as it was", async ({
  page,
}) => {
  await signInAsOwner(page);
  const before = await dashboardOrder(page);

  await page.getByRole("button", { name: "Arrange the rooms" }).click();
  const slots = page.getByTestId("dashboard-rooms").getByTestId("room-slot");
  await slots.first().dragTo(slots.last());
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(await dashboardOrder(page)).toEqual(before);

  await page.getByRole("button", { name: "Arrange the rooms" }).click();
  await slots.first().dragTo(slots.last());
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("The order of the rooms was saved")).toBeVisible();
  const moved = [...before.slice(1), before[0]];
  await expect.poll(() => dashboardOrder(page)).toEqual(moved);
});

test("choosing a room in the inventory still works, and arranging there saves too", async ({
  page,
}) => {
  await signInAsOwner(page);
  const order = await inventoryOrder(page);
  const cards = page.getByTestId("room-cards").getByTestId("room-card");
  // The first card is "All rooms"; a room card filters while not arranging.
  await cards.nth(1).click();
  await expect(cards.nth(1)).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Arrange the rooms" }).click();
  const slots = page.getByTestId("room-cards").getByTestId("room-slot");
  await slots
    .last()
    .getByRole("button", { name: /Move .* earlier/ })
    .click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("The order of the rooms was saved")).toBeVisible();
  const swapped = [...order];
  [swapped[order.length - 2], swapped[order.length - 1]] = [
    order[order.length - 1],
    order[order.length - 2],
  ];
  await expect.poll(() => inventoryOrder(page)).toEqual(swapped);
});
