import type { AgentRun } from "@/lib/agent-runs-types";
import { commitAgentRunDeliverable } from "@/lib/agent-runs/commit-agent-run-deliverable";
import type { BrowserAutomationProgressDeliverable } from "@/lib/browser-automation-api";
import { fetchWorkflowStepOutputs } from "@/lib/workflow/workflow-api";
import type { TaskArchiveFileInput } from "@/lib/task-execution-archive";

export function progressDeliverableCommitSignature(
  item: Pick<BrowserAutomationProgressDeliverable, "filename" | "kind" | "rowIndex">,
  contentLength: number,
): string {
  const filename = String(item.filename ?? "deliverable").trim() || "deliverable";
  const isStreamingText = item.kind === "csv" || item.kind === "text";
  if (isStreamingText) {
    return `${filename}:${contentLength}`;
  }
  return `${filename}:${contentLength}:${item.rowIndex ?? 0}`;
}

export async function commitProgressDeliverable(
  run: AgentRun,
  item: BrowserAutomationProgressDeliverable,
  state: {
    saveLocalArchive: boolean;
    committedDeliverableSignatures: Set<string>;
    workflowOutputs?: Awaited<ReturnType<typeof fetchWorkflowStepOutputs>>;
  },
): Promise<void> {
  const content = String(item.content ?? item.base64 ?? "").trim();
  if (!content) return;

  const signature = progressDeliverableCommitSignature(item, content.length);
  if (state.committedDeliverableSignatures.has(signature)) return;
  state.committedDeliverableSignatures.add(signature);

  if (!state.workflowOutputs) {
    const workflowId = Number(run.context?.workflowId ?? run.plan?.workflowId ?? 0);
    const workflowRunId = Number(run.context?.workflowRunId ?? run.plan?.workflowRunId ?? 0);
    if (workflowId > 0 && workflowRunId > 0) {
      state.workflowOutputs = await fetchWorkflowStepOutputs(run.teamId, workflowId, workflowRunId);
    }
  }

  const filename = String(item.filename ?? "deliverable").trim() || "deliverable";
  const mime = String(item.mime ?? "application/octet-stream").trim() || "application/octet-stream";
  const stepKey =
    item.kind === "text" || item.kind === "csv" ? "browser_deliverable" : "browser_capture";
  const stepLabel = String(item.label ?? "Browser deliverable").trim() || "Browser deliverable";
  const replaceOutput = item.kind === "csv" || item.kind === "text";

  await commitAgentRunDeliverable({
    run,
    stepKey,
    stepLabel,
    files: [{ fileName: filename, mime, content }],
    textPreview: stepLabel,
    saveLocalArchive: state.saveLocalArchive,
    workflowOutputs: state.workflowOutputs,
    replaceOutput,
  });
}

export function sessionArchiveFile(input: {
  runId: number;
  targetUrl: string;
  summary: Record<string, unknown>;
}): TaskArchiveFileInput {
  const archiveSummary = {
    ...input.summary,
    deliverables: Array.isArray(input.summary.deliverables)
      ? (input.summary.deliverables as Array<Record<string, unknown>>).map((item) => ({
          filename: item.filename,
          label: item.label,
          mime: item.mime,
          fullPage: item.fullPage,
          capturedAt: item.capturedAt,
          url: item.url,
        }))
      : [],
  };
  const content = JSON.stringify(archiveSummary, null, 2);
  return {
    fileName: `browser-automation-${input.runId}.json`,
    mime: "application/json",
    content,
  };
}

export type BrowserDeliverable = {
  filename?: string;
  label?: string;
  mime?: string;
  base64?: string;
  content?: string;
  kind?: string;
};

function deliverableContent(item: BrowserDeliverable): string {
  const text = String(item.content ?? "").trim();
  if (text) return text;
  return String(item.base64 ?? "").trim();
}

function deliverableStepKey(item: BrowserDeliverable): string {
  if (item.kind === "text" || item.kind === "csv") return "browser_deliverable";
  return "browser_capture";
}

function instructionsAskForScreenshot(html: string): boolean {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return /\bscreenshot\b|\bscreen shot\b/.test(text);
}

export function captureDeliverablesFromSummary(
  summary: Record<string, unknown>,
  fallbackScreenshot: string | null,
  browserInstructionsHtml: string,
): BrowserDeliverable[] {
  const fromSummary = Array.isArray(summary.deliverables)
    ? (summary.deliverables as BrowserDeliverable[])
    : [];
  if (fromSummary.some((item) => deliverableContent(item))) {
    return fromSummary;
  }
  const screenshot = fallbackScreenshot?.trim();
  if (!screenshot || !instructionsAskForScreenshot(browserInstructionsHtml)) {
    return fromSummary;
  }
  return [
    {
      filename: "homepage-screenshot.jpg",
      label: "Homepage screenshot",
      mime: "image/jpeg",
      base64: screenshot,
    },
  ];
}


export async function persistBrowserDeliverables(
  run: AgentRun,
  deliverables: BrowserDeliverable[],
  saveLocalArchive: boolean,
  committedDeliverableSignatures?: Set<string>,
): Promise<TaskArchiveFileInput[]> {
  const files: TaskArchiveFileInput[] = [];
  const groups = new Map<string, BrowserDeliverable[]>();
  for (const item of deliverables) {
    const content = deliverableContent(item);
    if (!content) continue;
    const filename = String(item.filename ?? "deliverable");
    const alreadyStreamed = [...(committedDeliverableSignatures ?? [])].some((sig) =>
      sig.startsWith(`${filename}:`),
    );
    if (alreadyStreamed && (item.kind === "csv" || item.kind === "text")) continue;
    const stepKey = deliverableStepKey(item);
    const bucket = groups.get(stepKey) ?? [];
    bucket.push(item);
    groups.set(stepKey, bucket);
  }

  const workflowId = Number(run.context?.workflowId ?? run.plan?.workflowId ?? 0);
  const workflowRunId = Number(run.context?.workflowRunId ?? run.plan?.workflowRunId ?? 0);
  const workflowOutputs =
    workflowId > 0 && workflowRunId > 0
      ? await fetchWorkflowStepOutputs(run.teamId, workflowId, workflowRunId)
      : undefined;

  for (const [stepKey, items] of groups) {
    const batchFiles: TaskArchiveFileInput[] = [];
    for (const item of items) {
      const content = deliverableContent(item);
      const name = String(item.filename ?? "deliverable").trim() || "deliverable";
      const mime = String(item.mime ?? "application/octet-stream").trim() || "application/octet-stream";
      batchFiles.push({ fileName: name, mime, content });
    }
    if (!batchFiles.length) continue;
    const stepLabel = String(items[0]?.label ?? "Browser deliverable").trim() || "Browser deliverable";
    await commitAgentRunDeliverable({
      run,
      stepKey,
      stepLabel,
      files: batchFiles,
      textPreview: stepLabel,
      saveLocalArchive,
      workflowOutputs,
    });
    files.push(...batchFiles);
  }

  return files;
}
