import { describe, expect, it } from "vitest";
import {
  migrateWorkflowThenStepsFromAgents,
  readWorkflowAgentThenPayload,
  stripAllAgentInlineDelivery,
  workflowNeedsThenMigration,
} from "@/lib/workflow/workflow-migrate-then-steps";
import type { WorkflowDefinition } from "@/lib/workflow/workflow-types";

describe("workflow-migrate-then-steps", () => {
  const baseWorkflow: WorkflowDefinition = {
    id: 1,
    teamId: 1,
    name: "GSC",
    status: "draft",
    nodes: [
      { id: "trigger", kind: "trigger_manual", label: "Trigger", config: {}, position: { x: 0, y: 0 } },
      {
        id: "agent",
        kind: "action_agent",
        label: "GSC",
        config: {
          executionKind: "gsc_reporting",
          ragVariableKey: "gsc_1",
          executionPayload: { comparePreset: "mom" },
        },
        position: { x: 0, y: 80 },
      },
      {
        id: "then-email",
        kind: "then_email",
        label: "Email",
        config: {
          inputVariableKey: "gsc_1",
          inputNodeId: "agent",
          executionPayload: {
            sendAutomationEmail: true,
            automationEmailTo: "ops@example.com",
            saveLocalArchive: true,
          },
        },
        position: { x: 0, y: 160 },
      },
      {
        id: "archive",
        kind: "rag_archive",
        label: "Archive",
        config: { variableKey: "gsc_1", scope: "run" },
        position: { x: 0, y: 240 },
      },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "agent" },
      { id: "e2", source: "agent", target: "then-email" },
      { id: "e3", source: "then-email", target: "archive" },
    ],
    ragVariables: [],
    createdAt: "",
    updatedAt: "",
  };

  it("reads email delivery from Then nodes for the agent editor", () => {
    const payload = readWorkflowAgentThenPayload(baseWorkflow, "agent");
    expect(payload?.sendAutomationEmail).toBe(true);
    expect(payload?.automationEmailTo).toBe("ops@example.com");
  });

  it("skips migration when agent payload is already stripped but Then email remains", () => {
    expect(workflowNeedsThenMigration(baseWorkflow)).toBe(false);
  });

  it("detects inline delivery flags that still need migration", () => {
    const workflow = {
      ...baseWorkflow,
      nodes: baseWorkflow.nodes.filter((node) => node.kind !== "then_email"),
    };
    expect(workflowNeedsThenMigration(workflow)).toBe(false);

    const withInlineEmail = {
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === "agent"
          ? {
              ...node,
              config: {
                ...(node.config as object),
                executionPayload: {
                  comparePreset: "mom",
                  sendAutomationEmail: true,
                  automationEmailTo: "ops@example.com",
                },
              },
            }
          : node,
      ),
    };
    expect(workflowNeedsThenMigration(withInlineEmail)).toBe(true);
  });

  it("replaces stale Then nodes when agent payload switches to email", () => {
    const migrated = migrateWorkflowThenStepsFromAgents({
      ...baseWorkflow,
      nodes: baseWorkflow.nodes.map((node) =>
        node.id === "agent"
          ? {
              ...node,
              config: {
                ...(node.config as object),
                executionPayload: {
                  comparePreset: "mom",
                  sendAutomationEmail: true,
                  automationEmailTo: "reports@example.com",
                },
              },
            }
          : node,
      ),
    });

    const emailNodes = migrated.nodes.filter((node) => node.kind === "then_email");
    expect(emailNodes).toHaveLength(1);
    expect((emailNodes[0]?.config as { executionPayload?: { automationEmailTo?: string } }).executionPayload
      ?.automationEmailTo).toBe("reports@example.com");

    const agent = migrated.nodes.find((node) => node.id === "agent");
    expect(
      (agent?.config as { executionPayload?: { sendAutomationEmail?: boolean } }).executionPayload
        ?.sendAutomationEmail,
    ).not.toBe(true);
  });

  it("removes Then nodes when delivery switches back to local archive only", () => {
    const migrated = migrateWorkflowThenStepsFromAgents({
      ...baseWorkflow,
      nodes: baseWorkflow.nodes.map((node) =>
        node.id === "agent"
          ? {
              ...node,
              config: {
                ...(node.config as object),
                executionPayload: {
                  comparePreset: "mom",
                  saveLocalArchive: true,
                },
              },
            }
          : node,
      ),
    });

    expect(migrated.nodes.some((node) => node.kind === "then_email")).toBe(false);
  });

  it("stripAllAgentInlineDelivery clears agent flags but keeps Then nodes", () => {
    const workflow = {
      ...baseWorkflow,
      nodes: baseWorkflow.nodes.map((node) =>
        node.id === "agent"
          ? {
              ...node,
              config: {
                ...(node.config as object),
                executionPayload: {
                  comparePreset: "mom",
                  saveToGoogleDrive: true,
                  googleDriveFolderId: "folder-123",
                  sendAutomationEmail: true,
                  automationEmailTo: "ops@example.com",
                },
              },
            }
          : node,
      ),
    };

    const stripped = stripAllAgentInlineDelivery(workflow);
    const agent = stripped.nodes.find((node) => node.id === "agent");
    const payload = (agent?.config as { executionPayload?: Record<string, unknown> }).executionPayload ?? {};

    expect(payload.saveToGoogleDrive).not.toBe(true);
    expect(payload.sendAutomationEmail).not.toBe(true);
    expect(String(payload.googleDriveFolderId ?? "")).toBe("");
    expect(stripped.nodes.some((node) => node.kind === "then_email")).toBe(true);
    expect(stripped.nodes.some((node) => node.kind === "rag_archive")).toBe(true);
  });
});
