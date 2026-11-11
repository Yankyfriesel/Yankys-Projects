// Builds the two manuals (English and Hebrew) as PDF files from manual/content/*.mjs and the
// pictures in manual/shots. Run: node manual/build.mjs [en|he]
//
// In the content, [[some.key]] is replaced with the exact words the system shows for that key
// (from messages/en.json or messages/he.json), so a button or a menu name in the manual is always
// the one on the screen.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "Manual PDF");
const work = path.join(root, "manual", "build");
mkdirSync(out, { recursive: true });
mkdirSync(work, { recursive: true });

const css = readFileSync(path.join(root, "manual", "style.css"), "utf8");
const only = process.argv[2];
const langs = only ? [only] : ["en", "he"];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function lookup(messages, key) {
  let node = messages;
  for (const part of key.split(".")) node = node?.[part];
  return typeof node === "string" ? node : null;
}

const missing = new Set();
let currentMessages;

function make(lang) {
  const messages = JSON.parse(readFileSync(path.join(root, "messages", `${lang}.json`), "utf8"));
  /** Words of the interface, then simple inline marks: **bold**, `code`. */
  const rich = (text) =>
    text
      .replace(/\[\[([\w.]+)\]\]/g, (_, key) => {
        const value = lookup(messages, key);
        if (value === null) {
          missing.add(`${lang}: ${key}`);
          return `<span class="ui missing">${key}</span>`;
        }
        return `<span class="ui">${esc(value)}</span>`;
      })
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  return { messages, rich };
}

function figure(lang, block, rich) {
  const file = path.join(root, "manual", "shots", lang, `${block.img}.png`);
  if (!existsSync(file)) {
    missing.add(`${lang}: picture ${block.img}`);
    return `<p class="missing">[picture ${block.img} missing]</p>`;
  }
  const src = pathToFileURL(file).href;
  const legend = block.legend
    ? `<ol class="legend">${block.legend.map((l, i) => `<li><span class="n">${i + 1}</span><span>${rich(l)}</span></li>`).join("")}</ol>`
    : "";
  const MEDIUM = ["81-receiving-priority-down", "51-inventory-filters", "67-label-editor-box", "68-label-editor-pallet", "55-pallet-detail", "50-inventory"];
  const cls = (MEDIUM.includes(block.img) ? "fig medium" : block.narrow ? "fig narrow" : block.phone ? "fig phone" : "fig") + (block.legend ? "" : " alone");
  return `<figure class="${cls}"><div class="figbox"><img src="${src}"/><figcaption>${rich(block.caption)}</figcaption></div>${legend}</figure>`;
}

