import { describe, expect, it } from "vitest";
import { automationPlanToWorkflowGraph } from "@/lib/workflow/workflow-migrate-from-planner";
import type { AutomationPlan } from "@/lib/automation-planner-types";
import { buildEntityToSapWorkflowDraft } from "@/lib/workflow/templates/entity-to-sap-workflow";
import type { WorkflowActionConfig } from "@/lib/workflow/workflow-types";

describe("entity-to-sap workflow", () => {
  it("buildEntityToSapWorkflowDraft wires entity_generator to sap_generator", () => {
    const draft = buildEntityToSapWorkflowDraft(1, "site-1");
    const actionNodes = draft.nodes.filter((node) => node.kind === "action_agent");
    expect(actionNodes).toHaveLength(2);
    expect((actionNodes[0]?.config as WorkflowActionConfig).executionKind).toBe("entity_generator");
    expect((actionNodes[1]?.config as WorkflowActionConfig).executionKind).toBe("sap_generator");
    const sapConfig = actionNodes[1]?.config as {
      executionPayload?: { entityCsvInputSource?: string; ragInputKeys?: string[] };
      ragInputKeys?: string[];
    };
    expect(sapConfig.executionPayload?.entityCsvInputSource).toBe("workflow");
    expect(sapConfig.ragInputKeys).toEqual(["entity_generator_1"]);
  });

  it("automationPlanToWorkflowGraph auto-wires entity_generator after local_dominator_export", () => {
    const plan: AutomationPlan = {
      keyword: "grid-to-entity",
      name: "Grid to entity",
      trigger: {
        keyword: "schedule-monthly",
        kind: "calendar",
        frequency: "monthly",
        startDate: "2026-09-01",
        time: "09:00",
      },
      action: {
        keyword: "local-dominator-grid-export",
        executionKind: "local_dominator_export",
        executionPayload: {},
        title: "Export grid",
      },
      actions: [
        {
          keyword: "local-dominator-grid-export",
          executionKind: "local_dominator_export",
          executionPayload: {},
          title: "Export grid",
        },
        {
          keyword: "entity-generator-run",
          executionKind: "entity_generator",
          executionPayload: { focusKeyword: "blinds" },
          title: "Generate entity CSV",
        },
        {
          keyword: "sap-generator-run",
          executionKind: "sap_generator",
          executionPayload: {},
          title: "Create SAP pages",
        },
      ],
    };

    const graph = automationPlanToWorkflowGraph(plan, { teamId: 1 });
    const actionNodes = graph.nodes.filter((node) => node.kind === "action_agent");
    const entityConfig = actionNodes[1]?.config as {
      executionPayload?: { gridInputSource?: string; ragInputKeys?: string[] };
      ragInputKeys?: string[];
    };
    const sapConfig = actionNodes[2]?.config as {
      executionPayload?: { entityCsvInputSource?: string; ragInputKeys?: string[] };
      ragInputKeys?: string[];
    };

    expect(entityConfig.executionPayload?.gridInputSource).toBe("workflow");
    expect(entityConfig.ragInputKeys).toEqual(["local_dominator_export_1"]);
    expect(sapConfig.executionPayload?.entityCsvInputSource).toBe("workflow");
    expect(sapConfig.ragInputKeys).toEqual(["entity_generator_2"]);
  });
});
