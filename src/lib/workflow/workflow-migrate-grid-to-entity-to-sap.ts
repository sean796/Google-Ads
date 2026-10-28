import automationRecipes from "@/lib/automation-recipes-catalog.bundle.json";
import type { AutomationRecipeCatalogItem } from "@/lib/automation-recipes-types";
import { deleteNode, insertNodesAfter } from "@/lib/workflow/workflow-graph-mutations";
import { recipeToActionSubgraph } from "@/lib/workflow/workflow-recipe-merge";
import { GRID_TO_ENTITY_TO_SAP_RECIPE_KEYWORD } from "@/lib/workflow/templates/grid-to-entity-pages-workflow";
import type {
  WorkflowActionConfig,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowRagVariable,
} from "@/lib/workflow/workflow-types";

const GRID_RECIPE_KEYWORDS = new Set([
  GRID_TO_ENTITY_TO_SAP_RECIPE_KEYWORD,
  "grid-to-entity-pages-monthly",
]);

const STEP_TITLES: Record<string, string> = {
  local_dominator_export: "Local Grid scan",
  entity_generator: "Entities from grid",
  sap_generator: "SAP pages",
};

function gridRecipeFromCatalog(): AutomationRecipeCatalogItem | null {
  const list = automationRecipes as AutomationRecipeCatalogItem[];
  return list.find((item) => item.keyword === GRID_TO_ENTITY_TO_SAP_RECIPE_KEYWORD) ?? null;
}

function actionConfig(node: WorkflowNode): WorkflowActionConfig | null {
  if (node.kind !== "action_agent") return null;
  return node.config as WorkflowActionConfig;
}

export function workflowMatchesGridToEntityToSap(
  workflow: Pick<WorkflowDefinition, "name" | "nodes">,
): boolean {
  const name = workflow.name.trim().toLowerCase();
  if (name.includes("grid") && name.includes("entity")) return true;

  for (const node of workflow.nodes) {
    const config = actionConfig(node);
    if (!config) continue;
    const recipeKeyword = config.recipeKeyword?.trim();
    if (recipeKeyword && GRID_RECIPE_KEYWORDS.has(recipeKeyword)) return true;
  }

  const agents = workflow.nodes.filter((node) => node.kind === "action_agent");
  const kinds = agents.map((node) => actionConfig(node)?.executionKind ?? "");
  if (kinds[0] === "local_dominator_export" && kinds.includes("entity_generator")) return true;
  if (kinds[0] === "local_dominator_export" && kinds.includes("entity_page_creator")) return true;
  return (
    kinds.includes("local_dominator_export") &&
    kinds.includes("entity_generator") &&
    kinds.includes("sap_generator")
  );
}

function titleNeedsUpdate(kind: string, node: WorkflowNode): boolean {
  const config = actionConfig(node);
  const title = (config?.title ?? node.label ?? "").trim();
  const canonical = STEP_TITLES[kind];
  if (!canonical) return false;
  if (title === canonical) return false;
  const lower = title.toLowerCase();
  if (kind === "local_dominator_export" && /export.*grid|local dominator|dominator grid/i.test(title)) {
    return true;
  }
  if (kind === "entity_generator" && /entity csv|entity pages from grid|generate entity/i.test(lower)) {
    return true;
  }
  if (kind === "sap_generator" && /create sap pages from entity|sap pages from entity csv/i.test(lower)) {
    return true;
  }
  return title !== canonical;
}

function payloadNeedsUpdate(kind: string, config: WorkflowActionConfig): boolean {
  const payload = config.executionPayload ?? {};
  if (kind === "local_dominator_export" && payload.saveToDisk === true) return true;
  if (
    (kind === "entity_generator" || kind === "sap_generator") &&
    payload.entityUseEditorialPackage !== true
  ) {
    return true;
  }
  if (kind === "entity_generator" && payload.gridInputSource !== "workflow") return true;
  if (kind === "sap_generator" && payload.entityCsvInputSource !== "workflow") return true;
  if (config.recipeKeyword && !GRID_RECIPE_KEYWORDS.has(config.recipeKeyword)) return true;
  if (config.recipeKeyword === "grid-to-entity-pages-monthly") return true;
  return false;
}

export function workflowNeedsGridToEntityToSapMigration(workflow: WorkflowDefinition): boolean {
  if (!workflowMatchesGridToEntityToSap(workflow)) return false;

  const recipe = gridRecipeFromCatalog();
  if (!recipe) return false;

  const hasLegacyCreator = workflow.nodes.some(
    (node) => actionConfig(node)?.executionKind === "entity_page_creator",
  );
  if (hasLegacyCreator) return true;

  if (workflow.name.trim() !== recipe.name) return true;
  if ((workflow.description ?? "").trim() !== (recipe.description ?? "").trim()) return true;

  for (const node of workflow.nodes) {
    const config = actionConfig(node);
    if (!config?.executionKind) continue;
    if (!STEP_TITLES[config.executionKind]) continue;
    if (titleNeedsUpdate(config.executionKind, node)) return true;
    if (payloadNeedsUpdate(config.executionKind, config)) return true;
  }

  return false;
}

