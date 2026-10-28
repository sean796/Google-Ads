import { describe, expect, it } from "vitest";
import { createWorkflowNode } from "@/lib/workflow/workflow-graph-mutations";
import {
  migrateGridToEntityToSapWorkflow,
  workflowNeedsGridToEntityToSapMigration,
} from "@/lib/workflow/workflow-migrate-grid-to-entity-to-sap";
import type { WorkflowDefinition } from "@/lib/workflow/workflow-types";

function legacyGridWorkflow(): WorkflowDefinition {
  const client = createWorkflowNode("workflow_client", "Client");
  const schedule = createWorkflowNode("trigger_calendar", "Schedule");
  const grid = createWorkflowNode("action_agent", "Export Local Grid CSV");
  grid.config = {
    executionKind: "local_dominator_export",
    executionPayload: { saveToDisk: true, keyword: "" },
    ragVariableKey: "local_dominator_export_1",
    title: "Export Local Grid CSV",
    recipeKeyword: "grid-to-entity-pages-monthly",
  };
  const entity = createWorkflowNode("action_agent", "Generate entity CSV from grid");
  entity.config = {
    executionKind: "entity_generator",
    executionPayload: { gridInputSource: "workflow", ragInputKeys: ["local_dominator_export_1"] },
    ragVariableKey: "entity_generator_2",
    ragInputKeys: ["local_dominator_export_1"],
    title: "Generate entity CSV from grid",
    recipeKeyword: "grid-to-entity-pages-monthly",
  };
  const sap = createWorkflowNode("action_agent", "Create SAP pages from entity CSV");
  sap.config = {
    executionKind: "sap_generator",
    executionPayload: { entityCsvInputSource: "workflow", ragInputKeys: ["entity_generator_2"] },
    ragVariableKey: "sap_generator_3",
    ragInputKeys: ["entity_generator_2"],
    title: "Create SAP pages from entity CSV",
    recipeKeyword: "grid-to-entity-pages-monthly",
  };

  return {
    id: 23,
    teamId: 1,
    name: "Grid to entity to SAP",
    status: "draft",
    wordpressSiteId: "kwb",
    nodes: [client, schedule, grid, entity, sap],
    edges: [
      { id: "e1", source: client.id, target: schedule.id },
      { id: "e2", source: schedule.id, target: grid.id },
      { id: "e3", source: grid.id, target: entity.id },
      { id: "e4", source: entity.id, target: sap.id },
    ],
    ragVariables: [
      { key: "local_dominator_export_1", nodeId: grid.id, scope: "run", label: "Export Local Grid CSV" },
      { key: "entity_generator_2", nodeId: entity.id, scope: "run", label: "Generate entity CSV from grid" },
      { key: "sap_generator_3", nodeId: sap.id, scope: "run", label: "Create SAP pages from entity CSV" },
    ],
    createdAt: "",
    updatedAt: "",
  };
}

describe("workflow-migrate-grid-to-entity-to-sap", () => {
  it("detects legacy grid workflow titles and payloads", () => {
    const workflow = legacyGridWorkflow();
    expect(workflowNeedsGridToEntityToSapMigration(workflow)).toBe(true);
  });

  it("rewrites step labels to the simple three-step names", () => {
    const migrated = migrateGridToEntityToSapWorkflow(legacyGridWorkflow());
    const agents = migrated.nodes.filter((node) => node.kind === "action_agent");
    expect(agents.map((node) => node.label)).toEqual([
      "Local Grid scan",
      "Entities from grid",
      "SAP pages",
    ]);
    const gridPayload = (agents[0]?.config as { executionPayload?: { saveToDisk?: boolean } }).executionPayload;
    expect(gridPayload?.saveToDisk).toBe(false);
  });
});
