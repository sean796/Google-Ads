import { linearOrderedNodes } from "@/lib/workflow/workflow-graph-mutations";
import {
  isWorkflowThenKind,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowNodeKind,
} from "@/lib/workflow/workflow-types";

export function isExecutableWorkflowStepKind(kind: WorkflowNodeKind): boolean {
  return kind === "action_agent" || kind === "csv_rows" || kind === "rag_archive" || isWorkflowThenKind(kind);
}

/** Executable steps after `afterNodeId` in linear canvas order (includes nodes missing graph edges). */
export function linearExecutableTailNodes(
  workflow: Pick<WorkflowDefinition, "nodes" | "edges">,
  afterNodeId: string,
): WorkflowNode[] {
  const ordered = linearOrderedNodes(workflow);
  const startIdx = ordered.findIndex((node) => node.id === afterNodeId);
  if (startIdx < 0) return [];
  return ordered.slice(startIdx + 1).filter((node) => isExecutableWorkflowStepKind(node.kind));
}
