import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const agentLoopPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/research/browser-automation/agent-loop.mjs",
);
const visionRoundPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/research/browser-automation/agent-vision-round.mjs",
);

describe("browser automation agent loop hardening", () => {
  it("requires tool_choice and retries when the model returns text only", () => {
    const source = readFileSync(agentLoopPath, "utf8");
    const visionSource = readFileSync(visionRoundPath, "utf8");
    expect(source).toContain("callOpenRouterVision");
    expect(visionSource).toContain('tool_choice: "required"');
    expect(source).toContain("endedWithoutTool");
    expect(source).toContain("Vision model did not call a tool.");
    expect(source).toContain("You must call exactly one tool");
  });

  it("threads deliverables through loop results", () => {
    const source = readFileSync(agentLoopPath, "utf8");
    expect(source).toContain("const deliverables =");
    expect(source).toContain("deliverables,");
    expect(source).toContain("preflightStatus: input.preflightStatus");
  });
});
