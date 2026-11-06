import { linearOrderedNodes } from "@/lib/workflow/workflow-graph-mutations";
import type { TaskExecutionPayload } from "@/lib/tasks-types";
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowStepOutput,
  WorkflowThenStepConfig,
} from "@/lib/workflow/workflow-types";
import { isWorkflowThenKind } from "@/lib/workflow/workflow-types";

const THEN_STEP_SCHEDULE_KEYS = [
  "scheduleFrequency",
  "scheduleCustomInterval",
  "scheduleDayOfWeek",
  "scheduleStartDateOption",
  "scheduleCustomStartDate",
  "scheduleTimesPerMonth",
  "scheduleStartDay",
  "scheduleStartTime",
  "scheduleStaggerOptimized",
  "schedulePublishDays",
  "scheduleDraftOnly",
  "postDestination",
] as const satisfies readonly (keyof TaskExecutionPayload)[];

export function thenConfig(node: WorkflowNode): WorkflowThenStepConfig {
  const config = node.config as WorkflowThenStepConfig;
  return {
    inputVariableKey: String(config.inputVariableKey ?? "").trim(),
    inputNodeId: config.inputNodeId,
    executionPayload: config.executionPayload ?? {},
    inputMode: node.kind === "then_google_drive" ? "single" : (config.inputMode ?? "single"),
    emailBatchScope: config.emailBatchScope ?? "single",
    waitMode: config.waitMode ?? "immediate",
  };
}

