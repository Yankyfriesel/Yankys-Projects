import { expect, test } from "@playwright/test";
import { signIn, signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

test("three wrong passwords for one email raise a warning with a red number on the menu", async ({
  page,
}) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    await signIn(page, "intruder@e2e.test", `wrong-password-${attempt}`);
    await expect(page.locator("[role=alert]").filter({ hasText: /\S/ }).first()).toBeVisible();
  }

  await signInAsOwner(page);
  await expect(page.getByTestId("nav-badge-admin")).toBeVisible();

  // The menu item opens the security tab, where the new warning waits.
  await page
    .getByRole("link", { name: /System administration|ניהול מערכת/ })
    .first()
    .click();
  await expect(page.getByTestId("alerts-list")).toContainText("intruder@e2e.test");
  await expect(page.getByTestId("alerts-new")).toBeVisible();

  await page.getByTestId("alerts-seen").click();
  await expect(page.getByTestId("alerts-new")).toHaveCount(0);
  await expect(page.getByTestId("nav-badge-admin")).toHaveCount(0);
  // Still listed as history.
  await expect(page.getByTestId("alerts-list")).toContainText("intruder@e2e.test");
});
