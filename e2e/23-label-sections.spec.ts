import { expect, test, type Page } from "@playwright/test";
import { signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

const LAYOUT = "E2E sections label";

const canvasOf = (page: Page) => page.getByTestId("label-canvas");
const selectedPanel = (page: Page) => page.getByRole("region", { name: "Selected element" });
const addPanel = (page: Page) => page.getByRole("region", { name: "Add to the label" });
const DATE = /\d{2}\/\d{2}\/\d{4}/g;

/** How many lines of the drawn boxes have a line under them of this kind (dotted, solid). */
const separators = (page: Page, kind: string) =>
  canvasOf(page).evaluate(
    (canvas, wanted) =>
      [...canvas.querySelectorAll<HTMLElement>("div[dir]")].filter((row) => {
        const style = getComputedStyle(row);
        return style.borderBottomStyle === wanted && parseFloat(style.borderBottomWidth) > 0;
      }).length,
    kind,
  );

/** What is drawn on the label, as text (the drawn elements, not the frames laid over them). */
async function drawn(page: Page): Promise<string> {
  return canvasOf(page).innerText();
}

test("every detail can be put on the label with one press, with the item names and the dates ready-made", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await page.getByRole("button", { name: "New layout" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(LAYOUT);
  await dialog.getByRole("button", { name: "Create and open" }).click();
  await expect(canvasOf(page)).toBeVisible();

  // Every detail of an item label is a button of its own; a pallet's details are not offered here.
  const details = addPanel(page).getByTestId("add-details");
  for (const key of [
    "itemNumber",
    "name",
    "nameEn",
    "itemBarcode",
    "category",
    "weightAvg",
    "shelfLife",
    "storageText",
    "packingCode",
    "origin",
    "slaughterDate",
    "productionDate",
    "expiryDate",
    "weightKg",
    "certificateNo",
    "runningNumber",
    "boxBarcode",
  ]) {
    await expect(details.locator(`[data-detail=${key}]`)).toBeVisible();
  }
  await expect(details.locator("[data-detail=palletNumber]")).toHaveCount(0);

  // The names in Hebrew and in English, ready-made, each in its own writing.
  await addPanel(page).getByRole("button", { name: "Item name (Hebrew)" }).click();
  await expect(canvasOf(page).getByRole("button", { name: "Field: Name (Hebrew)" })).toBeVisible();
  await expect(selectedPanel(page).getByRole("radio", { name: "Hebrew" })).toBeChecked();
  await addPanel(page).getByRole("button", { name: "Item name (English)" }).click();
  await expect(canvasOf(page).getByRole("button", { name: "Field: Name (English)" })).toBeVisible();
  await expect(selectedPanel(page).getByRole("radio", { name: "English" })).toBeChecked();

  // Any other detail is one press too.
  await details.locator("[data-detail=origin]").click();
  await expect(
    canvasOf(page).getByRole("button", { name: "Field: Country of origin" }),
  ).toBeVisible();
});

test("the dates are one box, written day/month/year, and every line of it can be designed", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await page.getByRole("link", { name: LAYOUT, exact: true }).click();
  await expect(canvasOf(page)).toBeVisible();

  await addPanel(page).getByRole("button", { name: "Dates box" }).click();
  const box = canvasOf(page).getByRole("button", { name: /^Lines box:/ });
  await expect(box).toBeVisible();

  // Three dates in one frame, each as DD/MM/YYYY and none as year-month-day.
  const text = await drawn(page);
  expect(text).toContain("תאריך שחיטה:");
  expect(text).toContain("תאריך ייצור:");
  expect(text).toContain("תאריך תפוגה:");
  expect(text.match(DATE)).toHaveLength(3);
  expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  // A dotted line between the three lines, as in the photo (two lines for three rows).
  await expect.poll(() => separators(page, "dotted")).toBe(2);

  // The box is one element that can be sized: width and height are typed in.
  const panel = selectedPanel(page);
  await expect(panel.getByTestId("lines-properties")).toBeVisible();
  await panel.getByLabel("Width (mm)").fill("52");
  await panel.getByLabel("Height (mm)").fill("18");
  await expect(panel.getByLabel("Width (mm)")).toHaveValue("52");
  const frame = (await box.boundingBox())!;
  const canvas = (await canvasOf(page).boundingBox())!;
  const scale = canvas.width / 100;
  expect(frame.width / scale).toBeCloseTo(52, 0);
  expect(frame.height / scale).toBeCloseTo(18, 0);

  // The frame, the corners and what lies between the lines are set for the whole box.
  await panel.getByLabel("Frame (mm, 0 = none)").fill("0.8");
  await panel.getByLabel("Rounded corners (mm)").fill("4");
  await panel.getByRole("radio", { name: "Solid" }).click();
  await expect(panel.getByRole("radio", { name: "Solid" })).toBeChecked();
  await expect.poll(() => separators(page, "solid")).toBe(2);
  await expect.poll(() => separators(page, "dotted")).toBe(0);

  // Each line has its own words, value, typeface, size and writing.
  const second = panel.getByRole("group", { name: "Line 2" });
  await second.getByLabel("Words before the value").fill("תאריך ייצור חדש:");
  await second.getByLabel("Size (pt)").fill("14");
  await second.getByRole("button", { name: "Bold" }).click();
  await expect(second.getByRole("button", { name: "Bold" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect.poll(() => drawn(page)).toContain("תאריך ייצור חדש:");

  // A line with words before its value is spread across, or set together in the centre.
  await second.getByRole("radio", { name: "Center" }).click();
  await expect
    .poll(() =>
      canvasOf(page).evaluate(
        (canvas) =>
          [...canvas.querySelectorAll<HTMLElement>("div[dir]")].filter(
            (row) => getComputedStyle(row).justifyContent === "center",
          ).length,
      ),
    )
    .toBe(1);

  // A line can show any detail, or a text typed in the designer.
  const third = panel.getByRole("group", { name: "Line 3" });
  await third.getByLabel("Shows").selectOption({ label: "A text typed here" });
  await third.getByLabel("Text", { exact: true }).fill("שמור בקירור");
  await expect.poll(() => drawn(page)).toContain("שמור בקירור");
  expect((await drawn(page)).match(DATE)).toHaveLength(2);

  // Lines are moved, taken away and added.
  await panel.getByRole("button", { name: "Move line 1 down" }).click();
  await expect
    .poll(async () => {
      const now = await drawn(page);
      return now.indexOf("תאריך ייצור חדש:") < now.indexOf("תאריך שחיטה:");
    })
    .toBe(true);
  await panel.getByRole("button", { name: "Remove line 3" }).click();
  await expect(panel.getByRole("group", { name: /^Line / })).toHaveCount(2);
  await panel.getByRole("button", { name: "Add a line" }).click();
  await expect(panel.getByRole("group", { name: /^Line / })).toHaveCount(3);

  // The last line cannot be removed: a box keeps at least one.
  await panel.getByRole("button", { name: "Remove line 3" }).click();
  await panel.getByRole("button", { name: "Remove line 2" }).click();
  await expect(panel.getByRole("button", { name: "Remove line 1" })).toBeDisabled();
});

test("a warning box shows the storage text or a text of its own, and it is saved and printed", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed += 1;
    };
  });
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await page.getByRole("link", { name: LAYOUT, exact: true }).click();
  await expect(canvasOf(page)).toBeVisible();
  // The dates box of the earlier test was not saved: start over with the warning box.
  await expect(page.getByRole("button", { name: /^Lines box:/ })).toHaveCount(0);

  await addPanel(page).getByRole("button", { name: "Warning box" }).click();
  await expect(canvasOf(page).getByRole("button", { name: /^Lines box: אזהרה/ })).toBeVisible();
  const panel = selectedPanel(page);
  await expect(panel.getByRole("group", { name: "Line 1" }).getByLabel("Shows")).toHaveValue(
    "storageText",
  );

  // Its own text, in place of what Priority says about storage.
  const line = panel.getByRole("group", { name: "Line 1" });
  await line.getByLabel("Shows").selectOption({ label: "A text typed here" });
  await line.getByLabel("Text", { exact: true }).fill("להגיש לאחר חימום");
  await expect.poll(() => drawn(page)).toContain("להגיש לאחר חימום");

  // And the dates box next to it, then everything is saved.
  await addPanel(page).getByRole("button", { name: "Dates box" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Layout saved")).toBeVisible();
  await page.reload();
  const text = await drawn(page);
  expect(text).toContain("להגיש לאחר חימום");
  expect(text).toContain("תאריך שחיטה:");
  expect(text.match(DATE)).toHaveLength(3);

  // The test print draws the same boxes at real size, the dates again as DD/MM/YYYY.
  await page.getByRole("button", { name: "Test print" }).click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  const printed = await page.locator("#label-print-root").innerText();
  expect(printed).toContain("להגיש לאחר חימום");
  expect(printed.match(DATE)).toHaveLength(3);
  expect(printed).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
});

test("the box label is made complete with one press: name, weight, dates, barcode and storage text", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await page.getByRole("link", { name: "תווית ארגז", exact: true }).click();
  await expect(canvasOf(page)).toBeVisible();

  // It replaces what is there, after asking.
  page.once("dialog", (dialog) => dialog.accept());
  await addPanel(page)
    .getByRole("button", { name: /^Complete box label/ })
    .click();
  await expect(page.getByLabel("Width (mm)").first()).toHaveValue("100");
  const text = await drawn(page);
  expect(text).toContain("משקל");
  expect(text).toContain("ק״ג");
  expect(text).toContain("תאריך שחיטה:");
  expect(text.match(DATE)).toHaveLength(3);
  await expect(canvasOf(page).getByRole("button", { name: /^Barcode/ })).toBeVisible();
  if (process.env.SCREENSHOTS)
    await canvasOf(page).screenshot({ path: "data/screenshots/box-label-complete.png" });
});

test("a category's storage text is saved in the settings and kept", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/settings?section=receiving");
  const box = page.getByLabel(/^Storage text for/).first();
  await box.fill("יש לשמור בטמפ׳ של 18- מעלות\nאין להפשיר ולהקפיא בשנית");
  await box.blur();
  await expect(page.getByText("Storage text saved").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/^Storage text for/).first()).toHaveValue(
    "יש לשמור בטמפ׳ של 18- מעלות\nאין להפשיר ולהקפיא בשנית",
  );
  // Emptied again, so the categories keep only Priority's own texts for the tests after this.
  await page
    .getByLabel(/^Storage text for/)
    .first()
    .fill("");
  await page
    .getByLabel(/^Storage text for/)
    .first()
    .blur();
  await expect(page.getByText("Storage text saved").first()).toBeVisible();
});