export function defaultThenVariableKey(node: WorkflowNode): string {
  return `then_${node.id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

/** True when this Then node already saved a run output for this client. */
export function workflowThenOutputExistsForSite(
  outputs: WorkflowStepOutput[],
  nodeId: string,
  siteId?: string,
  agentRunId?: number,
): boolean {
  const wantSite = String(siteId ?? "").trim();
  const wantRun = agentRunId && agentRunId > 0 ? agentRunId : 0;
  const matches = outputs.filter((output) => output.nodeId === nodeId && output.scope === "run");
  if (matches.length === 0) return false;
  if (!wantSite && wantRun === 0) return true;
  return matches.some((output) => {
    const outputSite = String(output.siteId ?? "").trim();
    const outputRun = output.agentRunId && output.agentRunId > 0 ? output.agentRunId : 0;
    if (wantSite && outputSite) return outputSite === wantSite;
    if (wantRun > 0 && outputRun > 0) return outputRun === wantRun;
    return false;
  });
}

export function workflowHasThenSteps(workflow: Pick<WorkflowDefinition, "nodes">): boolean {
  return workflow.nodes.some((node) => isWorkflowThenKind(node.kind));
}

export function workflowAgentUsesThenDelivery(
  workflow: Pick<WorkflowDefinition, "nodes" | "edges">,
  agentNodeId: string,
): boolean {
  const ordered = linearOrderedNodes(workflow);
  const agentIndex = ordered.findIndex((node) => node.id === agentNodeId);
  if (agentIndex < 0) return false;
  return ordered.slice(agentIndex + 1).some(
    (node) => isWorkflowThenKind(node.kind) || node.kind === "rag_archive",
  );
}

export function findDownstreamThenStep(
  workflow: Pick<WorkflowDefinition, "nodes" | "edges">,
  agentNodeId: string,
): WorkflowNode | null {
  const ordered = linearOrderedNodes(workflow);
  const agentIndex = ordered.findIndex((node) => node.id === agentNodeId);
  if (agentIndex < 0) return null;
  return ordered.slice(agentIndex + 1).find((node) => isWorkflowThenKind(node.kind)) ?? null;
}

/** Apply schedule fields from the downstream Then step (e.g. then_scheduled) onto the agent payload. */
/** Copy agent posting schedule onto a downstream then_scheduled / then_draft node. */
export function applyThenStepScheduleFromPayload(
  workflow: WorkflowDefinition,
  agentNodeId: string,
  executionPayload: TaskExecutionPayload,
): WorkflowDefinition {
  const thenNode = findDownstreamThenStep(workflow, agentNodeId);
  if (!thenNode || (thenNode.kind !== "then_scheduled" && thenNode.kind !== "then_draft")) {
    return workflow;
  }

  const schedulePatch: Partial<TaskExecutionPayload> = {};
  for (const key of THEN_STEP_SCHEDULE_KEYS) {
    const value = executionPayload[key];
    if (value !== undefined) {
      (schedulePatch as Record<string, unknown>)[key] = value;
    }
  }

  const nodes = workflow.nodes.map((node) => {
    if (node.id !== thenNode.id) return node;
    const config = thenConfig(node);
    return {
      ...node,
      config: {
        ...config,
        executionPayload: {
          ...config.executionPayload,
          ...schedulePatch,
        },
      },
    };
  });

  return { ...workflow, nodes };
}

export function mergeThenStepScheduleIntoPayload(
  workflow: Pick<WorkflowDefinition, "nodes" | "edges">,
  agentNodeId: string,
  payload: TaskExecutionPayload,
): TaskExecutionPayload {
  const thenNode = findDownstreamThenStep(workflow, agentNodeId);
  if (!thenNode) return payload;

  const thenPayload = thenConfig(thenNode).executionPayload ?? {};
  const merged: TaskExecutionPayload = { ...payload };
  for (const key of THEN_STEP_SCHEDULE_KEYS) {
    const value = thenPayload[key];
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  if (thenNode.kind === "then_draft") {
    merged.scheduleDraftOnly = true;
    merged.postDestination = "draft";
  }
  return merged;
}

export function stripInlineDeliveryFlags<T extends Record<string, unknown>>(payload: T): T {
  return {
    ...payload,
    sendAutomationEmail: false,
    saveToGoogleDrive: false,
    automationEmailTo: "",
    automationEmailCc: "",
    automationEmailMessage: "",
    googleDriveFolderId: "",
    googleDriveFolderLabel: "",
    googleDrivePresetKey: "",
    googleDriveFolderSource: "manual",
    googleDriveFolderPath: "",
    googleDriveFolderYear: "",
    googleDriveFolderMonth: "",
    googleDriveFolderVariable: "",
  };
}

/** Strip inline delivery and local PC download for workflow agent steps (Then steps handle delivery). */
export function stripWorkflowAgentDeliveryPayload<T extends Record<string, unknown>>(payload: T): T {
  return stripInlineDeliveryFlags({
    ...payload,
    saveLocalArchive: false,
    saveToDisk: false,
  });
}

export function thenKindLabel(kind: WorkflowNodeKind): string {
  switch (kind) {
    case "then_local":
      return "Save locally";
    case "then_google_drive":
      return "Google Drive";
    case "then_email":
      return "Email";
    case "then_scheduled":
      return "Scheduled publish";
    case "then_draft":
      return "Save as draft";
    default:
      return kind;
  }
}

/** Card / header title for Then email: To address is source of truth when set. */
export function thenEmailDisplayLabel(node: WorkflowNode): string {
  const to = String(thenConfig(node).executionPayload?.automationEmailTo ?? "").trim();
  if (to) return to;
  const label = node.label.trim();
  if (label && label !== "Email") return label;
  return "Email";
}

/** Keep node.label and automationEmailTo aligned for Then email steps. */
export function withThenEmailRecipientSync(
  node: WorkflowNode,
  recipient: string,
): WorkflowNode {
  if (node.kind !== "then_email") return node;
  const trimmed = recipient.trim();
  const config = thenConfig(node);
  return {
    ...node,
    label: trimmed || "Email",
    config: {
      ...config,
      executionPayload: {
        ...config.executionPayload,
        sendAutomationEmail: true,
        automationEmailTo: trimmed,
      },
    },
  };
}
