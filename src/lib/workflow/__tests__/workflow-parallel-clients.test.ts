import { describe, expect, it, vi } from "vitest";
import type { AgentRun } from "@/lib/agent-runs-types";
import type { WorkflowDefinition, WorkflowNode, WorkflowRun } from "@/lib/workflow/workflow-types";

vi.mock("@/components/integrations/storage", () => ({
  getStoredSites: vi.fn(() => [
    { id: "site-a", name: "Site A", siteUrl: "https://a.example" },
    { id: "site-b", name: "Site B", siteUrl: "https://b.example" },
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
    resolveStepOutputFileRefsWithRetry: vi.fn(async () => []),
  };
});

vi.mock("@/lib/tasks-api", () => ({
  fetchTaskDetail: vi.fn(),
}));

vi.mock("@/lib/agent-runs-api", () => ({
  fetchAgentRun: vi.fn(),
  fetchAgentRuns: vi.fn(async () => []),
}));

const csvAuditConcurrency = { inFlight: 0, maxInFlight: 0 };

vi.mock("@/lib/workflow/workflow-csv-rows-runner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflow/workflow-csv-rows-runner")>();
  return {
    ...actual,
    persistPageAuditCsvToNextTask: vi.fn(async () => undefined),
    attachPageAuditCsvToAgentRun: vi.fn(async () => undefined),
    ensureWorkflowCsvRowsStashForAction: vi.fn(async () => undefined),
    executeWorkflowCsvRowsStep: vi.fn(async (input: { siteId?: string }) => {
      csvAuditConcurrency.inFlight += 1;
      csvAuditConcurrency.maxInFlight = Math.max(
        csvAuditConcurrency.maxInFlight,
        csvAuditConcurrency.inFlight,
      );
      await new Promise((resolve) => setTimeout(resolve, 40));
      csvAuditConcurrency.inFlight -= 1;
      return {
        preview: "url,H2\n",
        mapping: { mode: "bulk", payload: { targetUrls: [] } },
        csvText: "url,H2\n",
        fileName: `${input.siteId ?? "site"}.csv`,
      };
    }),
  };
});

import { executeWorkflowRun } from "@/lib/workflow/workflow-runner";

