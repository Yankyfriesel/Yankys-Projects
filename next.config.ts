import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const isDev = process.env.NODE_ENV !== "production";

// What a page may load and do. Scripts and styles are the app's own (Next injects small inline
// ones); nothing may frame the app, and forms and links go nowhere else.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers: async () => [
    // The pages hold per-person data: never kept in a shared or browser cache.
    {
      source: "/((?!_next/static).*)",
      headers: [...SECURITY_HEADERS, { key: "Cache-Control", value: "no-store, max-age=0" }],
    },
    // Built files are fingerprinted and may be cached. (Not while developing: the files keep
    // their names there, and the browser would keep showing old code.)
    ...(isDev
      ? []
      : [
          {
            source: "/_next/static/:path*",
            headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
          },
        ]),
  ],
  // The end-to-end tests run their own server beside the dev server and need a separate build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Every screen is per-user and dynamic (session, permissions, language),
  // so the static-shell model of cache components buys nothing here and
  // would forbid reading the language cookie in the root layout.
  cacheComponents: false,
  // Other devices on the same network (a phone) may open the dev server by its network address.
  allowedDevOrigins: (process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    // The host alone (no scheme or port); a leading "*." allows every subdomain.
    .map((origin) => origin.replace(/^https?:\/\//, "").replace(/:\d+$/, "")),
  // Native/WASM database drivers must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
