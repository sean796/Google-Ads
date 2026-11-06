import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The checklist generator lives in blog-template-checklist-generate.ts plus
// its paa-selector, context-sections, and prompt-assembly siblings; scan the
// whole family so the doctrine assertions cover the assembled prompt.
const checklistSource = [
  "src/lib/blog-template-checklist-generate.ts",
  "src/lib/blog-template-checklist-paa-selector.ts",
  "src/lib/blog-template-checklist-context-sections.ts",
  "src/lib/blog-template-checklist-prompt-assembly.ts",
]
  .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
  .join("\n");
const blueprintSource = readFileSync(
  join(process.cwd(), "src/lib/blog-template-blueprint-generate.ts"),
  "utf8",
);

describe("single keyword doctrine (Wave 2)", () => {
  it("checklist prompts carry no density target or every-H2 exact phrase rule", () => {
    expect(checklistSource).not.toContain("ONCE PER EVERY H2");
    expect(checklistSource).not.toMatch(/1\.0\s?(%|percent)/);
    expect(checklistSource).not.toMatch(/exact phrase in every H2/i);
    expect(checklistSource).toContain("AISO_CHECKLIST_KEYWORD_RULE");
  });

  it("title prompts never ask the model to count characters", () => {
    expect(checklistSource).not.toMatch(/count every character/i);
    expect(blueprintSource).not.toMatch(/count every character/i);
  });

  it("blueprint prompts state the single 60 character title limit", () => {
    expect(blueprintSource).toContain("60");
    expect(blueprintSource).not.toMatch(/MAXIMUM 50 characters/i);
  });
});
