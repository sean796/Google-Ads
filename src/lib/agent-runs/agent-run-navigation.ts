import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import { taskExecutionKindToRecipe, type AgentRun, type AgentRunRecipeKey } from "@/lib/agent-runs-types";

const GSC_TASK_KEYWORDS = new Set(["gsc-mom-report", "gsc-yoy-report"]);
const ADS_TASK_KEYWORDS = new Set(["ads-mom-report", "ads-yoy-report"]);
const POST_CREATOR_TASK_KEYWORDS = new Set(["monthly-post-creator-run", "monthly-3-posts-run"]);

export function resolveAgentRunRecipeKey(
  run: Pick<AgentRun, "recipeKey" | "plan" | "context">,
): AgentRunRecipeKey | string {
  const key = (run.recipeKey ?? "").trim();
  const executionKind = String(run.plan?.executionKind ?? "").trim();

  const comparePreset = String(run.plan?.clientRunContract?.comparePreset ?? "").trim();
  if (comparePreset === "mom" || comparePreset === "yoy") {
    if (executionKind === "ads_reporting" || key === "ads_reporting") return "ads_reporting";
    return "gsc_reporting";
  }

  if (
    key === "entity_page_creator" ||
    key === "entity_generator" ||
    key === "sap_generator" ||
    key === "gsc_reporting" ||
    key === "ads_reporting" ||
    key === "post_creator" ||
    key === "local_dominator_export" ||
    key === "chatgpt_website_audit" ||
    key === "dfs_llm_article_audit" ||
    key === "browser_automation" ||
    key === "content_gap_check" ||
    key === "content_optimizer_bulk" ||
    key === "overview_pages_meta_batch"
  ) {
    return key;
  }

  const fromExecutionKind = executionKind ? taskExecutionKindToRecipe(executionKind) : null;
  if (fromExecutionKind) {
    return fromExecutionKind;
  }

  const businessName = String(run.plan?.clientRunContract?.businessName ?? "").trim();
  const keyword = String(run.plan?.clientRunContract?.keyword ?? "").trim();
  if (businessName && keyword) {
    return "local_dominator_export";
  }

  const taskKw = (run.context?.taskKeyword ?? "").trim();
  if (GSC_TASK_KEYWORDS.has(taskKw)) return "gsc_reporting";
  if (ADS_TASK_KEYWORDS.has(taskKw)) return "ads_reporting";
  if (POST_CREATOR_TASK_KEYWORDS.has(taskKw)) return "post_creator";

  return key || "content_optimizer_bulk";
}

export function agentRunGeneratorSection(recipeKey: string): BlogGeneratorSectionId {
  if (recipeKey === "gsc_reporting" || recipeKey === "ads_reporting") return "opt";
  if (recipeKey === "post_creator") return "bulk-prompt";
  return "opt";
}

export function agentRunProgressHeading(recipeKey: string): string {
  if (recipeKey === "gsc_reporting" || recipeKey === "ads_reporting") return "Report";
  if (recipeKey === "local_dominator_export") return "Grid export";
  if (recipeKey === "chatgpt_website_audit") return "ChatGPT audit";
  if (recipeKey === "dfs_llm_article_audit") return "DFS article audit";
  if (recipeKey === "browser_automation") return "Browser automation";
  if (recipeKey === "content_gap_check") return "Content gap check";
  if (recipeKey === "entity_page_creator" || recipeKey === "entity_generator" || recipeKey === "sap_generator") return "Progress";
  if (recipeKey === "post_creator") return "";
  return "Current post";
}

export function agentRunShowsUrlProgress(recipeKey: string): boolean {
  return (
    recipeKey === "content_optimizer_bulk" ||
    recipeKey === "overview_pages_meta_batch" ||
    !isKnownNonOptimizerRecipe(recipeKey)
  );
}

export function agentRunShowsBrowserPreview(recipeKey: string): boolean {
  return recipeKey === "chatgpt_website_audit" || recipeKey === "browser_automation";
}

function isKnownNonOptimizerRecipe(recipeKey: string): recipeKey is AgentRunRecipeKey {
  return (
    recipeKey === "gsc_reporting" ||
    recipeKey === "ads_reporting" ||
    recipeKey === "post_creator" ||
    recipeKey === "entity_page_creator" ||
    recipeKey === "entity_generator" ||
    recipeKey === "sap_generator" ||
    recipeKey === "local_dominator_export" ||
    recipeKey === "chatgpt_website_audit" ||
    recipeKey === "dfs_llm_article_audit" ||
    recipeKey === "browser_automation" ||
    recipeKey === "content_gap_check" ||
    recipeKey === "content_optimizer_bulk" ||
    recipeKey === "overview_pages_meta_batch"
  );
}
