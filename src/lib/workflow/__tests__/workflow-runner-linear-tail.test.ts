import { describe, expect, it, vi } from "vitest";
import { createWorkflowNode, createWorkflowActionAgentNode, insertNodeAfter } from "@/lib/workflow/workflow-graph-mutations";
import type { WorkflowDefinition, WorkflowRun, WorkflowStepOutput } from "@/lib/workflow/workflow-types";

vi.mock("@/components/integrations/storage", () => ({
  getStoredSites: vi.fn(() => [
    { id: "site-a", name: "Site A", siteUrl: "https://a.example" },
  ]),
}));

vi.mock("@/lib/workflow/workflow-rag-archive", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflow/workflow-rag-archive")>();
  return {
    ...actual,
    syncWorkflowRunArchiveDeliverables: vi.fn(async () => null),
  };
});

vi.mock("@/lib/workflow/workflow-api", () => ({
  ackPendingWorkflowTrigger: vi.fn(async () => ({ ok: true })),
  claimPendingWorkflowDispatch: vi.fn(async () => ({ ok: true, claimed: true })),
  fetchWorkflow: vi.fn(),
  fetchWorkflowRun: vi.fn(),
  fetchWorkflowStepOutputs: vi.fn(),
  patchWorkflowRun: vi.fn(async () => ({ ok: true })),
  saveWorkflowStepOutput: vi.fn(),
}));

vi.mock("@/lib/workflow/workflow-step-file-refs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflow/workflow-step-file-refs")>();
  return {
    ...actual,
    resolveStepOutputFileRefsWithRetry: vi.fn(async () => [
      { name: "gsc-report.md", url: "https://example.com/gsc.md" },
    ]),
  };
});

vi.mock("@/lib/workflow/workflow-then-runner", () => ({
  executeWorkflowThenStep: vi.fn(async (node: { id: string; label: string }) => ({
    ok: true,
    output: {
      variableKey: `then_${node.id}`,
      label: node.label,
      textPreview: "Google Drive upload complete",
      fileRefs: [{ name: "gsc-report.md", url: "https://example.com/gsc.md" }],
    },
  })),
}));

vi.mock("@/lib/tasks-api", () => ({
  fetchTaskDetail: vi.fn(),
}));

vi.mock("@/lib/agent-runs-api", () => ({
  fetchAgentRun: vi.fn(async () => ({
    id: 901,
    teamId: 1,
    status: "running",
    source: "workflow",
    plan: { workflowThenDelivery: true },
    result: { message: "GSC complete" },
  })),
  patchAgentRun: vi.fn(async () => ({ id: 901, status: "done" })),
}));

vi.mock("@/lib/agent-runs/agent-run-step", () => ({
  appendAgentRunStep: vi.fn(async () => undefined),
}));

vi.mock("@/lib/agent-runs/agent-runs-local-patch", () => ({
  patchAgentRunInList: vi.fn(),
}));

vi.mock("@/lib/workflow/workflow-grid-export-chain", () => ({
  chainWorkflowAfterAgentComplete: vi.fn(async () => undefined),
}));

vi.mock("@/lib/workflow/workflow-node-agent-dedupe", () => ({
  findWorkflowNodeAgentRun: vi.fn(async () => null),
  downstreamWorkflowAgentAlreadyStarted: vi.fn(async () => false),
}));

import { executeWorkflowRun } from "@/lib/workflow/workflow-runner";
import { executeWorkflowThenStep } from "@/lib/workflow/workflow-then-runner";
import { saveWorkflowStepOutput } from "@/lib/workflow/workflow-api";

