import { readFileSync, mkdirSync, rmSync } from "node:fs";
import http from "node:http";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

/**
 * Takes the pictures for the manual, in English and in Hebrew, from a private copy of the system
 * with made-up data (manual/server.sh). Numbered red marks are drawn on the page before a picture
 * is taken, so the text of the manual can say "see 1, 2, 3".
 */

const ITEM_QR = "NF1|N2015D-S|CERT-77|051126|061126|171126";
const SECOND_QR = "NF1|N2015D-S|CERT-78|051126|061126|171126";
const OWNER = { email: "manager@example.com", first: "e2e-owner-password", next: "Tz7!kQm29rLw" };
const NEW_USER_PASSWORD = "Vh4#wPn83xYd";
const OUT = "manual/shots";

type Lang = "en" | "he";
const messages: Record<Lang, unknown> = {
  en: JSON.parse(readFileSync("messages/en.json", "utf8")),
  he: JSON.parse(readFileSync("messages/he.json", "utf8")),
};
const seedItems: Array<{ partname: string; barcode: string }> = JSON.parse(
  readFileSync("db/seed/priority/items.json", "utf8"),
);
const TAIL = seedItems.find((i) => i.partname === "N2015D-S")!.barcode.slice(-7);

function lookup(lang: Lang, key: string): string {
  let node: unknown = messages[lang];
  for (const part of key.split(".")) node = (node as Record<string, unknown>)?.[part];
  if (typeof node !== "string") throw new Error(`no message ${key} in ${lang}`);
  return node;
}

class Ctx {
  where = "";
  constructor(
    public page: Page,
    public lang: Lang,
  ) {}
  t(key: string, vars: Record<string, string | number> = {}): string {
    return lookup(this.lang, key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
  }
  text(key: string, exact = true): Locator {
    return this.page.getByText(this.t(key), { exact }).first();
  }
  button(key: string, vars: Record<string, string | number> = {}, exact = true): Locator {
    return this.page.getByRole("button", { name: this.t(key, vars), exact }).first();
  }
}

let current: Ctx;
const problems: string[] = [];

async function step(name: string, body: () => Promise<void>) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return;
  try {
    await body();
  } catch (error) {
    const message = `${current.lang} · ${name}: ${(error as Error).message.split("\n").slice(0, 3).join(" | ")}`;
    problems.push(message);
    console.log(`!! ${message}`);
    await current.page.keyboard.press("Escape").catch(() => undefined);
    await unmark(current.page).catch(() => undefined);
  }
}

/** Draws numbered red marks around elements, in page coordinates. */
async function mark(
  page: Page,
  targets: Array<Locator | null | undefined>,
  area: { min: number; max: number },
) {
  const rects: Array<{ n: number; x: number; y: number; w: number; h: number }> = [];
  for (const [index, target] of targets.entries()) {
    if (!target) continue;
    try {
      await target.first().waitFor({ state: "visible", timeout: 2500 });
      const box = await target.first().boundingBox();
      if (box) {
        const pad = box.height < 44 || box.width < 120 ? 7 : 2;
        rects.push({
          n: index + 1,
          x: box.x - pad,
          y: box.y - pad,
          w: box.width + pad * 2,
          h: box.height + pad * 2,
        });
      }
    } catch {
      problems.push(`${current.lang} · mark ${index + 1} not found (${current.where})`);
    }
  }
  const rtl = (await page.locator("html").getAttribute("dir")) === "rtl";
  await page.evaluate(
    ({ rects, rtl, area }) => {
      const root = document.createElement("div");
      root.id = "manual-marks";
      document.body.appendChild(root);
      const sx = window.scrollX;
      const sy = window.scrollY;
      for (const r of rects) {
        const box = document.createElement("div");
        box.style.cssText = `position:absolute;left:${r.x + sx - 3}px;top:${r.y + sy - 3}px;width:${r.w + 6}px;height:${r.h + 6}px;border:3px solid #d62828;border-radius:10px;pointer-events:none;z-index:2147483000;box-shadow:0 0 0 1px #fff;`;
        const badge = document.createElement("div");
        badge.textContent = String(r.n);
        const size = 28;
        const fitsOutside = rtl ? r.x + r.w + 8 + size <= area.max : r.x - size - 8 >= area.min;
        let left = rtl ? r.x + sx + r.w + 8 : r.x + sx - size - 8;
        if (!fitsOutside) left = rtl ? r.x + sx + r.w - size - 8 : r.x + sx + 8;
        const top = r.h > 56 ? r.y + sy + 8 : r.y + sy + r.h / 2 - size / 2;
        badge.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:28px;height:28px;border-radius:50%;background:#d62828;color:#fff;font:700 15px/28px Arial,sans-serif;text-align:center;pointer-events:none;z-index:2147483001;box-shadow:0 0 0 2px #fff;`;
        root.append(box, badge);
      }
    },
    { rects, rtl, area },
  );
}

