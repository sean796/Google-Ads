import type { TaskExecutionKind, TaskExecutionPayload, TaskRecurrenceRule } from "@/lib/tasks-types";
import type { TaskTriggerConfig, TaskTriggerSource } from "@/lib/task-trigger-types";
import type { AgentRunRecipeKey } from "@/lib/agent-runs-types";
import type { AutomationRecipeBucket } from "@/lib/automation-recipes-types";

export type WorkflowStatus = "draft" | "published";

export type WorkflowRunStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export type WorkflowNodeKind =
  | "workflow_client"
  | "trigger_calendar"
  | "trigger_gsc"
  | "trigger_document"
  | "trigger_agentmail"
  | "trigger_manual"
  | "trigger_agent_done"
  | "action_agent"
  | "csv_rows"
  | "path_rules"
  | "rag_archive"
  | "then_local"
  | "then_google_drive"
  | "then_email"
  | "then_scheduled"
  | "then_draft";

export const WORKFLOW_THEN_KINDS: WorkflowNodeKind[] = [
  "then_local",
  "then_google_drive",
  "then_email",
  "then_scheduled",
  "then_draft",
];

export type ThenInputMode = "single" | "all_from_node" | "all_deliverables";

export type ThenEmailBatchScope = "single" | "per_client" | "workflow_run";

export type ThenWaitMode = "immediate" | "upstream_terminal" | "all_parallel_clients";

export type WorkflowThenStepConfig = {
  inputVariableKey: string;
  inputNodeId?: string;
  executionPayload?: TaskExecutionPayload;
  inputMode?: ThenInputMode;
  emailBatchScope?: ThenEmailBatchScope;
  waitMode?: ThenWaitMode;
};

export type WorkflowStepDeliveryMeta = {
  googleDriveUrl?: string;
  googleDriveFileId?: string;
  googleDriveFileName?: string;
  googleDriveFolderUrl?: string;
  googleDriveFolderLabel?: string;
  googleDriveTargetFolderId?: string;
  googleDriveFoldersCreated?: string[];
  emailSent?: boolean;
  emailError?: string;
  localSaved?: boolean;
  scheduled?: boolean;
};

export type WorkflowRagScope = "run" | "agent" | "shared";

export type WorkflowNodePosition = { x: number; y: number };

export type WorkflowCalendarTriggerConfig = {
  frequency: "once" | "daily" | "weekly" | "monthly" | "yearly";
  startDate: string;
  time: string;
  dayOfMonth?: number;
  startMonthChoice?: "this" | "next" | "custom";
  recurrenceRule?: TaskRecurrenceRule;
  cronExpression?: string;
  timezone?: string;
};

export type WorkflowGscTriggerConfig = {
  source: TaskTriggerSource;
  triggerConfig: TaskTriggerConfig;
  targetBucket?: AutomationRecipeBucket;
};

export type WorkflowDocumentTriggerConfig = {
  source: "task_file" | "kb" | "email";
  mimePattern?: string;
  nameContains?: string;
};

export type WorkflowAgentMailTriggerConfig = {
  fromEmail: string;
  inbox?: string;
};

export type WorkflowAgentDoneTriggerConfig = {
  recipeKey?: AgentRunRecipeKey | string;
  executionKind?: TaskExecutionKind;
  projectId?: number;
  status: "done";
};

export type WorkflowActionConfig = {
  executionKind: TaskExecutionKind;
  executionPayload: TaskExecutionPayload;
  ragVariableKey?: string;
  ragScope?: WorkflowRagScope;
  ragInputKeys?: string[];
  title?: string;
  actionBlockKeyword?: string;
  recipeKeyword?: string;
  recipeCategory?: string;
};

export type WorkflowPathConditionKind =
  | "gsc_signal"
  | "agent_result_field"
  | "document_source"
  | "time_window"
  | "variable_present";

export type WorkflowPathCondition = {
  kind: WorkflowPathConditionKind;
  field?: string;
  operator?: "eq" | "neq" | "gt" | "lt" | "present" | "empty";
  value?: string | number | boolean;
  variableKey?: string;
};

export type WorkflowPathBranchConfig = {
  branchId: string;
  label: string;
  conditions: WorkflowPathCondition[];
  match: "all" | "any";
};

export type WorkflowPathRulesConfig = {
  branches: WorkflowPathBranchConfig[];
};

export type WorkflowRagArchiveDeliverableScope = "final" | "all";