function patchAgentNode(
  node: WorkflowNode,
  recipe: AutomationRecipeCatalogItem,
  ldVariableKey: string,
  entityVariableKey: string,
): WorkflowNode {
  const config = actionConfig(node);
  if (!config?.executionKind) return node;

  const kind = config.executionKind;
  const recipeAction =
    recipe.defaultTasks?.find((task) => task.executionKind === kind) ??
    recipe.actionBlocks?.find((block) => block.executionKind === kind);
  const canonicalTitle = STEP_TITLES[kind] ?? (config.title ?? node.label);

  let executionPayload = {
    ...(config.executionPayload ?? {}),
    ...(recipeAction?.executionPayload ?? {}),
  };

  if (kind === "local_dominator_export") {
    executionPayload = { ...executionPayload, saveLocalArchive: true, saveToDisk: false };
  }
  if (kind === "entity_generator") {
    executionPayload = {
      ...executionPayload,
      locationSource: "grid",
      gridInputSource: "workflow",
      entityUseEditorialPackage: true,
      targetBucket: "sap",
      ragInputKeys: [ldVariableKey],
    };
  }
  if (kind === "sap_generator") {
    executionPayload = {
      ...executionPayload,
      entityCsvInputSource: "workflow",
      entityUseEditorialPackage: true,
      targetBucket: "sap",
      ragInputKeys: [entityVariableKey],
    };
  }

  const ragInputKeys =
    kind === "entity_generator"
      ? [ldVariableKey]
      : kind === "sap_generator"
        ? [entityVariableKey]
        : config.ragInputKeys;

  return {
    ...node,
    label: canonicalTitle,
    config: {
      ...config,
      title: canonicalTitle,
      executionPayload,
      ragInputKeys,
      recipeKeyword: GRID_TO_ENTITY_TO_SAP_RECIPE_KEYWORD,
      recipeCategory: recipe.category,
    },
  };
}

function replaceLegacyEntityPageCreator(
  workflow: WorkflowDefinition,
  recipe: AutomationRecipeCatalogItem,
): WorkflowDefinition {
  const legacy = workflow.nodes.find((node) => actionConfig(node)?.executionKind === "entity_page_creator");
  if (!legacy) return workflow;

  const ldNode = workflow.nodes.find((node) => actionConfig(node)?.executionKind === "local_dominator_export");
  if (!ldNode) return workflow;

  const removed = deleteNode(workflow, legacy.id);
  if (!removed) return workflow;

  const usedKeys = new Set(workflow.ragVariables.map((item) => item.key));
  const subgraph = recipeToActionSubgraph(recipe, usedKeys);
  const tailNodes = subgraph.nodes.filter(
    (node) =>
      actionConfig(node)?.executionKind === "entity_generator" ||
      actionConfig(node)?.executionKind === "sap_generator",
  );
  if (tailNodes.length === 0) return workflow;

  const inserted = insertNodesAfter(
    { ...workflow, ...removed },
    ldNode.id,
    tailNodes,
  );

  const ragVariables: WorkflowRagVariable[] = [
    ...workflow.ragVariables.filter((item) => item.nodeId !== legacy.id),
    ...subgraph.ragVariables.filter((item) =>
      tailNodes.some((node) => node.id === item.nodeId),
    ),
  ];

  return {
    ...workflow,
    nodes: inserted.nodes,
    edges: inserted.edges,
    ragVariables,
  };
}

function syncRagVariableLabels(nodes: WorkflowNode[], ragVariables: WorkflowRagVariable[]): WorkflowRagVariable[] {
  return ragVariables.map((item) => {
    const node = nodes.find((n) => n.id === item.nodeId);
    const config = node ? actionConfig(node) : null;
    const label = config?.title ?? item.label;
    return label && label !== item.label ? { ...item, label } : item;
  });
}

export function migrateGridToEntityToSapWorkflow(workflow: WorkflowDefinition): WorkflowDefinition {
  if (!workflowMatchesGridToEntityToSap(workflow)) return workflow;

  const recipe = gridRecipeFromCatalog();
  if (!recipe) return workflow;

  let next = replaceLegacyEntityPageCreator(workflow, recipe);

  const ldNode = next.nodes.find((node) => actionConfig(node)?.executionKind === "local_dominator_export");
  const entityNode = next.nodes.find((node) => actionConfig(node)?.executionKind === "entity_generator");
  const ldVariableKey = String(actionConfig(ldNode ?? ({} as WorkflowNode))?.ragVariableKey ?? "local_dominator_export_1");
  const entityVariableKey = String(
    actionConfig(entityNode ?? ({} as WorkflowNode))?.ragVariableKey ?? "entity_generator_2",
  );

  const nodes = next.nodes.map((node) => {
    if (node.kind !== "action_agent") return node;
    const kind = actionConfig(node)?.executionKind ?? "";
    if (!STEP_TITLES[kind]) return node;
    return patchAgentNode(node, recipe, ldVariableKey, entityVariableKey);
  });

  const ragVariables = syncRagVariableLabels(nodes, next.ragVariables);

  return {
    ...next,
    name: recipe.name,
    description: recipe.description,
    nodes,
    ragVariables,
  };
}

export function applyGridToEntityToSapMigrationIfNeeded(workflow: WorkflowDefinition): WorkflowDefinition {
  if (!workflowNeedsGridToEntityToSapMigration(workflow)) return workflow;
  return migrateGridToEntityToSapWorkflow(workflow);
}
