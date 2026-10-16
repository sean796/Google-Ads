import { linearOrderedNodes } from "@/lib/workflow/workflow-graph-mutations";
import { defaultThenVariableKey } from "@/lib/workflow/workflow-then-utils";
import { workflowClientVariableSuffix } from "@/lib/workflow/workflow-client-config";
import { workflowOutputsToContextBlocks } from "@/lib/workflow/workflow-context-inject";
import {
  buildClientRunContextBlock,
  outputMatchesRagVariableKey,
} from "@/lib/workflow/workflow-client-context";
import { effectiveClientSiteIds, filterWorkflowOutputsForSite } from "@/lib/workflow/workflow-rag-client";
import type {
  WorkflowActionConfig,
  WorkflowDefinition,
  WorkflowRagVariable,
  WorkflowStepOutput,
} from "@/lib/workflow/workflow-types";
import { isWorkflowThenKind } from "@/lib/workflow/workflow-types";

export type WorkflowActionConfigWithRag = WorkflowActionConfig & {
  upstreamVariable?: string;
  ragInputKeys?: string[];
};

export function resolveRagInputKeys(config: WorkflowActionConfigWithRag): string[] {
  if (Array.isArray(config.ragInputKeys) && config.ragInputKeys.length > 0) {
    return config.ragInputKeys;
  }
  const legacy = config.upstreamVariable?.trim();
  return legacy ? [legacy] : [];
}

export function upstreamRagVariablesForNode(
  workflow: Pick<WorkflowDefinition, "nodes" | "edges" | "ragVariables">,
  nodeId: string,
): WorkflowRagVariable[] {
  const ordered = linearOrderedNodes(workflow);
  const nodeIndex = ordered.findIndex((node) => node.id === nodeId);
  if (nodeIndex <= 0) return [];

  const priorNodes = ordered.slice(0, nodeIndex);
  const priorActionIds = new Set(
    priorNodes.filter((node) => node.kind === "action_agent").map((node) => node.id),
  );
  const priorCsvIds = new Set(
    priorNodes.filter((node) => node.kind === "csv_rows").map((node) => node.id),
  );
  const priorThenIds = new Set(
    priorNodes.filter((node) => isWorkflowThenKind(node.kind)).map((node) => node.id),
  );

  const fromRegistry = workflow.ragVariables.filter(
    (variable) =>
      variable.scope === "run" &&
      (priorActionIds.has(variable.nodeId) ||
        priorCsvIds.has(variable.nodeId) ||
        priorThenIds.has(variable.nodeId)),
  );

  const computed: WorkflowRagVariable[] = [];
  for (const prior of priorNodes) {
    if (prior.kind === "action_agent") {
      const actionConfig = prior.config as WorkflowActionConfig;
      computed.push({
        key: String(actionConfig.ragVariableKey ?? `step_${prior.id}`),
        nodeId: prior.id,
        scope: "run",
        label: prior.label,
      });
    } else if (prior.kind === "csv_rows") {
      const csvConfig = prior.config as { ragVariableKey?: string };
      computed.push({
        key: String(csvConfig.ragVariableKey?.trim() || `csv_${prior.id}`),
        nodeId: prior.id,
        scope: "run",
        label: prior.label || "CSV rows",
      });
    } else if (isWorkflowThenKind(prior.kind)) {
      computed.push({
        key: defaultThenVariableKey(prior),
        nodeId: prior.id,
        scope: "run",
        label: prior.label,
      });
    }
  }

  const merged = new Map<string, WorkflowRagVariable>();
  for (const variable of [...fromRegistry, ...computed]) {
    merged.set(variable.key, variable);
  }
  return Array.from(merged.values());
}

export function buildRunContextBlock(
  outputs: WorkflowStepOutput[],
  ragInputKeys: string[],
  siteId?: string,
  clientSiteIds?: string[],
): string {
  const keys = ragInputKeys.map((item) => item.trim()).filter(Boolean);
  if (keys.length === 0) return "";

  const targetSiteId = siteId?.trim();
  const scopedClientSiteIds = clientSiteIds ?? [];
  if (targetSiteId && scopedClientSiteIds.length > 0) {
    return buildClientRunContextBlock(outputs, keys, targetSiteId, scopedClientSiteIds);
  }

  const allSiteIds = effectiveClientSiteIds(outputs, scopedClientSiteIds);
  const runOutputs = outputs.filter((output) => {
    if (output.scope !== "run") return false;
    return keys.some((key) => {
      if (output.variableKey === key) return true;
      return output.variableKey.startsWith(`${key}__`);
    });
  });
  if (allSiteIds.length > 1) {
    return workflowOutputsToContextBlocks(
      runOutputs.filter((output) => {
        const ownerSiteId = output.siteId?.trim();
        if (!ownerSiteId) return false;
        return keys.some((key) => outputMatchesRagVariableKey(output, key, ownerSiteId, allSiteIds));
      }),
    );
  }
  return workflowOutputsToContextBlocks(runOutputs);
}

export function resolveArchiveOutputForClient(
  outputs: WorkflowStepOutput[],
  sourceVariableKey: string,
  siteId: string,
  clientSiteIds: string[],
): WorkflowStepOutput | undefined {
  const key = sourceVariableKey.trim();
  if (!key) return undefined;
  const allSiteIds = effectiveClientSiteIds(outputs, clientSiteIds);
  const scoped = filterWorkflowOutputsForSite(outputs, siteId, allSiteIds);
  const suffixed =
    allSiteIds.length > 1 ? `${key}${workflowClientVariableSuffix(allSiteIds, siteId)}` : key;
  return (
    [...scoped].reverse().find((output) => output.variableKey === suffixed) ??
    [...scoped].reverse().find((output) => output.variableKey === key)
  );
}
