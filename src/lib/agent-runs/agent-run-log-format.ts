import { formatAgentRunTimeOnly, formatAgentRunTimestamp } from "@/lib/edmonton-time";
import type {
  AgentRun,
  AgentRunCheckpoint,
  AgentRunStep,
  AgentRunStepArtifact,
  AgentRunUploadedPost,
} from "@/lib/agent-runs-types";
import { AGENT_RUN_STATUS_LABELS } from "@/lib/agent-runs-types";
import { agentRunSourceLine } from "@/lib/agent-runs/agent-run-display";
import { dedupeAgentRunLogLines } from "@/lib/agent-runs/agent-run-log-download";
import {
  exportedUploadedPosts,
  normalizeAgentRunStepsForDisplay,
  sanitizeCheckpointForExport,
  sanitizeStepPayloadForExport,
  stepArtifacts,
} from "@/lib/agent-runs/agent-run-log-steps";

export {
  cleanAgentRunDriveLogLabel,
  enrichAgentRunStepsWithServerData,
  formatAgentRunLogTimeline,
  normalizeAgentRunStepsForDisplay,
  splitAgentRunLogLabelUrl,
} from "@/lib/agent-runs/agent-run-log-steps";
export type {
  AgentRunLogLabelUrlParts,
  AgentRunLogTimelineRow,
} from "@/lib/agent-runs/agent-run-log-steps";

export type AgentRunLogJsonExport = {
  run: {
    id: number;
    title: string;
    recipeKey: string;
    recipeTitle: string;
    status: AgentRun["status"];
    source: AgentRun["source"];
    startedAt: string | null;
    finishedAt: string | null;
    errorMessage: string;
    result: AgentRun["result"];
  };
  plan?: {
    clientRunContract?: {
      forceNewResearch?: boolean;
      sendAutomationEmail?: boolean;
      automationEmailTo?: string;
      saveToGoogleDrive?: boolean;
      googleDriveFolderId?: string;
      googleDriveFolderLabel?: string;
      googleDriveFolderSource?: string;
      googleDriveFolderPath?: string;
      googleDriveFolderVariable?: string;
    };
  };
  emailOutcome?: {
    emailSent?: boolean;
    emailError?: string;
    emailSkipped?: boolean;
    emailSkipReason?: string;
    transport?: string;
  };
  googleDriveOutcome?: {
    googleDriveWebViewLink?: string;
    googleDriveFileId?: string;
    googleDriveFileName?: string;
    googleDriveError?: string;
    googleDriveSkipped?: boolean;
    googleDriveSkipReason?: string;
  };
  deliverables?: {
    googleDriveUrl?: string;
    googleDriveFileName?: string;
  };
  checkpoint: AgentRunCheckpoint | null;
  uploadedPosts: AgentRunUploadedPost[];
  steps: Array<{
    stepKey?: string;
    label: string;
    status: AgentRunStep["status"];
    createdAt: string;
    updatedAt?: string;
    payload?: Record<string, unknown>;
    artifacts?: AgentRunStepArtifact[];
    postUrl?: string;
  }>;
};

function exportEmailContractFromPlan(
  plan: AgentRun["plan"] | undefined,
): AgentRunLogJsonExport["plan"] | undefined {
  const client = plan?.clientRunContract;
  const payload = plan?.executionPayload;
  const merged =
    client && payload && typeof client === "object" && typeof payload === "object"
      ? { ...payload, ...client }
      : client ?? payload;
  if (!merged || typeof merged !== "object") return undefined;
  const c = merged as Record<string, unknown>;
  return {
    clientRunContract: {
      forceNewResearch:
        c.forceNewResearch === true
        || (c.optimizationOptions as { forceNewResearch?: boolean } | undefined)?.forceNewResearch
          === true,
      sendAutomationEmail: c.sendAutomationEmail === true,
      automationEmailTo:
        typeof c.automationEmailTo === "string" ? c.automationEmailTo : undefined,
      saveToGoogleDrive: c.saveToGoogleDrive === true,
      googleDriveFolderId:
        typeof c.googleDriveFolderId === "string" ? c.googleDriveFolderId : undefined,
      googleDriveFolderLabel:
        typeof c.googleDriveFolderLabel === "string" ? c.googleDriveFolderLabel : undefined,
      googleDriveFolderSource:
        typeof c.googleDriveFolderSource === "string" ? c.googleDriveFolderSource : undefined,
      googleDriveFolderPath:
        typeof c.googleDriveFolderPath === "string" ? c.googleDriveFolderPath : undefined,
      googleDriveFolderVariable:
        typeof c.googleDriveFolderVariable === "string" ? c.googleDriveFolderVariable : undefined,
    },
  };
}

