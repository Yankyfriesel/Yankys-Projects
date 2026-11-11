import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Tailwind classes that hard-code a physical side. The UI must mirror between
// Hebrew (RTL) and English (LTR), so only logical classes are allowed:
// ms-/me-, ps-/pe-, start-/end-, text-start/text-end, rounded-s-/rounded-e-, border-s-/border-e-.
const PHYSICAL_SIDE_CLASS =
  /(^|[\s"'`:!])-?(ml|mr|pl|pr|left|right|inset-x-?[lr]?|rounded-[lr]|rounded-[tb][lr]|border-[lr]|scroll-[mp][lr]|text-left|text-right|float-left|float-right)(-|\b)/;

const logicalCssRule = {
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["src/components/ui/**"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: `Literal[value=${PHYSICAL_SIDE_CLASS.toString()}]`,
        message:
          "Use logical Tailwind classes (ms-/me-, ps-/pe-, start-/end-, text-start/end) so the layout mirrors in RTL.",
      },
      {
        selector: `TemplateElement[value.raw=${PHYSICAL_SIDE_CLASS.toString()}]`,
        message:
          "Use logical Tailwind classes (ms-/me-, ps-/pe-, start-/end-, text-start/end) so the layout mirrors in RTL.",
      },
    ],
  },
};

// Every visible string goes through next-intl so the UI is fully Hebrew or fully English.
const noHardcodedTextRule = {
  files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
  // The design review page is an English-only developer tool, not part of the product.
  ignores: ["src/components/ui/**", "src/app/(app)/design/**"],
  rules: {
    "react/jsx-no-literals": [
      "error",
      {
        noStrings: true,
        ignoreProps: true,
        allowedStrings: ["·", "•", "-", "–", "/", ":", "(", ")", "%", "×", "…", "&nbsp;"],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  logicalCssRule,
  noHardcodedTextRule,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "data/**",
  ]),
]);

export default eslintConfig;
