import { describe, expect, it } from "vitest";
import { automationPlanToWorkflowGraph } from "@/lib/workflow/workflow-migrate-from-planner";
import type { AutomationPlan } from "@/lib/automation-planner-types";

describe("automationPlanToWorkflowGraph grid chain wiring", () => {
  it("locks entity step to grid workflow mode after local dominator export", () => {
    const plan: AutomationPlan = {
      keyword: "grid-to-entity-pages",
      name: "Chain",
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
        executionPayload: { businessName: "Acme", keyword: "plumber" },
        title: "Export grid",
      },
      actions: [
        {
          keyword: "local-dominator-grid-export",
          executionKind: "local_dominator_export",
          executionPayload: { businessName: "Acme", keyword: "plumber" },
          title: "Export grid",
        },
        {
          keyword: "entity-page-creator-monthly",
          executionKind: "entity_page_creator",
          executionPayload: { focusKeyword: "plumber" },
          title: "Entity pages",
        },
      ],
    };

    const graph = automationPlanToWorkflowGraph(plan, { teamId: 1, siteId: "site-1" });
    const actionNodes = graph.nodes.filter((node) => node.kind === "action_agent");
    expect(actionNodes).toHaveLength(2);
    const entityNode = actionNodes[1]!;
    const config = entityNode.config as {
      executionPayload?: { locationSource?: string; gridInputSource?: string };
      ragInputKeys?: string[];
    };
    expect(config.executionPayload?.locationSource).toBe("grid");
    expect(config.executionPayload?.gridInputSource).toBe("workflow");
    expect(config.ragInputKeys).toEqual(["local_dominator_export_1"]);
  });
});
