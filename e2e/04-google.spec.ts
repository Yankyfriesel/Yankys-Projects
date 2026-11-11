import { expect, test } from "@playwright/test";

// No Google OAuth client exists yet (HANDOFF.md), so the real round trip cannot run here.
// These cover only what the login page does around it. Whether Google really refuses an
// unregistered email, and accepts a registered one, still needs a manual run with a real client.

test("without a Google client the Google button is hidden", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
});

test("a refused Google account is told so on the login page", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: "locale", value: "en", url: baseURL! }]);
  // The code Better Auth sends back when Google signs in an email no admin registered.
  await page.goto("/login?error=email_not_found");
  await expect(page.getByText("This Google account is not registered")).toBeVisible();
});
