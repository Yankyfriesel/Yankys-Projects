import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

// A pretend Priority on this computer, so the whole path (settings, sign-in, request, answer) is
// tried without any real key. It accepts one made-up key and answers like Priority would.
const KEY = "E2E-TEST-KEY-0123456789";
let server: Server;
let address: string;
const asked: { method: string; path: string; signedInAs: string }[] = [];
// A key whose account the pretend Priority has locked, like the real one did. Counts the requests it got.
const LOCKED_KEY = "E2E-LOCKED-KEY-0123456789";
let askedWithLockedKey = 0;

function signedInAs(request: IncomingMessage): string {
  const header = request.headers.authorization ?? "";
  return Buffer.from(header.replace(/^Basic /, ""), "base64").toString();
}

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const credentials = signedInAs(request);
    const path = new URL(request.url ?? "/", "http://x").pathname.split("/").pop() ?? "";
    asked.push({ method: request.method ?? "", path, signedInAs: credentials });
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (credentials === `${LOCKED_KEY}:PAT`) {
      askedWithLockedKey += 1;
      return send(429, {
        error: {
          message: "Account locked due to too many failed login attempts. Try again later.",
        },
      });
    }
    if (credentials !== `${KEY}:PAT`) return send(401, { error: { message: "Unauthorized" } });
    if (path === "LOGPART")
      return send(200, {
        value: [
          {
            PARTNAME: "N2015D-S",
            PARTDES: "המבורגר בקר",
            EXPIREDAYS: 12,
            BARCODE: "7290001234567",
          },
        ],
      });
    if (path === "WAREHOUSES")
      return send(404, { error: { message: "Form WAREHOUSES not found" } });
    if (path === "PARTBAL") return send(200, { value: [] });
    return send(404, { error: { message: `Form ${path} not found` } });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  address = `http://127.0.0.1:${(server.address() as AddressInfo).port}/odata/Priority/x.ini/democo`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("the access key is saved without being shown, and the data check asks Priority and reports each form", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/settings?section=priority");

  // Nothing to check before the connection is set up.
  await expect(page.getByRole("button", { name: /^Check LOGPART/ })).toBeDisabled();

  await page.getByRole("button", { name: "Edit connection" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#priority-url").fill(address);
  await dialog.locator("#priority-user").fill(KEY);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  // The key is kept, and is nowhere on the page.
  await expect(page.getByText("A key is saved")).toBeVisible();
  expect(await page.content()).not.toContain(KEY);

  await page.getByRole("button", { name: /^Check LOGPART/ }).click();
  const probes = page.getByTestId("priority-probes");
  await expect(probes).toBeVisible();

  const logpart = probes.locator("details", { hasText: "LOGPART" });
  await expect(logpart).toContainText("4 fields");
  await logpart.locator("summary").click();
  await expect(logpart).toContainText("EXPIREDAYS");
  await expect(logpart).toContainText("N2015D-S");

  const warehouses = probes.locator("details", { hasText: /^WAREHOUSES(?!ZOOM)/ });
  await expect(warehouses).toContainText("404");
  await expect(warehouses).toContainText("Form WAREHOUSES not found");

  await expect(probes.locator("details", { hasText: /^PARTBAL/ })).toContainText("0 fields");

  // Priority was only ever asked to read, and was signed in to with the key and Priority's word.
  expect(asked.length).toBeGreaterThanOrEqual(3);
  expect(asked.every((request) => request.method === "GET")).toBe(true);
  expect(asked.every((request) => request.signedInAs === `${KEY}:PAT`)).toBe(true);
});

test("another form can be asked for, a wrong key is reported, and the details are removed afterwards", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/settings?section=priority");

  await page.locator("#priority-form-name").fill("ORDERS");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByTestId("priority-probes")).toContainText("Form ORDERS not found");

  // A wrong key: Priority says no, and the screen says what Priority said.
  await page.getByRole("button", { name: "Edit connection" }).click();
  await page.getByRole("dialog").locator("#priority-user").fill("WRONG-KEY");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: /^Check LOGPART/ }).click();
  const logpart = page.getByTestId("priority-probes").locator("details", { hasText: "LOGPART" });
  await expect(logpart).toContainText("401");
  await expect(logpart).toContainText("Unauthorized");

  // The log says the connection changed, and never what the key was.
  await page.goto("/admin?tab=log&action=settings.priorityChanged");
  await expect(page.getByRole("row", { name: /priority/i }).first()).toBeVisible();
  expect(await page.content()).not.toContain(KEY);
  expect(await page.content()).not.toContain("WRONG-KEY");

  // Clean up: no key and no address, as before.
  await page.goto("/settings?section=priority");
  await page.getByRole("button", { name: "Edit connection" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: "Remove the saved key" }).click();
  await dialog.locator("#priority-url").fill("");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /^Check LOGPART/ })).toBeDisabled();
});

test("a locked account is asked once, then left alone, and a new key is tried at once", async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto("/settings?section=priority");

  await page.getByRole("button", { name: "Edit connection" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.locator("#priority-url").fill(address);
  await dialog.locator("#priority-user").fill(LOCKED_KEY);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  // The first form is refused as locked; the others are not even asked.
  await page.getByRole("button", { name: /^Check LOGPART/ }).click();
  const probes = page.getByTestId("priority-probes");
  const logpart = probes.locator("details", { hasText: "LOGPART" });
  await expect(logpart).toContainText("429");
  await expect(logpart).toContainText("Account locked due to too many failed login attempts");
  await expect(logpart.getByTestId("priority-refusal")).toContainText("locked the account");
  await expect(probes.locator("details", { hasText: /^WAREHOUSES(?!ZOOM)/ })).toContainText(
    "Not asked",
  );
  await expect(probes.locator("details", { hasText: /^PARTBAL/ })).toContainText("Not asked");
  expect(askedWithLockedKey).toBe(1);

  // Pressing again does not ask Priority anything while it is being left alone.
  await page.getByRole("button", { name: /^Check LOGPART/ }).click();
  await expect(page.getByTestId("priority-check-error")).toContainText(
    "left alone for 30 more minutes",
  );
  expect(askedWithLockedKey).toBe(1);

  // A different key is a fresh try, so it is asked at once.
  await page.getByRole("button", { name: "Edit connection" }).click();
  dialog = page.getByRole("dialog");
  await dialog.locator("#priority-user").fill(KEY);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /^Check LOGPART/ }).click();
  await expect(
    page.getByTestId("priority-probes").locator("details", { hasText: "LOGPART" }),
  ).toContainText("4 fields");
  expect(askedWithLockedKey).toBe(1);

  // Clean up: no key and no address, as before.
  await page.getByRole("button", { name: "Edit connection" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: "Remove the saved key" }).click();
  await dialog.locator("#priority-url").fill("");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
});