function exportEmailOutcomeFromResult(
  result: AgentRun["result"],
): AgentRunLogJsonExport["emailOutcome"] | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;
  if (
    r.emailSkipped === true &&
    r.emailSkipReason === "sendAutomationEmail not set on run contract."
  ) {
    return undefined;
  }
  const outcome: NonNullable<AgentRunLogJsonExport["emailOutcome"]> = {};
  if (typeof r.emailSent === "boolean") outcome.emailSent = r.emailSent;
  if (typeof r.emailError === "string") outcome.emailError = r.emailError;
  if (typeof r.emailSkipped === "boolean") outcome.emailSkipped = r.emailSkipped;
  if (typeof r.emailSkipReason === "string") outcome.emailSkipReason = r.emailSkipReason;
  if (typeof r.transport === "string") outcome.transport = r.transport;
  return Object.keys(outcome).length > 0 ? outcome : undefined;
}

function exportGoogleDriveOutcomeFromResult(
  result: AgentRun["result"],
): AgentRunLogJsonExport["googleDriveOutcome"] | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;
  if (
    r.googleDriveSkipped === true &&
    r.googleDriveSkipReason === "saveToGoogleDrive not set on run contract."
  ) {
    return undefined;
  }
  const outcome: NonNullable<AgentRunLogJsonExport["googleDriveOutcome"]> = {};
  if (typeof r.googleDriveWebViewLink === "string") outcome.googleDriveWebViewLink = r.googleDriveWebViewLink;
  if (typeof r.googleDriveFileId === "string") outcome.googleDriveFileId = r.googleDriveFileId;
  if (typeof r.googleDriveFileName === "string") outcome.googleDriveFileName = r.googleDriveFileName;
  if (typeof r.googleDriveError === "string") outcome.googleDriveError = r.googleDriveError;
  if (typeof r.googleDriveSkipped === "boolean") outcome.googleDriveSkipped = r.googleDriveSkipped;
  if (typeof r.googleDriveSkipReason === "string") outcome.googleDriveSkipReason = r.googleDriveSkipReason;
  return Object.keys(outcome).length > 0 ? outcome : undefined;
}

function exportDeliverablesFromResult(
  result: AgentRun["result"],
): AgentRunLogJsonExport["deliverables"] | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;
  const url = typeof r.googleDriveWebViewLink === "string" ? r.googleDriveWebViewLink.trim() : "";
  if (!url) return undefined;
  return {
    googleDriveUrl: url,
    googleDriveFileName:
      typeof r.googleDriveFileName === "string" ? r.googleDriveFileName : undefined,
  };
}

function deliveryFieldsFromRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const keys = [
    "googleDriveWebViewLink",
    "googleDriveFileId",
    "googleDriveFileName",
    "googleDriveError",
    "googleDriveSkipped",
    "googleDriveSkipReason",
    "emailSent",
    "emailError",
    "emailSkipped",
    "emailSkipReason",
    "transport",
  ] as const;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in record) out[key] = record[key];
  }
  return out;
}

export function mergeAgentRunDeliveryFields(
  result: AgentRun["result"],
  incoming: Record<string, unknown> | undefined,
): AgentRun["result"] {
  if (!incoming) return result;
  const merged = deliveryFieldsFromRecord(incoming);
  if (Object.keys(merged).length === 0) return result;
  return { ...(result ?? {}), ...merged };
}

