/**
 * Export Generator harness fragments + prompt parity snapshot for server PHP.
 * Run: node scripts/export-post-creator-generator-php.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const harnessPromptPath = path.join(root, "src/lib/prompt-builders/harness-section-user-prompt.ts");
const exportedOut = path.join(
  root,
  "wordpress-plugins/neo-pulse-app/includes/agent-runs/prompts/post-creator-exported-prompts.php",
);
const generatorPhp = path.join(
  root,
  "wordpress-plugins/neo-pulse-app/includes/agent-runs/prompts/post-creator-generator-prompts.php",
);
const snapshotOut = path.join(
  root,
  "wordpress-plugins/neo-pulse-app/includes/agent-runs/prompts/.generator-prompt-snapshot.json",
);

const src = fs.readFileSync(harnessPromptPath, "utf8");

function extractConst(name) {
  const re = new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`, "m");
  const m = src.match(re);
  if (!m) throw new Error(`Missing ${name} in harness-section-user-prompt.ts`);
  return m[1];
}

const harnessLengthMarkdown = extractConst("HARNESS_SECTION_LENGTH_RULE_MARKDOWN");
const harnessScopeMarkdown = extractConst("HARNESS_SECTION_SCOPE_RULE_MARKDOWN");

const exportedPhp = `<?php
/**
 * Generator-aligned prompt fragments (exported from TypeScript).
 * DO NOT EDIT BY HAND — run: node scripts/export-post-creator-generator-php.mjs
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Agent_Run_Exported_Prompts {

\tpublic static function harness_section_length_rule_markdown(): string {
\t\treturn <<<'PROMPT'
${harnessLengthMarkdown.replace(/'/g, "\\'")}
PROMPT;
\t}

\tpublic static function harness_section_scope_rule_markdown(): string {
\t\treturn <<<'PROMPT'
${harnessScopeMarkdown.replace(/'/g, "\\'")}
PROMPT;
\t}

\tpublic static function harness_body_system_prompt(): string {
\t\treturn 'You write SEO blog sections in Markdown for a harnessed generator. Follow section word budget and harness length rules. No FAQ sections. Output exactly one ## section.';
\t}

\tpublic static function rename_intro_agent_title( string $title, string $keyword ): string {
\t\t$lower = strtolower( trim( $title ) );
\t\tif ( ! in_array( $lower, array( 'introduction', 'intro' ), true ) ) {
\t\t\treturn trim( $title );
\t\t}
\t\t$topic = trim( $keyword ) !== '' ? trim( $keyword ) : 'This Topic';
\t\treturn 'Why ' . $topic . ' Matters';
\t}
}
`;

fs.mkdirSync(path.dirname(exportedOut), { recursive: true });
fs.writeFileSync(exportedOut, exportedPhp.replace(/\r\n/g, "\n"), "utf8");
console.log("Wrote", exportedOut);

const snapshot = {
  checklistSystemMarkers: [
    "Do NOT use ## markdown headings",
    "FOCUS KEYWORD DENSITY",
    "INTERNAL LINK TARGETS",
  ],
  blueprintSystemMarkers: [
    "Blueprint Architect",
    "Rename Introduction/Intro",
  ],
};

fs.writeFileSync(snapshotOut, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
console.log("Wrote", snapshotOut);

const php = fs.readFileSync(generatorPhp, "utf8");
const required = [
  "Do NOT use ## markdown headings",
  "FOCUS KEYWORD DENSITY",
  "INTERNAL LINK TARGETS",
  "Blueprint Architect",
];
for (const marker of required) {
  if (!php.includes(marker)) {
    console.error(`Generator PHP missing marker: ${marker}`);
    process.exit(1);
  }
}

console.log("Generator PHP parity markers OK");
