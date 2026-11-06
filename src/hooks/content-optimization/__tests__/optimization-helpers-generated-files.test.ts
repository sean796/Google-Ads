import { describe, expect, it } from "vitest";
import { mergeOptimizationProgress } from "../optimization-helpers";

describe("mergeOptimizationProgress generatedFiles", () => {
  it("clears leftover downloads when the patch is an empty array", () => {
    const next = mergeOptimizationProgress(
      {
        "site-1": {
          stepId: "plan",
          subProgress: 0.2,
          step: "Plan",
          progress: 10,
          generatedFiles: [
            { name: "serp-research-brief-old.json", content: "{}", mimeType: "application/json" },
          ],
        },
      },
      "site-1",
      { stepId: "plan", subProgress: 1, generatedFiles: [] },
    );
    expect(next["site-1"].generatedFiles).toEqual([]);
  });

  it("clears leftover downloads on the stepId merge path", () => {
    const next = mergeOptimizationProgress(
      {
        "site-1": {
          stepId: "plan",
          subProgress: 0.2,
          step: "Plan",
          progress: 10,
          generatedFiles: [
            { name: "serp-research-brief-old.json", content: "{}", mimeType: "application/json" },
          ],
        },
      },
      "site-1",
      { stepId: "plan", subProgress: 0.3, generatedFiles: [] },
    );
    expect(next["site-1"].generatedFiles).toEqual([]);
  });
});

