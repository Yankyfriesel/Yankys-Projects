import { expect, test, type Page } from "@playwright/test";
import { signInAsOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

const QR = "NF1|N2015D-S|CERT-88|201026|211026|011126";

async function chooseStandIn(page: Page, mode: "Normal" | "Not answering") {
  await page.goto("/settings?section=priority");
  await page
    .getByRole("radiogroup", { name: "Stand-in control" })
    .getByRole("radio", { name: new RegExp(`^${mode}`) })
    .click();
  await expect(page.getByText("Stand-in behaviour changed").first()).toBeVisible();
}

test("a box saved while Priority is down is listed, then sent by the timer without anyone helping", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await signInAsOwner(page);

  await page.goto("/admin?tab=sends");
  await expect(page.getByTestId("sends-empty")).toBeVisible();

  await chooseStandIn(page, "Not answering");
  try {
    await page.goto("/receiving");
    await expect(page.getByText(/Priority is not answering/).first()).toBeVisible();
    const scan = page.getByLabel("QR code on the item label");
    await scan.fill(QR);
    await scan.press("Enter");
    await page.getByLabel("Weight (simulated scale)").fill("12.3");
    await page.getByRole("button", { name: "Save and print label" }).click();
    await expect(page.getByTestId("saved-notice")).toContainText("will be sent again by itself");
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

    // The box is in the list of what Priority does not have yet.
    await page.goto("/admin?tab=sends");
    const row = page.getByTestId("sends-table").getByRole("row").filter({ hasText: "12.3" });
    await expect(row).toContainText("Retrying");
    await expect(row).toContainText("Priority did not answer");
  } finally {
    await chooseStandIn(page, "Normal");
  }

  // Priority is back. The timer (every 30 seconds) sends the box once its wait is over.
  await expect
    .poll(
      async () => {
        await page.goto("/admin?tab=sends");
        return page.getByTestId("sends-empty").isVisible();
      },
      { timeout: 150_000, intervals: [10_000] },
    )
    .toBe(true);
});
