/**
 * Pulse UI guardrails, consumed by eslint.config.js and scripts/pulse-ui-audit.mjs.
 *
 * Two scopes:
 * - src/ui/** composes tokens only (PULSE_UI_SYNTAX_RULES + PULSE_UI_SPINNER_IMPORT).
 * - Converted pages build from @/ui only (PULSE_UI_PAGE_RULES). A page joins
 *   PULSE_UI_PAGE_FILES when docs/api/ui/registry.md lists it as converted.
 *
 * Rule messages are a contract: pulse-ui-audit.mjs buckets violations by these
 * exact prefixes. Do not reword a prefix without updating the audit script.
 */

const SPINNER_MESSAGE =
  "No spinner components or animate-spin classes. Show busy state as a present-tense text label on the control (ActionButton states).";
const TRUNCATE_MESSAGE =
  "No truncated control labels. Size the control to its longest label (fixed width, whitespace-nowrap).";
const FONT_MESSAGE =
  "No arbitrary font sizes below the 1rem floor. Use text-base (text-xs and text-sm already map to 1rem).";
const PALETTE_MESSAGE =
  "No raw palette classes. Compose the tokens in src/ui/tokens.ts or semantic colors (bg-ui-field, text-muted-foreground).";
const LABEL_MESSAGE =
  "No stacked labels. The placeholder is the label on Field, SelectField, and TextareaField.";
const RAW_CONTROL_MESSAGE =
  "No raw form controls in converted pages. Use Button, Field, SelectField, TextareaField, CheckField, or SwitchField from @/ui.";
const SHADCN_MESSAGE =
  "Import Button, Field, SelectField and other controls from @/ui (src/ui/registry.ts), not @/ui/vendor.";

const PALETTE_RE = "(bg|text|border|ring|fill|stroke)-(zinc|slate|gray|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]";

/** Syntax bans shared by the UI layer and converted pages. */
export const PULSE_UI_SYNTAX_RULES = [
  {
    selector: "JSXOpeningElement[name.name=/^(Loader2|LoaderCircle|Spinner)$/]",
    message: SPINNER_MESSAGE,
  },
  {
    selector: `Literal[value=/animate-spin/]`,
    message: SPINNER_MESSAGE,
  },
  {
    selector: `Literal[value=/(^|\\s)truncate(\\s|$)/]`,
    message: TRUNCATE_MESSAGE,
  },
  {
    selector: `Literal[value=/line-clamp-[1-9]/]`,
    message: TRUNCATE_MESSAGE,
  },
  {
    selector: `Literal[value=/text-\\[[0-9]/]`,
    message: FONT_MESSAGE,
  },
  {
    selector: `Literal[value=/${PALETTE_RE}/]`,
    message: PALETTE_MESSAGE,
  },
];

/** Import ban applied inside src/ui: no spinner icons from lucide. */
export const PULSE_UI_SPINNER_IMPORT = {
  name: "lucide-react",
  importNames: ["Loader2", "LoaderCircle"],
  message: SPINNER_MESSAGE,
};

/** Extra syntax bans that apply to converted pages only. */
const PAGE_ONLY_SYNTAX_RULES = [
  {
    selector: "JSXOpeningElement[name.name=/^(button|input|select|textarea)$/]",
    message: RAW_CONTROL_MESSAGE,
  },
  {
    selector: "JSXOpeningElement[name.name=/^(Label|label)$/]",
    message: LABEL_MESSAGE,
  },
];

/** Import ban applied everywhere outside the UI layer: controls come from @/ui only. */
export const PULSE_UI_VENDOR_IMPORT = {
  group: ["@/ui/vendor/*", "**/ui/vendor/*", "@/components/ui/*", "**/components/ui/*"],
  message: SHADCN_MESSAGE,
};

export const PULSE_UI_IMPORT_BAN = {
  "no-restricted-imports": [
    "error",
    {
      paths: [PULSE_UI_SPINNER_IMPORT],
      patterns: [PULSE_UI_VENDOR_IMPORT],
    },
  ],
};

export const PULSE_UI_PAGE_RULES = {
  "no-restricted-syntax": ["error", ...PULSE_UI_SYNTAX_RULES, ...PAGE_ONLY_SYNTAX_RULES],
  ...PULSE_UI_IMPORT_BAN,
};

/**
 * Converted pages (registry-only). Add a file here in the same change that
 * lists it as converted in docs/api/ui/registry.md.
 */
export const PULSE_UI_PAGE_FILES = ["src/components/knowledge-base/KnowledgeBaseToolbar.tsx"];

/** Files the page rules never apply to (the UI layer has its own block). */
export const PULSE_UI_EXEMPT = [
  "src/ui/**",
  "src/**/*.stories.{ts,tsx}",
  "src/**/*.test.{ts,tsx}",
  "src/**/__tests__/**",
];
