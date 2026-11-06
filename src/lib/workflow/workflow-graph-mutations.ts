import {
  defaultNodeLabel,
  findClientNode,
  findTriggerNode,
  newWorkflowNodeId,
  nodeById,
  outgoingEdges,
} from "@/lib/workflow/workflow-graph-utils";
import { inferActionKeyword } from "@/lib/automation-planner-compile";
import { ensureExecutionSchedulePayload } from "@/lib/post-creator/post-creator-schedule-payload";
import type { TaskExecutionKind, TaskExecutionPayload } from "@/lib/tasks-types";
import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeConfig,
  WorkflowNodeKind,
} from "@/lib/workflow/workflow-types";
import { isWorkflowClientKind, isWorkflowThenKind, isWorkflowTriggerKind } from "@/lib/workflow/workflow-types";

const STEP_Y_GAP = 140;
const STEP_X = 120;
const STEP_Y_START = 80;

/** When adding from the column footer, prefer inserting before Then/archive steps. */
export function resolveDefaultInsertAnchorId(
  workflow: Pick<WorkflowDefinition, "nodes" | "edges">,
  afterNodeId?: string | null,
): string | null {
  if (afterNodeId) return afterNodeId;

  const ordered = linearOrderedNodes(workflow);
  const firstThenOrArchive = ordered.find(
    (node) => isWorkflowThenKind(node.kind) || node.kind === "rag_archive",
  );
  if (firstThenOrArchive) {
    const index = ordered.indexOf(firstThenOrArchive);
    if (index > 0) return ordered[index - 1]!.id;
  }

  return (
    ordered[ordered.length - 1]?.id ??
    findTriggerNode(workflow)?.id ??
    findClientNode(workflow)?.id ??
    null
  );
}

export function linearOrderedNodes(workflow: Pick<WorkflowDefinition, "nodes" | "edges">): WorkflowNode[] {
  const client = findClientNode(workflow);
  const trigger = findTriggerNode(workflow);
  const ordered: WorkflowNode[] = [];
  const visited = new Set<string>();

  const walkFrom = (startId: string) => {
    let currentId = startId;
    while (true) {
      const nextEdges = outgoingEdges(workflow.edges, currentId);
      if (nextEdges.length === 0) break;
      const nextId = nextEdges[0]?.target;
      if (!nextId || visited.has(nextId)) break;
      const nextNode = nodeById(workflow.nodes, nextId);
      if (!nextNode || isWorkflowClientKind(nextNode.kind)) break;
      ordered.push(nextNode);
      visited.add(nextId);
      currentId = nextId;
    }
  };

  if (client) {
    ordered.push(client);
    visited.add(client.id);
  }

  if (trigger && !visited.has(trigger.id)) {
    ordered.push(trigger);
    visited.add(trigger.id);
    walkFrom(trigger.id);
  } else if (client) {
    walkFrom(client.id);
  }

  for (const node of workflow.nodes) {
    if (!visited.has(node.id)) ordered.push(node);
  }

  if (ordered.length === 0) return [...workflow.nodes];
  return ordered;
}

export function findUpstreamActionAgent(
  workflow: Pick<WorkflowDefinition, "nodes" | "edges">,
  nodeId: string,
): WorkflowNode | null {
  const ordered = linearOrderedNodes(workflow);
  const index = ordered.findIndex((node) => node.id === nodeId);
  const before = index >= 0 ? ordered.slice(0, index) : ordered;
  return [...before].reverse().find((node) => node.kind === "action_agent") ?? null;
}

export function findRagArchiveNode(workflow: Pick<WorkflowDefinition, "nodes">): WorkflowNode | null {
  return workflow.nodes.find((node) => node.kind === "rag_archive") ?? null;
}

export function syncLinearPositions(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.map((node, index) => ({
    ...node,
    position: { x: STEP_X, y: STEP_Y_START + index * STEP_Y_GAP },
  }));
}

