import { devices, expect, test } from "@playwright/test";
import { USER_NEW_PASSWORD } from "./constants";
import { choosePassword, createUser, signIn, signInAsOwner, ensureEnglish } from "./helpers";

test.describe.configure({ mode: "serial" });

test("a phone-only user cannot use the app from a desktop browser", async ({ page }) => {
  await signInAsOwner(page);
  const temporary = await createUser(page, {
    name: "Pia Phone",
    email: "pia@e2e.test",
    screens: { Dashboard: "View only" },
    desktop: false,
    phone: true,
  });
  await page.context().clearCookies();

  await signIn(page, "pia@e2e.test", temporary);
  await choosePassword(page, temporary, USER_NEW_PASSWORD);
  await ensureEnglish(page);
  await expect(page.getByText("No access from this device")).toBeVisible();
});

test("a desktop-only user cannot use the app from a phone", async ({ page, browser }) => {
  await signInAsOwner(page);
  const temporary = await createUser(page, {
    name: "Dov Desktop",
    email: "dov@e2e.test",
    screens: { Dashboard: "View only" },
    desktop: true,
    phone: false,
  });

  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  const mobile = await phone.newPage();
  await signIn(mobile, "dov@e2e.test", temporary);
  await choosePassword(mobile, temporary, USER_NEW_PASSWORD);
  await ensureEnglish(mobile);
  await expect(mobile.getByText("No access from this device")).toBeVisible();
  await phone.close();
});
