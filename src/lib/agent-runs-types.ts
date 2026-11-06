import type { AssistCardStep } from "@/lib/pulse-assist/types";
import { browserAutomationIsConfigured, browserAutomationRequiresClient } from "@/lib/browser-automation/resolve-browser-target-url";
import type { TaskExecutionClientRunContract, TaskExecutionPayload } from "@/lib/tasks-types";
import {
  taskExecutionLocalDominatorIsConfigured,
  taskExecutionEntityPageCreatorIsConfigured,
  taskExecutionEntityGeneratorIsConfigured,
  taskExecutionSapGeneratorIsConfigured,
  taskExecutionPostCreatorIsConfigured,
  taskExecutionReportingIsConfigured,
  taskExecutionTargetIsConfigured,
} from "@/lib/task-execution-bucket";

export type AgentRunStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export type AgentRunSource = "pulse_assist" | "task_manager" | "workflow";

export const CLIENT_AGNOSTIC_EXECUTION_KINDS = ["browser_automation"] as const;

export function isClientAgnosticExecutionKind(
  kind: string | undefined | null,
  payload?: TaskExecutionPayload | null,
): boolean {
  const normalized = (kind ?? "").trim();
  if (normalized === "browser_automation") {
    return !browserAutomationRequiresClient(payload);
  }
  return CLIENT_AGNOSTIC_EXECUTION_KINDS.includes(
    normalized as (typeof CLIENT_AGNOSTIC_EXECUTION_KINDS)[number],
  );
}

export type AgentRunRecipeKey =
  | "overview_pages_meta_batch"
  | "content_optimizer_bulk"
  | "gsc_reporting"
  | "ads_reporting"
  | "post_creator"
  | "entity_page_creator"
  | "entity_generator"
  | "sap_generator"
  | "local_dominator_export"
  | "chatgpt_website_audit"
  | "dfs_llm_article_audit"
  | "browser_automation"
  | "content_gap_check";

export type AgentRunStepArtifact = {
  id: string;
  name: string;
  url: string;
  mime?: string;
};