async function unmark(page: Page) {
  await page.evaluate(() => document.getElementById("manual-marks")?.remove());
}

interface ShotOptions {
  marks?: Array<Locator | null | undefined>;
  /** Make the window as tall as the page, so the whole page is in the picture. */
  tall?: boolean;
  of?: Locator;
  wait?: number;
  keepScroll?: boolean;
  /** Keep the side menu in the picture (by default it is cropped away, to show the screen larger). */
  keepSidebar?: boolean;
  /** A fixed part of the page, in pixels, for pages without a side menu. */
  clip?: { x: number; y: number; width: number; height: number };
}

async function shot(name: string, options: ShotOptions = {}) {
  const { page, lang } = current;
  current.where = name;
  await page.waitForLoadState("networkidle").catch(() => undefined);
  if (options.tall) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 1280, height: Math.min(Math.max(height, 800), 3200) });
    await page.waitForTimeout(500);
  }
  if (!options.keepScroll && !options.of) await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(options.wait ?? 800);
  let clip = options.clip;
  const size = page.viewportSize()!;
  if (!clip && !options.keepSidebar && !options.of && size.width >= 1000) {
    const rtl = (await page.locator("html").getAttribute("dir")) === "rtl";
    const hasMenu = (await page.locator("nav").count()) > 0;
    if (hasMenu) clip = { x: rtl ? 0 : 230, y: 0, width: size.width - 230, height: size.height };
  }
  if (options.marks) {
    await mark(
      page,
      options.marks,
      clip ? { min: clip.x, max: clip.x + clip.width } : { min: 0, max: size.width },
    );
  }
  const path = `${OUT}/${lang}/${name}.png`;
  if (options.of) await options.of.screenshot({ path });
  else await page.screenshot({ path, clip });
  await unmark(page);
  if (options.tall) await page.setViewportSize({ width: 1280, height: 800 });
}

async function ensureLang(page: Page, lang: Lang) {
  if ((await page.locator("html").getAttribute("lang")) !== lang) {
    await page.getByTitle(lang === "he" ? "עברית" : "English").click();
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
  }
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("button[type=submit]").click();
}

async function choosePassword(page: Page, next: string) {
  await expect(page).toHaveURL(/\/change-password/);
  await page.waitForLoadState("networkidle");
  await page.locator("#newPassword").fill(next);
  await page.locator("#confirmPassword").fill(next);
  await page.locator("button[type=submit]").click();
}

async function setLocaleCookie(page: Page, lang: Lang) {
  await page.context().addCookies([{ name: "locale", value: lang, url: "http://localhost:3100" }]);
}

async function ownerSession(page: Page, lang: Lang) {
  await page.context().clearCookies();
  await setLocaleCookie(page, lang);
  await signIn(page, OWNER.email, OWNER.next);
  const reached = await page
    .waitForURL(/\/dashboard/, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!reached) {
    await signIn(page, OWNER.email, OWNER.first);
    await choosePassword(page, OWNER.next);
    await expect(page).toHaveURL(/\/dashboard/);
  }
  await ensureLang(page, lang);
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

const run = Date.now().toString().slice(-6);

async function captureLogin(browser: Browser, lang: Lang) {
  const context = await browser.newContext({ locale: lang === "he" ? "he-IL" : "en-US" });
  const page = await context.newPage();
  current = new Ctx(page, lang);
  await setLocaleCookie(page, lang);
  await go(page, "/login");
  const card = { x: 430, y: 60, width: 420, height: 680 };
  await shot("01-login", {
    clip: card,
    marks: [page.locator("#email"), page.locator("#password"), page.locator("button[type=submit]")],
  });
  await step("login wrong password", async () => {
    await page.locator("#email").fill(OWNER.email);
    await page.locator("#password").fill("wrong-password-1");
    await page.locator("button[type=submit]").click();
    await page.getByRole("alert").first().waitFor();
    await shot("02-login-wrong", { clip: card });
  });
  await context.close();
}

async function captureNewUser(browser: Browser, lang: Lang, email: string, password: string) {
  const context = await browser.newContext({ locale: lang === "he" ? "he-IL" : "en-US" });
  const page = await context.newPage();
  current = new Ctx(page, lang);
  await setLocaleCookie(page, lang);
  await signIn(page, email, password);
  await page.waitForURL(/\/change-password/);
  await page.waitForLoadState("networkidle");
  await step("first login page", async () => {
    await page.locator("#newPassword").fill(NEW_USER_PASSWORD);
    await page.locator("#confirmPassword").fill(NEW_USER_PASSWORD);
    await shot("03-first-login", {
      clip: { x: 430, y: 40, width: 420, height: 720 },
      marks: [
        page.locator("#newPassword"),
        page.locator("#confirmPassword"),
        page.locator("button[type=submit]"),
      ],
    });
  });
  await page.locator("button[type=submit]").click();
  await page.waitForLoadState("networkidle");
  await step("worker landing", async () => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await shot("04-worker-landing", { keepSidebar: true });
  });
  await context.close();
}

