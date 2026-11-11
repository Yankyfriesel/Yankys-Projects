import http from "node:http";
import { expect, test } from "@playwright/test";
import { USER_NEW_PASSWORD } from "./constants";
import { choosePassword, createUser, ensureEnglish, signIn, signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

// A pretend of the service behind the question helper: it records what it was asked.
const ANSWER =
  "1. Press **Print several items**.\n2. Tap the items you want.\n3. Press **Print labels**.";
const asked: Array<{
  key: string;
  body: { system: Array<{ text: string }>; messages: Array<{ content: string }> };
}> = [];
let pretend: http.Server;

test.beforeAll(async () => {
  pretend = http.createServer((request, response) => {
    let data = "";
    request.on("data", (chunk) => (data += chunk));
    request.on("end", () => {
      asked.push({ key: String(request.headers["x-api-key"]), body: JSON.parse(data) });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ content: [{ type: "text", text: ANSWER }] }));
    });
  });
  await new Promise<void>((done) => pretend.listen(3199, "127.0.0.1", done));
});

test.afterAll(async () => {
  await new Promise((done) => pretend.close(done));
});

const MIA = "mia.messenger@e2e.test";

test("someone without any admin permission sends a divided message, and cannot read messages", async ({
  page,
  request,
}) => {
  // Nobody signed out may ask for the count.
  expect((await request.get("/api/messages/unread")).status()).toBe(401);

  await signInAsOwner(page);
  const temporary = await createUser(page, {
    name: "Mia Messenger",
    email: MIA,
    screens: { "Item catalog": "View only" },
    desktop: true,
    phone: false,
  });
  await page.context().clearCookies();
  await signIn(page, MIA, temporary);
  await choosePassword(page, temporary, USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/catalog/);
  await ensureEnglish(page);

  // Ask the helper: the answer comes back, and the question can go on to the admin.
  const question = "How do I print labels for several items?";
  await page.getByTestId("page-help").click();
  await page.getByTestId("help-tab-ask").click();
  await page.locator("#help-question").fill(question);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByTestId("ask-assistant")).toContainText("Print several items");
  expect(asked).toHaveLength(1);
  expect(asked[0].key).toBe("e2e-test-key");
  expect(asked[0].body.messages.at(-1)?.content).toBe(question);
  expect(asked[0].body.system[0].text).toContain("THE MANUAL:");
  expect(asked[0].body.system[1].text).toContain("Item catalog"); // the page she is on
  await page.getByRole("button", { name: "Send this question to the admin" }).click();
  await expect(page.locator("#message-details")).toHaveValue(question);

  // The form is divided: the kind, the screen (the page she is on) and what about it.
  const screen = page.locator("#message-screen");
  await expect(screen).toHaveValue("catalog");
  await page.getByTestId("message-kind-problem").click();
  await page.locator("#message-subject").selectOption("printing");
  await page.getByTestId("message-urgent").click();
  const send = page.getByRole("button", { name: "Send to the admin" });
  await page.locator("#message-details").fill("The item label does not come out of the printer.");
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByTestId("message-sent")).toBeVisible();
  const mine = page.getByTestId("my-messages");
  await expect(mine.locator("li").first()).toContainText("The item label does not come out");
  await expect(mine.locator("li").first()).toContainText("Waiting");
  await expect(mine.locator("li").first()).toContainText("Printing");

  // She has no way into the administration.
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(404);
  expect((await request.get("/api/messages/unread")).status()).toBe(401);
});

test("the administrator sees the message divided, answers it, and the sender reads the answer", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/dashboard");
  // A red number on the Administration menu.
  const menu = page.getByRole("link", { name: /System administration/ });
  await expect(menu).toContainText("1");

  await page.goto("/admin");
  // New messages open the administration on the Messages tab.
  await expect(page).toHaveURL(/tab=messages|\/admin$/);
  await page.goto("/admin?tab=messages");
  // The Users tab can be opened from here even while messages wait.
  await page.locator('a[href="/admin?tab=users"]').first().click();
  await expect(page).toHaveURL(/tab=users/);
  await expect(page.getByTestId("message-card")).toHaveCount(0);
  await page.goto("/admin?tab=messages");
  const card = page.getByTestId("message-card").first();
  await expect(card).toHaveAttribute("data-kind", "problem");
  await expect(card).toContainText("A problem");
  await expect(card).toContainText("Urgent");
  await expect(card).toContainText("Item catalog");
  await expect(card).toContainText("Printing");
  await expect(card).toContainText("Mia Messenger");
  await expect(card).toContainText("The item label does not come out of the printer.");
  await expect(card).toContainText("/catalog");

  await card
    .getByLabel("Your answer (the sender will read it)")
    .fill("Please check the label roll.");
  await card.getByTestId("message-done").click();
  await expect(page.getByTestId("messages-empty")).toBeVisible(); // the "New" list is empty now
  await page.getByTestId("messages-filter-done").click();
  const answered = page.getByTestId("message-card").first();
  await expect(answered).toHaveAttribute("data-status", "done");
  await expect(answered).toContainText("Please check the label roll.");
  await expect(answered).toContainText("Answered by E2E Owner");

  // The answer is in the activity log too.
  await page.goto("/admin?tab=log&action=messages.handled");
  await expect(page.getByRole("row", { name: /Answered a message/ }).first()).toBeVisible();

  // The sender reads the answer in the help window.
  await page.context().clearCookies();
  await signIn(page, MIA, USER_NEW_PASSWORD);
  await expect(page).toHaveURL(/\/catalog/);
  await ensureEnglish(page);
  await page.getByTestId("page-help").click();
  await page.getByTestId("help-tab-message").click();
  const mine = page.getByTestId("my-messages").locator("li").first();
  await expect(mine).toHaveAttribute("data-status", "done");
  await expect(mine).toContainText("Answer from E2E Owner");
  await expect(mine).toContainText("Please check the label roll.");
});
