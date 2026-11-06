import type { AgentRunArtifactRecord } from "@/lib/agent-runs-api";
import { formatAgentRunTimeOnly, formatAgentRunTimestamp } from "@/lib/edmonton-time";
import type {
  AgentRun,
  AgentRunCheckpoint,
  AgentRunStep,
  AgentRunStepArtifact,
  AgentRunUploadedPost,
} from "@/lib/agent-runs-types";
import { AGENT_RUN_STATUS_LABELS } from "@/lib/agent-runs-types";
import { agentRunSourceLine, isAgentRunNodeDiagnosticLabel } from "@/lib/agent-runs/agent-run-display";
import { driveFolderDisplayName } from "@/lib/google-drive/google-drive-folder-hierarchy";
import { dedupeAgentRunLogLines } from "@/lib/agent-runs/agent-run-log-download";

export type AgentRunLogTimelineRow = {
  key: string;
  timeLabel: string;
  label: string;
  status: AgentRunStep["status"];
  isActive?: boolean;
  artifacts?: AgentRunStepArtifact[];
};

export type AgentRunLogLabelUrlParts = {
  before: string;
  url: string;
  after: string;
};

export function splitAgentRunLogLabelUrl(label: string): AgentRunLogLabelUrlParts | null {
  const httpsAt = label.indexOf("https://");
  const httpAt = label.indexOf("http://");
  const start = httpsAt >= 0 ? httpsAt : httpAt;
  if (start < 0) return null;
  let end = start;
  while (end < label.length && label[end] !== " " && label[end] !== "\t") {
    end += 1;
  }
  const url = label.slice(start, end);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return {
    before: label.slice(0, start),
    url,
    after: label.slice(end),
  };
}

function isResumeNoiseLabel(label: string): boolean {
  const trimmed = label.trim();
  return trimmed.startsWith("Resuming:") || trimmed === "Queued for resume";
}

function isTerminalNoiseLabel(label: string): boolean {
  const trimmed = label.trim();
  return trimmed === "Complete" || trimmed === "Done";
}

function isSiteAuditProgressLabel(label: string): boolean {
  const trimmed = label.trim();
  return (
    /^Site audit \d+\/\d+:/.test(trimmed) || /^Site audit report \(\d+\/\d+\)/.test(trimmed)
  );
}

function collapseSiteAuditProgressSteps(steps: AgentRunStep[]): AgentRunStep[] {
  const auditSteps = steps.filter((step) => isSiteAuditProgressLabel(step.label));
  if (auditSteps.length <= 1) return steps;
  const lastAudit = auditSteps[auditSteps.length - 1]!;
  return steps.filter((step) => !isSiteAuditProgressLabel(step.label) || step === lastAudit);
}

function collapseLegacyProgressSteps(steps: AgentRunStep[]): AgentRunStep[] {
  return collapseSiteAuditProgressSteps(steps);
}

function compareAgentRunStepsChronological(a: AgentRunStep, b: AgentRunStep): number {
  const aTime = (a.createdAt ?? a.updatedAt ?? "").trim();
  const bTime = (b.createdAt ?? b.updatedAt ?? "").trim();
  if (aTime !== bTime) return aTime.localeCompare(bTime);
  return a.stepIndex - b.stepIndex;
}

export function normalizeAgentRunStepsForDisplay(steps: AgentRunStep[]): AgentRunStep[] {
  const filtered = steps.filter((step) => {
    const label = step.label.trim();
    return (
      label &&
      !isResumeNoiseLabel(label) &&
      !isTerminalNoiseLabel(label) &&
      !isAgentRunNodeDiagnosticLabel(label)
    );
  });

  const keyed = filtered.filter((s) => s.stepKey?.trim());
  if (keyed.length > 0) {
    const byKey = new Map<string, AgentRunStep>();
    const legacy: AgentRunStep[] = [];
    for (const step of filtered) {
      const key = step.stepKey?.trim();
      if (key) {
        byKey.set(key, step);
      } else {
        legacy.push(step);
      }
    }
    const keyedSteps = Array.from(byKey.values()).sort(compareAgentRunStepsChronological);
    const keyedLabels = new Set(keyedSteps.map((s) => s.label.trim()));
    const extraLegacy = collapseLegacyProgressSteps(
      legacy.filter((s) => !keyedLabels.has(s.label.trim())),
    );
    return [...keyedSteps, ...extraLegacy].sort(compareAgentRunStepsChronological);
  }

  const collapsed: AgentRunStep[] = [];
  for (const step of filtered) {
    const label = step.label.trim();
    const prev = collapsed[collapsed.length - 1];
    if (prev?.label.trim() === label) {
      collapsed[collapsed.length - 1] = step;
      continue;
    }
    collapsed.push(step);
  }

  const auditCollapsed = collapseLegacyProgressSteps(collapsed);

  const seen = new Set<string>();
  const deduped: AgentRunStep[] = [];
  for (const step of auditCollapsed) {
    const label = step.label.trim();
    if (seen.has(label)) continue;
    seen.add(label);
    deduped.push(step);
  }
  return deduped;
}