test("pictures for the manual", async ({ page, browser }) => {
  test.setTimeout(2_400_000);
  if (!process.env.ONLY) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(`${OUT}/en`, { recursive: true });
  mkdirSync(`${OUT}/he`, { recursive: true });
  await page.addInitScript(() => {
    window.print = () => undefined;
  });

  const pretend = http.createServer((request, response) => {
    let data = "";
    request.on("data", (chunk) => (data += chunk));
    request.on("end", () => {
      const body = JSON.parse(data) as { system: Array<{ text: string }> };
      const lang: Lang = body.system[0].text.includes("Answer in Hebrew") ? "he" : "en";
      const t = (key: string) => lookup(lang, key);
      const text =
        lang === "en"
          ? `1. Open **${t("nav.catalog")}** and press **${t("catalog.select.start")}**.\n2. Tap the items you want. The bar at the bottom counts them.\n3. Press **${t("catalog.select.print")}**.\n4. Choose one label type for all, fill in each item's slaughter date, certificate number and copies, and press **${t("catalog.print.submit")}**.`
          : `1. פתחו את **${t("nav.catalog")}** ולחצו **${t("catalog.select.start")}**.\n2. הקישו על הפריטים שאתם רוצים. הסרגל בתחתית סופר אותם.\n3. לחצו **${t("catalog.select.print")}**.\n4. בחרו סוג תווית אחד לכולם, מלאו לכל פריט תאריך שחיטה, מספר תעודה ועותקים, ולחצו **${t("catalog.print.submit")}**.`;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ content: [{ type: "text", text }] }));
    });
  });
  await new Promise<void>((done) => pretend.listen(3199, "127.0.0.1", done));

  for (const lang of ["en", "he"] as const) {
    if (process.env.LANG_ONLY && process.env.LANG_ONLY !== lang) continue;
    if (!process.env.ONLY) await captureLogin(browser, lang);
    current = new Ctx(page, lang);
    await ownerSession(page, lang);
    await captureApp(page, browser, lang);
  }

  await new Promise((done) => pretend.close(done));
  console.log("\nPROBLEMS:\n" + (problems.join("\n") || "none"));
});

const finishPrint = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

