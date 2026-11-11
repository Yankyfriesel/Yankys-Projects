#!/usr/bin/env node
// extract.mjs: writes every file of REBUILD.md into a folder and fills in the {{PLACEHOLDERS}}.
// Usage: node extract.mjs [REBUILD.md] [output-folder] [rebuild.config.json]
// No packages needed. The first run creates rebuild.config.json (sample values) and stops, so you can
// edit the branding; the second run writes the project.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node extract.mjs [REBUILD.md] [output-folder] [rebuild.config.json]");
  process.exit(0);
}
const [specFile = "REBUILD.md", outDir = "./system", configFile = "rebuild.config.json"] = args;

const DEFAULTS = {
  "COMPANY_NAME": "Northfield Foods",
  "COMPANY_NAME_HE": "נורת׳פילד פודס",
  "COMPANY_FILE_PREFIX": "Northfield-Foods",
  "SYSTEM_NAME": "Northfield Foods - Factory",
  "SYSTEM_NAME_HE": "נורת׳פילד פודס - מפעל",
  "SENDER_NAME": "Northfield Foods System",
  "APP_ID": "northfield",
  "APP_URL": "https://app.example.com",
  "APP_HOST": "app.example.com",
  "COMPANY_DOMAIN": "example.com",
  "OWNER_EMAIL": "owner@example.com",
  "OWNER_NAME": "Alex Owner",
  "SMTP_FROM_ADDRESS": "system@example.com",
  "RENDER_SERVICE_NAME": "northfield-factory",
  "RENDER_DB_NAME": "northfield-db",
  "QR_PREFIX": "NF",
  "BRAND_COLOR": "#1f6f78",
  "BRAND_COLOR_ALT": "#1a5f68",
  "ACCENT_COLOR": "#b8862b",
  "ACCENT_COLOR_LIGHT": "#e2b866",
  "ACCENT_COLOR_SOFT": "#f7edd8"
};

// ---- the values
if (!fs.existsSync(configFile)) {
  fs.writeFileSync(configFile, JSON.stringify(DEFAULTS, null, 2) + "\n");
  console.log(`Wrote ${configFile} with sample values for a made-up company.`);
  console.log("Edit it (see section 8 of REBUILD.md), then run the same command again.");
  process.exit(0);
}
const config = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(configFile, "utf8")) };
// Derived values (not in the config file).
config.QR_PREFIX_LOWER = String(config.QR_PREFIX ?? "").toLowerCase();
for (const [key, value] of Object.entries(config)) {
  if (key === "QR_PREFIX_LOWER") continue;
  if (typeof value !== "string" || value === "" || /["'\\`$\n\r{}]/.test(value)) {
    throw new Error(`${configFile}: the value of ${key} must be a non-empty text without quotes, backslashes, backticks, $, braces or line breaks`);
  }
  if (key.includes("COLOR") && !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`${configFile}: ${key} must be a colour like #1f6f78`);
  }
}

// ---- read the files out of REBUILD.md
const lines = fs.readFileSync(specFile, "utf8").replace(/\r\n/g, "\n").split("\n");
const files = [];
for (let i = 0; i < lines.length; i++) {
  const heading = /^### FILE: `([^`]+)`\s*$/.exec(lines[i]);
  if (!heading) continue;
  let j = i + 1;
  while (lines[j] === "") j++;
  const fence = /^(`{4,})(\S*)\s*$/.exec(lines[j] ?? "");
  if (!fence) throw new Error(`no code block after the heading of ${heading[1]} (line ${i + 1})`);
  const body = [];
  for (j++; j < lines.length && lines[j] !== fence[1]; j++) body.push(lines[j]);
  if (j >= lines.length) throw new Error(`the code block of ${heading[1]} is not closed`);
  files.push({ path: heading[1], text: body.join("\n") + "\n" });
  i = j;
}
if (files.length === 0) throw new Error(`no files found in ${specFile}`);

// ---- write them, with the placeholders filled in
let written = 0;
for (const file of files) {
  const text = file.text.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (all, key) => {
    if (!(key in config)) throw new Error(`${file.path}: unknown placeholder ${all}; add it to ${configFile}`);
    return config[key];
  });
  const target = path.join(outDir, file.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  written++;
}

// ---- placeholder pictures (simple shapes in the brand colours; replace with the real artwork)
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let crc = 0xffffffff;
  for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** shapes: [{ kind: "rect"|"circle", box: [x0, y0, x1, y1] in 0..1, color: [r,g,b,a] }], drawn in order */
function png(width, height, background, shapes) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      let pixel = background;
      for (const shape of shapes) {
        const [x0, y0, x1, y1] = shape.box;
        const u = x / width;
        const v = y / height;
        const inside =
          shape.kind === "rect"
            ? u >= x0 && u <= x1 && v >= y0 && v <= y1
            : ((u - (x0 + x1) / 2) / ((x1 - x0) / 2)) ** 2 + ((v - (y0 + y1) / 2) / ((y1 - y0) / 2)) ** 2 <= 1;
        if (inside) pixel = shape.color;
      }
      raw.set(pixel, y * (width * 4 + 1) + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const brand = [...rgb(config.BRAND_COLOR), 255];
const accent = [...rgb(config.ACCENT_COLOR), 255];
const ivory = [250, 246, 238, 255];
const white = [255, 255, 255, 255];
const clear = [0, 0, 0, 0];
const wordmark = (ink, dot) => [
  { kind: "circle", box: [0.08, 0.2, 0.32, 0.8], color: dot },
  { kind: "rect", box: [0.4, 0.38, 0.92, 0.62], color: ink },
];
const pictures = [
  ["public/brand/logo-light.png", png(1000, 500, clear, wordmark(ivory, accent))],
  ["public/brand/logo.png", png(1000, 500, white, wordmark(brand, accent))],
  ["public/brand/logo-mark.png", png(320, 320, clear, [{ kind: "circle", box: [0.1, 0.1, 0.9, 0.9], color: brand }, { kind: "circle", box: [0.38, 0.38, 0.62, 0.62], color: white }])],
  ["src/app/icon.png", png(320, 320, brand, [{ kind: "circle", box: [0.25, 0.25, 0.75, 0.75], color: white }])],
  ["src/app/apple-icon.png", png(512, 512, brand, [{ kind: "circle", box: [0.25, 0.25, 0.75, 0.75], color: white }])],
  ["src/app/opengraph-image.png", png(600, 600, ivory, [{ kind: "circle", box: [0.2, 0.2, 0.8, 0.8], color: brand }, { kind: "circle", box: [0.4, 0.4, 0.6, 0.6], color: accent }])],
];
for (const [file, bytes] of pictures) {
  const target = path.join(outDir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
}

console.log(`Wrote ${written} files and ${pictures.length} placeholder pictures into ${outDir}`);
console.log("Next: cd " + outDir + " && corepack enable && pnpm install   (see section 9 of REBUILD.md)");
