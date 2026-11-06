import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AgentRun } from "@/lib/agent-runs-types";
import type { WorkflowStepOutput } from "@/lib/workflow/workflow-types";
import {
  isLdGridCsvReceived,
  isLdWorkflowExportRun,
  tryContinueWorkflowAfterAgentComplete,
  tryContinueWorkflowAfterLdExport,
} from "@/lib/workflow/workflow-ld-continue-watchdog";

vi.mock("@/lib/workflow/workflow-api", () => ({
  fetchWorkflow: vi.fn(),
  fetchWorkflowRun: vi.fn(),
  fetchWorkflowStepOutputs: vi.fn(),
  ackPendingWorkflowTrigger: vi.fn(),
  patchWorkflowRun: vi.fn(),
}));

vi.mock("@/lib/agent-runs-api", () => ({
  fetchAgentRunArtifacts: vi.fn(),
  fetchAgentRuns: vi.fn(),
  fetchAgentRunCsvContent: vi.fn(),
}));

vi.mock("@/lib/workflow/workflow-runner", () => ({
  runNextWorkflowAgentStep: vi.fn(),
}));

import {
  ackPendingWorkflowTrigger,
  fetchWorkflow,
  fetchWorkflowRun,
  fetchWorkflowStepOutputs,
} from "@/lib/workflow/workflow-api";
import { fetchAgentRunArtifacts, fetchAgentRunCsvContent, fetchAgentRuns } from "@/lib/agent-runs-api";
import { runNextWorkflowAgentStep } from "@/lib/workflow/workflow-runner";

const ldRun: AgentRun = {
  id: 894,
  teamId: 1,
  createdBy: 1,
  title: "Export Local Dominator grid CSV",
  recipeKey: "local_dominator_export",
  recipeTitle: "Export Local Dominator grid CSV",
  status: "done",
  source: "workflow",
  taskId: 0,
  taskTitle: "",
  result: null,
  errorMessage: "",
  clientBatchKey: "",
  startedAt: null,
  finishedAt: null,
  context: {
    siteId: "wp-1",
    workflowId: 10,
    workflowRunId: 292,
    workflowNodeId: "ld-node",
  },
  plan: {},
  createdAt: "",
  updatedAt: "",
};

function stepOutput(partial: Partial<WorkflowStepOutput>): WorkflowStepOutput {
  return {
    id: 1,
    runId: 292,
    nodeId: "ld-node",
    variableKey: "var",
    scope: "run",
    label: "Output",
    textPreview: "",
    fileRefs: [],
    createdAt: "",
    ...partial,
  };
}

