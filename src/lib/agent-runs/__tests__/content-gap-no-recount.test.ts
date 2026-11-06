import { describe, expect, it } from "vitest";
import { contentGapResultFromRun } from "@/lib/agent-runs/run-content-gap-check-client-harness";
import type { AgentRun } from "@/lib/agent-runs-types";

function baseRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 1026,
    teamId: 1,
    createdBy: 1,
    title: "Content gap check",
    recipeKey: "content_gap_check",
    recipeTitle: "Content gap check",
    status: "running",
    source: "workflow",
    taskId: 0,
    taskTitle: "Content gap check",
    context: {},
    plan: {},
    startedAt: "",
    finishedAt: null,
    errorMessage: "",
    clientBatchKey: "agent-run-1026",
    createdAt: "",
    updatedAt: "",
    result: null,
    ...overrides,
  };
}

describe("contentGapResultFromRun", () => {
  it("returns null when gap has not been counted yet", () => {
    expect(contentGapResultFromRun(baseRun())).toBeNull();
  });

  it("reuses an existing gap count so the harness does not recount", () => {
    const existing = contentGapResultFromRun(
      baseRun({
        result: {
          message: "Gap: 15\nCreate 15 SAP page(s).",
          gapCount: 15,
          goalMet: false,
          postCount: 15,
        },
      }),
    );
    expect(existing).toEqual({
      message: "Gap: 15\nCreate 15 SAP page(s).",
      gapCount: 15,
      goalMet: false,
      postCount: 15,
      batchKey: "agent-run-1026",
    });
  });

  it("treats gapCount 0 as target met", () => {
    const existing = contentGapResultFromRun(
      baseRun({
        result: {
          gapCount: 0,
          goalMet: true,
          message: "Target met",
        },
      }),
    );
    expect(existing?.goalMet).toBe(true);
    expect(existing?.gapCount).toBe(0);
  });
});
