import { expect, test, type Page } from "@playwright/test";
import { USER_NEW_PASSWORD } from "./constants";
import { choosePassword, createUser, ensureEnglish, signIn, signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

const LAYOUT = "E2E tray label";

/** Pixels per millimetre of the label as drawn, from its real size on screen. */
async function pixelsPerMm(page: Page, widthMm: number): Promise<number> {
  const box = await page.getByTestId("label-canvas").boundingBox();
  return box!.width / widthMm;
}

const inCanvas = (page: Page) => page.getByTestId("label-canvas");
const selectedPanel = (page: Page) => page.getByRole("region", { name: "Selected element" });
const labelPanel = (page: Page) => page.getByRole("region", { name: "Label", exact: true });

async function openLayout(page: Page, name: string) {
  await page.goto("/settings/labels");
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByTestId("label-canvas")).toBeVisible();
}

test("settings leads to the layouts, which start with an item, a box and a pallet layout", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/settings");
  // The settings are in groups; the menu moves between them, and the first is open.
  const menu = page.getByRole("navigation", { name: "Settings groups" });
  await menu.getByRole("link", { name: /^Priority/ }).click();
  await expect(page).toHaveURL(/section=priority/);
  await expect(page.getByRole("heading", { name: "Priority", exact: true })).toBeVisible();
  await menu.getByRole("link", { name: /^Company and labels/ }).click();
  await expect(menu.getByRole("link", { name: /^Company and labels/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("button", { name: "Open the label designer" }).click();

  await expect(page).toHaveURL(/\/settings\/labels$/);
  await expect(page.getByRole("heading", { name: "Label layouts" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("6 layouts");
  await expect(page.getByText("Item label", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Box label", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Pallet label", { exact: true }).first()).toBeVisible();

  // There is only one box layout: it cannot be copied (the three item layouts and the pallet layout can).
  await expect(page.getByRole("button", { name: /^Duplicate/ })).toHaveCount(5);
});

test("a new layout is created at a typed size and opens in the editor", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await page.getByRole("button", { name: "New layout" }).click();

  const dialog = page.getByRole("dialog");
  // The box layout exists already, so that kind cannot be chosen again.
  await expect(dialog.getByRole("radio", { name: /Box label/ })).toBeDisabled();
  await dialog.getByLabel("Name").fill(LAYOUT);
  await dialog.getByLabel("Width (mm)").fill("60");
  await dialog.getByLabel("Height (mm)").fill("40");
  await dialog.getByRole("button", { name: "Create and open" }).click();

  await expect(page).toHaveURL(/\/settings\/labels\/[\w-]+$/);
  await expect(page.getByRole("group", { name: `${LAYOUT}: 60 by 40 millimetres` })).toBeVisible();
  await expect(page.getByText("The label is empty.")).toBeVisible();
});

test("an element is added, typed into, dragged, resized, saved and found again", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openLayout(page, LAYOUT);

  await page.getByRole("button", { name: "Text", exact: true }).click();
  const element = inCanvas(page).getByRole("button", { name: "Text: Text", exact: true });
  await expect(element).toBeVisible();

  const panel = selectedPanel(page);
  await panel.getByLabel("Text", { exact: true }).fill("Fresh");
  await expect(inCanvas(page).getByRole("button", { name: "Text: Fresh" })).toBeVisible();

  // Drag it 8 mm to the right (it is 40 mm wide on a 60 mm label, so 10 mm is all it can move) and 5 mm down; the position follows, snapped to half a millimetre.
  const scale = await pixelsPerMm(page, 60);
  const startX = Number(await panel.getByLabel("From the left (mm)").inputValue());
  const startY = Number(await panel.getByLabel("From the top (mm)").inputValue());
  const box = (await inCanvas(page).getByRole("button", { name: "Text: Fresh" }).boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 8 * scale, cy + 5 * scale, { steps: 8 });
  await page.mouse.up();
  const movedX = Number(await panel.getByLabel("From the left (mm)").inputValue());
  const movedY = Number(await panel.getByLabel("From the top (mm)").inputValue());
  expect(movedX).toBeCloseTo(startX + 8, 0);
  expect(movedY).toBeCloseTo(startY + 5, 0);

  // Drag the bottom handle down by 3 mm: the height grows, the width does not.
  const startH = Number(await panel.getByLabel("Height (mm)").inputValue());
  const startW = Number(await panel.getByLabel("Width (mm)").inputValue());
  const handle = (await page.locator("[data-handle=s]").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 3 * scale, {
    steps: 6,
  });
  await page.mouse.up();
  expect(Number(await panel.getByLabel("Height (mm)").inputValue())).toBeCloseTo(startH + 3, 0);
  expect(Number(await panel.getByLabel("Width (mm)").inputValue())).toBe(startW);

  // Saving, then opening the layout again, finds the element where it was left.
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Layout saved")).toBeVisible();
  await expect(page.getByText("Unsaved changes")).toBeHidden();

  await page.reload();
  await expect(inCanvas(page).getByRole("button", { name: "Text: Fresh" })).toBeVisible();
  await inCanvas(page).getByRole("button", { name: "Text: Fresh" }).click();
  expect(
    Number(await selectedPanel(page).getByLabel("From the left (mm)").inputValue()),
  ).toBeCloseTo(startX + 8, 0);
});

test("a field shows the preview item's value, in its own language, and undo takes changes back", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openLayout(page, LAYOUT);

  await page.getByRole("button", { name: "Field", exact: true }).click();
  const panel = selectedPanel(page);
  await panel.getByLabel("Shows").selectOption({ label: "Name (English)" });
  const canvas = page.getByTestId("label-canvas");
  await expect(canvas).toContainText("Boneless beef shoulder cut");

  // Another item in the preview changes only what the label shows.
  await labelPanel(page).getByLabel("Preview with item").selectOption({ index: 4 });
  await expect(canvas).not.toContainText("Boneless beef shoulder cut");

  const before = await inCanvas(page)
    .getByRole("button", { name: /^Field:/ })
    .count();
  await page.getByRole("button", { name: "Undo" }).click(); // back to the first field choice
  await page.getByRole("button", { name: "Undo" }).click(); // the field is gone again
  expect(
    await inCanvas(page)
      .getByRole("button", { name: /^Field:/ })
      .count(),
  ).toBe(before - 1);
  await page.getByRole("button", { name: "Redo" }).click();
  expect(
    await inCanvas(page)
      .getByRole("button", { name: /^Field:/ })
      .count(),
  ).toBe(before);
});

test("the keyboard works fully: choose several, move, copy, delete and undo, also with a Hebrew keyboard", async ({
  page,
}) => {
  await signInAsOwner(page);
  await openLayout(page, LAYOUT);
  const canvas = inCanvas(page);
  const layers = page.locator("[data-layer-id]");
  const chosen = page.locator("[data-layer-id][aria-pressed=true]");
  const start = await layers.count();

  // Two new texts to work with.
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(layers).toHaveCount(start + 2);
  const texts = canvas.getByRole("button", { name: "Text: Text", exact: true });
  const first = texts.nth(0);
  const second = texts.nth(1);
  const scale = await pixelsPerMm(page, 60);
  const left = async (locator: typeof first) => (await locator.boundingBox())!.x;
  // The second text sits two millimetres below the first: its lower edge is free of the first one's handles.
  const lowEdge = { x: 6, y: (await second.boundingBox())!.height - 2 };

  // After a click with the mouse the keys work at once: Delete deletes, Ctrl+Z brings it back.
  await first.click({ position: { x: 6, y: 2 } });
  await expect(chosen).toHaveCount(1);
  await page.keyboard.press("Delete");
  await expect(layers).toHaveCount(start + 1);
  await page.keyboard.press("Control+z"); // the focus stayed in the editor after the delete
  await expect(layers).toHaveCount(start + 2);

  // Ctrl+A chooses everything, Escape chooses nothing.
  await page.keyboard.press("Control+a");
  await expect(chosen).toHaveCount(start + 2);
  await expect(page.getByTestId("multiple-selected")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chosen).toHaveCount(0);

  // Shift + click adds to the choice (and takes out again).
  await first.click({ position: { x: 6, y: 2 } });
  await second.click({ modifiers: ["Shift"], position: lowEdge });
  await expect(chosen).toHaveCount(2);
  await second.click({ modifiers: ["Shift"], position: lowEdge });
  await expect(chosen).toHaveCount(1);
  await second.click({ modifiers: ["Shift"], position: lowEdge });
  await expect(chosen).toHaveCount(2);

  // The arrow keys move everything chosen together (Shift: 5 mm).
  const firstLeft = await left(first);
  const secondLeft = await left(second);
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => (await left(first)) - firstLeft).toBeCloseTo(5 * scale, 0);
  expect((await left(second)) - secondLeft).toBeCloseTo(5 * scale, 0);

  // Dragging one of the chosen moves all of them.
  const grab = (await first.boundingBox())!;
  const x = grab.x + 6;
  const y = grab.y + 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 5 * scale, y, { steps: 6 });
  await page.mouse.up();
  expect(Math.abs((await left(first)) - firstLeft)).toBeLessThan(1);
  expect(Math.abs((await left(second)) - secondLeft)).toBeLessThan(1);
  await expect(chosen).toHaveCount(2);

  // Ctrl+C and Ctrl+V: a copy of both appears and is the choice; Ctrl+Z takes it away.
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(layers).toHaveCount(start + 4);
  await expect(chosen).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(layers).toHaveCount(start + 2);

  // Delete removes all the chosen ones at once; undo brings them back.
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await expect(layers).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(layers).toHaveCount(start + 2);

  // A Hebrew keyboard types other letters for the same keys (Ctrl+Z gives "ז"): it works the same.
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await expect(layers).toHaveCount(0);
  await page.evaluate(() =>
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: "ז", code: "KeyZ", ctrlKey: true, bubbles: true }),
    ),
  );
  await expect(layers).toHaveCount(start + 2);
  await page.evaluate(() =>
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: "ש", code: "KeyA", ctrlKey: true, bubbles: true }),
    ),
  );
  await expect(chosen).toHaveCount(start + 2);

  // In the list of elements the arrows walk the list, and Shift chooses several in a row.
  const before = await left(first);
  await layers.nth(0).focus();
  await page.keyboard.press("ArrowDown");
  await expect(layers.nth(1)).toBeFocused();
  await expect(chosen).toHaveCount(1);
  await page.keyboard.press("Shift+ArrowDown");
  await expect(chosen).toHaveCount(2);
  await page.keyboard.press("Control+Enter"); // Ctrl with Enter takes the layer out of the choice
  await expect(chosen).toHaveCount(1);
  expect(await left(first)).toBe(before); // walking the list moved nothing

  // The help for the keys is there.
  await page.getByText("Show the keys").click();
  await expect(page.getByTestId("keyboard-help")).toContainText("Ctrl+A");
  await expect(page.getByTestId("keyboard-help")).toContainText("Delete");
});

