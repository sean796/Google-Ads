import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkflowNode, insertNodeAfter, linearOrderedNodes } from "@/lib/workflow/workflow-graph-mutations";
import { executeWorkflowThenStep, resetGoogleDriveThenFlightsForTests } from "@/lib/workflow/workflow-then-runner";
import { defaultThenVariableKey, thenConfig } from "@/lib/workflow/workflow-then-utils";
import type { WorkflowDefinition, WorkflowNode, WorkflowStepOutput } from "@/lib/workflow/workflow-types";

vi.mock("@/components/integrations/storage", () => ({
  getStoredSites: vi.fn(() => [
    {
      id: "posh-outdoors",
      name: "Posh Outdoors",
      siteUrl: "https://posh-outdoors.com",
      username: "",
      appPassword: "",
      connectedAt: 0,
    },
    {
      id: "ridgeline",
      name: "Ridgeline Solar",
      siteUrl: "https://ridgelinesolar.ca",
      username: "",
      appPassword: "",
      connectedAt: 0,
    },
  ]),
}));

vi.mock("@/lib/automation-email-delivery", () => ({
  sendAutomationEmailIfConfigured: vi.fn(async (args: { summaryText: string }) => ({
    emailSent: true,
    summaryText: args.summaryText,
  })),
}));

vi.mock("@/lib/google-drive/upload-deliverable-to-drive", () => ({
  uploadDeliverableToDrive: vi.fn(async (input: { fileName: string; content: string; folderId: string }) => ({
    success: true,
    fileId: "test-file-id",
    webViewLink: "https://drive.google.com/file/d/test-file-id/view",
    name: input.fileName,
  })),
}));

vi.mock("@/lib/automation-google-drive-delivery", () => ({
  enrichGoogleDriveContractFromSite: vi.fn((contract: Record<string, unknown>) => contract),
  readConfiguredGoogleDriveTargetFolder: vi.fn(() => null),
  normalizeWorkflowDriveContract: vi.fn((contract: Record<string, unknown>) => ({
    ...contract,
    saveToGoogleDrive: true,
    googleDriveFolderSource: "path",
    googleDriveFolderPath: "reporting",
  })),
  resolveGoogleDriveTargetFolder: vi.fn(async (args: { siteName?: string }) => {
    const client = String(args.siteName ?? "Acme").trim() || "Acme";
    return {
      folderId: "folder-target",
      label: `NEO Pulse / ${client} / Reporting / 2026 / August`,
      webViewLink: "https://drive.google.com/drive/folders/folder-target",
      created: ["Reporting / 2026 / August"],
    };
  }),
  resolveDriveUploadDeliverables: vi.fn(async (input: { executionKind?: string }) => {
    if (input.executionKind === "gsc_reporting") {
      return [
        {
          fileName: "Acme - Meeting notes - August 2026",
          content: "# Meeting notes",
          mime: "text/markdown",
          convertToGoogleDoc: true,
        },
        {
          fileName: "gsc-report-mom-acme-1",
          content: "# Report",
          mime: "text/markdown",
          convertToGoogleDoc: true,
        },
      ];
    }
    return [
      {
        fileName: "report.md",
        content: "# Report",
        mime: "text/markdown",
        convertToGoogleDoc: true,
      },
    ];
  }),
  uploadDeliverableToGoogleDriveIfConfigured: vi.fn(async () => ({
    googleDriveWebViewLink: "https://drive.google.com/file/d/abc/view",
    googleDriveFileWebViewLink: "https://drive.google.com/file/d/abc/view",
    googleDriveFileId: "abc",
    googleDriveFileName: "report.md",
    googleDriveFolderWebViewLink: "https://drive.google.com/drive/folders/folder-target",
    googleDriveFolderLabel: "NEO Pulse / Acme / Reporting / 2026 / August",
    googleDriveTargetFolderId: "folder-target",
  })),
}));

