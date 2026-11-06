import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AgentRun } from "@/lib/agent-runs-types";
import { findWorkflowNodeAgentRun } from "@/lib/workflow/workflow-node-agent-dedupe";

vi.mock("@/lib/agent-runs-api", () => ({
  fetchAgentRuns: vi.fn(),
}));

import { fetchAgentRuns } from "@/lib/agent-runs-api";

function ldRun(partial: Partial<AgentRun> & Pick<AgentRun, "id" | "status">): AgentRun {
  return {
    teamId: 1,
    createdBy: 1,
    title: "Export Local Dominator grid CSV",
    recipeKey: "local_dominator_export",
    recipeTitle: "Export Local Dominator grid CSV",
    source: "workflow",
    taskId: 0,
    taskTitle: "",
    result: null,
    errorMessage: "",
    clientBatchKey: "",
    startedAt: null,
    finishedAt: null,
    context: {
      workflowId: 10,
      workflowRunId: 400,
      workflowNodeId: "ld-node",
    },
    plan: {},
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("findWorkflowNodeAgentRun LD job cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers a running LD export over a Job not found failure", async () => {
    vi.mocked(fetchAgentRuns).mockResolvedValue([
      ldRun({ id: 1, status: "failed", errorMessage: "Job not found." }),
      ldRun({ id: 2, status: "running" }),
    ]);

    const found = await findWorkflowNodeAgentRun(1, 400, "ld-node");
    expect(found?.id).toBe(2);
  });

  it("keeps Job not found failure so a second LD export is not started", async () => {
    vi.mocked(fetchAgentRuns).mockResolvedValue([
      ldRun({ id: 3, status: "failed", errorMessage: "Job not found." }),
    ]);

    const found = await findWorkflowNodeAgentRun(1, 400, "ld-node");
    expect(found?.id).toBe(3);
  });

  it("keeps real LD export failures so a second export is not started", async () => {
    vi.mocked(fetchAgentRuns).mockResolvedValue([
      ldRun({
        id: 5,
        status: "failed",
        errorMessage: 'Menu item "Export as CSV" not found.',
      }),
    ]);

    const found = await findWorkflowNodeAgentRun(1, 400, "ld-node");
    expect(found?.id).toBe(5);
  });

  it("ignores other failed agents so entity can retry", async () => {
    vi.mocked(fetchAgentRuns).mockResolvedValue([
      {
        id: 4,
        teamId: 1,
        createdBy: 1,
        title: "Create scheduled entity pages",
        recipeKey: "entity_page_creator",
        recipeTitle: "Create scheduled entity pages",
        status: "failed",
        source: "workflow",
        taskId: 0,
        taskTitle: "",
        result: null,
        clientBatchKey: "",
        startedAt: null,
        finishedAt: null,
        errorMessage: "Upstream Local Dominator export did not produce a grid CSV.",
        context: {
          workflowId: 10,
          workflowRunId: 400,
          workflowNodeId: "entity-node",
        },
        plan: {},
        createdAt: "",
        updatedAt: "",
      },
    ]);

    const found = await findWorkflowNodeAgentRun(1, 400, "entity-node");
    expect(found).toBeNull();
  });
});