export function formatAgentRunLogJson(run: AgentRun, steps: AgentRunStep[]): AgentRunLogJsonExport {
  const normalized = normalizeAgentRunStepsForDisplay(steps);
  const sanitizedCheckpoint = sanitizeCheckpointForExport(run.result?.checkpoint ?? null);
  const sanitizedResult = run.result
    ? {
        ...run.result,
        ...(sanitizedCheckpoint ? { checkpoint: sanitizedCheckpoint } : {}),
      }
    : run.result;
  return {
    run: {
      id: run.id,
      title: run.title,
      recipeKey: run.recipeKey,
      recipeTitle: run.recipeTitle,
      status: run.status,
      source: run.source,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      errorMessage: run.errorMessage,
      result: sanitizedResult,
    },
    plan: exportEmailContractFromPlan(run.plan),
    emailOutcome: exportEmailOutcomeFromResult(run.result),
    googleDriveOutcome: exportGoogleDriveOutcomeFromResult(run.result),
    deliverables: exportDeliverablesFromResult(run.result),
    checkpoint: sanitizedCheckpoint,
    uploadedPosts: exportedUploadedPosts(run),
    steps: normalized.map((step) => ({
      stepKey: step.stepKey,
      label: step.label.trim(),
      status: step.status,
      createdAt: step.createdAt,
      updatedAt: step.updatedAt,
      payload: sanitizeStepPayloadForExport(step.payload),
      artifacts: stepArtifacts(step),
      postUrl: typeof step.payload?.postUrl === "string" ? step.payload.postUrl : undefined,
    })),
  };
}

/** @deprecated Use formatAgentRunLogJson for downloads. */
export function formatAgentRunLogMarkdown(run: AgentRun, steps: AgentRunStep[]): string {
  const lines: string[] = [];
  lines.push(`# ${run.title}`);
  lines.push(`Run #${run.id} · ${run.recipeTitle} · Status: ${AGENT_RUN_STATUS_LABELS[run.status]}`);
  lines.push(agentRunSourceLine(run));
  lines.push("");

  if (run.startedAt) {
    lines.push(`Started: ${formatAgentRunTimestamp(run.startedAt)}`);
  }
  const normalized = normalizeAgentRunStepsForDisplay(steps);
  const lastStep = normalized[normalized.length - 1];
  if (lastStep?.createdAt) {
    lines.push(`Last step: ${formatAgentRunTimestamp(lastStep.updatedAt ?? lastStep.createdAt)}`);
  }
  if (run.finishedAt) {
    lines.push(`Finished: ${formatAgentRunTimestamp(run.finishedAt)}`);
  }
  lines.push("");

  if (normalized.length > 0) {
    lines.push("## Progress");
    const labels = dedupeAgentRunLogLines(normalized.map((s) => s.label.trim()));
    for (const label of labels) {
      const step = normalized.find((s) => s.label.trim() === label);
      const time = step ? formatAgentRunTimeOnly(step.updatedAt ?? step.createdAt) || "—" : "—";
      lines.push(`- ${time}  ${label}`);
    }
    lines.push("");
  }

  const uploaded = exportedUploadedPosts(run);
  if (uploaded.length > 0) {
    lines.push("## Uploaded posts");
    for (const post of uploaded) {
      const parts = [post.url];
      if (post.postId != null) parts.push(`ID ${post.postId}`);
      if (post.scheduledFor) parts.push(`scheduled ${post.scheduledFor}`);
      lines.push(`- ${parts.join(", ")}`);
    }
    lines.push("");
  }

  const blocked = run.result?.blockedRows ?? [];
  if (blocked.length > 0) {
    lines.push("## Blocked (cannibalization)");
    for (const row of blocked) {
      const conflict = row.conflictingUrl ? ` — ${row.conflictingUrl}` : "";
      lines.push(`- ${row.keyword}: ${row.reason}${conflict}`);
    }
    lines.push("");
  }

  if (run.errorMessage?.trim()) {
    lines.push("## Error");
    lines.push(run.errorMessage.trim());
    lines.push("");
  }

  const googleDriveUrl =
    typeof run.result?.googleDriveWebViewLink === "string"
      ? run.result.googleDriveWebViewLink.trim()
      : "";
  if (googleDriveUrl) {
    lines.push("## Google Drive");
    lines.push(googleDriveUrl);
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}
