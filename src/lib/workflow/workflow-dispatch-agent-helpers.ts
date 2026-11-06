import type { AgentRun } from "@/lib/agent-runs-types";
import { isClientAgnosticExecutionKind } from "@/lib/agent-runs-types";
import { browserAutomationRequiresClient } from "@/lib/browser-automation/resolve-browser-target-url";
import { findClientNode } from "@/lib/workflow/workflow-graph-utils";
import { isContentGapGoalMetFromPreview } from "@/lib/workflow/workflow-run-completion";
import type {
  WorkflowActionConfig,
  WorkflowClientConfig,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowPathRulesConfig,
} from "@/lib/workflow/workflow-types";

export function contentGapGoalMetFromAgentResult(
  result: AgentRun["result"] | Record<string, unknown> | null | undefined,
): boolean {
  if (!result || typeof result !== "object") return false;
  const record = result as Record<string, unknown>;
  if (record.goalMet === true) return true;
  if (typeof record.gapCount === "number" && record.gapCount === 0) return true;
  if (typeof record.message === "string" && isContentGapGoalMetFromPreview(record.message)) {
    return true;
  }
  return false;
}

export function actionConfig(node: WorkflowNode): WorkflowActionConfig {
  return (node.config ?? {}) as WorkflowActionConfig;
}

function actionRequiresClient(config: WorkflowActionConfig): boolean {
  if (config.executionKind === "browser_automation") {
    return browserAutomationRequiresClient(config.executionPayload);
  }
  return !isClientAgnosticExecutionKind(config.executionKind);
}

export function workflowRequiresClient(workflow: Pick<WorkflowDefinition, "nodes">): boolean {
  return workflow.nodes.some(
    (node) => node.kind === "action_agent" && actionRequiresClient(actionConfig(node)),
  );
}

export function pathConfig(node: WorkflowNode): WorkflowPathRulesConfig {
  const config = node.config as WorkflowPathRulesConfig;
  return { branches: config?.branches ?? [] };
}

export function resolveWorkflowSiteId(workflow: WorkflowDefinition): string | undefined {
  if (workflow.wordpressSiteId?.trim()) return workflow.wordpressSiteId.trim();
  const client = findClientNode(workflow);
  const siteIds = (client?.config as WorkflowClientConfig | undefined)?.siteIds ?? [];
  return siteIds[0]?.trim() || undefined;
}

export function stepOutputPreview(
  result: Record<string, unknown> | undefined,
  status: string,
  agentRunId: number,
): string {
  const message = result?.message;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (status === "done") return "Complete";
  return JSON.stringify(result ?? { status, agentRunId }).slice(0, 4000);
}

export function workflowActionStartsFromCompiledTask(kind: string | undefined): boolean {
  return kind === "dfs_llm_article_audit" || kind === "content_optimizer";
}
