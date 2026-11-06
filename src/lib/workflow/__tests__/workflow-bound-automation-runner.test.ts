import { describe, expect, it, vi, beforeEach } from "vitest";
import { createWorkflowActionAgentNode, createWorkflowNode, insertNodeAfter } from "@/lib/workflow/workflow-graph-mutations";
import type { AgentRun } from "@/lib/agent-runs-types";
import type { WorkflowDefinition } from "@/lib/workflow/workflow-types";

vi.mock("@/components/integrations/storage", () => ({
  getStoredSites: vi.fn(() => []),
}));

vi.mock("@/lib/workflow/workflow-api", () => ({
  fetchWorkflow: vi.fn(),
  fetchWorkflowStepOutputs: vi.fn(async () => []),
  saveWorkflowStepOutput: vi.fn(async () => ({ ok: true, output: { nodeId: "drive", scope: "run" } })),
}));

vi.mock("@/lib/workflow/workflow-then-runner", () => ({
  executeWorkflowThenStep: vi.fn(async () => ({
    ok: true,
    output: {
      variableKey: "then_drive",
      label: "Google Drive",
      textPreview: "Uploaded",
      fileRefs: [],
      agentRunId: 42,
    },
  })),
}));

vi.mock("@/lib/workflow/workflow-agent-binding", () => ({
  readWorkflowAgentBinding: vi.fn(() => ({
    workflowId: 1,
    workflowRunId: 10,
    workflowNodeId: "gsc",
  })),
}));

import { runWorkflowBoundDeliverySteps } from "@/lib/workflow/workflow-bound-automation-runner";
import { executeWorkflowThenStep } from "@/lib/workflow/workflow-then-runner";
import { fetchWorkflow, saveWorkflowStepOutput } from "@/lib/workflow/workflow-api";

function buildWorkflow(includeEmail = false): WorkflowDefinition {
  const trigger = createWorkflowNode("trigger_manual", "Start");
  const gsc = createWorkflowActionAgentNode({ executionKind: "gsc_reporting", label: "GSC" });
  const drive = createWorkflowNode("then_google_drive", "Google Drive");
  const email = createWorkflowNode("then_email", "Email");
  let workflow: WorkflowDefinition = {
    id: 1,
    teamId: 1,
    name: "GSC",
    status: "draft",
    nodes: [trigger],
    edges: [],
    ragVariables: [],
    createdAt: "",
    updatedAt: "",
  };
  workflow = insertNodeAfter(workflow, trigger.id, gsc);
  workflow = insertNodeAfter(workflow, gsc.id, drive);
  if (includeEmail) {
    workflow = insertNodeAfter(workflow, drive.id, email);
  }
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) =>
      node.label === "GSC"
        ? { ...node, id: "gsc" }
        : node.label === "Google Drive"
          ? { ...node, id: "drive" }
          : node.label === "Email"
            ? { ...node, id: "email" }
            : node,
    ),
  };
}

function makeRun(): AgentRun {
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
    context: { siteId: "site-a" },
    plan: {
      workflowThenDelivery: true,
      executionPayload: {
        siteId: "site-a",
        businessName: "Ridgeline Solar",
        siteUrl: "https://ridgelinesolar.ca",
      },
    },
    result: { updated: 1 },
    errorMessage: "",
    clientBatchKey: "",
    startedAt: null,
    finishedAt: null,
    createdAt: "",
    updatedAt: "",
    steps: [],
  };
}

describe("runWorkflowBoundDeliverySteps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWorkflow).mockResolvedValue(buildWorkflow());
  });

  it("runs Google Drive Then step and saves workflow output", async () => {
    await runWorkflowBoundDeliverySteps({ teamId: 1, run: makeRun() });
    expect(executeWorkflowThenStep).toHaveBeenCalledTimes(1);
    expect(vi.mocked(executeWorkflowThenStep).mock.calls[0]?.[0]).toMatchObject({
      kind: "then_google_drive",
    });
    expect(saveWorkflowStepOutput).toHaveBeenCalled();
  });

  it("still uploads Google Drive when another client already saved the Then output", async () => {
    const { fetchWorkflowStepOutputs } = await import("@/lib/workflow/workflow-api");
    vi.mocked(fetchWorkflowStepOutputs).mockResolvedValueOnce([
      {
        id: 1,
        runId: 10,
        nodeId: "drive",
        variableKey: "then_drive",
        scope: "run",
        label: "Google Drive",
        textPreview: "Uploaded",
        fileRefs: [],
        agentRunId: 99,
        siteId: "site-other",
        createdAt: "",
      },
    ]);
    await runWorkflowBoundDeliverySteps({ teamId: 1, run: makeRun() });
    expect(executeWorkflowThenStep).toHaveBeenCalledTimes(1);
  });

  it("skips Google Drive when workflow output already exists", async () => {
    const { fetchWorkflowStepOutputs } = await import("@/lib/workflow/workflow-api");
    vi.mocked(fetchWorkflowStepOutputs).mockResolvedValueOnce([
      {
        id: 1,
        runId: 10,
        nodeId: "drive",
        variableKey: "then_drive",
        scope: "run",
        label: "Google Drive",
        textPreview: "Uploaded",
        fileRefs: [],
        agentRunId: 42,
        createdAt: "",
      },
    ]);
    await runWorkflowBoundDeliverySteps({ teamId: 1, run: makeRun() });
    expect(executeWorkflowThenStep).not.toHaveBeenCalled();
  });

  it("runs downstream email Then steps and saves workflow outputs", async () => {
    vi.mocked(fetchWorkflow).mockResolvedValue(buildWorkflow(true));
    await runWorkflowBoundDeliverySteps({ teamId: 1, run: makeRun() });
    expect(executeWorkflowThenStep).toHaveBeenCalledTimes(2);
    expect(vi.mocked(executeWorkflowThenStep).mock.calls[1]?.[0]).toMatchObject({
      kind: "then_email",
    });
    expect(vi.mocked(executeWorkflowThenStep).mock.calls[1]?.[2]).toMatchObject({
      siteName: "Ridgeline Solar",
      siteUrl: "https://ridgelinesolar.ca",
    });
    expect(saveWorkflowStepOutput).toHaveBeenCalled();
  });

  it("skips local dominator export defer runs", async () => {
    const run = { ...makeRun(), recipeKey: "local_dominator_export" as const };
    await runWorkflowBoundDeliverySteps({ teamId: 1, run });
    expect(executeWorkflowThenStep).not.toHaveBeenCalled();
  });
});
