import { workflowClientVariableSuffix } from "@/lib/workflow/workflow-client-config";
import type { TaskExecutionPayload } from "@/lib/tasks-types";
import { linearOrderedNodes } from "@/lib/workflow/workflow-graph-mutations";
import type {
  WorkflowActionConfig,
  WorkflowDefinition,
  WorkflowStepOutput,
} from "@/lib/workflow/workflow-types";
import { clampPostCreatorPostCount } from "@/lib/post-creator/post-creator-post-count";

export function parseGapCountFromContentGapText(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const gapLine = trimmed.match(/^Gap:\s*(\d+)\s*$/m);
  if (gapLine) {
    const value = Number(gapLine[1]);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
  }

  const createMatch = trimmed.match(/Create\s+(\d+)\s+post/i);
  if (createMatch) {
    const value = Number(createMatch[1]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  }

  return null;
}

function findContentGapOutput(
  outputs: readonly WorkflowStepOutput[],
  variableKey: string,
  siteId: string,
  clientSiteIds: string[],
): WorkflowStepOutput | undefined {
  const suffix = workflowClientVariableSuffix(clientSiteIds, siteId);
  const suffixedKey = `${variableKey}${suffix}`;
  const scoped = outputs.filter((output) => {
    const ownerSiteId = output.siteId?.trim();
    if (suffix && ownerSiteId && ownerSiteId !== siteId.trim()) return false;
    return true;
  });
  return [...scoped]
    .reverse()
    .find((output) => output.variableKey === suffixedKey || output.variableKey === variableKey);
}

export function resolveUpstreamContentGapPostCount(
  workflow: WorkflowDefinition,
  nodeId: string,
  outputs: readonly WorkflowStepOutput[],
  siteId: string,
  clientSiteIds: string[],
): number | null {
  const ordered = linearOrderedNodes(workflow);
  const nodeIndex = ordered.findIndex((node) => node.id === nodeId);
  if (nodeIndex <= 0) return null;

  for (let index = nodeIndex - 1; index >= 0; index -= 1) {
    const prior = ordered[index];
    if (prior.kind !== "action_agent") continue;
    const config = prior.config as WorkflowActionConfig;
    if (config.executionKind !== "content_gap_check") continue;

    const variableKey = String(config.ragVariableKey ?? `step_${prior.id}`);
    const output = findContentGapOutput(outputs, variableKey, siteId, clientSiteIds);
    if (!output?.textPreview?.trim()) return null;

    return parseGapCountFromContentGapText(output.textPreview);
  }

  return null;
}

export function applyContentGapPostCountToPostCreatorPayload(
  payload: TaskExecutionPayload,
  workflow: WorkflowDefinition,
  nodeId: string,
  outputs: readonly WorkflowStepOutput[],
  siteId: string,
  clientSiteIds: string[],
): TaskExecutionPayload {
  const gapCount = resolveUpstreamContentGapPostCount(workflow, nodeId, outputs, siteId, clientSiteIds);
  if (gapCount == null || gapCount <= 0) return payload;

  const postCount = clampPostCreatorPostCount(gapCount);
  return {
    ...payload,
    postCount,
    scheduleTimesPerMonth: postCount,
    keywordSource: "gsc",
  };
}