describe("workflow parallel clients", () => {
  const workflow: WorkflowDefinition = {
    id: 1,
    teamId: 1,
    name: "Multi client",
    status: "draft",
    nodes: [
      { id: "trigger", kind: "trigger_manual", label: "Trigger", config: {}, position: { x: 0, y: 0 } },
      {
        id: "client",
        kind: "workflow_client",
        label: "Client",
        config: { clientScope: "selected", siteIds: ["site-a", "site-b"] },
        position: { x: 0, y: 80 },
      },
      {
        id: "agent",
        kind: "action_agent",
        label: "GSC",
        config: { executionKind: "gsc_reporting", title: "GSC", ragVariableKey: "gsc_1" },
        position: { x: 0, y: 160 },
      },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "client" },
      { id: "e2", source: "client", target: "agent" },
    ],
    ragVariables: [],
    createdAt: "",
    updatedAt: "",
  };

  const run: WorkflowRun = {
    id: 10,
    workflowId: 1,
    teamId: 1,
    status: "running",
    createdAt: "",
    updatedAt: "",
  };

  it("starts one agent run per selected client in parallel", async () => {
    const { fetchWorkflow, fetchWorkflowRun, fetchWorkflowStepOutputs, saveWorkflowStepOutput } =
      await import("@/lib/workflow/workflow-api");

    vi.mocked(fetchWorkflow).mockResolvedValue(workflow);
    vi.mocked(fetchWorkflowRun).mockResolvedValue(run);
    vi.mocked(fetchWorkflowStepOutputs).mockResolvedValue([]);
    vi.mocked(saveWorkflowStepOutput).mockResolvedValue({ ok: true });

    const startedSiteIds: string[] = [];
    const startRunAndWait = vi.fn(async (payload: { context?: { siteId?: string } }) => {
      startedSiteIds.push(payload.context?.siteId ?? "");
      return {
        ok: true,
        run: { id: startedSiteIds.length, status: "done", result: { message: "ok" } },
      };
    });

    const result = await executeWorkflowRun(1, 1, 10, {
      startRun: startRunAndWait,
      startRunAndWait,
      listAvailableSiteIds: () => ["site-a", "site-b"],
    });

    expect(result.ok).toBe(true);
    expect(startedSiteIds.sort()).toEqual(["site-a", "site-b"]);
    expect(startRunAndWait).toHaveBeenCalledTimes(2);
    const payloads = startRunAndWait.mock.calls.map(
      (call) => (call[0] as { plan?: { executionPayload?: { siteUrl?: string; siteId?: string } } }).plan?.executionPayload,
    );
    expect(payloads.find((item) => item?.siteId === "site-a")?.siteUrl).toBe("https://a.example");
    expect(payloads.find((item) => item?.siteId === "site-b")?.siteUrl).toBe("https://b.example");
  });

  it("starts one browser automation run per client when targetUrlSource is client_site", async () => {
    const browserWorkflow: WorkflowDefinition = {
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === "agent"
          ? {
              ...node,
              label: "Browser",
              config: {
                executionKind: "browser_automation",
                title: "Browser",
                ragVariableKey: "browser_1",
                executionPayload: {
                  targetUrlSource: "client_site",
                  browserInstructionsHtml: "<p>Audit homepage</p>",
                },
              },
            }
          : node,
      ),
    };

    const { fetchWorkflow, fetchWorkflowRun, fetchWorkflowStepOutputs, saveWorkflowStepOutput } =
      await import("@/lib/workflow/workflow-api");

    vi.mocked(fetchWorkflow).mockResolvedValue(browserWorkflow);
    vi.mocked(fetchWorkflowRun).mockResolvedValue(run);
    vi.mocked(fetchWorkflowStepOutputs).mockResolvedValue([]);
    vi.mocked(saveWorkflowStepOutput).mockResolvedValue({ ok: true });

    const started: Array<{ siteId?: string; targetUrl?: string }> = [];
    const startRunAndWait = vi.fn(async (payload: {
      context?: { siteId?: string };
      plan?: { executionPayload?: { targetUrl?: string } };
    }) => {
      started.push({
        siteId: payload.context?.siteId,
        targetUrl: payload.plan?.executionPayload?.targetUrl,
      });
      return {
        ok: true,
        run: { id: started.length, status: "done", result: { message: "ok" } },
      };
    });

    const result = await executeWorkflowRun(1, 1, 10, {
      startRun: startRunAndWait,
      startRunAndWait,
      listAvailableSiteIds: () => ["site-a", "site-b"],
    });

    expect(result.ok).toBe(true);
    expect(startRunAndWait).toHaveBeenCalledTimes(2);
    expect(started.map((entry) => entry.siteId).sort()).toEqual(["site-a", "site-b"]);
    expect(started.find((entry) => entry.siteId === "site-a")?.targetUrl).toBe("https://a.example");
    expect(started.find((entry) => entry.siteId === "site-b")?.targetUrl).toBe("https://b.example");
  });

  it("fans out to all available sites when client scope is all", async () => {
    const { fetchWorkflow, fetchWorkflowRun, fetchWorkflowStepOutputs, patchWorkflowRun } =
      await import("@/lib/workflow/workflow-api");

    vi.mocked(fetchWorkflow).mockResolvedValue({
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === "client"
          ? { ...node, config: { clientScope: "all", siteIds: [] } }
          : node,
      ),
    });
    vi.mocked(fetchWorkflowRun).mockResolvedValue(run);
    vi.mocked(fetchWorkflowStepOutputs).mockResolvedValue([]);
    vi.mocked(patchWorkflowRun).mockResolvedValue({ ok: true, run });

    const startedSiteIds: string[] = [];
    const startRunAndWait = vi.fn(async (payload: { context?: { siteId?: string } }) => {
      startedSiteIds.push(payload.context?.siteId ?? "");
      return {
        ok: true,
        run: { id: startedSiteIds.length, status: "done", result: { message: "ok" } },
      };
    });

    const result = await executeWorkflowRun(1, 1, 10, {
      startRun: startRunAndWait,
      startRunAndWait,
      listAvailableSiteIds: () => ["site-a", "site-b", "site-c"],
    });

    expect(result.ok).toBe(true);
    expect(startedSiteIds.sort()).toEqual(["site-a", "site-b", "site-c"]);
  });

  it("fails early when client scope is all but no sites are available", async () => {
    const { fetchWorkflow, fetchWorkflowRun, fetchWorkflowStepOutputs } =
      await import("@/lib/workflow/workflow-api");

    vi.mocked(fetchWorkflow).mockResolvedValue({
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === "client"
          ? { ...node, config: { clientScope: "all", siteIds: [] } }
          : node,
      ),
    });
    vi.mocked(fetchWorkflowRun).mockResolvedValue(run);
    vi.mocked(fetchWorkflowStepOutputs).mockResolvedValue([]);

    const result = await executeWorkflowRun(1, 1, 10, {
      startRun: vi.fn(),
      startRunAndWait: vi.fn(),
      listAvailableSiteIds: () => [],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("No WordPress sites available. Add clients in Integrations.");
  });

  it("runs page audits for every selected client in parallel", async () => {
    const csvWorkflow: WorkflowDefinition = {
      ...workflow,
      nodes: [
        workflow.nodes[0]!,
        workflow.nodes[1]!,
        {
          id: "csv",
          kind: "csv_rows",
          label: "Page audit",
          config: { csvInputSource: "site", ragVariableKey: "csv_1" },
          position: { x: 0, y: 140 },
        },
        workflow.nodes[2]!,
      ],
      edges: [
        { id: "e1", source: "trigger", target: "client" },
        { id: "e2", source: "client", target: "csv" },
        { id: "e3", source: "csv", target: "agent" },
      ],
    };

    const { fetchWorkflow, fetchWorkflowRun, fetchWorkflowStepOutputs, saveWorkflowStepOutput } =
      await import("@/lib/workflow/workflow-api");
    const { executeWorkflowCsvRowsStep } = await import("@/lib/workflow/workflow-csv-rows-runner");

    csvAuditConcurrency.inFlight = 0;
    csvAuditConcurrency.maxInFlight = 0;
    vi.mocked(fetchWorkflow).mockResolvedValue(csvWorkflow);
    vi.mocked(fetchWorkflowRun).mockResolvedValue(run);
    vi.mocked(fetchWorkflowStepOutputs).mockResolvedValue([]);
    vi.mocked(saveWorkflowStepOutput).mockResolvedValue({
      ok: true,
      output: {
        id: 1,
        runId: 10,
        nodeId: "csv",
        variableKey: "csv_1",
        scope: "run",
        label: "Page audit",
        textPreview: "url,H2\n",
        fileRefs: [],
        createdAt: "",
      },
    });

    const startRunAndWait = vi.fn(async () => ({
      ok: true,
      run: { id: 77, status: "done", result: { message: "ok" } },
    }));

    const result = await executeWorkflowRun(1, 1, 10, {
      startRun: startRunAndWait,
      startRunAndWait,
      listAvailableSiteIds: () => ["site-a", "site-b"],
    });

    expect(result.ok).toBe(true);
    expect(executeWorkflowCsvRowsStep).toHaveBeenCalledTimes(2);
    expect(csvAuditConcurrency.maxInFlight).toBe(2);
  });
});

