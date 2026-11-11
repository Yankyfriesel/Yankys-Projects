import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { E2E_OWNER, OWNER_NEW_PASSWORD } from "./constants";
import { signIn, signInAsOwner, signOut } from "./helpers";

test.describe.configure({ mode: "serial" });

/** The 6-digit code an authenticator app shows now, from the base32 key on the screen. */
function codeNow(base32: string, offsetSteps = 0): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32.toUpperCase().replace(/[=\s]/g, "")) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

let secret = "";

async function askForPassword(page: Page, buttonTestId: string) {
  await page.getByTestId(buttonTestId).click();
  await page.locator("#two-factor-password").fill(OWNER_NEW_PASSWORD);
  await page.getByTestId("two-factor-continue").click();
}

test("two-step verification is turned on from the account page with a code from the phone", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/account");
  await expect(page.getByTestId("two-factor-status")).toContainText("Off");

  await askForPassword(page, "two-factor-start");
  await expect(page.getByRole("img", { name: /authenticator app/ })).toBeVisible();
  secret = (await page.getByTestId("two-factor-secret").innerText()).trim();
  expect(secret.length).toBeGreaterThan(10);
  await expect(page.getByTestId("backup-codes").getByRole("listitem").first()).toBeVisible();

  // A wrong code does not turn it on.
  await page.locator("#two-factor-code").fill("000000");
  await page.getByTestId("two-factor-confirm").click();
  await expect(page.getByText("The code is wrong")).toBeVisible();

  await page.locator("#two-factor-code").fill(codeNow(secret));
  await page.getByTestId("two-factor-confirm").click();
  await page.getByTestId("two-factor-done").click();
  await expect(page.getByTestId("two-factor-status")).toContainText("On");
});

test("the password alone no longer signs in: the code is asked", async ({ page }) => {
  await signIn(page, E2E_OWNER.email, OWNER_NEW_PASSWORD);
  await expect(page.locator("#code")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  await page.locator("#code").fill("123456");
  await page.locator("#code").press("Enter");
  await expect(page.getByText(/Wrong code|הקוד שגוי/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // The code check allows only a few tries in ten seconds.
  await page.waitForTimeout(11_000);
  await page.locator("#code").fill(codeNow(secret));
  await page.locator("#code").press("Enter");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("it is turned off again from the account page", async ({ page }) => {
  await signIn(page, E2E_OWNER.email, OWNER_NEW_PASSWORD);
  await page.locator("#code").fill(codeNow(secret));
  await page.locator("#code").press("Enter");
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/account");
  await expect(page.getByTestId("two-factor-status")).toContainText("On");
  await page.getByRole("button", { name: "Turn off" }).click();
  await page.locator("#two-factor-password").fill(OWNER_NEW_PASSWORD);
  await page.getByTestId("two-factor-continue").click();
  await expect(page.getByTestId("two-factor-status")).toContainText("Off");

  // Back to the password alone, as every other test expects.
  await signOut(page);
  await signInAsOwner(page);
});
