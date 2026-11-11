import { expect, test, type Page } from "@playwright/test";
import { signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

const MINUTE = 60_000;

async function chooseSignOutTime(page: Page, label: string) {
  await page.goto("/admin?tab=security");
  await page.getByTestId("idle-minutes").selectOption({ label });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("The sign-out time was saved.")).toBeVisible();
}

test("the sign-out time is set in the system settings and kept", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/admin?tab=security");
  await expect(page.getByTestId("idle-minutes")).toHaveValue("30");
  await chooseSignOutTime(page, "5 minutes");
  await page.reload();
  await expect(page.getByTestId("idle-minutes")).toHaveValue("5");
});

test("a screen left alone is warned, can be kept with one press, and is then signed out", async ({
  page,
}) => {
  await page.clock.install();
  await signInAsOwner(page);
  await page.goto("/dashboard");
  await expect(page.getByTestId("idle-warning")).toHaveCount(0);

  // 4 minutes 15 seconds without touching: the notice appears (it is shown the last minute).
  await page.clock.fastForward(4 * MINUTE + 15_000);
  await expect(page.getByTestId("idle-warning")).toBeVisible();
  await page.getByRole("button", { name: "Stay signed in" }).click();
  await expect(page.getByTestId("idle-warning")).toHaveCount(0);

  // Staying counted as activity: another 4 minutes pass without a sign-out.
  await page.clock.fastForward(4 * MINUTE);
  await expect(page).toHaveURL(/\/dashboard/);

  // Nothing touched for the whole time: signed out, with a message on the login page.
  await page.clock.fastForward(2 * MINUTE);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByTestId("idle-notice")).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("with the time set to never, nobody is signed out; the time is put back to normal", async ({
  page,
}) => {
  await signInAsOwner(page);
  await chooseSignOutTime(page, "Never");
  await page.clock.install();
  await page.goto("/dashboard");
  await page.clock.fastForward(10 * 60 * MINUTE);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId("idle-warning")).toHaveCount(0);
  await chooseSignOutTime(page, "30 minutes");
});

test("an old time of last activity from an earlier visit does not sign a new login out", async ({
  page,
}) => {
  // The browser still holds the time of the last activity from long ago (set once, before the
  // login page loads).
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("seeded")) return;
    window.sessionStorage.setItem("seeded", "1");
    window.localStorage.setItem("northfield.lastActivity", String(Date.now() - 5 * 60 * 60 * 1000));
  });
  await signInAsOwner(page);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await page.waitForTimeout(2500);
  await expect(page).toHaveURL(/\/dashboard/);
});