async function captureApp(page: Page, browser: Browser, lang: Lang) {
  const c = new Ctx(page, lang);
  current = c;
  const email = `ronit.${lang}.${run}@example.com`;
  const workerName = lang === "he" ? "רונית לוי" : "Ronit Levy";

  // ------------------------------------------------------------------- dashboard and the shell
  await step("dashboard", async () => {
    await go(page, "/dashboard");
    await shot("10-dashboard", {
      marks: [
        c.button("dashboard.refresh"),
        page.getByText(c.t("dashboard.stats.weight"), { exact: true }).first(),
        page.getByText(c.t("dashboard.stats.attention"), { exact: true }).first(),
        page.getByTestId("dashboard-rooms"),
        c.button("rooms.arrange"),
        page.getByTestId("page-help"),
      ],
    });
  });
  await step("dashboard open", async () => {
    await page.getByTestId("attention-list").first().locator("summary").first().click();
    await page.getByTestId("attention-line").first().locator("summary").click();
    await shot("11-dashboard-open", { tall: true });
  });
  await step("menu", async () => {
    await go(page, "/dashboard");
    await shot("12-menu", {
      keepSidebar: true,
      marks: [
        page.getByRole("navigation").first(),
        page.getByTitle(lang === "he" ? "English" : "עברית"),
        page.locator("aside, [data-sidebar]").getByText("Dana Cohen").first(),
      ],
    });
  });
  await step("page help", async () => {
    await go(page, "/receiving");
    await page.getByTestId("page-help").click();
    const help = page.getByTestId("page-help-window");
    await help.waitFor();
    await page.waitForTimeout(600);
    await shot("15-page-help", { of: help });
    await page.keyboard.press("Escape");
  });
  await step("arrange rooms", async () => {
    await go(page, "/dashboard");
    await c.button("rooms.arrange").click();
    await page.waitForTimeout(1200);
    await shot("13-arrange-rooms", { marks: [c.button("rooms.done")] });
    await c.button("rooms.cancel").click();
  });

  // ---------------------------------------------------------------------------------- catalog
  await step("catalog", async () => {
    await go(page, "/catalog");
    await shot("20-catalog", {
      marks: [
        page.getByRole("searchbox"),
        page.getByRole("group").first(),
        c.button("catalog.select.start"),
        page.getByRole("button", { name: /^(Open|פתיחת) / }).first(),
      ],
    });
  });
  await step("catalog item", async () => {
    await page
      .getByRole("button", { name: /^(Open|פתיחת) / })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await shot("21-catalog-item", { marks: [c.button("catalog.details.printLabel")] });
    await c.button("catalog.details.printLabel").click();
    await dialog.getByTestId("layout-option").first().click();
    await dialog.getByLabel(c.t("catalog.print.fields.slaughter")).fill("2026-11-05");
    await dialog.getByLabel(c.t("catalog.print.fields.certificate")).fill("CERT-77");
    await page.waitForTimeout(1500);
    await shot("22-print-label", {
      marks: [
        dialog.getByTestId("layout-option").first(),
        dialog.getByLabel(c.t("catalog.print.fields.slaughter")),
        dialog.getByLabel(c.t("catalog.print.fields.certificate")),
        dialog.getByLabel(c.t("catalog.print.fields.copies")),
        dialog.getByRole("button", { name: c.t("catalog.print.submit"), exact: true }),
      ],
    });
    await page.keyboard.press("Escape");
  });
  await step("catalog packaging", async () => {
    await go(page, "/catalog");
    await page
      .getByRole("button", { name: /^(Open|פתיחת) / })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByText(c.t("catalog.packaging.label")).scrollIntoViewIfNeeded();
    await shot("23-catalog-packaging", { of: dialog });
    await page.keyboard.press("Escape");
  });
  await step("catalog category", async () => {
    await go(page, "/catalog");
    await page.getByRole("group").first().getByRole("button").nth(1).click();
    await page.getByRole("dialog").waitFor();
    await shot("24-catalog-category");
    await page.keyboard.press("Escape");
  });
  await step("catalog several", async () => {
    await go(page, "/catalog");
    await c.button("catalog.select.start").click();
    const cards = page.getByRole("button", { name: /^(Select|בחירת) / });
    await cards.nth(0).click();
    await cards.nth(2).click();
    await shot("25-catalog-select", { marks: [page.getByTestId("select-bar")] });
    await page
      .getByTestId("select-bar")
      .getByRole("button", { name: c.t("catalog.select.print") })
      .click();
    await page.getByRole("dialog").waitFor();
    await shot("26-catalog-batch");
    await page.keyboard.press("Escape");
  });

  // --------------------------------------------------------------------------- goods receiving
  await step("receiving empty", async () => {
    await go(page, "/receiving");
    await shot("30-receiving", {
      tall: true,
      marks: [
        page.locator("#scan-input"),
        c.button("receiving.manualButton"),
        page.getByTestId("weight-display").first(),
        page.locator("#simulated-weight"),
        page.getByText(c.t("receiving.autoPrint")).first(),
        page.getByTestId("today-table").or(page.getByText(c.t("receiving.today.title")).first()),
      ],
    });
  });
  await step("receiving scanned", async () => {
    const scan = page.locator("#scan-input");
    await scan.fill(ITEM_QR);
    await scan.press("Enter");
    await page.locator("#simulated-weight").fill("14.02");
    await page.waitForTimeout(1500);
    await shot("31-receiving-weighed", {
      tall: true,
      marks: [
        page.getByTestId("pending-summary"),
        page.getByTestId("weight-display"),
        c.button("receiving.save"),
      ],
    });
    await c.button("receiving.save").click();
    await page.waitForTimeout(800);
    await finishPrint(page);
    await page.getByTestId("saved-notice").waitFor();
    await shot("32-receiving-saved", {
      tall: true,
      marks: [page.getByTestId("saved-notice"), page.getByTestId("today-table")],
    });
  });
  await step("receiving error", async () => {
    const scan = page.locator("#scan-input");
    await scan.fill("hello");
    await scan.press("Enter");
    await page.getByRole("alert").first().waitFor();
    await shot("33-receiving-error", { tall: true });
  });
  await step("receiving manual", async () => {
    await go(page, "/receiving");
    await c.button("receiving.manualButton").click();
    await page.getByTestId("item-picker").waitFor();
    await shot("34-receiving-picker");
    await page.getByTestId("item-picker").getByRole("button", { name: /\(/ }).first().click();
    const manual = page.getByTestId("manual-entry");
    await manual.waitFor();
    await manual.getByLabel(c.t("receiving.manual.slaughter")).fill("2026-11-05");
    await manual.getByLabel(c.t("receiving.manual.certificate")).fill("HAND-1");
    await shot("35-receiving-manual", { of: manual });
  });
  await step("receiving two", async () => {
    await go(page, "/receiving");
    const scan = page.locator("#scan-input");
    await scan.fill(SECOND_QR);
    await scan.press("Enter");
    await page.locator("#simulated-weight").fill("13.55");
    await c.button("receiving.save").click();
    await page.getByTestId("saved-notice").waitFor();
    await finishPrint(page);
  });

  // ---------------------------------------------------------------------------- vendor receiving
  await step("vendor", async () => {
    await go(page, "/vendor-receiving");
    await shot("40-vendor", { marks: [page.getByLabel(c.t("vendor.scanLabel"))] });
    const code = `38${TAIL}100726090728${run.slice(-4)}${lang === "en" ? 1 : 2}1998`;
    const input = page.getByLabel(c.t("vendor.scanLabel"));
    await input.fill(code);
    await input.press("Enter");
    await page.getByTestId("vendor-saved").waitFor();
    await shot("41-vendor-saved", {
      tall: true,
      marks: [page.getByTestId("vendor-saved"), page.getByTestId("vendor-group").first()],
    });
    await input.fill(code);
    await input.press("Enter");
    await page.getByTestId("vendor-error").waitFor();
    await shot("42-vendor-duplicate", { tall: true, marks: [page.getByTestId("vendor-error")] });
    await input.fill("12345");
    await input.press("Enter");
    await page.getByTestId("vendor-error").waitFor();
    await shot("43-vendor-bad", { marks: [page.getByTestId("vendor-error")] });
  });

  // ------------------------------------------------------------------------------------ shipping
  await step("shipping", async () => {
    // Orders arrive the way Priority sends them: to the secret address, as JSON.
    await go(page, "/settings");
    await page.getByTestId("shipping-toggle").click();
    const url = await page.getByTestId("shipping-url").inputValue();
    const orders =
      lang === "en"
        ? [
            { ORDNAME: "SO26000118", CUSTNAME: "C1042", CDES: "Galil Market Ltd", ADDRESS: "15 Herzl St", STATE: "Tiberias", CURDATE: "2026-11-09", labels: 10 },
            { ORDNAME: "SO26000119", CUSTNAME: "C2210", CDES: "Haifa Fresh Foods", ADDRESS: "3 Hanamal St", STATE: "Haifa", CURDATE: "2026-11-09" },
            { ORDNAME: "SO26000120", CUSTNAME: "C3305", CDES: "Carmel Fine Foods", ADDRESS: "40 Allenby St", STATE: "Tel Aviv", CURDATE: "2026-11-10", labels: 4 },
          ]
        : [
            { ORDNAME: "SO26000118", CUSTNAME: "C1042", CDES: "מרכול הגליל בע״מ", ADDRESS: "הרצל 15", STATE: "טבריה", CURDATE: "2026-11-09", labels: 10 },
            { ORDNAME: "SO26000119", CUSTNAME: "C2210", CDES: "מזון טרי חיפה", ADDRESS: "הנמל 3", STATE: "חיפה", CURDATE: "2026-11-09" },
            { ORDNAME: "SO26000120", CUSTNAME: "C3305", CDES: "מעדני הכרמל", ADDRESS: "אלנבי 40", STATE: "תל אביב", CURDATE: "2026-11-10", labels: 4 },
          ];
    for (const order of orders) {
      const sent = await page.request.post(url, { data: order });
      expect(sent.status()).toBe(200);
    }

    // The settings card, opened.
    await page.setViewportSize({ width: 1280, height: 1250 });
    await page.getByTestId("shipping-card").evaluate((node) => node.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(500);
    await shot("47-shipping-settings", {
      keepScroll: true,
      marks: [
        page.getByTestId("shipping-url"),
        page.getByTestId("shipping-copy"),
        page.getByTestId("shipping-new-key"),
        page.locator("#shipping-layout"),
        page.locator("#shipping-unit"),
        page.getByTestId("shipping-default-count"),
        page.getByTestId("shipping-pallet-copies"),
        page.getByTestId("shipping-test"),
      ],
    });
    await page.setViewportSize({ width: 1280, height: 800 });

    // The list, with one order already printed.
    await go(page, "/shipping-labels");
    await page.evaluate(() => {
      window.print = () => window.dispatchEvent(new Event("afterprint"));
    });
    const first = page.getByTestId("shipping-order").filter({ hasText: "SO26000118" });
    await first.getByTestId("shipping-print").click();
    await page.getByTestId("shipping-do-print").click();
    await page.getByTestId("shipping-printed").first().waitFor();
    await page.waitForTimeout(600);
    await shot("45-shipping-list", {
      marks: [
        page.getByLabel(c.t("shipping.searchLabel")),
        page.getByTestId("shipping-printed").first(),
        page.getByTestId("shipping-print").first(),
      ],
    });

    // The printing window.
    await page
      .getByTestId("shipping-order")
      .filter({ hasText: "SO26000118" })
      .getByTestId("shipping-print")
      .click();
    await page.getByTestId("shipping-preview").waitFor();
    await page.waitForTimeout(800);
    await shot("46-shipping-print", {
      marks: [
        page.getByTestId("shipping-preview"),
        page.getByTestId("shipping-unit-box"),
        page.getByTestId("shipping-count"),
        page.getByTestId("shipping-sequence"),
        page.getByTestId("shipping-do-print"),
      ],
      keepSidebar: true,
      wait: 2000,
    });
    // Pallets: 10 pallets, 4 labels for each.
    await page.getByTestId("shipping-unit-pallet").click();
    await page.getByTestId("shipping-count").fill("10");
    await page.waitForTimeout(600);
    await shot("48-shipping-pallets", {
      marks: [
        page.getByTestId("shipping-unit-pallet"),
        page.getByTestId("shipping-count"),
        page.getByTestId("shipping-copies"),
        page.getByTestId("shipping-sequence"),
      ],
      keepSidebar: true,
      wait: 2000,
    });
    await page.keyboard.press("Escape");
  });

  // ---------------------------------------------------------------------------------- inventory
  await step("inventory", async () => {
    await go(page, "/inventory");
    await page.getByTestId("inventory-item").first().waitFor();
    await shot("50-inventory", {
      tall: true,
      marks: [
        page.getByTestId("room-card").first(),
        page.locator("#inv-item"),
        c.button("inventory.export.excel"),
        page.getByTestId("inventory-summary"),
        page.getByTestId("inventory-item").first(),
        page.getByTestId("item-details"),
        c.button("pallets.create.start"),
      ],
    });
  });
  await step("inventory filters", async () => {
    await c.text("inventory.filters.more").click();
    await page.locator("#inv-barcode").waitFor();
    await shot("51-inventory-filters", {
      marks: [
        page.locator("#inv-status"),
        page.locator("#inv-barcode"),
        page.locator("#inv-expiry-from"),
        page.locator("#inv-entered-from"),
      ],
    });
  });
  await step("inventory pallet", async () => {
    await go(page, "/inventory");
    await page.getByTestId("inventory-item").first().waitFor();
    await c.button("pallets.create.start").click();
    await page.getByTestId("pallet-toolbar").waitFor();
    const boxes = page.getByTestId("inventory-box");
    for (const i of [0, 1, 2]) await boxes.nth(i).getByRole("checkbox").check();
    await shot("52-inventory-pallet", {
      tall: true,
      marks: [
        page.getByTestId("pallet-toolbar"),
        boxes.nth(0).getByRole("checkbox"),
        page.getByTestId("pallet-scan-input"),
        page.getByRole("button", { name: c.t("pallets.create.create", { count: 3 }) }),
      ],
    });
    await page.getByRole("button", { name: c.t("pallets.create.create", { count: 3 }) }).click();
    await page.waitForTimeout(1500);
    await finishPrint(page);
    await shot("53-pallet-made");
  });
  await step("pallets screen", async () => {
    await go(page, "/inventory/pallets");
    await shot("54-pallets", {
      marks: [page.getByLabel(c.t("pallets.scan.label")), page.getByTestId("pallets-recent")],
    });
    await page
      .getByTestId("pallets-recent")
      .getByRole("listitem")
      .first()
      .getByRole("button")
      .first()
      .click();
    await page.getByTestId("pallet-detail").waitFor();
    await shot("55-pallet-detail", { tall: true });
  });

  // -------------------------------------------------------------------------------------- settings
  for (const [section, name] of [
    ["", "60-settings-company"],
    ["priority", "61-settings-priority"],
    ["receiving", "62-settings-receiving"],
    ["hardware", "63-settings-scale"],
  ] as const) {
    await step(name, async () => {
      await go(page, section ? `/settings?section=${section}` : "/settings");
      await shot(name, { tall: true });
    });
  }
  await step("labels list", async () => {
    await go(page, "/settings/labels");
    await shot("64-labels-list", { tall: true });
    await c.button("labels.list.new").click();
    await page.getByRole("dialog").waitFor();
    await shot("65-labels-new", { of: page.getByRole("dialog") });
    await page.keyboard.press("Escape");
  });
  await step("label editor", async () => {
    await go(page, "/settings/labels");
    await page.locator("table a").first().click();
    await page.getByTestId("label-canvas").waitFor();
    await page.waitForTimeout(1500);
    await page.locator('[data-element-id="name"]').click();
    await shot("66-label-editor");
  });
  await step("label editor box", async () => {
    await go(page, "/settings/labels");
    await page.getByRole("link", { name: "תווית ארגז", exact: true }).click();
    await page.getByTestId("label-canvas").waitFor();
    await page.waitForTimeout(1500);
    await shot("67-label-editor-box");
  });
  await step("label editor pallet", async () => {
    await go(page, "/settings/labels");
    await page.getByRole("link", { name: "תווית משטח", exact: true }).click();
    await page.getByTestId("label-canvas").waitFor();
    await page.waitForTimeout(1500);
    await shot("68-label-editor-pallet");
  });

  await step("label editor shipping", async () => {
    await go(page, "/settings/labels");
    await page.getByRole("link", { name: "תווית משלוח", exact: true }).click();
    await page.getByTestId("label-canvas").waitFor();
    await page.waitForTimeout(1500);
    await shot("69-label-editor-shipping");
  });

  // ------------------------------------------------------------------------------ administration
  await step("help ask and message", async () => {
    await go(page, "/catalog");
    await page.setViewportSize({ width: 1280, height: 1150 });
    await page.getByTestId("page-help").click();
    const help = page.getByTestId("page-help-window");
    await page.getByTestId("help-tab-ask").click();
    const question =
      lang === "en"
        ? "How do I print labels for several items?"
        : "איך מדפיסים תוויות להרבה פריטים?";
    await page.locator("#help-question").fill(question);
    await c.button("contact.ask.send").click();
    await page.getByTestId("ask-assistant").waitFor();
    await page.waitForTimeout(600);
    await shot("16-help-ask", { of: help });
    await page
      .getByRole("button", { name: c.t("contact.ask.toAdmin") })
      .first()
      .click();
    await page.getByTestId("message-kind-request").click();
    await page.locator("#message-subject").selectOption("permission");
    await page
      .locator("#message-details")
      .fill(
        lang === "en"
          ? "Please let me print labels for several items at once. I do it every morning."
          : "אפשר לאפשר לי להדפיס תוויות להרבה פריטים בבת אחת? אני עושה את זה כל בוקר.",
      );
    await shot("17-help-message", { of: help });
    await c.button("contact.message.send").click();
    await page.getByTestId("message-sent").waitFor();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 800 });
  });
  await step("admin messages", async () => {
    await go(page, "/admin?tab=messages");
    const card = page.getByTestId("message-card").first();
    await shot("19-admin-messages", {
      marks: [
        page.getByTestId("messages-filter-new"),
        card.locator("div.flex.flex-wrap.items-center.gap-2").first(),
        card.locator("p.rounded-xl").first(),
        card.locator("textarea"),
        card.getByTestId("message-done"),
      ],
    });
    await card
      .locator("textarea")
      .fill(
        lang === "en"
          ? "Done: you can print for several items now."
          : "בוצע: אפשר להדפיס עכשיו להרבה פריטים.",
      );
    await card.getByTestId("message-done").click();
    await page.waitForTimeout(800);
  });
  await step("admin users", async () => {
    await go(page, "/admin?tab=users");
    await shot("70-admin-users", {
      marks: [c.button("admin.users.new"), page.getByTestId("user-card").first()],
    });
  });
  await step("admin new user", async () => {
    await c.button("admin.users.new").click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#user-name").fill(workerName);
    await dialog.locator("#user-email").fill(email);
    await dialog.getByRole("radio", { name: lang === "en" ? "English" : "עברית" }).click();
    await shot("71-admin-new-user", {
      marks: [dialog.locator("#user-name"), dialog.locator("#user-email")],
    });
    const receiving = dialog.getByRole("radiogroup", { name: c.t("nav.receiving"), exact: true });
    await receiving.getByRole("radio", { name: c.t("admin.permissions.levels.full") }).click();
    const inventory = dialog.getByRole("radiogroup", { name: c.t("nav.inventory"), exact: true });
    await inventory.getByRole("radio", { name: c.t("admin.permissions.levels.view") }).click();
    await receiving.scrollIntoViewIfNeeded();
    await shot("72-admin-permissions", { of: dialog });
    const row = dialog.getByRole("listitem").filter({
      has: page.getByRole("radiogroup", { name: c.t("nav.inventory"), exact: true }),
    });
    await row.getByRole("button", { name: c.t("admin.permissions.details") }).click();
    await row.scrollIntoViewIfNeeded();
    await shot("73-admin-permissions-open", { of: dialog });
    await dialog.getByRole("switch").first().scrollIntoViewIfNeeded();
    await dialog.getByRole("switch").first().click();
    await shot("74-admin-devices", { of: dialog });
    await dialog.getByRole("button", { name: c.t("admin.form.create") }).click();
    await page.getByRole("dialog").locator("code").waitFor();
    await shot("75-admin-created");
    await page.getByRole("button", { name: c.t("admin.password.done") }).click();
  });
  await step("admin menu and first login", async () => {
    await go(page, "/admin?tab=users");
    const card = page.getByTestId("user-card").filter({ hasText: email });
    await card
      .getByRole("button", { name: c.t("admin.users.menu.label", { name: workerName }) })
      .click();
    await shot("76-admin-user-menu");
    await page.getByRole("menuitem", { name: c.t("admin.users.menu.reset") }).click();
    await shot("77-admin-reset-confirm");
    await page.getByRole("button", { name: c.t("admin.confirm.reset.action") }).click();
    const code = page.getByRole("dialog").locator("code");
    await code.waitFor();
    const temporary = (await code.innerText()).trim();
    await page.getByRole("button", { name: c.t("admin.password.done") }).click();
    await captureNewUser(browser, lang, email, temporary);
    current = c;
  });
  await step("admin log", async () => {
    await go(page, "/admin?tab=log");
    await shot("78-admin-log", { tall: true });
  });
  await step("admin security", async () => {
    await go(page, "/admin?tab=security");
    await shot("79-admin-security", { tall: true });
  });

  // ------------------------------------------------------ Priority not answering, and the queue
  await step("priority down", async () => {
    const choose = async (mode: "normal" | "down") => {
      await go(page, "/settings?section=priority");
      await page
        .getByRole("radiogroup", { name: c.t("settings.standIn.title") })
        .getByRole("radio", { name: new RegExp("^" + c.t(`settings.standIn.modes.${mode}.name`)) })
        .click();
      await page.waitForTimeout(1200);
    };
    await choose("down");
    try {
      await go(page, "/receiving");
      const scan = page.locator("#scan-input");
      await scan.fill(SECOND_QR.replace("CERT-78", "CERT-79"));
      await scan.press("Enter");
      await page.locator("#simulated-weight").fill("12.30");
      await c.button("receiving.save").click();
      await page.getByTestId("saved-notice").waitFor();
      await finishPrint(page);
      await shot("81-receiving-priority-down", { tall: true });
      await go(page, "/admin?tab=sends");
      await shot("82-admin-sends", { tall: true });
    } finally {
      await choose("normal");
    }
    // Priority is back: the timer sends the waiting box, so the next language starts clean.
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(10_000);
      await go(page, "/admin?tab=sends");
      if (await page.getByTestId("sends-empty").isVisible()) break;
    }
  });

  // --------------------------------------------------------------------------------------- account
  await step("account", async () => {
    await go(page, "/account");
    await shot("80-account", {
      marks: [page.getByTestId("change-password"), c.button("account.twoFactor.turnOn")],
    });
    await c.button("account.twoFactor.turnOn").click();
    await shot("83-two-factor-password");
    await page.locator('input[type="password"]').first().fill(OWNER.next);
    await c.button("account.twoFactor.continue").click();
    await page.waitForTimeout(2500);
    await shot("84-two-factor-qr", { tall: true });
    await c
      .button("account.twoFactor.cancel")
      .click()
      .catch(() => undefined);
  });
  await step("change password", async () => {
    await go(page, "/change-password");
    await shot("85-change-password", { clip: { x: 430, y: 40, width: 420, height: 720 } });
  });

  // ------------------------------------------------------------------------------------ the phone
  await step("phone", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, "/dashboard");
    await shot("90-phone-dashboard");
    await go(page, "/receiving");
    await shot("91-phone-receiving");
    await go(page, "/inventory");
    await shot("92-phone-inventory");
    await page.getByRole("button", { name: c.t("shell.openMenu") }).click();
    await shot("93-phone-menu");
    await page.setViewportSize({ width: 1280, height: 800 });
  });
}