function stepArtifacts(step: AgentRunStep): AgentRunStepArtifact[] {
  const raw = step.payload?.artifacts;
  const fromPayload = Array.isArray(raw)
    ? raw.filter(
        (item): item is AgentRunStepArtifact =>
          Boolean(item && typeof item === "object" && typeof (item as AgentRunStepArtifact).url === "string"),
      )
    : [];
  return mergeStepArtifacts(fromPayload, driveFolderArtifactsFromStep(step));
}

function driveFolderArtifactsFromStep(step: AgentRunStep): AgentRunStepArtifact[] {
  const payload = step.payload ?? {};
  const folderUrl =
    typeof payload.folderUrl === "string" && payload.folderUrl.trim()
      ? payload.folderUrl.trim()
      : typeof payload.googleDriveFolderWebViewLink === "string" && payload.googleDriveFolderWebViewLink.trim()
        ? payload.googleDriveFolderWebViewLink.trim()
        : "";
  const folderId =
    typeof payload.folderId === "string"
      ? payload.folderId.trim()
      : typeof payload.googleDriveTargetFolderId === "string"
        ? payload.googleDriveTargetFolderId.trim()
        : "";

  let url = folderUrl;
  if (!url && folderId) {
    const id = folderId.match(/^[a-zA-Z0-9_-]{10,}$/)?.[0] ?? "";
    if (id) url = `https://drive.google.com/drive/folders/${id}`;
  }
  if (!url) {
    const fromLabel = step.label.match(/folderId\s+([a-zA-Z0-9_-]{10,})/i)?.[1];
    if (fromLabel) url = `https://drive.google.com/drive/folders/${fromLabel}`;
  }
  if (!url) return [];
  const payloadLabel =
    typeof payload.folderLabel === "string"
      ? payload.folderLabel.trim()
      : typeof payload.googleDriveFolderLabel === "string"
        ? payload.googleDriveFolderLabel.trim()
        : "";
  return [
    {
      id: "google-drive-folder",
      name: driveFolderDisplayName(payloadLabel || step.label),
      url,
      mime: "application/vnd.google-apps.folder",
    },
  ];
}