function makeAgentRun(overrides: Partial<AgentRun>): AgentRun {
  return {
    id: 1,
    teamId: 1,
    createdBy: 1,
    title: "Agent",
    recipeKey: "entity_page_creator",
    recipeTitle: "Agent",
    status: "running",
    source: "workflow",
    taskId: 0,
    taskTitle: "",
    context: {},
    plan: {},
    result: null,
    errorMessage: "",
    clientBatchKey: "",
    startedAt: null,
    finishedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("workflow-ld-continue-watchdog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAgentRuns).mockResolvedValue([]);
    vi.mocked(fetchWorkflow).mockResolvedValue({
      id: 10,
      teamId: 1,
      name: "Test",
      nodes: [
        { id: "ld-node", kind: "action_agent", label: "LD", config: { executionKind: "local_dominator_export" } },
        { id: "entity-node", kind: "action_agent", label: "Entity", config: { executionKind: "entity_page_creator" } },
      ],
      edges: [{ source: "ld-node", target: "entity-node" }],
    } as never);
  });

  it("identifies workflow LD export runs", () => {
    expect(isLdWorkflowExportRun(ldRun)).toBe(true);
    expect(isLdWorkflowExportRun({ ...ldRun, source: "task_manager" })).toBe(false);
  });

  it("waits until grid CSV appears in workflow step outputs", async () => {
    vi.mocked(fetchWorkflowStepOutputs).mockResolvedValue([]);
    vi.mocked(fetchAgentRunArtifacts).mockResolvedValue([]);

    const result = await isLdGridCsvReceived(1, {
      workflowId: 10,
      workflowRunId: 292,
      workflowNodeId: "ld-node",
    }, 894);

    expect(result.ready).toBe(false);
    expect(result.fileRefs).toEqual([]);
  });

  it("continues workflow only after CSV is received", async () => {
    vi.mocked(fetchWorkflowRun).mockResolvedValue({
      id: 292,
      workflowId: 10,
      teamId: 1,
      status: "running",
      currentNodeId: "ld-node",
      createdAt: "",
      updatedAt: "",
    });
    const ldOutput = stepOutput({
      nodeId: "ld-node",
      agentRunId: 894,
      variableKey: "local_dominator_export_1",
      scope: "run",
      label: "Grid",
      fileRefs: [{ name: "grid.csv", url: "https://example.com/grid.csv", mime: "text/csv" }],
    });
    const entityOutput = stepOutput({
      nodeId: "entity-node",
      agentRunId: 895,
      variableKey: "entity_page_creator_1",
      scope: "run",
      label: "Entity",
    });
    vi.mocked(fetchWorkflowStepOutputs).mockImplementation(async () => {
      if (vi.mocked(runNextWorkflowAgentStep).mock.calls.length > 0) {
        return [ldOutput, entityOutput];
      }
      return [ldOutput];
    });
    vi.mocked(runNextWorkflowAgentStep).mockResolvedValue(undefined);
    vi.mocked(fetchAgentRunCsvContent).mockResolvedValue("Business Name,Rank\nTest,1");

    const continued = await tryContinueWorkflowAfterLdExport(1, ldRun, {
      startRun: vi.fn(),
    });

    expect(continued).toBe(true);
    expect(runNextWorkflowAgentStep).toHaveBeenCalledOnce();
    expect(ackPendingWorkflowTrigger).toHaveBeenCalledWith(1, 10);
  });

  it("does not start a second downstream agent when one already exists", async () => {
    vi.mocked(fetchWorkflowRun).mockResolvedValue({
      id: 292,
      workflowId: 10,
      teamId: 1,
      status: "running",
      currentNodeId: "ld-node",
      createdAt: "",
      updatedAt: "",
    });
    vi.mocked(fetchWorkflowStepOutputs).mockResolvedValue([
      stepOutput({
        nodeId: "ld-node",
        agentRunId: 894,
        variableKey: "local_dominator_export_1",
        scope: "run",
        label: "Grid",
        fileRefs: [{ name: "grid.csv", url: "https://example.com/grid.csv", mime: "text/csv" }],
      }),
    ]);
    vi.mocked(fetchAgentRuns).mockResolvedValue([
      makeAgentRun({
        id: 895,
        title: "Create scheduled entity pages",
        recipeKey: "entity_page_creator",
        recipeTitle: "Create scheduled entity pages",
        status: "running",
        context: {
          workflowId: 10,
          workflowRunId: 292,
          workflowNodeId: "entity-node",
        },
      }),
    ]);

    const continued = await tryContinueWorkflowAfterLdExport(1, ldRun, {
      startRun: vi.fn(),
    });

    expect(continued).toBe(false);
    expect(runNextWorkflowAgentStep).not.toHaveBeenCalled();
  });

  it("retries entity pages after a prior failed entity when LD CSV is ready", async () => {
    const retryLdRun: AgentRun = {
      ...ldRun,
      id: 1094,
      context: {
        ...ldRun.context,
        workflowRunId: 392,
      },
    };
    vi.mocked(fetchWorkflowRun).mockResolvedValue({
      id: 392,
      workflowId: 10,
      teamId: 1,
      status: "failed",
      currentNodeId: "entity-node",
      createdAt: "",
      updatedAt: "",
    });
    const ldOutput = stepOutput({
      nodeId: "ld-node",
      agentRunId: 1094,
      variableKey: "local_dominator_export_1",
      scope: "run",
      label: "Grid",
      fileRefs: [{ name: "grid.csv", url: "https://example.com/grid.csv", mime: "text/csv" }],
    });
    vi.mocked(fetchWorkflowStepOutputs).mockImplementation(async () => {
      if (vi.mocked(runNextWorkflowAgentStep).mock.calls.length > 0) {
        return [
          ldOutput,
          stepOutput({
            nodeId: "entity-node",
            agentRunId: 1096,
            variableKey: "entity_page_creator_1",
            scope: "run",
            label: "Entity",
          }),
        ];
      }
      return [ldOutput];
    });
    vi.mocked(fetchAgentRuns).mockResolvedValue([
      makeAgentRun({
        id: 1095,
        title: "Create scheduled entity pages",
        recipeKey: "entity_page_creator",
        recipeTitle: "Create scheduled entity pages",
        status: "failed",
        errorMessage: "Upstream Local Dominator export did not produce a grid CSV.",
        context: {
          workflowId: 10,
          workflowRunId: 392,
          workflowNodeId: "entity-node",
        },
      }),
    ]);
    vi.mocked(runNextWorkflowAgentStep).mockResolvedValue(undefined);
    vi.mocked(fetchAgentRunCsvContent).mockResolvedValue("Business Name,Rank\nTest,1");

    const continued = await tryContinueWorkflowAfterLdExport(1, retryLdRun, {
      startRun: vi.fn(),
    });

    expect(continued).toBe(true);
    expect(runNextWorkflowAgentStep).toHaveBeenCalledOnce();
  });

  it("continues Then steps after entity page creator when workflowThenDelivery is set", async () => {
    const entityRun: AgentRun = makeAgentRun({
      id: 902,
      title: "Create scheduled entity pages",
      recipeKey: "entity_page_creator",
      recipeTitle: "Create scheduled entity pages",
      status: "done",
      context: {
        workflowId: 10,
        workflowRunId: 295,
        workflowNodeId: "entity-node",
      },
      plan: { workflowThenDelivery: true },
    });

    vi.mocked(fetchWorkflowRun).mockResolvedValue({
      id: 295,
      workflowId: 10,
      teamId: 1,
      status: "running",
      currentNodeId: "entity-node",
      createdAt: "",
      updatedAt: "",
    });
    vi.mocked(fetchWorkflow).mockResolvedValue({
      id: 10,
      teamId: 1,
      name: "Test",
      nodes: [
        {
          id: "entity-node",
          kind: "action_agent",
          label: "Entity",
          config: { executionKind: "entity_page_creator" },
        },
        { id: "gdrive-node", kind: "then_google_drive", label: "Google Drive", config: {} },
        { id: "rag-node", kind: "rag_archive", label: "Archive", config: { variableKey: "rag" } },
      ],
      edges: [
        { source: "entity-node", target: "gdrive-node" },
        { source: "gdrive-node", target: "rag-node" },
      ],
    } as never);
    vi.mocked(fetchWorkflowStepOutputs).mockResolvedValue([
      stepOutput({
        nodeId: "entity-node",
        agentRunId: 902,
        variableKey: "entity_page_creator_1",
        scope: "run",
        label: "Entity",
      }),
    ]);
    vi.mocked(runNextWorkflowAgentStep).mockImplementation(async () => {
      vi.mocked(fetchWorkflowStepOutputs).mockResolvedValue([
        stepOutput({
          nodeId: "entity-node",
          agentRunId: 902,
          variableKey: "entity_page_creator_1",
          scope: "run",
          label: "Entity",
        }),
        stepOutput({
          nodeId: "gdrive-node",
          variableKey: "then_gdrive-node",
          scope: "run",
          label: "Google Drive",
        }),
        stepOutput({
          nodeId: "rag-node",
          variableKey: "rag",
          scope: "run",
          label: "Archive",
        }),
      ]);
    });

    const continued = await tryContinueWorkflowAfterAgentComplete(1, entityRun, {
      startRun: vi.fn(),
    });

    expect(continued).toBe(true);
    expect(runNextWorkflowAgentStep).toHaveBeenCalledWith(1, entityRun, expect.any(Object));
    expect(ackPendingWorkflowTrigger).toHaveBeenCalledWith(1, 10);
  });
});
