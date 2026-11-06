import { taskExecutionKindToRecipe, type StartAgentRunPayload } from "@/lib/agent-runs-types";
import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import { runAgentMailEmailIntake } from "@/lib/agentmail/agentmail-email-intake";
import { applyEditorialPackageContentGapTarget } from "@/lib/content-gap/apply-editorial-package-content-gap-target";
import { applyEditorialPackageEntityPageCount } from "@/lib/editorial/apply-editorial-package-entity-page-count";
import type { TaskExecutionKind, TaskExecutionPayload } from "@/lib/tasks-types";
import { applyCsvRowsPayloadForNode } from "@/lib/workflow/apply-csv-rows-payload";
import { ensureChatGptAuditExecutionPayload } from "@/lib/workflow/resolve-chatgpt-audit-workflow-payload";
import { resolveDfsArticleAuditWorkflowPayload } from "@/lib/workflow/resolve-dfs-article-audit-workflow-payload";
import { resolveWorkflowActionPayload } from "@/lib/workflow/resolve-workflow-action-payload";
import {
  applyContentGapPostCountToPostCreatorPayload,
} from "@/lib/workflow/resolve-workflow-content-gap-post-count";
import { applyUpstreamContextToPostCreatorPayload } from "@/lib/workflow/upstream-research-facts";
import {
  applyWorkflowTriggerScheduleToPayload,
} from "@/lib/workflow/workflow-agent-plan";
import { ensureWorkflowCsvRowsStashForAction } from "@/lib/workflow/workflow-csv-rows-runner";
import { actionConfig, resolveWorkflowSiteId } from "@/lib/workflow/workflow-dispatch-agent-helpers";
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowRun,
  WorkflowStepOutput,
} from "@/lib/workflow/workflow-types";
import {
  mergeThenStepScheduleIntoPayload,
  stripWorkflowAgentDeliveryPayload,
} from "@/lib/workflow/workflow-then-utils";
import {
  applyLocalDominatorWorkflowKeyword,
  resolveWorkflowSiteContext,
} from "@/lib/workflow/workflow-walk-helpers";

export async function buildActionPayload(
  workflow: WorkflowDefinition,
  node: WorkflowNode,
  contextBlock: string,
  run: WorkflowRun,
  siteId: string | undefined,
  outputs: WorkflowStepOutput[],
  clientSiteIds: string[],
): Promise<StartAgentRunPayload | null> {
  const config = actionConfig(node);
  const kind = config.executionKind as TaskExecutionKind;
  const recipeKey = taskExecutionKindToRecipe(kind);
  if (!recipeKey) return null;
  await ensureWorkflowCsvRowsStashForAction({
    teamId: workflow.teamId,
    workflowRunId: run.id,
    workflow,
    actionNode: node,
    outputs,
    siteId,
  });
  let basePayload: TaskExecutionPayload = {
    ...config.executionPayload,
    workflowContextBlock: contextBlock,
  };
  basePayload = applyWorkflowTriggerScheduleToPayload(workflow, kind, basePayload);
  basePayload = mergeThenStepScheduleIntoPayload(workflow, node.id, basePayload);
  const strippedPayload = stripWorkflowAgentDeliveryPayload(basePayload);

  if (run.triggerKind === "trigger_agentmail" && kind === "post_creator") {
    const messageId = String(run.triggerPayload?.messageId ?? "").trim();
    if (!messageId) {
      throw new Error("Agent Mail trigger is missing messageId.");
    }
    const intake = await runAgentMailEmailIntake(workflow.teamId, messageId);
    const intentParts = [intake.classification.intent, intake.contextNotes].filter(Boolean);
    strippedPayload.optionalPrompt = intentParts.join("\n\n").trim() || strippedPayload.optionalPrompt;
    strippedPayload.prefilledImportRows = intake.rows;
    strippedPayload.postCount = intake.rows.length;
    strippedPayload.agentMailMessageId = messageId;
  }

  const resolvedSiteId = siteId?.trim() || resolveWorkflowSiteId(workflow);
  const siteContext = resolveWorkflowSiteContext(resolvedSiteId);
  const withKeyword =
    kind === "local_dominator_export"
      ? applyLocalDominatorWorkflowKeyword(strippedPayload, config.executionPayload, siteContext.name)
      : strippedPayload;
  let payload = resolveWorkflowActionPayload(
    kind,
    withKeyword,
    siteContext.site,
    run.id,
    { outputs, siteId: resolvedSiteId, clientSiteIds },
  );
  if (resolvedSiteId) {
    payload = { ...payload, siteId: resolvedSiteId };
  }
  if (kind === "content_gap_check") {
    const gapSite = resolvedSiteId
      ? getStoredSites().find((item) => item.id === resolvedSiteId) ?? siteContext.site
      : siteContext.site;
    payload = applyEditorialPackageContentGapTarget(payload, gapSite as WordPressSite);
  }
  if (
    kind === "entity_generator"
    || kind === "sap_generator"
    || kind === "entity_page_creator"
  ) {
    const entitySite = resolvedSiteId
      ? getStoredSites().find((item) => item.id === resolvedSiteId) ?? siteContext.site
      : siteContext.site;
    payload = applyEditorialPackageEntityPageCount(payload, entitySite as WordPressSite);
  }
  const clientSiteUrl = (siteContext.url ?? siteContext.site.siteUrl ?? siteContext.site.productionSiteUrl ?? "").trim();
  if (clientSiteUrl) {
    payload = {
      ...payload,
      siteUrl: clientSiteUrl,
      productionSiteUrl: (siteContext.site.productionSiteUrl ?? clientSiteUrl).trim(),
    };
  }
  if (siteContext.name.trim() && !payload.businessName?.trim()) {
    payload = { ...payload, businessName: siteContext.name.trim() };
  }
  if (kind === "post_creator" && resolvedSiteId) {
    payload = applyContentGapPostCountToPostCreatorPayload(
      payload,
      workflow,
      node.id,
      outputs,
      resolvedSiteId,
      clientSiteIds,
    );
  }
  payload = applyCsvRowsPayloadForNode(run.id, node.id, payload, resolvedSiteId);
  if (kind === "post_creator") {
    payload = applyUpstreamContextToPostCreatorPayload(payload);
  }
  if (kind === "dfs_llm_article_audit" && resolvedSiteId) {
    const fullSite = getStoredSites().find((item) => item.id === resolvedSiteId);
    if (fullSite) {
      payload = await resolveDfsArticleAuditWorkflowPayload(fullSite, payload);
    }
  }
  if (kind === "chatgpt_website_audit") {
    payload = ensureChatGptAuditExecutionPayload(payload);
  }
  return {
    teamId: workflow.teamId,
    source: "workflow",
    recipeKey,
    title: config.title ?? node.label,
    context: {
      siteId: resolvedSiteId,
      workflowId: workflow.id,
      workflowRunId: run.id,
      workflowNodeId: node.id,
    },
    plan: {
      executionKind: kind,
      executionPayload: payload,
      workflowId: workflow.id,
      workflowRunId: run.id,
      workflowNodeId: node.id,
      ragVariableKey: config.ragVariableKey ?? `step_${node.id}`,
      workflowThenDelivery: true,
    },
  };
}
