import { compileWorkflowTasks } from "@/lib/workflow/workflow-compile";
import { createWorkflow, summarizeWorkflow, updateWorkflow } from "@/lib/workflow/workflow-api";
import {
  migrateWorkflowThenStepsFromAgents,
  stripAllAgentInlineDelivery,
  workflowNeedsThenMigration,
} from "@/lib/workflow/workflow-migrate-then-steps";
import {
  applyGridToEntityToSapMigrationIfNeeded,
  workflowNeedsGridToEntityToSapMigration,
} from "@/lib/workflow/workflow-migrate-grid-to-entity-to-sap";
import {
  applyScheduleStampToUpstream,
  syncAdjacentScheduleFromClient,
} from "@/lib/workflow/workflow-schedule-upstream";
import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from "@/lib/workflow/workflow-types";

export type PersistWorkflowResult = {
  ok: boolean;
  workflow?: WorkflowDefinition;
  error?: string;
  created?: boolean;
};

const lastSummaryFingerprintByKey = new Map<string, string>();

export function resetWorkflowSummaryFingerprintCache(): void {
  lastSummaryFingerprintByKey.clear();
}

function configRecord(config: unknown): Record<string, unknown> {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    return config as Record<string, unknown>;
  }
  return {};
}

/** Compact graph used for tile blurbs. Matches PHP compact_graph (ignores period dates). */
export function workflowSummaryFingerprint(
  workflow: Pick<WorkflowDefinition, "name" | "nodes" | "edges">,
): string {
  const nodes = workflow.nodes.map((node: WorkflowNode) => {
    const config = configRecord(node.config);
    const item: Record<string, unknown> = {
      id: String(node.id ?? ""),
      kind: String(node.kind ?? ""),
      label: String(node.label ?? ""),
    };
    const executionKind = typeof config.executionKind === "string" ? config.executionKind : "";
    if (executionKind) item.executionKind = executionKind;
    if (typeof config.clientScope === "string") item.clientScope = config.clientScope;
    if (Array.isArray(config.siteIds)) item.clientCount = config.siteIds.length;
    return item;
  });
  const edges = workflow.edges.map((edge: WorkflowEdge) => ({
    source: String(edge.source ?? ""),
    target: String(edge.target ?? ""),
  }));
  return JSON.stringify({
    name: workflow.name.trim() || "Untitled workflow",
    nodes,
    edges,
  });
}

export function applyThenMigrationIfNeeded(workflow: WorkflowDefinition): WorkflowDefinition {
  const migrated = workflowNeedsThenMigration(workflow)
    ? { ...workflow, ...migrateWorkflowThenStepsFromAgents(workflow) }
    : workflow;
  return syncAdjacentScheduleFromClient(
    applyScheduleStampToUpstream(stripAllAgentInlineDelivery(migrated)),
  );
}

export function applyWorkflowLoadMigrations(workflow: WorkflowDefinition): {
  workflow: WorkflowDefinition;
  structuralMigration: boolean;
} {
  const afterThen = applyThenMigrationIfNeeded(workflow);
  const needsGrid = workflowNeedsGridToEntityToSapMigration(afterThen);
  const afterGrid = needsGrid ? applyGridToEntityToSapMigrationIfNeeded(afterThen) : afterThen;
  return { workflow: afterGrid, structuralMigration: needsGrid };
}

async function resolveDescriptionForPersist(
  teamId: number,
  workflow: WorkflowDefinition,
): Promise<string | undefined> {
  const existing = workflow.description?.trim();
  const fingerprint = workflowSummaryFingerprint(workflow);
  const cacheKey = `${teamId}:${workflow.id || 0}`;
  if (lastSummaryFingerprintByKey.get(cacheKey) === fingerprint) {
    return existing || undefined;
  }
  const summarized = await summarizeWorkflow(teamId, {
    name: workflow.name.trim() || "Untitled workflow",
    nodes: workflow.nodes,
    edges: workflow.edges,
  });
  lastSummaryFingerprintByKey.set(cacheKey, fingerprint);
  if (summarized.ok && summarized.description?.trim()) {
    return summarized.description.trim();
  }
  return existing || undefined;
}

export async function compileAndPersistWorkflowNodes(
  teamId: number,
  workflow: WorkflowDefinition,
): Promise<{ workflow: WorkflowDefinition | null; error?: string }> {
  const compiled = await compileWorkflowTasks(teamId, workflow);
  const saved = await updateWorkflow(teamId, compiled.id, {
    name: compiled.name.trim() || "Untitled workflow",
    description: compiled.description,
    wordpressSiteId: compiled.wordpressSiteId,
    nodes: compiled.nodes,
    edges: compiled.edges,
    ragVariables: compiled.ragVariables,
  });
  if (!saved.workflow) {
    return { workflow: null, error: saved.error ?? "Could not compile workflow tasks" };
  }
  return { workflow: saved.workflow };
}

export async function persistWorkflowDefinition(
  teamId: number,
  source: WorkflowDefinition,
  options?: { compile?: boolean },
): Promise<PersistWorkflowResult> {
  const migrated = applyWorkflowLoadMigrations(source).workflow;
  const shouldCompile = options?.compile !== false;
  const description = await resolveDescriptionForPersist(teamId, migrated);

  if (!migrated.id) {
    const created = await createWorkflow(teamId, {
      name: migrated.name.trim() || "Untitled workflow",
      description,
      wordpressSiteId: migrated.wordpressSiteId,
      nodes: migrated.nodes,
      edges: migrated.edges,
      ragVariables: migrated.ragVariables,
    });
    if (!created.workflow) {
      return { ok: false, error: created.error ?? "Could not save workflow" };
    }
    return { ok: true, workflow: created.workflow, created: true };
  }

  const result = await updateWorkflow(teamId, migrated.id, {
    name: migrated.name.trim() || "Untitled workflow",
    description,
    wordpressSiteId: migrated.wordpressSiteId,
    nodes: migrated.nodes,
    edges: migrated.edges,
    ragVariables: migrated.ragVariables,
  });
  if (!result.workflow) {
    return { ok: false, error: result.error ?? "Could not save workflow" };
  }

  if (!shouldCompile) {
    return { ok: true, workflow: result.workflow };
  }

  const compiled = await compileAndPersistWorkflowNodes(teamId, result.workflow);
  if (!compiled.workflow) {
    return {
      ok: false,
      workflow: result.workflow,
      error: compiled.error ?? "Could not compile workflow tasks",
    };
  }
  return { ok: true, workflow: compiled.workflow };
}
