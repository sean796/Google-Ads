import type { AutomationPlan } from "@/lib/automation-planner-types";
import type { TaskExecutionPayload } from "@/lib/tasks-types";
import { automationPlanToWorkflowGraph } from "@/lib/workflow/workflow-migrate-from-planner";
import type { WorkflowDefinition } from "@/lib/workflow/workflow-types";

export const ENTITY_TO_SAP_RECIPE_KEYWORD = "entity-to-sap-monthly";

const ENTITY_GENERATOR_PAYLOAD: TaskExecutionPayload = {
  locationSource: "grid",
  gridInputSource: "workflow",
  entityAdGroupCount: 3,
  entityAdsPerGroup: 5,
  entityPageCount: 15,
  postCount: 15,
  focusKeyword: "",
  titleTemplate: "{keyword} Near {entity}",
  sitemapType: "entity",
  targetBucket: "sap",
  saveLocalArchive: true,
};

const SAP_GENERATOR_PAYLOAD: TaskExecutionPayload = {
  entityAdGroupCount: 3,
  entityAdsPerGroup: 5,
  entityPageCount: 15,
  postCount: 15,
  entityCsvInputSource: "workflow",
  ragInputKeys: ["entity_generator_1"],
  sitemapType: "entity",
  featuredImage: false,
  postDestination: "wordpress",
  scheduleTimesPerMonth: 15,
  scheduleCustomInterval: 15,
  scheduleStartDay: 1,
  scheduleStartTime: "09:00",
  scheduleStaggerOptimized: true,
  targetBucket: "sap",
  saveLocalArchive: true,
};

export function buildEntityToSapWorkflowDraft(
  teamId: number,
  siteId?: string | null,
): Omit<WorkflowDefinition, "id" | "createdAt" | "updatedAt" | "publishedAt"> {
  const plan: AutomationPlan = {
    keyword: ENTITY_TO_SAP_RECIPE_KEYWORD,
    name: "Entity to SAP pages",
    description: "Generate entity CSV rows, then hydrate and schedule SAP pages.",
    trigger: {
      keyword: "schedule-monthly",
      kind: "calendar",
      frequency: "monthly",
      startDate: new Date().toISOString().slice(0, 10),
      time: "09:00",
      targetBucket: "sap",
    },
    action: {
      keyword: "entity-generator-monthly",
      executionKind: "entity_generator",
      executionPayload: ENTITY_GENERATOR_PAYLOAD,
      title: "Generate entity CSV",
    },
    actions: [
      {
        keyword: "entity-generator-monthly",
        executionKind: "entity_generator",
        executionPayload: ENTITY_GENERATOR_PAYLOAD,
        title: "Generate entity CSV",
      },
      {
        keyword: "sap-generator-monthly",
        executionKind: "sap_generator",
        executionPayload: SAP_GENERATOR_PAYLOAD,
        title: "Create SAP pages from entity CSV",
      },
    ],
  };

  return automationPlanToWorkflowGraph(plan, { teamId, siteId });
}
