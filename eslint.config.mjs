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
  {
    // Feature folders under a `shared/<feature>/` directory expose their
    // public API through an `index.ts` barrel (the main component(s) plus
    // their prop types). Consumers outside the folder must import that
    // barrel, not reach into an internal file directly — that keeps the
    // folder an actual module with a contract instead of a bag of files
    // anything can dig into. Files inside `shared/**` are exempt so
    // siblings within (or across) a feature folder can still import each
    // other freely.
    files: ["app/frontend/components/**/*.{ts,tsx}"],
    ignores: ["**/shared/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/shared/app-header/*",
                "**/shared/portal-settings/*",
                "**/shared/fee-structure/*",
                "**/shared/fee-transactions-list/*",
                "**/shared/hostel-mess/*",
                "**/shared/offline-payment/*",
                "**/shared/petty-cash/*",
                "**/shared/student-fees-payment/*",
                "**/shared/studentDetail/*",
                "**/shared/analysis/*",
                "**/shared/classes/*",
                "**/shared/teacher-leaves/*",
                "**/shared/teachersTab/*",
                "**/shared/timetable/*",
                "**/shared/workshops-and-events/*",
                "**/shared/event-details/*",
                "**/shared/add-school/*",
                "**/shared/schools/*",
                "**/shared/subscriptions/*",
              ],
              message:
                "Import from the feature's shared/<feature> barrel (its index.ts) instead of reaching into an internal file directly.",
            },
          ],
        },
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
