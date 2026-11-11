import { expect, type Page } from "@playwright/test";
import { E2E_OWNER, OWNER_NEW_PASSWORD } from "./constants";

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  // Under `next dev` the form hydrates late; clicking earlier submits it as a plain page form.
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("button[type=submit]").click();
}

export async function choosePassword(page: Page, current: string, next: string) {
  await expect(page).toHaveURL(/\/change-password/);
  // After a temporary password the form does not ask for it again.
  if ((await page.locator("#currentPassword").count()) > 0) {
    await page.locator("#currentPassword").fill(current);
  }
  await page.locator("#newPassword").fill(next);
  await page.locator("#confirmPassword").fill(next);
  await page.locator("button[type=submit]").click();
}

/** The language button names the language you will get, so this works from either language. */
export async function ensureEnglish(page: Page) {
  if ((await page.locator("html").getAttribute("lang")) !== "en") {
    await page.getByTitle("English").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  }
}

/** Needs 02-accounts.spec.ts to have run first (it replaces the seed password). */
export async function signInAsOwner(page: Page) {
  await signIn(page, E2E_OWNER.email, OWNER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/);
  await ensureEnglish(page);
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/login/);
}

type Level = "No access" | "View only" | "Everything";

export interface NewUser {
  name: string;
  email: string;
  /** Screen name (as in the menu) to access level. */
  screens: Record<string, Level>;
  /** Single actions to tick on a screen, by the text beside their checkbox. */
  actions?: Record<string, string[]>;
  desktop: boolean;
  phone: boolean;
}

/** Creates a user through the administration screen and returns the temporary password. */
export async function createUser(page: Page, user: NewUser): Promise<string> {
  await page.goto("/admin");
  await page.getByRole("button", { name: "New user" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#user-name").fill(user.name);
  await dialog.locator("#user-email").fill(user.email);
  await dialog.getByRole("radio", { name: "English" }).click();
  for (const [screen, level] of Object.entries(user.screens)) {
    await dialog
      .getByRole("radiogroup", { name: screen, exact: true })
      .getByRole("radio", { name: level })
      .click();
  }
  for (const [screen, labels] of Object.entries(user.actions ?? {})) {
    const row = dialog
      .getByRole("listitem")
      .filter({ has: page.getByRole("radiogroup", { name: screen, exact: true }) });
    await row.getByRole("button", { name: "Single actions" }).click();
    for (const label of labels) await row.getByRole("checkbox", { name: label }).click();
  }
  if (user.desktop) await dialog.getByRole("switch", { name: "Desktop computer" }).click();
  if (user.phone) await dialog.getByRole("switch", { name: "Phone" }).click();
  await dialog.getByRole("button", { name: "Create user" }).click();

  const secret = page.getByRole("dialog").locator("code");
  await expect(secret).toBeVisible();
  const password = (await secret.innerText()).trim();
  await page.getByRole("button", { name: "I gave it to the user" }).click();
  return password;
}

/** The boxes of the item that is open on the inventory screen. */
export const openBoxes = (page: Page) => page.getByTestId("inventory-box");

/** The total number of boxes the inventory summary shows. */
export async function summaryBoxes(page: Page): Promise<number> {
  const text = await page.getByTestId("inventory-summary").innerText();
  return Number(/([\d,]+) box/.exec(text)![1].replace(/,/g, ""));
}

/** Opens the first item that has at least `count` boxes and returns their barcodes. */
export async function openItemWithBoxes(page: Page, count: number): Promise<string[]> {
  const items = page.getByTestId("inventory-item");
  await expect(items.first()).toBeVisible();
  for (let i = 0; i < (await items.count()); i++) {
    await items.nth(i).click();
    await expect(items.nth(i)).toHaveAttribute("aria-expanded", "true");
    const barcodes = await openBoxes(page).evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-barcode")!),
    );
    if (barcodes.length >= count) return barcodes;
  }
  throw new Error(`no item has ${count} boxes`);
}

/** Opens "More filters" on the inventory screen when it is closed. */
export async function openMoreFilters(page: Page) {
  if (!(await page.locator("#inv-barcode").isVisible())) {
    await page.getByText("More filters").click();
  }
}
