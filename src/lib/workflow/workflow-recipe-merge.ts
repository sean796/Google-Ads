import { recipeToPlan } from "@/lib/automation-planner-compile";
import type { AutomationRecipeCatalogItem } from "@/lib/automation-recipes-types";
import { syncAgentNodesForWorkflowClient } from "@/lib/workflow/workflow-client-agent-sync";
import { defaultNodeLabel, newWorkflowNodeId } from "@/lib/workflow/workflow-graph-utils";
import {
  ensureRagArchiveNode,
  insertNodesAfter,
  resolveDefaultInsertAnchorId,
} from "@/lib/workflow/workflow-graph-mutations";
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowRagVariable,
} from "@/lib/workflow/workflow-types";

export type RecipeMergeResult = {
  nodes: WorkflowNode[];
  edges: WorkflowDefinition["edges"];
  ragVariables: WorkflowRagVariable[];
  insertedNodeIds: string[];
  triggerConflict?: string;
};

export type RecipeActionSubgraph = {
  nodes: WorkflowNode[];
  ragVariables: WorkflowRagVariable[];
};

function uniqueRagKey(base: string, used: Set<string>): string {
  let key = base.replace(/[^a-z0-9_]/gi, "_");
  if (!used.has(key)) {
    used.add(key);
    return key;
  }
  let index = 2;
  while (used.has(`${key}_${index}`)) index += 1;
  const next = `${key}_${index}`;
  used.add(next);
  return next;
}

export function recipeToActionSubgraph(
  recipe: AutomationRecipeCatalogItem,
  usedKeys: Set<string>,
): RecipeActionSubgraph {
  const plan = recipeToPlan(recipe);
  const actions = plan.actions?.length ? plan.actions : [plan.action];
  const nodes: WorkflowNode[] = [];
  const ragVariables: WorkflowRagVariable[] = [];
  let prevVariableKey = "";
  let prevExecutionKind = "";

  actions.forEach((action, index) => {
    const actionId = newWorkflowNodeId("action_agent");
    const baseKey = `${action.executionKind}_${index + 1}`;
    const variableKey = uniqueRagKey(baseKey, usedKeys);
    const actionTitle = action.title ?? defaultNodeLabel("action_agent");
    const executionKind = String(action.executionKind ?? "");
    let executionPayload = { ...(action.executionPayload ?? {}) };

    if (
      index > 0 &&
      prevExecutionKind === "local_dominator_export" &&
      (executionKind === "entity_page_creator" || executionKind === "entity_generator")
    ) {
      executionPayload = {
        ...executionPayload,
        locationSource: "grid",
        gridInputSource: "workflow",
        ragInputKeys: [prevVariableKey],
      };
    }

    if (index > 0 && prevExecutionKind === "entity_generator" && executionKind === "sap_generator") {
      executionPayload = {
        ...executionPayload,
        entityCsvInputSource: "workflow",
        ragInputKeys: [prevVariableKey],
      };
    }

    const autoRagInputKeys =
      index > 0 &&
      ((prevExecutionKind === "local_dominator_export" &&
        (executionKind === "entity_page_creator" || executionKind === "entity_generator")) ||
        (prevExecutionKind === "entity_generator" && executionKind === "sap_generator") ||
        (executionKind === "post_creator" && Boolean(executionPayload.useUpstreamContext) && prevVariableKey))
        ? [prevVariableKey]
        : undefined;

    nodes.push({
      id: actionId,
      kind: "action_agent",
      label: `${recipe.name} · ${actionTitle}`,
      config: {
        executionKind: action.executionKind,
        executionPayload,
        ragVariableKey: variableKey,
        ragScope: "run",
        title: action.title,
        actionBlockKeyword: action.keyword,
        recipeKeyword: recipe.keyword,
        recipeCategory: recipe.category,
        ...(autoRagInputKeys ? { ragInputKeys: autoRagInputKeys } : {}),
      },
      position: { x: 120, y: 80 + (index + 1) * 140 },
    });
    ragVariables.push({
      key: variableKey,
      nodeId: actionId,
      scope: "run",
      label: action.title ?? `${recipe.name} output`,
    });
    prevVariableKey = variableKey;
    prevExecutionKind = executionKind;
  });

  return { nodes, ragVariables };
}

export function mergeRecipeIntoWorkflow(
  workflow: Pick<WorkflowDefinition, "nodes" | "edges" | "ragVariables">,
  recipe: AutomationRecipeCatalogItem,
  afterNodeId: string | null,
): RecipeMergeResult {
  const usedKeys = new Set(workflow.ragVariables.map((item) => item.key));
  const subgraph = recipeToActionSubgraph(recipe, usedKeys);
  const plan = recipeToPlan(recipe);

  let anchorId = afterNodeId;
  if (!anchorId) {
    anchorId = resolveDefaultInsertAnchorId(workflow);
  }

  let graph = insertNodesAfter(workflow, anchorId, subgraph.nodes);
  graph = ensureRagArchiveNode({ ...workflow, ...graph });
  const syncedNodes = syncAgentNodesForWorkflowClient({
    nodes: graph.nodes,
    edges: graph.edges,
  });

  const triggerConflict =
    plan.trigger.kind === "gsc" &&
    workflow.nodes.some((node) => node.kind === "trigger_manual")
      ? "Recipe uses a GSC trigger; only actions were added to this workflow."
      : undefined;

  return {
    nodes: syncedNodes,
    edges: graph.edges,
    ragVariables: [...workflow.ragVariables, ...subgraph.ragVariables],
    insertedNodeIds: subgraph.nodes.map((node) => node.id),
    triggerConflict,
  };
}