vi.mock("@/lib/agent-runs-api", () => ({
  fetchAgentRun: vi.fn(async (teamId: number, runId: number) => ({
    id: runId,
    teamId,
    steps: [],
    status: "done",
    recipeKey: "gsc_reporting",
    title: "GSC",
    recipeTitle: "GSC",
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
  })),
  fetchAgentRunArtifacts: vi.fn(async () => []),
  fetchAgentRunDeliverableFiles: vi.fn(async () => [
    { fileName: "gsc-report-mom-acme-1.md", content: "# Report", mime: "text/markdown" },
    { fileName: "mom-queries.csv", content: "a,b", mime: "text/csv" },
  ]),
}));

vi.mock("@/lib/agent-runs/agent-run-step", () => ({
  appendAgentRunStep: vi.fn(async () => {}),
}));

function baseWorkflow(nodes: WorkflowNode[]): WorkflowDefinition {
  return {
    id: 1,
    teamId: 1,
    name: "Test",
    status: "draft",
    nodes,
    edges: [],
    ragVariables: [],
  };
}

describe("workflow-then-runner", () => {
  beforeEach(() => {
    resetGoogleDriveThenFlightsForTests();
  });

  it("forces Google Drive input to single", () => {
    const driveNode = createWorkflowNode("then_google_drive", "Google Drive");
    driveNode.config = { inputMode: "all_deliverables" };
    expect(thenConfig(driveNode).inputMode).toBe("single");
  });

  it("uploads Google Drive once per client", async () => {
    const { resolveDriveUploadDeliverables, uploadDeliverableToGoogleDriveIfConfigured } = await import(
      "@/lib/automation-google-drive-delivery"
    );
    vi.mocked(resolveDriveUploadDeliverables).mockClear();
    vi.mocked(uploadDeliverableToGoogleDriveIfConfigured).mockClear();
    const driveNode = createWorkflowNode("then_google_drive", "Google Drive");
    driveNode.config = {
      inputVariableKey: "step_a1",
      inputNodeId: "a1",
      executionPayload: { saveToGoogleDrive: true, googleDriveFolderId: "folder" },
    };
    const outA: WorkflowStepOutput = {
      id: 1,
      runId: 1,
      nodeId: "a1",
      variableKey: "step_a1",
      scope: "run",
      label: "Agent",
      textPreview: "Done",
      fileRefs: [],
      agentRunId: 10,
      siteId: "site-a",
      createdAt: "",
    };
    const outB: WorkflowStepOutput = { ...outA, id: 2, agentRunId: 11, siteId: "site-b" };
    const workflow = baseWorkflow([driveNode]);
    const [first, second] = await Promise.all([
      executeWorkflowThenStep(driveNode, [outA], {
        workflow,
        siteId: "site-a",
        siteName: "Acme",
        siteUrl: "https://acme.test",
      }),
      executeWorkflowThenStep(driveNode, [outB], {
        workflow,
        siteId: "site-b",
        siteName: "Blinds West",
        siteUrl: "https://blindswest.test",
      }),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(resolveDriveUploadDeliverables).toHaveBeenCalledTimes(2);
    expect(uploadDeliverableToGoogleDriveIfConfigured).toHaveBeenCalledTimes(2);
  });

  it("uploads agent deliverables on then_google_drive", async () => {
    const agentOutput: WorkflowStepOutput = {
      id: 1,
      runId: 1,
      nodeId: "a1",
      variableKey: "step_a1",
      scope: "run",
      label: "Agent",
      textPreview: "Done",
      fileRefs: [],
      agentRunId: 10,
      createdAt: "",
    };
    const driveNode = createWorkflowNode("then_google_drive", "Google Drive");
    driveNode.config = {
      inputVariableKey: "step_a1",
      inputNodeId: "a1",
      executionPayload: { saveToGoogleDrive: true, googleDriveFolderId: "folder" },
    };

    const result = await executeWorkflowThenStep(
      driveNode,
      [agentOutput],
      { workflow: baseWorkflow([driveNode]), siteName: "Acme", siteUrl: "https://acme.test" },
    );

    expect(result.ok).toBe(true);
    expect(result.output?.deliveryMeta?.googleDriveUrl).toBe(
      "https://drive.google.com/file/d/abc/view",
    );
    expect(result.output?.deliveryMeta?.googleDriveFolderUrl).toBe(
      "https://drive.google.com/drive/folders/folder-target",
    );
    expect(result.output?.fileRefs?.[0]?.mime).toBe("application/vnd.google-apps.document");
    expect(result.output?.fileRefs?.[1]?.mime).toBe("application/vnd.google-apps.folder");
    expect(result.output?.fileRefs?.[1]?.name).toBe("August");
  });

  it("requires upstream output on then_google_drive", async () => {
    const driveNode = createWorkflowNode("then_google_drive", "Google Drive");
    driveNode.config = {
      executionPayload: { saveToGoogleDrive: true, googleDriveFolderId: "folder" },
    };

    const result = await executeWorkflowThenStep(
      driveNode,
      [],
      { workflow: baseWorkflow([driveNode]), siteName: "Acme", siteUrl: "https://acme.test" },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/upstream output/i);
  });

  it("uploads a test markdown file on then_google_drive when folderTestOnly is set", async () => {
    const { uploadDeliverableToGoogleDriveIfConfigured } = await import(
      "@/lib/automation-google-drive-delivery"
    );
    const { uploadDeliverableToDrive } = await import("@/lib/google-drive/upload-deliverable-to-drive");
    vi.mocked(uploadDeliverableToGoogleDriveIfConfigured).mockClear();
    vi.mocked(uploadDeliverableToDrive).mockClear();
    const driveNode = createWorkflowNode("then_google_drive", "Google Drive");
    driveNode.label = "Monthly Report Drive";
    driveNode.config = {
      executionPayload: { saveToGoogleDrive: true, googleDriveFolderId: "folder" },
    };

    const result = await executeWorkflowThenStep(
      driveNode,
      [],
      {
        workflow: baseWorkflow([driveNode]),
        siteName: "Acme",
        siteUrl: "https://acme.test",
        folderTestOnly: true,
      },
    );

    expect(result.ok).toBe(true);
    expect(uploadDeliverableToDrive).toHaveBeenCalledWith(
      expect.objectContaining({
        folderId: "folder-target",
        mime: "text/markdown",
        convertToGoogleDoc: true,
      }),
    );
    const uploadArgs = vi.mocked(uploadDeliverableToDrive).mock.calls[0]?.[0];
    expect(uploadArgs?.content).toContain("# Monthly Report Drive");
    expect(uploadArgs?.content).toContain("Test file");
    expect(uploadArgs?.fileName).toMatch(/Monthly-Report-Drive-test-/);
    expect(result.output?.fileRefs?.some((ref) => ref.url?.includes("folder-target"))).toBe(true);
    expect(uploadDeliverableToGoogleDriveIfConfigured).not.toHaveBeenCalled();
  });

  it("fails then_google_drive when upstream exists but no deliverable uploads", async () => {
    const { resolveDriveUploadDeliverables } = await import("@/lib/automation-google-drive-delivery");
    vi.mocked(resolveDriveUploadDeliverables).mockResolvedValueOnce([]);

    const agentOutput: WorkflowStepOutput = {
      id: 1,
      runId: 1,
      nodeId: "a1",
      variableKey: "step_a1",
      scope: "run",
      label: "Agent",
      textPreview: "GSC report",
      fileRefs: [],
      agentRunId: 10,
      createdAt: "",
    };
    const driveNode = createWorkflowNode("then_google_drive", "Google Drive");
    driveNode.config = {
      inputVariableKey: "step_a1",
      inputNodeId: "a1",
      executionPayload: { saveToGoogleDrive: true, googleDriveFolderId: "folder" },
    };

    const result = await executeWorkflowThenStep(
      driveNode,
      [agentOutput],
      { workflow: baseWorkflow([driveNode]), siteName: "Acme", siteUrl: "https://acme.test" },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no deliverable files loaded/i);
  });

  it("still uploads to Google Drive when upstream is failed but RAG has the report", async () => {
    const { fetchAgentRun } = await import("@/lib/agent-runs-api");
    const { uploadDeliverableToGoogleDriveIfConfigured } = await import(
      "@/lib/automation-google-drive-delivery"
    );
    vi.mocked(fetchAgentRun).mockResolvedValueOnce({
      id: 10,
      teamId: 1,
      createdBy: 1,
      title: "GSC",
      recipeKey: "gsc_reporting",
      recipeTitle: "GSC",
      status: "failed",
      source: "workflow",
      taskId: 0,
      taskTitle: "",
      context: {},
      plan: {},
      result: null,
      errorMessage: "GSC reporting API returned non-JSON (504)",
      clientBatchKey: "",
      startedAt: null,
      finishedAt: null,
      createdAt: "",
      updatedAt: "",
      steps: [],
    });
    vi.mocked(uploadDeliverableToGoogleDriveIfConfigured).mockClear();

    const agentOutput: WorkflowStepOutput = {
      id: 1,
      runId: 1,
      nodeId: "a1",
      variableKey: "step_a1",
      scope: "run",
      label: "Agent",
      textPreview: "GSC report",
      fileRefs: [],
      agentRunId: 10,
      createdAt: "",
    };
    const driveNode = createWorkflowNode("then_google_drive", "Google Drive");
    driveNode.config = {
      inputVariableKey: "step_a1",
      inputNodeId: "a1",
      executionPayload: { saveToGoogleDrive: true, googleDriveFolderId: "folder" },
    };

    const result = await executeWorkflowThenStep(
      driveNode,
      [agentOutput],
      {
        workflow: baseWorkflow([driveNode]),
        siteName: "Acme",
        siteUrl: "https://acme.test",
        executionKind: "gsc_reporting",
      },
    );

    expect(result.ok).toBe(true);
    expect(uploadDeliverableToGoogleDriveIfConfigured).toHaveBeenCalled();
  });

  it("uploads GSC meeting notes and the report to Google Drive once each", async () => {
    const { uploadDeliverableToGoogleDriveIfConfigured, resolveDriveUploadDeliverables } = await import(
      "@/lib/automation-google-drive-delivery"
    );
    vi.mocked(uploadDeliverableToGoogleDriveIfConfigured).mockClear();
    vi.mocked(resolveDriveUploadDeliverables).mockClear();

    const agentOutput: WorkflowStepOutput = {
      id: 1,
      runId: 1,
      nodeId: "a1",
      variableKey: "step_a1",
      scope: "run",
      label: "Agent",
      textPreview: "GSC report",
      fileRefs: [],
      agentRunId: 10,
      createdAt: "",
    };
    const driveNode = createWorkflowNode("then_google_drive", "Google Drive");
    driveNode.config = {
      inputVariableKey: "step_a1",
      inputNodeId: "a1",
      executionPayload: { saveToGoogleDrive: true, googleDriveFolderId: "folder" },
    };

    const result = await executeWorkflowThenStep(
      driveNode,
      [agentOutput],
      {
        workflow: baseWorkflow([driveNode]),
        siteName: "Acme",
        siteUrl: "https://acme.test",
        executionKind: "gsc_reporting",
      },
    );

    expect(result.ok).toBe(true);
    expect(uploadDeliverableToGoogleDriveIfConfigured).toHaveBeenCalledTimes(2);
    const names = vi.mocked(uploadDeliverableToGoogleDriveIfConfigured).mock.calls.map(
      (call) => call[0]?.deliverable?.fileName,
    );
    expect(names[0]).toMatch(/Meeting notes/i);
    expect(names[1]).toMatch(/gsc-report/);
    const docs = result.output?.fileRefs?.filter(
      (ref) => ref.mime === "application/vnd.google-apps.document",
    );
    expect(docs).toHaveLength(2);
  });

  it("uses upstream agent run client for Drive folder when workflow ctx names another client", async () => {
    const { fetchAgentRun } = await import("@/lib/agent-runs-api");
    const { resolveGoogleDriveTargetFolder } = await import("@/lib/automation-google-drive-delivery");
    vi.mocked(resolveGoogleDriveTargetFolder).mockClear();
    vi.mocked(fetchAgentRun).mockResolvedValueOnce({
      id: 99,
      teamId: 1,
      createdBy: 1,
      steps: [],
      status: "done",
      recipeKey: "gsc_reporting",
      title: "GSC",
      recipeTitle: "GSC",
      source: "workflow",
      taskId: 0,
      taskTitle: "",
      context: { siteId: "posh-outdoors" },
      plan: { executionPayload: { siteId: "posh-outdoors" } },
      result: null,
      errorMessage: "",
      clientBatchKey: "",
      startedAt: null,
      finishedAt: null,
      createdAt: "",
      updatedAt: "",
    });

    const agentOutput: WorkflowStepOutput = {
      id: 1,
      runId: 1,
      nodeId: "a1",
      variableKey: "step_a1",
      scope: "run",
      label: "Agent",
      textPreview: "GSC report",
      fileRefs: [],
      agentRunId: 99,
      siteId: "posh-outdoors",
      createdAt: "",
    };
    const driveNode = createWorkflowNode("then_google_drive", "Google Drive");

    const result = await executeWorkflowThenStep(driveNode, [agentOutput], {
      workflow: baseWorkflow([driveNode]),
      siteName: "Ridgeline Solar",
      siteUrl: "https://ridgelinesolar.ca",
      executionKind: "gsc_reporting",
    });

    expect(result.ok).toBe(true);
    expect(resolveGoogleDriveTargetFolder).toHaveBeenCalledWith(
      expect.objectContaining({ siteName: "Posh Outdoors" }),
    );
  });

  it("uploads GSC notes and report once when the Drive node has multiple upstream outputs", async () => {
    const { uploadDeliverableToGoogleDriveIfConfigured, resolveDriveUploadDeliverables } = await import(
      "@/lib/automation-google-drive-delivery"
    );
    vi.mocked(uploadDeliverableToGoogleDriveIfConfigured).mockClear();
    vi.mocked(resolveDriveUploadDeliverables).mockClear();

    const agentOutputs: WorkflowStepOutput[] = [1, 2, 3].map((id) => ({
      id,
      runId: 1,
      nodeId: "a1",
      variableKey: `step_a1__${id}`,
      scope: "run",
      label: "Agent",
      textPreview: "GSC report",
      fileRefs: [],
      agentRunId: 10 + id,
      createdAt: "",
    }));
    const driveNode = createWorkflowNode("then_google_drive", "Google Drive");
    driveNode.config = {
      inputVariableKey: "step_a1",
      inputNodeId: "a1",
      inputMode: "all_deliverables",
      executionPayload: { saveToGoogleDrive: true, googleDriveFolderId: "folder" },
    };

    const result = await executeWorkflowThenStep(
      driveNode,
      agentOutputs,
      {
        workflow: baseWorkflow([driveNode]),
        siteName: "Acme",
        siteUrl: "https://acme.test",
        executionKind: "gsc_reporting",
        allOutputs: agentOutputs,
      },
    );

    expect(result.ok).toBe(true);
    expect(resolveDriveUploadDeliverables).toHaveBeenCalledTimes(1);
    expect(uploadDeliverableToGoogleDriveIfConfigured).toHaveBeenCalledTimes(2);
  });

  it("does not run Google Drive a second time after it already failed", async () => {
    const { uploadDeliverableToGoogleDriveIfConfigured, resolveDriveUploadDeliverables } = await import(
      "@/lib/automation-google-drive-delivery"
    );
    vi.mocked(uploadDeliverableToGoogleDriveIfConfigured).mockClear();
    vi.mocked(resolveDriveUploadDeliverables).mockClear();
    vi.mocked(resolveDriveUploadDeliverables).mockResolvedValueOnce([]);

    const agentOutput: WorkflowStepOutput = {
      id: 1,
      runId: 1,
      nodeId: "a1",
      variableKey: "step_a1",
      scope: "run",
      label: "Agent",
      textPreview: "GSC report",
      fileRefs: [],
      agentRunId: 10,
      createdAt: "",
    };
    const driveNode = createWorkflowNode("then_google_drive", "Google Drive");
    driveNode.config = {
      inputVariableKey: "step_a1",
      inputNodeId: "a1",
      inputMode: "all_deliverables",
      executionPayload: { saveToGoogleDrive: true, googleDriveFolderId: "folder" },
    };
    const ctx = {
      workflow: baseWorkflow([driveNode]),
      siteName: "Acme",
      siteUrl: "https://acme.test",
      executionKind: "gsc_reporting",
    };

    const first = await executeWorkflowThenStep(driveNode, [agentOutput], ctx);
    expect(first.ok).toBe(false);
    expect(first.error).toMatch(/no GSC report found/i);

    const second = await executeWorkflowThenStep(driveNode, [agentOutput], ctx);
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/no GSC report found/i);
    expect(resolveDriveUploadDeliverables).toHaveBeenCalledTimes(1);
    expect(uploadDeliverableToGoogleDriveIfConfigured).not.toHaveBeenCalled();
  });

  it("skips Google Drive when upstream failed and RAG has no report", async () => {
    const { fetchAgentRun, fetchAgentRunDeliverableFiles, fetchAgentRunArtifacts } = await import(
      "@/lib/agent-runs-api"
    );
    const failedRun = {
      id: 10,
      teamId: 1,
      createdBy: 1,
      title: "GSC",
      recipeKey: "gsc_reporting",
      recipeTitle: "GSC",
      status: "failed" as const,
      source: "workflow" as const,
      taskId: 0,
      taskTitle: "",
      context: {},
      plan: {},
      result: null,
      errorMessage: "Agent run failed",
      clientBatchKey: "",
      startedAt: null,
      finishedAt: null,
      createdAt: "",
      updatedAt: "",
      steps: [],
    };
    vi.mocked(fetchAgentRun).mockResolvedValue(failedRun);
    vi.mocked(fetchAgentRunDeliverableFiles).mockResolvedValue([]);
    vi.mocked(fetchAgentRunArtifacts).mockResolvedValue([]);

    const agentOutput: WorkflowStepOutput = {
      id: 1,
      runId: 1,
      nodeId: "a1",
      variableKey: "step_a1",
      scope: "run",
      label: "Agent",
      textPreview: "GSC report",
      fileRefs: [],
      agentRunId: 10,
      createdAt: "",
    };
    const driveNode = createWorkflowNode("then_google_drive", "Google Drive");
    driveNode.config = {
      inputVariableKey: "step_a1",
      inputNodeId: "a1",
      executionPayload: { saveToGoogleDrive: true, googleDriveFolderId: "folder" },
    };

    const result = await executeWorkflowThenStep(
      driveNode,
      [agentOutput],
      { workflow: baseWorkflow([driveNode]), siteName: "Acme", siteUrl: "https://acme.test" },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Upstream agent run failed/i);

    vi.mocked(fetchAgentRun).mockImplementation(async (teamId: number, runId: number) => ({
      id: runId,
      teamId,
      createdBy: 1,
      title: "GSC",
      recipeKey: "gsc_reporting",
      recipeTitle: "GSC",
      status: "done",
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
      steps: [],
    }));
    vi.mocked(fetchAgentRunDeliverableFiles).mockResolvedValue([
      { fileName: "gsc-report-mom-acme-1.md", content: "# Report", mime: "text/markdown" },
      { fileName: "mom-queries.csv", content: "a,b", mime: "text/csv" },
    ]);
  });

  it("includes upstream Google Drive link in email summary", async () => {
    const { sendAutomationEmailIfConfigured } = await import("@/lib/automation-email-delivery");
    const agentOutput: WorkflowStepOutput = {
      id: 1,
      runId: 1,
      nodeId: "a1",
      variableKey: "step_a1",
      scope: "run",
      label: "Agent",
      textPreview: "Done",
      fileRefs: [],
      agentRunId: 10,
      createdAt: "",
    };
    const driveNode = createWorkflowNode("then_google_drive", "Google Drive");
    const driveKey = defaultThenVariableKey(driveNode);
    const driveOutput: WorkflowStepOutput = {
      id: 2,
      runId: 1,
      nodeId: driveNode.id,
      variableKey: driveKey,
      scope: "run",
      label: "Google Drive",
      textPreview: "Uploaded",
      fileRefs: [],
      agentRunId: 10,
      deliveryMeta: { googleDriveUrl: "https://drive.google.com/file/d/abc/view" },
      createdAt: "",
    };
    const emailNode = createWorkflowNode("then_email", "Email");
    emailNode.config = {
      inputVariableKey: driveKey,
      inputNodeId: driveNode.id,
      executionPayload: {
        sendAutomationEmail: true,
        automationEmailTo: "ops@example.com",
      },
    };

    const result = await executeWorkflowThenStep(
      emailNode,
      [agentOutput, driveOutput],
      {
        workflow: baseWorkflow([driveNode, emailNode]),
        siteName: "Acme",
        executionKind: "gsc_reporting",
      },
    );

    expect(result.ok).toBe(true);
    expect(sendAutomationEmailIfConfigured).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenContext: expect.objectContaining({
          summary: expect.stringContaining("https://drive.google.com/file/d/abc/view"),
        }),
        attachments: [
          expect.objectContaining({ fileName: "gsc-report-mom-acme-1.md", content: "# Report" }),
        ],
      }),
    );
  });

  it("uses the matching client gsc report when multiple reports are present", async () => {
    const { fetchAgentRunDeliverableFiles } = await import("@/lib/agent-runs-api");
    vi.mocked(fetchAgentRunDeliverableFiles).mockResolvedValueOnce([
      { fileName: "gsc-report-mom-posh-outdoors-1.md", content: "# Posh", mime: "text/markdown" },
      { fileName: "gsc-report-mom-blinds-west-2.md", content: "# Blinds", mime: "text/markdown" },
    ]);
    const { sendAutomationEmailIfConfigured } = await import("@/lib/automation-email-delivery");
    const agent = createWorkflowNode("action_agent", "Run agent");
    agent.id = "a1";
    agent.config = {
      executionKind: "gsc_reporting",
      title: "GSC Monthly MoM Report",
      executionPayload: { comparePreset: "mom" },
      ragVariableKey: "gsc_1",
    };
    const agentOutput: WorkflowStepOutput = {
      id: 1,
      runId: 1,
      nodeId: "a1",
      variableKey: "gsc_1__site_blinds",
      scope: "run",
      label: "GSC Monthly MoM Report",
      textPreview: "GSC report generated",
      fileRefs: [],
      agentRunId: 10,
      siteId: "site-blinds",
      createdAt: "",
    };
    const emailNode = createWorkflowNode("then_email", "Email");
    emailNode.config = {
      inputVariableKey: "gsc_1",
      inputNodeId: "a1",
      executionPayload: {
        sendAutomationEmail: true,
        automationEmailTo: "ops@example.com",
      },
    };

    const result = await executeWorkflowThenStep(
      emailNode,
      [agentOutput],
      {
        workflow: baseWorkflow([agent, emailNode]),
        siteId: "site-blinds",
        siteName: "Blinds West",
        executionKind: "gsc_reporting",
      },
    );

    expect(result.ok).toBe(true);
    expect(sendAutomationEmailIfConfigured).toHaveBeenCalledWith(
      expect.objectContaining({
        summaryText: "# Blinds",
        attachments: [
          expect.objectContaining({ fileName: "gsc-report-mom-blinds-west-2.md" }),
        ],
      }),
    );
  });

  it("uses the agent title and attaches deliverables for email-only GSC runs", async () => {
    const { sendAutomationEmailIfConfigured } = await import("@/lib/automation-email-delivery");
    const agent = createWorkflowNode("action_agent", "Run agent");
    agent.id = "a1";
    agent.config = {
      executionKind: "gsc_reporting",
      title: "GSC Monthly MoM Report",
      executionPayload: { comparePreset: "mom" },
    };
    const agentOutput: WorkflowStepOutput = {
      id: 1,
      runId: 1,
      nodeId: "a1",
      variableKey: "step_a1",
      scope: "run",
      label: "GSC Monthly MoM Report",
      textPreview: "GSC report generated",
      fileRefs: [],
      agentRunId: 10,
      createdAt: "",
    };
    const emailNode = createWorkflowNode("then_email", "Email");
    emailNode.config = {
      inputVariableKey: "step_a1",
      inputNodeId: "a1",
      executionPayload: {
        sendAutomationEmail: true,
        automationEmailTo: "ops@example.com",
      },
    };

    const result = await executeWorkflowThenStep(
      emailNode,
      [agentOutput],
      {
        workflow: baseWorkflow([agent, emailNode]),
        siteName: "In the Shade",
        executionKind: "gsc_reporting",
      },
    );

    expect(result.ok).toBe(true);
    expect(sendAutomationEmailIfConfigured).toHaveBeenCalledWith(
      expect.objectContaining({
        contract: expect.objectContaining({ automationEmailAiIntro: true }),
        tokenContext: expect.objectContaining({
          automationTitle: "GSC Monthly MoM Report",
        }),
        summaryText: "# Report",
        attachments: [
          expect.objectContaining({ fileName: "gsc-report-mom-acme-1.md" }),
        ],
      }),
    );
  });

  it("aggregates multiple drive links into one email", async () => {
    const { sendAutomationEmailIfConfigured } = await import("@/lib/automation-email-delivery");
    const agent = createWorkflowNode("action_agent", "Run agent");
    agent.id = "a1";
    const agentOutputs: WorkflowStepOutput[] = [
      {
        id: 1,
        runId: 1,
        nodeId: "a1",
        variableKey: "step_a1__post_1",
        scope: "run",
        label: "Post one",
        textPreview: "Done",
        fileRefs: [
          {
            name: "Post one",
            url: "https://docs.google.com/document/d/1/edit",
            mime: "application/vnd.google-apps.document",
          },
        ],
        agentRunId: 10,
        createdAt: "",
      },
      {
        id: 2,
        runId: 1,
        nodeId: "a1",
        variableKey: "step_a1__post_2",
        scope: "run",
        label: "Post two",
        textPreview: "Done",
        fileRefs: [
          {
            name: "Post two",
            url: "https://docs.google.com/document/d/2/edit",
            mime: "application/vnd.google-apps.document",
          },
        ],
        agentRunId: 11,
        createdAt: "",
      },
    ];
    const emailNode = createWorkflowNode("then_email", "Email");
    emailNode.config = {
      inputMode: "all_from_node",
      emailBatchScope: "workflow_run",
      inputVariableKey: "step_a1",
      inputNodeId: "a1",
      executionPayload: {
        sendAutomationEmail: true,
        automationEmailTo: "lead@example.com",
        automationEmailSubject: "{deliverableCount} posts ready",
        automationEmailMessage: "Links:\n{driveLinks}",
      },
    };

    const result = await executeWorkflowThenStep(
      emailNode,
      agentOutputs,
      {
        workflow: baseWorkflow([agent, emailNode]),
        siteName: "Acme",
        allOutputs: agentOutputs,
      },
    );

    expect(result.ok).toBe(true);
    expect(sendAutomationEmailIfConfigured).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenContext: expect.objectContaining({
          deliverableCount: 2,
          driveLinks: expect.stringContaining("Post one:"),
        }),
      }),
    );
  });
});

describe("workflow graph then steps", () => {
  it("inserts then nodes after agent in linear order", () => {
    const client = createWorkflowNode("workflow_client", "Client");
    const trigger = createWorkflowNode("trigger_manual", "Manual");
    const agent = createWorkflowNode("action_agent", "Run agent");
    const drive = createWorkflowNode("then_google_drive", "Google Drive");
    const workflow = {
      nodes: [client, trigger, agent],
      edges: [
        { id: "e1", source: client.id, target: trigger.id },
        { id: "e2", source: trigger.id, target: agent.id },
      ],
      ragVariables: [],
    };
    const inserted = insertNodeAfter(workflow, agent.id, drive);
    const ordered = linearOrderedNodes(inserted);
    expect(ordered.map((node) => node.kind)).toEqual([
      "workflow_client",
      "trigger_manual",
      "action_agent",
      "then_google_drive",
    ]);
  });
});