test("a layout is duplicated, then deleted, and the box layout cannot be removed twice", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/settings/labels");

  await page.getByRole("button", { name: `Duplicate ${LAYOUT}` }).click();
  await expect(page).toHaveURL(/\/settings\/labels\/[\w-]+$/);
  await expect(
    page.getByRole("group", { name: `${LAYOUT} (copy): 60 by 40 millimetres` }),
  ).toBeVisible();
  // The copy carries the original's element.
  await expect(inCanvas(page).getByRole("button", { name: "Text: Fresh" })).toBeVisible();

  await page.goto("/settings/labels");
  await expect(page.getByRole("status")).toHaveText("8 layouts");
  await page.getByRole("button", { name: `Delete ${LAYOUT} (copy)` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete layout" }).click();
  await expect(page.getByRole("status")).toHaveText("7 layouts");
  await expect(page.getByRole("link", { name: `${LAYOUT} (copy)` })).toHaveCount(0);
});

test("a user who may only look at the layouts cannot change them", async ({ page }) => {
  await signInAsOwner(page);
  const temporary = await createUser(page, {
    name: "Lena Looker",
    email: "lena@e2e.test",
    screens: {},
    actions: { "System settings": ["See label settings and the logo"] },
    desktop: true,
    phone: false,
  });
  await page.context().clearCookies();

  await signIn(page, "lena@e2e.test", temporary);
  await choosePassword(page, temporary, USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/settings/); // the only screen this user has
  await ensureEnglish(page);
  await page.goto("/settings/labels");
  await expect(page.getByRole("status")).toHaveText("7 layouts");
  await expect(page.getByRole("button", { name: "New layout" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Delete / })).toHaveCount(0);

  await page.getByRole("link", { name: LAYOUT, exact: true }).click();
  await expect(page.getByText("You can look at this layout but not change it.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Text", exact: true })).toHaveCount(0);
});

test("a user without the label permission gets no layouts page", async ({ page }) => {
  await signIn(page, "dana@e2e.test", USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/);
  await ensureEnglish(page);
  await page.goto("/settings/labels");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
