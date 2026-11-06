import { describe, expect, it, vi, beforeEach } from "vitest";
import { AGENT_RUN_STEP_KEYS } from "@/lib/agent-runs/agent-run-step-keys";
import { createWorkflowNode } from "@/lib/workflow/workflow-graph-mutations";
import {
  formatThenConfigSuffix,
  inferAutomationDeliveryStepKey,
  logAutomationDeliveryStep,
  resolveWorkflowBoundAgentRunId,
} from "@/lib/workflow/automation-delivery-log";

const appendAgentRunStep = vi.fn(async (..._args: unknown[]) => {});

vi.mock("@/lib/agent-runs/agent-run-step", () => ({
  appendAgentRunStep: (...args: unknown[]) => appendAgentRunStep(...args),
}));

vi.mock("@/lib/agent-runs-api", () => ({
  fetchAgentRun: vi.fn(async (_teamId: number, runId: number) => ({
    id: runId,
    teamId: 1,
    steps: [],
    status: "running",
    recipeKey: "gsc_reporting",
    title: "GSC",
    recipeTitle: "GSC reporting",
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
}));

describe("automation-delivery-log", () => {
  beforeEach(() => {
    appendAgentRunStep.mockClear();
  });

  it("resolves agent run id from upstream outputs", () => {
    expect(
      resolveWorkflowBoundAgentRunId(
        { agentRunId: 42 } as never,
        [{ agentRunId: 99 } as never],
      ),
    ).toBe(42);
  });

  it("infers shared delivery step keys from labels", () => {
    expect(inferAutomationDeliveryStepKey("Google Drive: resolving folder (Client)", "running")).toBe(
      AGENT_RUN_STEP_KEYS.automationGoogleDriveResolve,
    );
    expect(inferAutomationDeliveryStepKey("Google Drive: uploading report.md", "running")).toBe(
      AGENT_RUN_STEP_KEYS.automationGoogleDriveUpload,
    );
    expect(
      inferAutomationDeliveryStepKey("Google Drive: uploaded report.md · https://drive.google.com/x", "done"),
    ).toBe(AGENT_RUN_STEP_KEYS.automationGoogleDriveComplete);
    expect(inferAutomationDeliveryStepKey("Email: sending · user@example.com", "running")).toBe(
      AGENT_RUN_STEP_KEYS.automationEmailSend,
    );
    expect(inferAutomationDeliveryStepKey("Email: sent", "done")).toBe(
      AGENT_RUN_STEP_KEYS.automationEmailComplete,
    );
  });

  it("includes then config in drive label suffix without plain folder ids", () => {
    const node = createWorkflowNode("then_google_drive", "Drive");
    node.config = {
      inputMode: "single",
      executionPayload: { googleDriveFolderId: "folder-abc-123456" },
    };
    const suffix = formatThenConfigSuffix(node, { inputMode: "single" });
    expect(suffix).toContain("single");
    expect(suffix).not.toMatch(/folderId/i);
  });

  it("appends automation delivery rows to the agent run log", async () => {
    const node = createWorkflowNode("then_google_drive", "Google Drive");
    await logAutomationDeliveryStep({
      teamId: 1,
      agentRunId: 930,
      label: "Google Drive: uploaded report.md · https://drive.google.com/file/d/x/view",
      workflowNode: node,
      payload: { thenPhase: "upload_complete" },
    });
    expect(appendAgentRunStep).toHaveBeenCalledWith(
      1,
      930,
      expect.objectContaining({
        label: "Google Drive: uploaded report.md · https://drive.google.com/file/d/x/view",
        stepKey: AGENT_RUN_STEP_KEYS.automationGoogleDriveComplete,
        resumePayload: expect.objectContaining({ phase: "automation_delivery" }),
      }),
      expect.objectContaining({ id: 930 }),
    );
  });
});