export function rewireLinearChain(nodes: WorkflowNode[], _edges: WorkflowEdge[] = []): WorkflowEdge[] {
  const ordered = [...nodes].sort((a, b) => a.position.y - b.position.y);
  const nextEdges: WorkflowEdge[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const source = ordered[index]!;
    const target = ordered[index + 1]!;
    nextEdges.push({
      id: `e_${source.id}_${target.id}`,
      source: source.id,
      target: target.id,
    });
  }
  return nextEdges;
}

export function insertNodesAfter<T extends Pick<WorkflowDefinition, "nodes" | "edges">>(
  workflow: T,
  afterNodeId: string | null,
  newNodes: WorkflowNode[],
): T {
  if (newNodes.length === 0) {
    return workflow;
  }

  const ordered = linearOrderedNodes(workflow);
  const anchorId = resolveDefaultInsertAnchorId(workflow, afterNodeId);

  if (!anchorId) {
    const nodes = syncLinearPositions([...newNodes]);
    return { ...workflow, nodes, edges: rewireLinearChain(nodes, workflow.edges) };
  }

  const anchorIndex = ordered.findIndex((node) => node.id === anchorId);
  const insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : ordered.length;
  const before = ordered.slice(0, insertIndex);
  const after = ordered.slice(insertIndex);
  const merged = [...before, ...newNodes, ...after];
  const existingIds = new Set(workflow.nodes.map((node) => node.id));
  const appended = workflow.nodes.filter((node) => !merged.some((item) => item.id === node.id));
  const nodes = syncLinearPositions([...merged, ...appended]);
  return { ...workflow, nodes, edges: rewireLinearChain(nodes, workflow.edges) };
}

export function insertNodeAfter<T extends Pick<WorkflowDefinition, "nodes" | "edges">>(
  workflow: T,
  afterNodeId: string | null,
  node: WorkflowNode,
): T {
  return insertNodesAfter(workflow, afterNodeId, [node]);
}

export function deleteNode(
  workflow: Pick<WorkflowDefinition, "nodes" | "edges">,
  nodeId: string,
): Pick<WorkflowDefinition, "nodes" | "edges"> | null {
  const target = nodeById(workflow.nodes, nodeId);
  if (!target || isWorkflowClientKind(target.kind)) return null;

  const remaining = workflow.nodes.filter((node) => node.id !== nodeId);
  const positioned = syncLinearPositions(
    linearOrderedNodes({ nodes: remaining, edges: workflow.edges }).filter((node) => node.id !== nodeId),
  );
  return { nodes: positioned, edges: rewireLinearChain(positioned, workflow.edges) };
}

export function duplicateNode(
  workflow: Pick<WorkflowDefinition, "nodes" | "edges">,
  nodeId: string,
): { nodes: WorkflowNode[]; edges: WorkflowEdge[]; newNodeId: string } | null {
  const source = nodeById(workflow.nodes, nodeId);
  if (!source || isWorkflowTriggerKind(source.kind) || isWorkflowClientKind(source.kind)) return null;

  const cloneId = newWorkflowNodeId(source.kind);
  const clone: WorkflowNode = {
    ...source,
    id: cloneId,
    label: `${source.label} copy`,
    config: structuredClone(source.config),
  };
  const inserted = insertNodeAfter(workflow, nodeId, clone);
  return { ...inserted, newNodeId: cloneId };
}

