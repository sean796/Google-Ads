import type { TaskExecutionKind } from "@/lib/tasks-types";
import { linearOrderedNodes } from "@/lib/workflow/workflow-graph-mutations";
import type { WorkflowActionConfig, WorkflowEdge, WorkflowNode } from "@/lib/workflow/workflow-types";

function actionVariableKey(node: WorkflowNode): string {
  const config = node.config as WorkflowActionConfig;
  return String(config.ragVariableKey ?? `step_${node.id}`).trim();
}

const CLIENT_BOUND_BUSINESS_KINDS = new Set<TaskExecutionKind>([
  "local_dominator_export",
  "entity_page_creator",
  "entity_generator",
  "sap_generator",
]);

function stripStoredBusinessName(payload: Record<string, unknown>): Record<string, unknown> {
  const { businessName: _removed, ...rest } = payload;
  return rest;
}

/** Keep agent steps aligned when the workflow client site changes. */
export function syncAgentNodesForWorkflowClient(args: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}): WorkflowNode[] {
  const { nodes, edges } = args;
  const ordered = linearOrderedNodes({ nodes, edges });
  const byId = new Map(nodes.map((node) => [node.id, node]));

  let prevExecutionKind = "";
  let prevVariableKey = "";

  for (const node of ordered) {
    if (node.kind !== "action_agent") continue;
    const config = node.config as WorkflowActionConfig & { ragInputKeys?: string[] };
    const kind = String(config.executionKind ?? "") as TaskExecutionKind;
    let executionPayload = { ...(config.executionPayload ?? {}) };
    let nextRagInputKeys = config.ragInputKeys;

    if (CLIENT_BOUND_BUSINESS_KINDS.has(kind)) {
      executionPayload = stripStoredBusinessName(executionPayload);
    }

    if (
      prevExecutionKind === "local_dominator_export" &&
      (kind === "entity_page_creator" || kind === "entity_generator") &&
      prevVariableKey
    ) {
      executionPayload = {
        ...executionPayload,
        locationSource: "grid",
        gridInputSource: "workflow",
        ragInputKeys: [prevVariableKey],
      };
      nextRagInputKeys = [prevVariableKey];
    }

    if (
      prevExecutionKind === "entity_generator" &&
      kind === "sap_generator" &&
      prevVariableKey
    ) {
      executionPayload = {
        ...executionPayload,
        entityCsvInputSource: "workflow",
        ragInputKeys: [prevVariableKey],
      };
      nextRagInputKeys = [prevVariableKey];
    }

    byId.set(node.id, {
      ...node,
      config: {
        ...config,
        executionPayload,
        ...(nextRagInputKeys ? { ragInputKeys: nextRagInputKeys } : {}),
      },
    });

    prevExecutionKind = kind;
    prevVariableKey = actionVariableKey(node);
  }

  return nodes.map((node) => byId.get(node.id) ?? node);
}
