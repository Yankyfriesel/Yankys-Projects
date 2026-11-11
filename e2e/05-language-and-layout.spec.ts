import { expect, test, type Page } from "@playwright/test";
import { signIn, signInAsOwner, signOut } from "./helpers";
import { E2E_OWNER, OWNER_NEW_PASSWORD } from "./constants";

test.describe.configure({ mode: "serial" });

const SCREENS = [
  "/dashboard",
  "/catalog",
  "/receiving",
  "/vendor-receiving",
  "/inventory",
  "/settings",
  "/admin",
];

async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("the language choice switches direction and survives sign-out and sign-in", async ({
  page,
}) => {
  await signInAsOwner(page); // English, left to right
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

  await page.getByTitle("עברית").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  await page.getByRole("button", { name: "יציאה" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await page.context().clearCookies(); // only the saved user choice may bring the language back

  await signIn(page, E2E_OWNER.email, OWNER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  await page.getByTitle("English").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await signOut(page);
});

for (const [label, size] of [
  ["phone", { width: 375, height: 812 }],
  ["desktop", { width: 1280, height: 800 }],
] as const) {
  test(`every screen fits the ${label} width in both languages`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/login");
    await expectNoSideScroll(page);

    await signIn(page, E2E_OWNER.email, OWNER_NEW_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/);

    // The owner is in English here. Hebrew first, then back to English so the next test starts the same.
    for (const lang of ["he", "en"] as const) {
      // The button sits in the side menu: always on screen on a desktop, behind the menu button on a phone.
      const switchButton = page
        .locator(`button[title="${lang === "he" ? "עברית" : "English"}"]:visible`)
        .first();
      if (!(await switchButton.isVisible())) {
        await page
          .getByRole("button", { name: lang === "he" ? "Open the menu" : "פתיחת התפריט" })
          .click();
      }
      await switchButton.click();
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      const dir = lang === "he" ? "rtl" : "ltr";
      for (const path of SCREENS) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("dir", dir);
        await expectNoSideScroll(page);
      }
    }
  });
}