export function defaultNodeConfig(kind: WorkflowNodeKind): Record<string, unknown> {
  switch (kind) {
    case "workflow_client":
      return { siteIds: [], clientScope: "selected" };
    case "action_agent":
      return {
        executionKind: "content_optimizer_meta",
        executionPayload: { targetBucket: "pages" },
        ragVariableKey: `step_${Date.now()}`,
        ragScope: "run",
        ragInputKeys: [],
      };
    case "path_rules":
      return {
        branches: [
          { branchId: "branch_a", label: "Path A", match: "any", conditions: [] },
          { branchId: "default", label: "Default", match: "all", conditions: [] },
        ],
      };
    case "trigger_gsc":
      return { targetBucket: "pages", triggerConfig: { conditions: [], match: "any", sources: ["gsc"] } };
    case "trigger_agentmail":
      return { fromEmail: "", inbox: "" };
    case "csv_rows":
      return {
        csvInputSource: "upload",
        csvColumnMap: {},
        ragVariableKey: `csv_${Date.now()}`,
      };
    case "rag_archive":
      return { variableKey: "workflow_output", scope: "run", deliverableScope: "final" };
    case "then_google_drive":
      return {
        inputVariableKey: "",
        inputMode: "single",
        executionPayload: {
          saveLocalArchive: true,
          saveToGoogleDrive: true,
          googleDriveFolderSource: "path",
          googleDriveFolderPath: "reporting",
        },
      };
    case "then_local":
    case "then_email":
      return { inputVariableKey: "", executionPayload: { saveLocalArchive: true } };
    case "then_scheduled":
      return {
        inputVariableKey: "",
        executionPayload: ensureExecutionSchedulePayload({
          postCount: 15,
          scheduleFrequency: "custom",
          scheduleCustomInterval: 15,
          scheduleTimesPerMonth: 15,
          scheduleStartDay: 1,
          scheduleStartTime: "09:00",
          scheduleStartDateOption: "immediate",
          scheduleStaggerOptimized: true,
          postDestination: "wordpress",
        }),
      };
    case "then_draft":
      return {
        inputVariableKey: "",
        executionPayload: {
          postCount: 1,
          scheduleDraftOnly: true,
          postDestination: "draft",
        },
      };
    default:
      return {};
  }
}

export function createWorkflowNode(
  kind: WorkflowNodeKind,
  label?: string,
  config?: Partial<WorkflowNodeConfig>,
): WorkflowNode {
  return {
    id: newWorkflowNodeId(kind),
    kind,
    label: label ?? defaultNodeLabel(kind),
    config: { ...defaultNodeConfig(kind), ...(config ?? {}) },
    position: { x: STEP_X, y: STEP_Y_START },
  };
}

export function createWorkflowActionAgentNode(args: {
  executionKind: TaskExecutionKind;
  label: string;
  executionPayload?: TaskExecutionPayload;
  actionBlockKeyword?: string;
}): WorkflowNode {
  const id = newWorkflowNodeId("action_agent");
  const actionBlockKeyword =
    args.actionBlockKeyword?.trim() ||
    inferActionKeyword(args.executionKind, args.executionPayload);
  return {
    id,
    kind: "action_agent",
    label: args.label,
    config: {
      executionKind: args.executionKind,
      executionPayload: args.executionPayload ?? {},
      ragVariableKey: `step_${id}`,
      ragScope: "run",
      ragInputKeys: [],
      actionBlockKeyword,
    },
    position: { x: STEP_X, y: STEP_Y_START },
  };
}

export function ensureRagArchiveNode<
  T extends Pick<WorkflowDefinition, "nodes" | "edges" | "ragVariables">,
>(workflow: T): T {
  if (findRagArchiveNode(workflow)) {
    return workflow;
  }

  const ordered = linearOrderedNodes(workflow);
  const lastAction = [...ordered].reverse().find((node) => node.kind === "action_agent");
  const variableKey =
    workflow.ragVariables[workflow.ragVariables.length - 1]?.key ??
    (lastAction?.config as { ragVariableKey?: string })?.ragVariableKey ??
    "workflow_output";

  const archive = createWorkflowNode("rag_archive", "Archive to RAG");
  archive.config = { variableKey, scope: "run", deliverableScope: "final" };
  const anchorId = ordered[ordered.length - 1]?.id ?? findTriggerNode(workflow)?.id ?? null;
  return insertNodeAfter(workflow, anchorId, archive);
}