export type WorkflowRagArchiveConfig = {
  variableKey: string;
  scope: WorkflowRagScope;
  label?: string;
  deliverableScope?: WorkflowRagArchiveDeliverableScope;
};

export type WorkflowClientConfig = {
  siteIds: string[];
  /** When `all`, every enabled team site runs. Otherwise `siteIds` is used. */
  clientScope?: "all" | "selected";
  frequency?: WorkflowCalendarTriggerConfig["frequency"];
  startDate?: string;
  time?: string;
  dayOfMonth?: number;
  startMonthChoice?: WorkflowCalendarTriggerConfig["startMonthChoice"];
  recurrenceRule?: TaskRecurrenceRule;
  cronExpression?: string;
  timezone?: string;
};

export type WorkflowNodeConfig =
  | WorkflowClientConfig
  | WorkflowCalendarTriggerConfig
  | WorkflowGscTriggerConfig
  | WorkflowDocumentTriggerConfig
  | WorkflowAgentMailTriggerConfig
  | WorkflowAgentDoneTriggerConfig
  | WorkflowActionConfig
  | WorkflowPathRulesConfig
  | WorkflowRagArchiveConfig
  | WorkflowThenStepConfig
  | import("@/lib/workflow/csv-rows-types").WorkflowCsvRowsConfig
  | Record<string, unknown>;

export type WorkflowNode = {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  config: WorkflowNodeConfig;
  position: WorkflowNodePosition;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
};

export type WorkflowRagVariable = {
  key: string;
  nodeId: string;
  scope: WorkflowRagScope;
  label: string;
};

export type WorkflowDefinition = {
  id: number;
  teamId: number;
  name: string;
  description?: string;
  status: WorkflowStatus;
  wordpressSiteId?: string | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  ragVariables: WorkflowRagVariable[];
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
};

export type WorkflowStepOutputFileRef = {
  id?: number;
  name: string;
  url?: string;
  mime?: string;
};

export type WorkflowStepOutput = {
  id: number;
  runId: number;
  nodeId: string;
  variableKey: string;
  scope: WorkflowRagScope;
  label: string;
  textPreview: string;
  fileRefs: WorkflowStepOutputFileRef[];
  agentRunId?: number | null;
  siteId?: string | null;
  deliveryMeta?: WorkflowStepDeliveryMeta;
  createdAt: string;
};

export type WorkflowRun = {
  id: number;
  workflowId: number;
  teamId: number;
  status: WorkflowRunStatus;
  triggerKind?: WorkflowNodeKind;
  triggerPayload?: Record<string, unknown>;
  currentNodeId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt?: string;
  finishedAt?: string | null;
  stepOutputs?: WorkflowStepOutput[];
};

export type WorkflowLibraryEntry = {
  key: string;
  label: string;
  textPreview: string;
  fileRefs: WorkflowStepOutputFileRef[];
  scope: "shared";
  promotedFromRunId?: number;
  updatedAt: string;
};

export type WorkflowPendingDispatch = {
  workflowId: number;
  runId?: number;
  triggerKind: WorkflowNodeKind;
  payload?: Record<string, unknown>;
  simulated?: boolean;
  createdAt: string;
};

export const WORKFLOW_TRIGGER_KINDS: WorkflowNodeKind[] = [
  "trigger_gsc",
  "trigger_document",
  "trigger_agentmail",
  "trigger_manual",
  "trigger_agent_done",
];

export function isWorkflowTriggerKind(kind: WorkflowNodeKind): boolean {
  return WORKFLOW_TRIGGER_KINDS.includes(kind);
}

export function isWorkflowScheduleKind(kind: WorkflowNodeKind): boolean {
  return kind === "trigger_calendar";
}

export function isWorkflowClientKind(kind: WorkflowNodeKind): boolean {
  return kind === "workflow_client";
}

export function isWorkflowThenKind(kind: WorkflowNodeKind): boolean {
  return WORKFLOW_THEN_KINDS.includes(kind);
}

export function workflowTriggerLabel(kind: WorkflowNodeKind): string {
  switch (kind) {
    case "workflow_client":
      return "Client";
    case "trigger_calendar":
      return "Schedule";
    case "trigger_gsc":
      return "GSC signal";
    case "trigger_document":
      return "Document received";
    case "trigger_agentmail":
      return "Agent Mail received";
    case "trigger_manual":
      return "Manual";
    case "trigger_agent_done":
      return "Agent completed";
    case "csv_rows":
      return "CSV rows";
    default:
      return kind;
  }
}
