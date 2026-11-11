import { expect, test } from "@playwright/test";
import { E2E_OWNER } from "./constants";
import { signIn } from "./helpers";

// Runs first: the seed password is still in place, so the owner's first login is the forced change.

test("login page is Hebrew and right to left by default", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("the password is shown only while the eye is pressed and held", async ({ page }) => {
  await page.goto("/login");
  const box = page.locator("#password");
  await box.fill("secret-123");
  await expect(box).toHaveAttribute("type", "password");
  const eye = page.getByTestId("reveal-password");
  await eye.hover();
  await page.mouse.down();
  await expect(box).toHaveAttribute("type", "text");
  await expect(box).toHaveValue("secret-123");
  await page.mouse.up();
  await expect(box).toHaveAttribute("type", "password");
});

test("a wrong password is refused", async ({ page }) => {
  await signIn(page, E2E_OWNER.email, "not-the-password");
  await expect(page).toHaveURL(/\/login/);
  // The exact message, not only the URL: a form that was never sent also stays on the login page,
  // and a generic "sign-in failed" would mean the request itself broke.
  await expect(
    page.getByRole("alert").filter({ hasText: "האימייל או הסיסמה שגויים" }),
  ).toBeVisible();
});

test("the seeded owner must choose a new password on first login", async ({ page }) => {
  await signIn(page, E2E_OWNER.email, E2E_OWNER.password);
  await expect(page).toHaveURL(/\/change-password/);
});

test("a signed-out visitor is sent to the login page", async ({ page }) => {
  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/login/);
});