function buildGscPipelineWorkflow(): WorkflowDefinition {
  const trigger = createWorkflowNode("trigger_manual", "Start");
  const client = createWorkflowNode("workflow_client", "Client");
  const gsc = createWorkflowActionAgentNode({
    executionKind: "gsc_reporting",
    label: "GSC",
  });
  const gdrive = createWorkflowNode("then_google_drive", "Google Drive");
  const rag = createWorkflowNode("rag_archive", "Archive");

  let workflow: WorkflowDefinition = {
    id: 1,
    teamId: 1,
    name: "GSC pipeline",
    status: "draft",
    nodes: [trigger],
    edges: [],
    ragVariables: [],
    createdAt: "",
    updatedAt: "",
  };
  workflow = insertNodeAfter(workflow, trigger.id, client);
  workflow = insertNodeAfter(workflow, client.id, gsc);
  workflow = insertNodeAfter(workflow, gsc.id, gdrive);
  workflow = insertNodeAfter(workflow, gdrive.id, rag);

  return {
    ...workflow,
    edges: [],
    nodes: workflow.nodes.map((node) => {
      if (node.kind === "workflow_client") {
        return {
          ...node,
          config: { clientScope: "selected", siteIds: ["site-a"] },
        };
      }
      if (node.kind === "then_google_drive") {
        return {
          ...node,
          config: {
            ...node.config,
            executionPayload: { googleDriveFolderId: "folder-123" },
          },
        };
      }
      if (node.kind === "rag_archive") {
        return {
          ...node,
          config: {
            variableKey: "archive_step",
            scope: "run",
            deliverableScope: "final",
            label: "Archive",
          },
        };
      }
      return node;
    }),
  };
}

describe("executeWorkflowRun linear tail", () => {
  const run: WorkflowRun = {
    id: 10,
    workflowId: 1,
    teamId: 1,
    status: "running",
    createdAt: "",
    updatedAt: "",
  };

  it("runs GSC, Google Drive, and RAG when graph edges are missing", async () => {
    const workflow = buildGscPipelineWorkflow();
    const gscNode = workflow.nodes.find((node) => node.label === "GSC")!;
    const gdriveNode = workflow.nodes.find((node) => node.label === "Google Drive")!;
    const ragNode = workflow.nodes.find((node) => node.label === "Archive")!;

    const { fetchWorkflow, fetchWorkflowRun, fetchWorkflowStepOutputs } =
      await import("@/lib/workflow/workflow-api");

    const savedOutputs: WorkflowStepOutput[] = [];
    vi.mocked(fetchWorkflow).mockResolvedValue(workflow);
    vi.mocked(fetchWorkflowRun).mockResolvedValue(run);
    vi.mocked(fetchWorkflowStepOutputs).mockResolvedValue([]);
    vi.mocked(saveWorkflowStepOutput).mockImplementation(async (_teamId, _wfId, _runId, payload) => {
      const output: WorkflowStepOutput = {
        id: 1,
        runId: 10,
        nodeId: payload.nodeId,
        variableKey: payload.variableKey,
        scope: payload.scope,
        label: payload.label,
        textPreview: payload.textPreview,
        agentRunId: payload.agentRunId ?? undefined,
        fileRefs: payload.fileRefs,
        createdAt: "",
      };
      savedOutputs.push(output);
      return { ok: true, output };
    });

    const startRunAndWait = vi.fn(async () => ({
      ok: true,
      run: { id: 901, status: "done", result: { message: "GSC complete" } },
    }));

    const result = await executeWorkflowRun(1, 1, 10, {
      startRun: startRunAndWait,
      startRunAndWait,
      listAvailableSiteIds: () => ["site-a"],
    });

    expect(result.ok, result.error ?? "unknown error").toBe(true);
    expect(startRunAndWait).toHaveBeenCalledTimes(1);
    expect(executeWorkflowThenStep).toHaveBeenCalled();
    expect(savedOutputs.some((output) => output.nodeId === gscNode.id)).toBe(true);
    expect(savedOutputs.some((output) => output.nodeId === gdriveNode.id)).toBe(true);
    expect(savedOutputs.some((output) => output.nodeId === ragNode.id)).toBe(true);
  });
});