function renderBlock(lang, block, rich) {
  switch (block.type) {
    case "h3":
      return `<h3>${rich(block.text)}</h3>`;
    case "h4":
      return `<h4>${rich(block.text)}</h4>`;
    case "p":
      return `<p>${rich(block.text)}</p>`;
    case "ul":
      return `<ul>${block.items.map((i) => `<li>${rich(i)}</li>`).join("")}</ul>`;
    case "ol":
      return `<ol class="steps">${block.items.map((i) => `<li>${rich(i)}</li>`).join("")}</ol>`;
    case "note":
    case "tip":
    case "warn":
      return `<div class="callout ${block.type}"><b class="label">${rich(block.label)}</b><div>${rich(block.text)}</div></div>`;
    case "table":
      return `<table><thead><tr>${block.head.map((h) => `<th>${rich(h)}</th>`).join("")}</tr></thead><tbody>${block.rows
        .map((r) => `<tr>${r.map((c) => `<td>${rich(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`;
    case "fig":
      return figure(lang, block, rich);
    case "perms": {
      // Every single action a person can be allowed, straight from the system's own list.
      const m = currentMessages;
      const screens = [
        ["dashboard", "nav.dashboard"],
        ["catalog", "nav.catalog"],
        ["receiving", "nav.receiving"],
        ["vendor", "nav.vendor"],
        ["shipping", "nav.shipping"],
        ["inventory", "nav.inventory"],
        ["settings", "nav.settings"],
        ["admin", "nav.admin"],
        ["device", "admin.permissions.devices.title"],
      ];
      const leaves = (node, prefix = "") =>
        Object.entries(node).flatMap(([k, v]) =>
          typeof v === "string" ? [v] : leaves(v, `${prefix}${k}.`),
        );
      const rows = screens.map(([key, nameKey]) => {
        const actions = leaves(m.admin.perm[key]);
        return `<tr><td class="permscreen">${esc(lookup(m, nameKey))}</td><td><ul class="compact">${actions
          .map((a) => `<li>${esc(a)}</li>`)
          .join("")}</ul></td></tr>`;
      });
      return `<table><thead><tr><th>${block.head[0]}</th><th>${block.head[1]}</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
    }
    case "row":
      return `<div class="row n${block.items.length}">${block.items
        .map((item) => {
          const file = path.join(root, "manual", "shots", lang, `${item.img}.png`);
          if (!existsSync(file)) {
            missing.add(`${lang}: picture ${item.img}`);
            return `<figure class="missing">[${item.img}]</figure>`;
          }
          return `<figure><img src="${pathToFileURL(file).href}"/><figcaption>${rich(item.caption)}</figcaption></figure>`;
        })
        .join("")}</div>`;
    case "flow":
      return `<div class="flow">${block.steps
        .map((s, i) => `<div class="flowstep"><span class="n">${i + 1}</span><b>${rich(s[0])}</b><span>${rich(s[1])}</span></div>`)
        .join('<span class="arrow">›</span>')}</div>`;
    default:
      throw new Error(`unknown block ${block.type}`);
  }
}

const logoLight = pathToFileURL(path.join(root, "public", "brand", "logo-light.png")).href;

function chapterHtml(lang, content, chapter, index, rich) {
  const body = chapter.blocks.map((b) => renderBlock(lang, b, rich)).join("\n");
  return `<section class="chapter" id="c${index}">
  <div class="chapter-head"><span class="chapter-no">${index}</span><h1>${rich(chapter.title)}</h1></div>
  ${chapter.intro ? `<p class="lead">${rich(chapter.intro)}</p>` : ""}
  ${body}
</section>`;
}

function coverHtml(content, rich) {
  return `<section class="cover">
  <img class="logo" src="${logoLight}"/>
  <h1>${rich(content.cover.title)}</h1>
  <p class="sub">${rich(content.cover.subtitle)}</p>
  <p class="date">${rich(content.cover.date)}</p>
</section>`;
}

function tocHtml(content, rich, pages) {
  const rows = content.chapters
    .map(
      (c, i) =>
        `<li><a href="#c${i + 1}"><span class="t"><span class="no">${i + 1}</span>${rich(c.title)}</span><span class="dots"></span><span class="pg">${pages ? pages[i] : ""}</span></a>${c.summary ? `<p>${rich(c.summary)}</p>` : ""}</li>`,
    )
    .join("");
  return `<section class="toc"><h1>${rich(content.tocTitle)}</h1><ol>${rows}</ol></section>`;
}

function page(lang, content, inner) {
  const dir = lang === "he" ? "rtl" : "ltr";
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"/><title>${esc(content.cover.title)}</title><style>${css}</style></head><body>${inner}</body></html>`;
}

async function pdfOf(browser, html, file, { footer = true } = {}) {
  const htmlFile = path.join(work, path.basename(file).replace(/\.pdf$/, ".html"));
  writeFileSync(htmlFile, html);
  const tab = await browser.newPage();
  await tab.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
  await tab.evaluate(() => document.fonts.ready);
  await tab.waitForTimeout(400);
  const buffer = await tab.pdf({
    path: file,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });
  await tab.close();
  const text = buffer.toString("latin1");
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  return counts.length ? Math.max(...counts) : 1;
}

const plain = (html) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/** The text on every page of a PDF, so the contents page can name the page of each chapter. */
async function pageTexts(buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
  const texts = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    texts.push(content.items.map((i) => i.str).join(" ").replace(/\s+/g, " "));
  }
  return texts;
}

const reversed = (text) => [...text].reverse().join("");

const browser = await chromium.launch();
for (const lang of langs) {
  const content = (await import(pathToFileURL(path.join(root, "manual", "content", `${lang}.mjs`)).href)).default;
  const { rich, messages } = make(lang);
  currentMessages = messages;
  const chapters = content.chapters.map((c, i) => chapterHtml(lang, content, c, i + 1, rich));
  const build = (starts) =>
    page(lang, content, coverHtml(content, rich) + tocHtml(content, rich, starts) + chapters.join(""));
  const file = path.join(out, content.fileName);

  // First pass: build it without page numbers, find the page where each chapter starts,
  // then build it again with the numbers (they do not change the number of pages).
  await pdfOf(browser, build(null), file);
  const texts = await pageTexts(readFileSync(file));
  let from = 1; // the contents page is page 2 (index 1); chapters come after it
  const starts = content.chapters.map((c, i) => {
    const marker = plain(rich(c.intro)).slice(0, 28);
    const found = texts.findIndex(
      (t, idx) => idx >= from && (t.includes(marker) || t.includes(reversed(marker))),
    );
    if (found < 0) {
      missing.add(`${lang}: could not find chapter ${i + 1} in the PDF`);
      return "";
    }
    from = found;
    return found + 1;
  });
  const total = await pdfOf(browser, build(starts), file);
  console.log(`${lang}: ${total} pages -> ${file}; chapters start on pages ${starts.join(", ")}`);
}
await browser.close();
if (missing.size) {
  console.log("MISSING:\n" + [...missing].join("\n"));
  process.exitCode = 1;
}