describe("workflowStepChainKey scope", () => {
  const baseWorkflow: WorkflowDefinition = {
    id: 1,
    teamId: 1,
    name: "Chain",
    status: "draft",
    nodes: [
      { id: "trigger", kind: "trigger_manual", label: "Trigger", config: {}, position: { x: 0, y: 0 } },
      {
        id: "client",
        kind: "workflow_client",
        label: "Client",
        config: { clientScope: "selected", siteIds: ["site-a", "site-b"] },
        position: { x: 0, y: 80 },
      },
      {
        id: "agent",
        kind: "action_agent",
        label: "LD",
        config: { executionKind: "local_dominator_export", title: "Grid", ragVariableKey: "ld_1" },
        position: { x: 0, y: 160 },
      },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "client" },
      { id: "e2", source: "client", target: "agent" },
    ],
    ragVariables: [],
    createdAt: "",
    updatedAt: "",
  };

  const baseRun: WorkflowRun = {
    id: 10,
    workflowId: 1,
    teamId: 1,
    status: "running",
    createdAt: "",
    updatedAt: "",
  };

  it("completes grid export chain for a scoped client site", async () => {
    const { runNextWorkflowAgentStep } = await import("@/lib/workflow/workflow-runner");
    const { fetchWorkflow, fetchWorkflowRun, fetchWorkflowStepOutputs, patchWorkflowRun } =
      await import("@/lib/workflow/workflow-api");
    const { fetchAgentRun } = await import("@/lib/agent-runs-api");

    const agentRun: AgentRun = {
      id: 501,
      teamId: 1,
      createdBy: 1,
      title: "LD",
      recipeKey: "local_dominator_export",
      recipeTitle: "LD",
      status: "done",
      source: "workflow",
      taskId: 0,
      taskTitle: "",
      context: { siteId: "site-a", workflowId: 1, workflowRunId: 10, workflowNodeId: "agent" },
      plan: { workflowId: 1, workflowRunId: 10, workflowNodeId: "agent" },
      result: null,
      errorMessage: "",
      clientBatchKey: "",
      startedAt: null,
      finishedAt: null,
      createdAt: "",
      updatedAt: "",
    };

    vi.mocked(fetchWorkflow).mockResolvedValue({
      ...baseWorkflow,
      nodes: [
        ...baseWorkflow.nodes,
        { id: "archive", kind: "rag_archive", label: "Archive", config: { variableKey: "out" }, position: { x: 0, y: 240 } },
      ],
      edges: [...baseWorkflow.edges, { id: "e3", source: "agent", target: "archive" }],
    });
    vi.mocked(fetchWorkflowRun).mockResolvedValue(baseRun);
    vi.mocked(fetchWorkflowStepOutputs).mockResolvedValue([
      {
        id: 1,
        runId: 10,
        nodeId: "agent",
        variableKey: "gsc_1__site_a",
        scope: "run",
        label: "GSC",
        textPreview: "CSV",
        fileRefs: [{ name: "grid.csv", url: "https://example.com/grid.csv" }],
        agentRunId: 501,
        siteId: "site-a",
        createdAt: "",
      },
    ]);
    vi.mocked(patchWorkflowRun).mockResolvedValue({ ok: true, run: baseRun });
    vi.mocked(fetchAgentRun).mockResolvedValue(agentRun);

    const startRunAndWait = vi.fn(async () => ({
      ok: true,
      run: { id: 999, status: "done", result: {} },
    }));

    await expect(
      runNextWorkflowAgentStep(1, agentRun, {
        startRun: startRunAndWait,
        startRunAndWait,
        listAvailableSiteIds: () => ["site-a", "site-b"],
      }),
    ).resolves.toBeUndefined();
  });
});
