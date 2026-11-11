import { expect, test, type Page } from "@playwright/test";
import { signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

/** Every page with its own help window: where it is, and a word its window must contain. */
const PAGES: Array<{ path: string; title: string; purpose: RegExp }> = [
  { path: "/dashboard", title: "Dashboard", purpose: /factory at a glance/ },
  { path: "/catalog", title: "Item catalog", purpose: /All the items from Priority/ },
  {
    path: "/receiving",
    title: "Goods receiving",
    purpose: /Receive the boxes made in the factory/,
  },
  { path: "/vendor-receiving", title: "Vendor receiving", purpose: /vendor’s own barcode/ },
  { path: "/inventory", title: "Inventory management", purpose: /never changes stock/ },
  { path: "/inventory/pallets", title: "Pallets", purpose: /fixed group of boxes/ },
  { path: "/settings", title: "Company and labels", purpose: /company logo/ },
  { path: "/settings?section=priority", title: "Priority", purpose: /reaches Priority/ },
  { path: "/settings?section=receiving", title: "Receiving", purpose: /rules for receiving/ },
  {
    path: "/settings?section=hardware",
    title: "Scale",
    purpose: /Connect or disconnect the scale/,
  },
  { path: "/settings/labels", title: "Label layouts", purpose: /label layouts the system prints/ },
  { path: "/admin", title: "Users", purpose: /who can sign in/ },
  { path: "/admin?tab=log", title: "Activity log", purpose: /Everything that happens/ },
  { path: "/admin?tab=sends", title: "Sends to Priority", purpose: /not taken yet/ },
  { path: "/admin?tab=security", title: "Security", purpose: /Keep the system safe/ },
  { path: "/admin?tab=messages", title: "Messages", purpose: /Questions, requests, problems/ },
  { path: "/account", title: "My account", purpose: /Your own password/ },
];

async function checkHelp(page: Page, title: string, purpose: RegExp) {
  const button = page.getByTestId("page-help");
  await expect(button).toBeVisible();
  await button.click();
  const window = page.getByTestId("page-help-window");
  await expect(window).toBeVisible();
  await expect(window.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(window).toContainText(purpose);
  await expect(window).toContainText("What this page is for");
  await expect(window).toContainText("How it works");
  // At least three numbered steps.
  expect(await window.locator("ol > li").count()).toBeGreaterThanOrEqual(2);
  await window.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(window).toBeHidden();
}

test("every page has a question mark that explains the page", async ({ page }) => {
  test.setTimeout(240_000);
  await signInAsOwner(page);
  for (const entry of PAGES) {
    await page.goto(entry.path);
    await page.waitForLoadState("networkidle");
    await checkHelp(page, entry.title, entry.purpose);
  }
});

test("the label editor has one too, and Hebrew has its own texts", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/settings/labels");
  await page.locator("table a").first().click();
  await expect(page.getByTestId("label-canvas")).toBeVisible();
  await checkHelp(page, "Label designer", /Design one label/);

  await page.goto("/dashboard");
  await page.getByTitle("עברית").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await page.getByTestId("page-help").click();
  const window = page.getByTestId("page-help-window");
  await expect(window).toContainText("למה הדף הזה משמש");
  await expect(window).toContainText("המפעל במבט אחד");
  await page
    .getByTestId("page-help-window")
    .getByRole("button", { name: "סגירה", exact: true })
    .last()
    .click();
  // Put the language back for the specs that follow.
  await page.getByTitle("English").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