test("the premium item label for ready-printed paper is there to print on", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await page.getByRole("link", { name: "תווית פרימיום (על נייר מודפס)", exact: true }).click();
  await expect(canvasOf(page)).toBeVisible();
  await expect(page.getByLabel("Height (mm)").first()).toHaveValue("245");
  const text = await drawn(page);
  expect(text).toContain("ארץ מקור:");
  expect(text).toContain("לשימוש עד:");
  expect(text.match(DATE)).toHaveLength(3);
  if (process.env.SCREENSHOTS) {
    // The whole label is tall: a tall window shows all of it.
    await page.setViewportSize({ width: 1280, height: 2600 });
    await page.waitForTimeout(800);
    await canvasOf(page).screenshot({ path: "data/screenshots/premium-item-label.png" });
  }
});

test("the country of origin is typed at each print and printed on the premium label", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed += 1;
    };
  });
  await signInAsOwner(page);
  await page.goto("/catalog");
  await page
    .getByRole("button", { name: /^Open / })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Print a label" }).click();
  await dialog
    .getByTestId("layout-option")
    .filter({ hasText: "תווית פרימיום (על נייר מודפס)" })
    .click();
  await dialog.getByLabel("Slaughter date").fill("2026-10-20");
  await dialog.getByLabel("Production certificate number").fill("CERT-1");
  await dialog.getByLabel("Country of origin").fill("פולין");
  await dialog.getByRole("button", { name: "Print", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed))
    .toBe(1);
  const printed = await page.locator("#label-print-root").innerText();
  expect(printed).toContain("ארץ מקור:");
  expect(printed).toContain("פולין");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
});

