import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createWorkflowNode } from "@/lib/workflow/workflow-graph-mutations";
import { mergeRecipeIntoWorkflow } from "@/lib/workflow/workflow-recipe-merge";
import type { AutomationRecipeCatalogItem } from "@/lib/automation-recipes-types";
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

describe("mergeRecipeIntoWorkflow", () => {
  it("inserts GSC agent after Schedule in a Then-only workflow", () => {
    const catalog = JSON.parse(
      readFileSync(join(process.cwd(), "src/lib/automation-recipes-catalog.bundle.json"), "utf8"),
    ) as AutomationRecipeCatalogItem[];
    const recipe = catalog.find((item) => item.keyword === "gsc-monthly-mom-report");
    expect(recipe).toBeTruthy();

    const schedule = createWorkflowNode("trigger_calendar", "Schedule");
    const workflow = chainWorkflow([
      createWorkflowNode("workflow_client", "Client"),
      schedule,
      createWorkflowNode("then_google_drive", "Google Drive"),
      createWorkflowNode("then_email", "Email"),
    ]);

    const merged = mergeRecipeIntoWorkflow(workflow, recipe!, schedule.id);
    const kinds = merged.nodes.map((node) => node.kind);

    expect(kinds.filter((kind) => kind === "action_agent")).toHaveLength(1);
    expect(kinds.indexOf("action_agent")).toBe(2);
    expect(kinds[3]).toBe("then_google_drive");
    expect(merged.insertedNodeIds).toHaveLength(1);
  });

  it("inserts GSC agent before Then steps when afterNodeId is null", () => {
    const catalog = JSON.parse(
      readFileSync(join(process.cwd(), "src/lib/automation-recipes-catalog.bundle.json"), "utf8"),
    ) as AutomationRecipeCatalogItem[];
    const recipe = catalog.find((item) => item.keyword === "gsc-monthly-mom-report");
    expect(recipe).toBeTruthy();

    const workflow = chainWorkflow([
      createWorkflowNode("workflow_client", "Client"),
      createWorkflowNode("trigger_calendar", "Schedule"),
      createWorkflowNode("then_google_drive", "Google Drive"),
      createWorkflowNode("then_email", "Email"),
    ]);

    const merged = mergeRecipeIntoWorkflow(workflow, recipe!, null);
    const kinds = merged.nodes.map((node) => node.kind);

    expect(kinds.indexOf("action_agent")).toBe(2);
    expect(kinds[3]).toBe("then_google_drive");
  });
});
