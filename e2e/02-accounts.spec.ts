import { expect, test } from "@playwright/test";
import { E2E_OWNER, OWNER_NEW_PASSWORD, USER_NEW_PASSWORD } from "./constants";
import {
  choosePassword,
  createUser,
  signIn,
  signInAsOwner,
  signOut,
  ensureEnglish,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test("the owner replaces the seed password and reaches the dashboard", async ({ page }) => {
  await signIn(page, E2E_OWNER.email, E2E_OWNER.password);
  await choosePassword(page, E2E_OWNER.password, OWNER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("a new user must change the temporary password, then sees only the screens they were given", async ({
  page,
}) => {
  await signInAsOwner(page);
  const temporary = await createUser(page, {
    name: "Dana Dashboard",
    email: "dana@e2e.test",
    screens: { Dashboard: "View only" },
    desktop: true,
    phone: true,
  });
  await signOut(page);

  await signIn(page, "dana@e2e.test", temporary);
  await expect(page).toHaveURL(/\/change-password/);

  // Mismatched confirmation is refused.
  // The temporary password is not asked for again after signing in with it.
  await expect(page.locator("#currentPassword")).toHaveCount(0);
  await page.locator("#newPassword").fill(USER_NEW_PASSWORD);
  await page.locator("#confirmPassword").fill("something-else-entirely");
  await page.locator("button[type=submit]").click();
  await expect(page.getByRole("alert").filter({ hasText: "do not match" })).toBeVisible();

  // The form clears itself after a refused attempt; fill it again only once the answer is in.
  await choosePassword(page, temporary, USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/);
  await ensureEnglish(page);

  const menu = page.getByRole("navigation", { name: "Main navigation" });
  await expect(menu.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Inventory management" })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "System administration" })).toHaveCount(0);

  // The hidden screen is "not found", not "forbidden".
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("resetting a password signs the user out on their other browser", async ({
  page,
  browser,
}) => {
  await signInAsOwner(page);
  const temporary = await createUser(page, {
    name: "Rafi Reset",
    email: "rafi@e2e.test",
    screens: { Dashboard: "View only" },
    desktop: true,
    phone: false,
  });

  // Rafi signs in on a second browser and finishes the first-login change.
  const other = await browser.newContext();
  const rafi = await other.newPage();
  await signIn(rafi, "rafi@e2e.test", temporary);
  await choosePassword(rafi, temporary, USER_NEW_PASSWORD);
  await expect(rafi).toHaveURL(/\/dashboard/);

  // The owner resets Rafi's password.
  await page.goto("/admin");
  const card = page.getByTestId("user-card").filter({ hasText: "Rafi Reset" });
  // Each user's card shows the screens they may open and the devices they may use.
  await expect(card.getByTestId("user-screens")).toBeVisible();
  await expect(card.getByTestId("user-devices")).toBeVisible();
  await card.getByRole("button", { name: "Actions for Rafi Reset" }).click();
  await page.getByRole("menuitem", { name: "Reset password" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Reset/ }).last().click();
  await expect(page.getByRole("button", { name: "I gave it to the user" })).toBeVisible();

  // Rafi's old session is gone at once.
  await rafi.goto("/dashboard");
  await expect(rafi).toHaveURL(/\/login/);
  await other.close();
});

test("a user with history is deleted only after a warning, and the history stays", async ({
  page,
}) => {
  await signInAsOwner(page);
  const temporary = await createUser(page, {
    name: "Gil Gone",
    email: "gil@e2e.test",
    screens: { Dashboard: "View only" },
    desktop: true,
    phone: true,
  });
  // Gil signs in, which is history in the activity log.
  await page.context().clearCookies();
  await signIn(page, "gil@e2e.test", temporary);
  await choosePassword(page, temporary, USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().clearCookies();

  await signInAsOwner(page);
  await page.goto("/admin");
  const card = page.getByTestId("user-card").filter({ hasText: "Gil Gone" });
  await card.getByRole("button", { name: "Actions for Gil Gone" }).click();
  await page.getByRole("menuitem", { name: "Delete user" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  // The warning: the user stays until it is confirmed again.
  await expect(dialog.getByTestId("history-warning")).toContainText("has history in the system");
  await expect(card).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: "Actions for Gil Gone" }).click();
  await page.getByRole("menuitem", { name: "Delete user" }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog.getByTestId("history-warning")).toBeVisible();
  await dialog.getByRole("button", { name: "Delete anyway" }).click();
  await expect(page.getByText("User deleted")).toBeVisible();
  await expect(page.getByTestId("user-card").filter({ hasText: "Gil Gone" })).toHaveCount(0);

  // His history is still in the activity log, under his name.
  await page.goto("/admin?tab=log");
  await expect(page.getByText("Gil").first()).toBeVisible();
});
