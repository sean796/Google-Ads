import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchAgentRun, patchAgentRun } from "@/lib/agent-runs-api";
import { appendAgentRunStep } from "@/lib/agent-runs/agent-run-step";
import { patchAgentRunInList } from "@/lib/agent-runs/agent-runs-local-patch";
import { finalizeWorkflowBoundAgentRunsOnFailure } from "@/lib/workflow/workflow-agent-run-finalize";
import type { AgentRun } from "@/lib/agent-runs-types";
import type { WorkflowDefinition, WorkflowStepOutput } from "@/lib/workflow/workflow-types";

vi.mock("@/lib/agent-runs-api", () => ({
  fetchAgentRun: vi.fn(),
  patchAgentRun: vi.fn(),
}));

vi.mock("@/lib/agent-runs/agent-run-step", () => ({
  appendAgentRunStep: vi.fn(),
}));

vi.mock("@/lib/agent-runs/agent-runs-local-patch", () => ({
  patchAgentRunInList: vi.fn(),
}));

const workflow: WorkflowDefinition = {
  id: 1,
  teamId: 1,
  name: "GSC",
  status: "draft",
  nodes: [],
  edges: [],
  ragVariables: [],
};

function agentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 42,
    teamId: 1,
    createdBy: 1,
    title: "GSC",
    recipeKey: "gsc_reporting",
    recipeTitle: "GSC",
    status: "running",
    source: "workflow",
    taskId: 0,
    taskTitle: "",
    context: {},
    plan: { workflowThenDelivery: true },
    result: { updated: 1 },
    errorMessage: "",
    clientBatchKey: "",
    startedAt: null,
    finishedAt: null,
    createdAt: "",
    updatedAt: "",
    steps: [],
    ...overrides,
  };
}

function outputs(partial: Partial<WorkflowStepOutput>[] = []): WorkflowStepOutput[] {
  return partial.map((row, index) => ({
    id: index + 1,
    runId: 10,
    nodeId: row.nodeId ?? "agent",
    variableKey: row.variableKey ?? "agent_1",
    scope: row.scope ?? "run",
    label: row.label ?? "Agent",
    textPreview: row.textPreview ?? "",
    agentRunId: row.agentRunId ?? 42,
    fileRefs: [],
    createdAt: "",
    ...row,
  }));
}

describe("finalizeWorkflowBoundAgentRunsOnFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAgentRun).mockResolvedValue(agentRun());
    vi.mocked(patchAgentRun).mockResolvedValue({ ok: true, run: agentRun({ status: "failed" }) });
    vi.mocked(appendAgentRunStep).mockResolvedValue(undefined);
  });

  it("marks running workflowThenDelivery agent failed on workflow error", async () => {
    await finalizeWorkflowBoundAgentRunsOnFailure({
      teamId: 1,
      workflow,
      outputs: outputs([{ nodeId: "agent", agentRunId: 42 }]),
      errorMessage: "Google Drive upload failed",
    });

    expect(appendAgentRunStep).toHaveBeenCalledWith(
      1,
      42,
      { label: "Google Drive upload failed", status: "error" },
      expect.any(Object),
    );
    expect(patchAgentRun).toHaveBeenCalledWith(
      1,
      42,
      expect.objectContaining({ status: "failed", errorMessage: "Google Drive upload failed" }),
    );
  });

  it("skips agents already terminal", async () => {
    vi.mocked(fetchAgentRun).mockResolvedValue(agentRun({ status: "done" }));
    await finalizeWorkflowBoundAgentRunsOnFailure({
      teamId: 1,
      workflow,
      outputs: outputs([{ nodeId: "agent", agentRunId: 42 }]),
      errorMessage: "Workflow run failed",
    });
    expect(patchAgentRun).not.toHaveBeenCalled();
  });
});