test("what is chosen is put in the middle of the label with one press", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await page.getByRole("link", { name: LAYOUT, exact: true }).click();
  await expect(canvasOf(page)).toBeVisible();
  await addPanel(page).getByRole("button", { name: "Dates box" }).click();
  const panel = selectedPanel(page);
  await panel.getByLabel("Width (mm)").fill("40");
  await panel.getByLabel("Height (mm)").fill("10");
  await panel.getByLabel("From the left (mm)").fill("3");
  await panel.getByLabel("From the top (mm)").fill("2");

  await panel.getByRole("button", { name: "Center across the label" }).click();
  await expect(panel.getByLabel("From the left (mm)")).toHaveValue("30"); // (100 - 40) / 2
  await panel.getByRole("button", { name: "Center up and down" }).click();
  await expect(panel.getByLabel("From the top (mm)")).toHaveValue("25"); // (60 - 10) / 2
});

test("an item label chosen as the default is ready when printing, and can still be changed", async ({
  page,
}) => {
  const PREMIUM = "תווית פרימיום (על נייר מודפס)";
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await page.getByRole("button", { name: `Make ${PREMIUM} the default item label` }).click();
  await expect(page.getByTestId("default-layout")).toHaveCount(1);

  await page.goto("/catalog");
  await page
    .getByRole("button", { name: /^Open / })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Print a label" }).click();
  const chosen = dialog.locator("[data-chosen=true]");
  await expect(chosen).toHaveCount(1);
  await expect(chosen).toContainText(PREMIUM);
  // Another label for this print only.
  await dialog.getByTestId("layout-option").filter({ hasText: "תווית פריט" }).click();
  await expect(chosen).toContainText("תווית פריט");

  // Back to no default, as the other tests expect.
  await page.goto("/settings/labels");
  await page.getByRole("button", { name: `Stop ${PREMIUM} being the default` }).click();
  await expect(page.getByTestId("default-layout")).toHaveCount(0);
});

