import { describe, expect, it } from "vitest";
import { formatAgentRunLogJson, formatAgentRunLogTimeline } from "@/lib/agent-runs/agent-run-log-format";
import type { AgentRun } from "@/lib/agent-runs-types";

function baseRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 994,
    teamId: 1,
    createdBy: 1,
    title: "Content gap check",
    recipeKey: "content_gap_check",
    recipeTitle: "Content gap check",
    status: "done",
    source: "workflow",
    taskId: 0,
    taskTitle: "Content gap check",
    context: {},
    plan: {},
    clientBatchKey: "",
    createdAt: "",
    updatedAt: "",
    startedAt: "2026-08-21 20:24:08",
    finishedAt: "2026-08-21 20:24:11",
    errorMessage: "",
    result: {
      goalMet: true,
      gapCount: 0,
      message: "Gap: 0\nTarget met (15/3). No post(s) needed.",
      checkpoint: {
        completedUrls: [],
        uploadedUrls: [],
        lastMessage: "Target met",
        lastStepLabel: "Target met",
        lastStepAt: "2026-08-21T20:24:10.983Z",
      },
    },
    steps: [
      {
        id: 1,
        stepIndex: 0,
        label: "Counting content",
        status: "done",
        createdAt: "2026-08-21T20:24:08.746Z",
        updatedAt: "2026-08-21T20:24:10.900Z",
      },
      {
        id: 2,
        stepIndex: 1,
        label: "Target met",
        status: "done",
        createdAt: "2026-08-21T20:24:10.983Z",
        updatedAt: "2026-08-21T20:24:10.983Z",
      },
    ],
    ...overrides,
  };
}

describe("content gap goal met stop", () => {
  it("exports done step statuses instead of forcing running", () => {
    const run = baseRun();
    const json = formatAgentRunLogJson(run, run.steps ?? []);
    expect(json.run.status).toBe("done");
    expect(json.steps.map((step) => step.status)).toEqual(["done", "done"]);
    expect(json.steps.map((step) => step.label)).toEqual(["Counting content", "Target met"]);
  });

  it("timeline shows done status and not active when run is done", () => {
    const run = baseRun();
    const rows = formatAgentRunLogTimeline(run, run.steps ?? [], "Target met");
    expect(rows[1]?.status).toBe("done");
    expect(rows[1]?.isActive).toBe(false);
  });
});
