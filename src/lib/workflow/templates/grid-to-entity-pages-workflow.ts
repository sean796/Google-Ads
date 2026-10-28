import type { AutomationPlan } from "@/lib/automation-planner-types";
import { automationPlanToWorkflowGraph } from "@/lib/workflow/workflow-migrate-from-planner";
import type { WorkflowDefinition } from "@/lib/workflow/workflow-types";

/** Primary recipe keyword for the 3-step Local Grid → entity → SAP workflow. */
export const GRID_TO_ENTITY_TO_SAP_RECIPE_KEYWORD = "grid-to-entity-to-sap-monthly";

/** @deprecated Use GRID_TO_ENTITY_TO_SAP_RECIPE_KEYWORD */
export const GRID_TO_ENTITY_PAGES_RECIPE_KEYWORD = GRID_TO_ENTITY_TO_SAP_RECIPE_KEYWORD;

const LOCAL_GRID_EXPORT_PAYLOAD = {
  businessName: "",
  keyword: "property",
  saveLocalArchive: true,
  saveToDisk: false,
};

const ENTITY_FROM_GRID_PAYLOAD = {
  locationSource: "grid",
  gridInputSource: "workflow",
  entityUseEditorialPackage: true,
  focusKeyword: "",
  titleTemplate: "{keyword} Near {entity}",
  sitemapType: "entity",
  targetBucket: "sap",
  saveLocalArchive: true,
  ragInputKeys: ["local_dominator_export_1"],
};

const SAP_FROM_ENTITY_PAYLOAD = {
  entityUseEditorialPackage: true,
  entityCsvInputSource: "workflow",
  sitemapType: "entity",
  featuredImage: false,
  postDestination: "wordpress",
  scheduleStartDay: 1,
  scheduleStartTime: "09:00",
  scheduleStaggerOptimized: true,
  targetBucket: "sap",
  saveLocalArchive: true,
  ragInputKeys: ["entity_generator_2"],
};

export function buildGridToEntityToSapWorkflowDraft(
  teamId: number,
  siteId?: string | null,
): Omit<WorkflowDefinition, "id" | "createdAt" | "updatedAt" | "publishedAt"> {
  const plan: AutomationPlan = {
    keyword: GRID_TO_ENTITY_TO_SAP_RECIPE_KEYWORD,
    name: "Grid to entity to SAP",
    description: "Local Grid scan, entity CSV from grid, then SAP pages for the client package.",
    trigger: {
      keyword: "schedule-monthly",
      kind: "calendar",
      frequency: "monthly",
      startDate: new Date().toISOString().slice(0, 10),
      time: "09:00",
      targetBucket: "sap",
    },
    action: {
      keyword: "local-dominator-grid-export",
      executionKind: "local_dominator_export",
      executionPayload: LOCAL_GRID_EXPORT_PAYLOAD,
      title: "Local Grid scan",
    },
    actions: [
      {
        keyword: "local-dominator-grid-export",
        executionKind: "local_dominator_export",
        executionPayload: LOCAL_GRID_EXPORT_PAYLOAD,
        title: "Local Grid scan",
      },
      {
        keyword: "entity-generator-grid-run",
        executionKind: "entity_generator",
        executionPayload: ENTITY_FROM_GRID_PAYLOAD,
        title: "Entities from grid",
      },
      {
        keyword: "sap-generator-run",
        executionKind: "sap_generator",
        executionPayload: SAP_FROM_ENTITY_PAYLOAD,
        title: "SAP pages",
      },
    ],
  };

  return automationPlanToWorkflowGraph(plan, { teamId, siteId });
}

/** @deprecated Use buildGridToEntityToSapWorkflowDraft */
export function buildGridToEntityPagesWorkflowDraft(
  teamId: number,
  siteId?: string | null,
): Omit<WorkflowDefinition, "id" | "createdAt" | "updatedAt" | "publishedAt"> {
  return buildGridToEntityToSapWorkflowDraft(teamId, siteId);
}