export type AgentRunStep = {
  id: number;
  stepIndex: number;
  stepKey?: string;
  label: string;
  status: AssistCardStep["status"];
  payload?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export type AgentRunContext = {
  siteId?: string;
  managerTab?: string;
  sitemapSource?: string;
  message?: string;
  taskKeyword?: string;
  taskTitle?: string;
  projectId?: number;
  workflowId?: number;
  workflowRunId?: number;
  workflowNodeId?: string;
};

export type AgentRunPlan = Record<string, unknown> & {
  taskExecutionId?: number;
  /** Stored run plans often carry a partial contract (e.g. only siteId); the full contract is merged at run time. */
  clientRunContract?: Omit<TaskExecutionClientRunContract, "executionId"> & {
    executionId?: number;
  };
  executionPayload?: TaskExecutionPayload & { wordpressSiteId?: string };
  sitemapSource?: string;
  executionMode?: "client" | "server";
};

export type AgentRunCheckpointUrlSummary = {
  url: string;
  postTitle?: string;
};

export type AgentRunServerCheckpoint = {
  rowIndex?: number;
  intraPhase?: string;
  checklistRows?: Array<{ keyword?: string; title?: string }>;
};

export type AgentRunCheckpoint = {
  completedUrls: string[];
  uploadedUrls: string[];
  server?: AgentRunServerCheckpoint;
  currentUrl?: string;
  currentIndex?: number;
  totalCount?: number;
  currentUrlProgress?: number;
  lastMessage?: string;
  completedUrlSummaries?: AgentRunCheckpointUrlSummary[];
  lastStepLabel?: string;
  lastStepAt?: string;
  lastStepPayload?: Record<string, unknown>;
};

export type AgentRunResumePoint = {
  label: string;
  status: AgentRunStep["status"];
  createdAt: string;
  payload: Record<string, unknown>;
  stepIndex: number;
};

export type AgentRunUploadedPost = {
  url: string;
  postId?: number;
  title?: string;
  scheduledFor?: string;
  rowIndex?: number;
};

export type AgentRunBlockedRow = {
  keyword: string;
  reason: string;
  conflictingUrl?: string;
};

export type AgentRunResult = {
  updated?: number;
  skipped?: number;
  failed?: number;
  batchKey?: string;
  message?: string;
  checkpoint?: AgentRunCheckpoint;
  uploadedPosts?: AgentRunUploadedPost[];
  blockedRows?: AgentRunBlockedRow[];
  postCount?: number;
  executionMode?: "client" | "server";
  gridInputResolved?: boolean;
  urls?: string[];
  googleDriveWebViewLink?: string;
  googleDriveFileId?: string;
  googleDriveFileName?: string;
  googleDriveFolderLabel?: string;
  googleDriveFolderWebViewLink?: string;
  googleDriveTargetFolderId?: string;
  googleDriveFoldersCreated?: string[];
  googleDriveError?: string;
  googleDriveSkipped?: boolean;
  googleDriveSkipReason?: string;
  gapCount?: number;
  goalMet?: boolean;
  comparePreset?: "mom" | "yoy";
  compareLabel?: string;
  sectionCount?: number;
  jobId?: string;
  sessionReady?: boolean;
  responseCount?: number;
  responses?: import("@/lib/chatgpt-audit-api").ChatGptAuditQueryResponse[];
};

export type AgentRun = {
  id: number;
  teamId: number;
  createdBy: number;
  title: string;
  recipeKey: AgentRunRecipeKey | string;
  recipeTitle: string;
  status: AgentRunStatus;
  source: AgentRunSource;
  taskId: number;
  taskTitle: string;
  context: AgentRunContext;
  plan: AgentRunPlan;
  result: AgentRunResult | null;
  errorMessage: string;
  clientBatchKey: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps?: AgentRunStep[];
};

export type StartAgentRunPayload = {
  teamId: number;
  source: AgentRunSource;
  recipeKey: AgentRunRecipeKey | string;
  title?: string;
  taskId?: number | null;
  context?: AgentRunContext;
  plan?: AgentRunPlan;
};

export const AGENT_RUN_STATUS_LABELS: Record<AgentRunStatus, string> = {
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const AGENT_RUN_SOURCE_LABELS: Record<AgentRunSource, string> = {
  pulse_assist: "Pulse Assist",
  task_manager: "Task",
  workflow: "Workflow",
};

export function isAgentRunTerminal(status: AgentRunStatus): boolean {
  return status === "done" || status === "failed" || status === "cancelled";
}

export function taskExecutionKindToRecipe(kind: string): AgentRunRecipeKey | null {
  if (kind === "content_optimizer") return "content_optimizer_bulk";
  if (kind === "content_optimizer_meta") return "overview_pages_meta_batch";
  if (kind === "gsc_reporting") return "gsc_reporting";
  if (kind === "ads_reporting") return "ads_reporting";
  if (kind === "post_creator") return "post_creator";
  if (kind === "entity_page_creator") return "entity_page_creator";
  if (kind === "entity_generator") return "entity_generator";
  if (kind === "sap_generator") return "sap_generator";
  if (kind === "local_dominator_export") return "local_dominator_export";
  if (kind === "chatgpt_website_audit") return "chatgpt_website_audit";
  if (kind === "dfs_llm_article_audit") return "dfs_llm_article_audit";
  if (kind === "browser_automation") return "browser_automation";
  if (kind === "content_gap_check") return "content_gap_check";
  return null;
}

function taskExecutionIsConfigured(
  kind: string,
  payload?: TaskExecutionPayload,
): boolean {
  if (kind === "gsc_reporting" || kind === "ads_reporting") return taskExecutionReportingIsConfigured(payload);
  if (kind === "local_dominator_export") return taskExecutionLocalDominatorIsConfigured(payload);
  if (kind === "chatgpt_website_audit") return true;
  if (kind === "dfs_llm_article_audit") {
    const url = payload?.targetUrl?.trim();
    return Boolean(url) && url !== "ALL";
  }
  if (kind === "browser_automation") {
    return browserAutomationIsConfigured(payload);
  }
  if (kind === "content_gap_check") {
    const target = payload?.contentGapTargetCount;
    const source = payload?.contentGapSitemapSource?.trim();
    const mode = payload?.contentGapCountMode?.trim();
    return typeof target === "number" && target > 0 && Boolean(source) && Boolean(mode);
  }
  if (kind === "post_creator") return taskExecutionPostCreatorIsConfigured(payload);
  if (kind === "entity_page_creator") return taskExecutionEntityPageCreatorIsConfigured(payload);
  if (kind === "entity_generator") return taskExecutionEntityGeneratorIsConfigured(payload);
  if (kind === "sap_generator") return taskExecutionSapGeneratorIsConfigured(payload);
  return taskExecutionTargetIsConfigured(payload);
}

export function taskCanExecuteWithAgent(
  task: {
    executionKind?: string;
    executionPayload?: TaskExecutionPayload;
    assigneeIds?: number[];
    wordpressSiteId?: string;
  },
  members: Array<{ userId: number; email?: string; isBot?: boolean; displayName?: string }> = [],
  activeWordPressSiteId?: string | null,
): boolean {
  const kind = (task.executionKind ?? "").trim() || "content_optimizer";
  const recipe = taskExecutionKindToRecipe(kind);
  if (!recipe) return false;
  if (members.length > 0) {
    const pulseAssigned = task.assigneeIds?.some((userId) => {
      const member = members.find((m) => m.userId === userId);
      return (
        member &&
        (Boolean(member.isBot) ||
          member.displayName === "NEO Pulse" ||
          member.displayName === "FLO" ||
          member.email === "pulse@neodigital.ca")
      );
    });
    if (!pulseAssigned) return false;
  }
  if (
    !isClientAgnosticExecutionKind(kind, task.executionPayload)
    && !resolveTaskExecuteSiteId(task, activeWordPressSiteId)
  ) {
    return false;
  }
  return taskExecutionIsConfigured(kind, task.executionPayload);
}

/** Scheduled Pulse runs: site + bucket only (assignee already filtered). */
export function scheduledPulseTaskCanExecute(
  task: {
    executionKind?: string;
    executionPayload?: TaskExecutionPayload;
    wordpressSiteId?: string;
  },
  activeWordPressSiteId?: string | null,
): boolean {
  const kind = (task.executionKind ?? "").trim() || "content_optimizer";
  if (!taskExecutionKindToRecipe(kind)) return false;
  if (
    !isClientAgnosticExecutionKind(kind, task.executionPayload)
    && !resolveTaskExecuteSiteId(task, activeWordPressSiteId)
  ) {
    return false;
  }
  return taskExecutionIsConfigured(kind, task.executionPayload);
}

export function resolveTaskExecuteSiteId(
  task: { wordpressSiteId?: string | null },
  activeWordPressSiteId?: string | null,
): string {
  return task.wordpressSiteId?.trim() || activeWordPressSiteId?.trim() || "";
}