/** Drop plain-text folderId from Drive log labels; the folder is shown as a link artifact instead. */
export function cleanAgentRunDriveLogLabel(label: string): string {
  return label
    .replace(/,?\s*folderId\s+[a-zA-Z0-9_-]{10,}/gi, "")
    .replace(/\s*,\s*·/g, " ·")
    .replace(/·\s*,/g, "·")
    .replace(/\s+·\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseUploadStepRowIndex(stepKey: string): number | null {
  const match = /^post(\d+)upload$/.exec(stepKey.trim());
  if (!match) return null;
  const rowIndex = Number(match[1]);
  return Number.isFinite(rowIndex) ? rowIndex : null;
}

function artifactRecordToStepArtifact(record: AgentRunArtifactRecord): AgentRunStepArtifact {
  return {
    id: record.id ?? record.stepKey ?? record.name,
    name: record.name,
    url: record.url ?? "",
    mime: record.mime,
  };
}

function mergeStepArtifacts(
  existing: AgentRunStepArtifact[],
  incoming: AgentRunStepArtifact[],
): AgentRunStepArtifact[] {
  const byKey = new Map<string, AgentRunStepArtifact>();
  for (const artifact of [...existing, ...incoming]) {
    if (!artifact.url) continue;
    byKey.set(`${artifact.name}:${artifact.url}`, artifact);
  }
  return Array.from(byKey.values());
}

function exportedUploadedPosts(run: AgentRun): AgentRunUploadedPost[] {
  const posts = run.result?.uploadedPosts ?? [];
  if (posts.length > 0) return posts;
  const urls = run.result?.urls ?? [];
  return urls.map((url) => ({ url }));
}

export function enrichAgentRunStepsWithServerData(
  run: AgentRun,
  steps: AgentRunStep[],
  serverArtifacts: readonly AgentRunArtifactRecord[],
): AgentRunStep[] {
  const artifactByStepKey = new Map<string, AgentRunArtifactRecord>();
  for (const artifact of serverArtifacts) {
    const key = artifact.stepKey?.trim();
    if (key) artifactByStepKey.set(key, artifact);
  }

  const uploadedPosts = exportedUploadedPosts(run);

  return steps.map((step) => {
    const stepKey = step.stepKey?.trim() ?? "";
    let artifacts = stepArtifacts(step);

    const serverArtifact =
      artifactByStepKey.get(stepKey) ??
      artifactByStepKey.get(stepKey.replace(/-/g, ""));
    if (serverArtifact?.url) {
      artifacts = mergeStepArtifacts(artifacts, [artifactRecordToStepArtifact(serverArtifact)]);
    }

    if (artifacts.length === 0 && (stepKey === "contentbucket" || stepKey === "content-bucket")) {
      for (const artifact of serverArtifacts) {
        if (/^content-bucket-/i.test(artifact.name ?? "")) {
          artifacts = mergeStepArtifacts(artifacts, [artifactRecordToStepArtifact(artifact)]);
          break;
        }
      }
    }

    const uploadRowIndex = parseUploadStepRowIndex(stepKey);
    if (uploadRowIndex != null) {
      const post = uploadedPosts[uploadRowIndex];
      if (post?.url) {
        artifacts = mergeStepArtifacts(artifacts, [
          {
            id: `post-${uploadRowIndex}`,
            name: "View post",
            url: post.url,
          },
        ]);
      }
    }

    if (artifacts.length === 0) return step;
    return {
      ...step,
      payload: {
        ...(step.payload ?? {}),
        artifacts,
      },
    };
  });
}

function sanitizeCheckpointForExport(
  checkpoint: AgentRunCheckpoint | null,
): AgentRunCheckpoint | null {
  if (!checkpoint || typeof checkpoint !== "object") return checkpoint;
  const record = checkpoint as Record<string, unknown>;
  const server = record.server;
  const lastStepPayload =
    record.lastStepPayload && typeof record.lastStepPayload === "object"
      ? sanitizeStepPayloadForExport(record.lastStepPayload as Record<string, unknown>)
      : record.lastStepPayload;
  const next: Record<string, unknown> = { ...record, lastStepPayload };
  if (server && typeof server === "object") {
    const serverRecord = { ...(server as Record<string, unknown>) };
    delete serverRecord.generatedContent;
    next.server = serverRecord;
  }
  return next as AgentRunCheckpoint;
}

function sanitizeStepPayloadForExport(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== "object") return payload;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "cachedFiles" && Array.isArray(value)) {
      out.cachedFileCount = value.length;
      out.cachedFileNames = value
        .map((item) => (item && typeof item === "object" ? String((item as { name?: string }).name ?? "") : ""))
        .filter(Boolean);
      continue;
    }
    if (key === "artifacts") continue;
    if (key === "content" && typeof value === "string" && value.length > 200) {
      out.contentBytes = value.length;
      continue;
    }
    if (Array.isArray(value) && value.length > 20) {
      out[`${key}Count`] = value.length;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = sanitizeStepPayloadForExport(value as Record<string, unknown>);
      if (nested && Object.keys(nested).length > 0) out[key] = nested;
      continue;
    }
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function formatAgentRunLogTimeline(
  run: AgentRun,
  steps: AgentRunStep[],
  activeLabel?: string | null,
): AgentRunLogTimelineRow[] {
  const normalized = normalizeAgentRunStepsForDisplay(steps);
  return normalized.map((step, index) => ({
    key: step.stepKey || `${step.id}-${index}`,
    timeLabel: formatAgentRunTimeOnly(step.updatedAt ?? step.createdAt) || "—",
    label: cleanAgentRunDriveLogLabel(step.label.trim()),
    status: step.status,
    artifacts: stepArtifacts(step),
    isActive: Boolean(
      activeLabel
      && step.label.trim() === activeLabel.trim()
      && run.status === "running"
      && step.status === "running",
    ),
  }));
}

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
