import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { USER_NEW_PASSWORD } from "./constants";
import { choosePassword, createUser, ensureEnglish, signIn, signInAsOwner } from "./helpers";

interface SeedItem {
  partname: string;
  partdes: string;
  epartdes: string;
  barcode: string;
  familydes: string;
  expiredays: number;
}

// The stand-in's catalog is this seed file, so the expectations come from it.
const seed: SeedItem[] = JSON.parse(readFileSync("db/seed/priority/items.json", "utf8"));
const total = (n: number) => `Total shown: ${n}`;
// The same alphabetical order the screen uses: Hebrew letters in order, numbers by value.
const abc = new Intl.Collator("he", { numeric: true, sensitivity: "base" });
const byName = (a: SeedItem, b: SeedItem) =>
  abc.compare(a.partdes, b.partdes) || abc.compare(a.partname, b.partname);

test.describe.configure({ mode: "serial" });

test("the owner sees every category as a card, and every item under its category", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/catalog");
  await expect(page.getByRole("heading", { name: "Item catalog" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(total(seed.length));

  // A card for all categories, then one per category with its count.
  const categories = [...new Set(seed.map((i) => i.familydes))];
  const group = page.getByRole("group", { name: "Categories" });
  await expect(group.getByRole("button")).toHaveCount(categories.length + 1);
  await expect(group.getByRole("button").first()).toContainText("All categories");

  // Every item is a card in its category's section, with both names and the item number.
  const sections = page.getByTestId("catalog-section");
  await expect(sections).toHaveCount(categories.length);
  const first = seed[0];
  const section = page.getByRole("region", { name: first.familydes, exact: true });
  const card = section.getByRole("button", { name: `Open ${first.partdes}` });
  await expect(card).toContainText(first.partname);
  await expect(card).toContainText(first.epartdes);
  await expect(section.getByRole("button", { name: /^Open / })).toHaveCount(
    seed.filter((i) => i.familydes === first.familydes).length,
  );
});

test("categories, and the items in each, are in alphabetical order", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/catalog");

  // The category cards after "All categories", and the sections, follow the alphabet.
  const categories = [...new Set(seed.map((i) => i.familydes))].sort(abc.compare);
  const cards = page.getByRole("group", { name: "Categories" }).getByRole("button");
  const names = (await cards.allInnerTexts()).slice(1).map((text) => text.split("\n")[0].trim());
  expect(names).toEqual(categories);
  const headings = (await page.getByTestId("catalog-section").locator("h2").allInnerTexts()).map(
    (text) => text.trim(),
  );
  expect(headings).toEqual(categories);

  // Inside every section the items follow the alphabet of their names.
  for (const category of categories) {
    const expected = seed
      .filter((i) => i.familydes === category)
      .sort(byName)
      .map((i) => `Open ${i.partdes}`);
    const shown = await page
      .getByRole("region", { name: category, exact: true })
      .getByRole("button", { name: /^Open / })
      .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")));
    expect(shown).toEqual(expected);
  }
});

test("a category opens a window with its items, and an item there opens the item", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/catalog");
  const category = seed[0].familydes;
  const inCategory = seed.filter((i) => i.familydes === category).sort(byName);

  await page
    .getByRole("group", { name: "Categories" })
    .getByRole("button", { name: new RegExp(`of ${category}$`) })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: `Items in the category: ${category}` }),
  ).toBeVisible();
  await expect(dialog).toContainText(
    `${inCategory.length === 1 ? "One item" : `${inCategory.length} items`} found in this category.`,
  );
  const cards = dialog.getByTestId("category-items").getByRole("button");
  await expect(cards).toHaveCount(inCategory.length);
  await expect(cards.first()).toContainText(`#${inCategory[0].partname}`);

  // Opening an item there shows the item instead.
  await cards.first().click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: inCategory[0].partdes }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0); // both windows have finished closing

  // The window also closes with its own button.
  await page
    .getByRole("group", { name: "Categories" })
    .getByRole("button", { name: new RegExp(`of ${category}$`) })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Close window" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0); // both windows have finished closing
});

test("search finds items by name, ignoring case, and says when nothing matches", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/catalog");
  const word = seed[0].epartdes.split(" ")[0].toUpperCase();
  const found = seed.filter((i) => i.epartdes.toLowerCase().includes(word.toLowerCase()));
  const search = page.getByRole("searchbox", { name: "Search the catalog" });
  await search.fill(word);
  await expect(page.getByRole("status")).toHaveText(total(found.length));
  await expect(page.getByRole("button", { name: /^Open / })).toHaveCount(found.length);

  await search.fill("no-such-item-anywhere");
  await expect(page.getByText("No item matches.")).toBeVisible();
  await page.getByRole("button", { name: "Show all items" }).click();
  await expect(page.getByRole("status")).toHaveText(total(seed.length));

  // The "all categories" card also brings everything back.
  await search.fill(word);
  await page.getByRole("button", { name: /^All categories/ }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("status")).toHaveText(total(seed.length));
});

test("an item opens to Priority's fields, with a way to print its label", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/catalog");
  const first = seed[0];
  await page.getByRole("button", { name: `Open ${first.partdes}` }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: first.partdes })).toBeVisible();
  await expect(dialog).toContainText(first.partname);
  await expect(dialog).toContainText(first.barcode);
  await expect(dialog).toContainText(first.epartdes);
  await expect(dialog).toContainText(`${first.expiredays} days`);
  await expect(dialog).toContainText("Items are edited only in Priority.");

  // Printing happens in the same window, and cancelling it goes back to the details.
  await dialog.getByRole("button", { name: "Print a label" }).click();
  await expect(dialog.getByRole("heading", { name: "Print item label" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog.getByRole("heading", { name: first.partdes })).toBeVisible();

  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(dialog).toBeHidden();
});

test("a user allowed to see the catalog but not details or printing gets boxes that do not open", async ({
  page,
}) => {
  await signInAsOwner(page);
  const temporary = await createUser(page, {
    name: "Cleo Catalog",
    email: "cleo@e2e.test",
    screens: { "Item catalog": "View only" },
    desktop: true,
    phone: false,
  });
  await page.context().clearCookies();

  await signIn(page, "cleo@e2e.test", temporary);
  await choosePassword(page, temporary, USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/catalog/);
  await ensureEnglish(page);

  await expect(page.getByRole("status")).toHaveText(total(seed.length));
  await expect(page.getByText(seed[0].partdes).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Open / })).toHaveCount(0);
  await expect(page.getByText("click a box")).toHaveCount(0);
});
