import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import {
  PULSE_UI_EXEMPT,
  PULSE_UI_IMPORT_BAN,
  PULSE_UI_PAGE_FILES,
  PULSE_UI_PAGE_RULES,
  PULSE_UI_SPINNER_IMPORT,
  PULSE_UI_SYNTAX_RULES,
} from "./eslint.pulse-ui-rules.js";


export default tseslint.config(
  { ignores: ["dist", "dist-storybook"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Pulse UI kit: guardrails for the shared vocabulary.
    files: ["src/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...PULSE_UI_SYNTAX_RULES],
      "no-restricted-imports": ["error", { paths: [PULSE_UI_SPINNER_IMPORT] }],
    },
  },
  {
    // Vendor base (Radix primitives) keeps its own class strings; only the spinner ban applies.
    files: ["src/ui/vendor/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": "off",
      "no-restricted-imports": ["error", { paths: [PULSE_UI_SPINNER_IMPORT] }],
    },
  },
  {
    // App code imports controls from @/ui only; the vendor base stays inside src/ui.
    files: ["src/**/*.{ts,tsx}"],
    ignores: PULSE_UI_EXEMPT,
    rules: PULSE_UI_IMPORT_BAN,
  },
  {
    // Every other file in src builds from @/ui only. Bespoke controls need a documented per-line exception.
    files: PULSE_UI_PAGE_FILES,
    ignores: PULSE_UI_EXEMPT,
    rules: PULSE_UI_PAGE_RULES,
  },
);
