import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // This codebase uses pragmatic typing (esp. API route filters/parsers).
    // Keep lint useful by not blocking builds on `any` in server routes.
    files: ["app/api/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "prefer-const": "off",
    },
  },
  {
    // UI components occasionally use `any` for generic table renderers, etc.
    files: ["app/frontend/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Tests sometimes use CommonJS require() for simple mocks.
    files: ["**/*.{test,spec}.{ts,tsx,js,jsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Scripts are typically CommonJS.
    files: ["scripts/**/*.{js,ts}", "socket-server/**/*.{ts,js}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Allow setting initial state from URL params without lint noise.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react/no-unescaped-entities": "off",
      "react/no-children-prop": "off",
    },
  },
  {
    // Allow unused vars prefixed with "_" (common in route handlers).
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Keep UI files decomposed into components/modules of ~400 lines or
    // less. Warn (not error) so an occasional justified exception — a
    // single cohesive drawing routine, a large but flat options table —
    // doesn't block a build; CI treats repeated/large overruns as a signal
    // to split the file, not a hard wall.
    files: ["app/frontend/**/*.{ts,tsx}"],
    ignores: ["**/*.{test,spec}.{ts,tsx}"],
    rules: {
      "max-lines": [
        "warn",
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