test("the meat item label for ready-printed paper is there at 100 × 160 mm", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await page.getByRole("link", { name: "תווית בשר 100×160 (על נייר מודפס)", exact: true }).click();
  await expect(canvasOf(page)).toBeVisible();
  await expect(page.getByLabel("Height (mm)").first()).toHaveValue("160");
  const text = await drawn(page);
  expect(text).toContain("ארץ מקור:");
  expect(text.match(DATE)).toHaveLength(3);
  if (process.env.SCREENSHOTS) {
    await page.setViewportSize({ width: 1280, height: 1800 });
    await page.waitForTimeout(800);
    await canvasOf(page).screenshot({ path: "data/screenshots/meat-item-label.png" });
  }
});

test("a label text can be set in one of the extra typefaces with Hebrew", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await page.getByRole("link", { name: LAYOUT, exact: true }).click();
  await expect(canvasOf(page)).toBeVisible();
  await addPanel(page).getByRole("button", { name: "Item name (Hebrew)" }).click();

  const typeface = selectedPanel(page).getByLabel("Typeface");
  // Twenty more than the three of the screens.
  await expect(typeface.locator("option")).toHaveCount(23);
  await typeface.selectOption({ label: "Rubik" });
  await expect
    .poll(() =>
      canvasOf(page).evaluate((canvas) =>
        [...canvas.querySelectorAll<HTMLElement>("div[dir]")]
          .map((node) => getComputedStyle(node).fontFamily)
          .join(" | "),
      ),
    )
    .toMatch(/Rubik/);
});

test("the days from slaughter to expiry are set per category in the receiving settings", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/settings?section=receiving");
  const box = page.getByLabel(/^Days from slaughter to expiry for/).first();
  await box.fill("45");
  await box.press("Enter");
  await expect(page.getByText("Days to expiry saved").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/^Days from slaughter to expiry for/).first()).toHaveValue("45");

  // A wrong number is refused and the old one stays.
  const again = page.getByLabel(/^Days from slaughter to expiry for/).first();
  await again.fill("0");
  await again.press("Enter");
  await expect(
    page.getByText("Enter a whole number of days from 1 to 3650.").first(),
  ).toBeVisible();
  await expect(again).toHaveValue("45");

  // Emptied again, so the other tests keep each item's own days.
  await again.fill("");
  await again.press("Enter");
  await expect(page.getByText("Days to expiry saved").first()).toBeVisible();
});
