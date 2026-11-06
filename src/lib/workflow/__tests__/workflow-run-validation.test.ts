import { describe, expect, it } from "vitest";
import { createWorkflowNode } from "@/lib/workflow/workflow-graph-mutations";
import { validateWorkflowForRun, workflowHasActionAgent } from "@/lib/workflow/workflow-run-validation";
import type { WorkflowDefinition } from "@/lib/workflow/workflow-types";

function chainWorkflow(nodes: ReturnType<typeof createWorkflowNode>[]): WorkflowDefinition {
  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: `e-${index}`,
    source: node.id,
    target: nodes[index + 1]!.id,
  }));
  return {
    id: 7,
    teamId: 1,
    name: "GSC Monthly MoM Report",
    status: "draft",
    nodes,
    edges,
    ragVariables: [],
  };
}

describe("validateWorkflowForRun", () => {
  it("rejects workflows with no agent step", () => {
    const workflow = chainWorkflow([
      createWorkflowNode("workflow_client", "Client"),
      createWorkflowNode("trigger_calendar", "Schedule"),
      createWorkflowNode("then_google_drive", "Google Drive"),
      createWorkflowNode("then_email", "Email"),
    ]);

    expect(workflowHasActionAgent(workflow)).toBe(false);
    expect(validateWorkflowForRun(workflow)).toEqual({
      ok: false,
      error:
        "This workflow has no agent step. Add GSC, Local Dominator, or another agent between Schedule and Then steps, then save and Test again.",
    });
  });

  it("accepts workflows that start on an agent step", () => {
    const workflow = chainWorkflow([
      createWorkflowNode("workflow_client", "Client"),
      createWorkflowNode("trigger_calendar", "Schedule"),
      createWorkflowNode("action_agent", "GSC"),
      createWorkflowNode("then_google_drive", "Google Drive"),
    ]);

    expect(validateWorkflowForRun(workflow)).toEqual({ ok: true });
  });
});
