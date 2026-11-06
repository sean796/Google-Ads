import type { PulseForgeRoute } from "@/lib/pulse-forge/pulse-forge-route";
import type { TaskExecutionKind } from "@/lib/tasks-types";
import type { WorkflowActionConfig, WorkflowNode } from "@/lib/workflow/workflow-types";
import { isWorkflowClientKind } from "@/lib/workflow/workflow-types";

type ActionNodeConfig = WorkflowActionConfig;

const EXECUTION_KIND_RECIPE_KEYWORDS: Partial<Record<TaskExecutionKind, string>> = {
  gsc_reporting: "gsc-monthly-mom-report",
  ads_reporting: "ads-monthly-mom-report",
  local_dominator_export: "research-local-dominator-grid-export",
  chatgpt_website_audit: "chatgpt-website-audit",
  dfs_llm_article_audit: "dfs-llm-article-audit",
  browser_automation: "residential-browser-automation",
  post_creator: "monthly-post-creator",
  entity_page_creator: "entity-page-creator-monthly",
  entity_generator: "entity-generator-monthly",
  sap_generator: "sap-generator-monthly",
  content_optimizer: "content-optimizer-full",
  content_optimizer_meta: "content-optimizer-meta",
};

function recipeBuilderRoute(
  recipeKeyword: string,
  workflowId?: number,
  workflowNodeId?: string,
): PulseForgeRoute {
  if (workflowId && workflowNodeId) {
    return { section: "recipes", view: "builder", recipeKeyword, workflowId, workflowNodeId };
  }
  return { section: "recipes", view: "builder", recipeKeyword };
}

function recipeKeywordFromExecutionKind(kind: string | undefined): string | null {
  const trimmed = kind?.trim();
  if (!trimmed) return null;
  return EXECUTION_KIND_RECIPE_KEYWORDS[trimmed as TaskExecutionKind] ?? null;
}

function actionAgentRoute(node: WorkflowNode): PulseForgeRoute | null {
  const config = node.config as ActionNodeConfig;
  const recipeKeyword =
    config.actionBlockKeyword?.trim() ||
    recipeKeywordFromExecutionKind(config.executionKind);
  return recipeKeyword ? recipeBuilderRoute(recipeKeyword) : null;
}

function triggerRoute(
  node: WorkflowNode,
  workflowId?: number,
  workflowNodeId?: string,
): PulseForgeRoute | null {
  if (node.kind === "trigger_calendar") {
    return recipeBuilderRoute("gsc-monthly-mom-report", workflowId, workflowNodeId);
  }
  if (node.kind === "trigger_gsc") {
    return recipeBuilderRoute("pages-clicks-drop", workflowId, workflowNodeId);
  }
  if (node.kind === "trigger_agent_done") {
    const config = node.config as { executionKind?: TaskExecutionKind; recipeKey?: string };
    const recipeKeyword =
      recipeKeywordFromExecutionKind(config.executionKind) ??
      (config.recipeKey === "gsc_reporting"
        ? "gsc-monthly-mom-report"
        : config.recipeKey === "ads_reporting"
          ? "ads-monthly-mom-report"
        : config.recipeKey === "local_dominator_export"
          ? "research-local-dominator-grid-export"
          : config.recipeKey === "chatgpt_website_audit"
            ? "chatgpt-website-audit"
            : config.recipeKey === "dfs_llm_article_audit"
              ? "dfs-llm-article-audit"
            : config.recipeKey === "browser_automation"
              ? "residential-browser-automation"
            : null);
    return recipeKeyword ? recipeBuilderRoute(recipeKeyword, workflowId, workflowNodeId) : null;
  }
  return null;
}

export function resolveWorkflowStepForgeRoute(
  node: WorkflowNode,
  workflowId?: number,
): PulseForgeRoute | null {
  if (isWorkflowClientKind(node.kind)) return null;
  if (node.kind === "action_agent") {
    const route = actionAgentRoute(node);
    if (!route || !("recipeKeyword" in route) || !workflowId) return route;
    return recipeBuilderRoute(route.recipeKeyword, workflowId, node.id);
  }
  if (node.kind.startsWith("trigger_")) {
    return triggerRoute(node, workflowId, node.id);
  }
  return null;
}

export function workflowStepForgeRouteLabel(node: WorkflowNode): string {
  const route = resolveWorkflowStepForgeRoute(node);
  if (!route || !("recipeKeyword" in route)) return "Open in Forge";
  return "Open agent in Forge";
}
