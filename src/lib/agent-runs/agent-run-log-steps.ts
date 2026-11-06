import type { AgentRunArtifactRecord } from "@/lib/agent-runs-api";
import { formatAgentRunTimeOnly } from "@/lib/edmonton-time";
import type {
  AgentRun,
  AgentRunCheckpoint,
  AgentRunStep,
  AgentRunStepArtifact,
  AgentRunUploadedPost,
} from "@/lib/agent-runs-types";
import { isAgentRunNodeDiagnosticLabel } from "@/lib/agent-runs/agent-run-display";
import { driveFolderDisplayName } from "@/lib/google-drive/google-drive-folder-hierarchy";

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

export function stepArtifacts(step: AgentRunStep): AgentRunStepArtifact[] {
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

export function exportedUploadedPosts(run: AgentRun): AgentRunUploadedPost[] {
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

export function sanitizeCheckpointForExport(
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

export function sanitizeStepPayloadForExport(
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

