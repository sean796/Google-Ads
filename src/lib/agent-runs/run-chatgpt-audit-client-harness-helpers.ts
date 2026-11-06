import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import type { AgentRun, AgentRunResult, AgentRunStepArtifact } from "@/lib/agent-runs-types";
import { persistAgentRunArtifact } from "@/lib/agent-runs/agent-run-artifacts";
import { agentRunBrowserPreviewDataUrl } from "@/lib/agent-runs/agent-run-browser-preview";
import { patchAgentRunInList } from "@/lib/agent-runs/agent-runs-local-patch";
import { patchAgentRun } from "@/lib/agent-runs-api";
import { commitAgentRunDeliverable } from "@/lib/agent-runs/commit-agent-run-deliverable";
import type { ChatGptAuditQueryResponse } from "@/lib/chatgpt-audit-api";
import { chatgptAuditCsvFileName } from "@/lib/chatgpt-audit-csv";
import { chatgptAuditCumulativeCsvFile, type TaskArchiveFileInput } from "@/lib/task-execution-archive";
import { fetchWorkflowStepOutputs } from "@/lib/workflow/workflow-api";
import { fetchAppApiText } from "@/lib/proxy-fetch-text";
import { syncAgentRunHostedFilesFromBulk } from "@/lib/agent-runs/agent-run-hosted-files";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";

export function resolveSite(siteId: string, sites: WordPressSite[]): WordPressSite {
  const fromList = sites.find((s) => s.id === siteId);
  if (fromList) return fromList;
  const stored = getStoredSites().find((s) => s.id === siteId);
  if (stored) return stored;
  throw new Error("WordPress site not found for this ChatGPT audit run.");
}

export function clientUrlFromSite(site: WordPressSite): string {
  const url = site.productionSiteUrl?.trim() || site.siteUrl?.trim() || "";
  if (url) return url.replace(/\/+$/, "");
  return "";
}

export function readWorkflowBinding(run: AgentRun): {
  workflowId: number;
  workflowRunId: number;
} | null {
  const ctx = run.context ?? {};
  const plan = run.plan ?? {};
  const workflowId = Number(ctx.workflowId ?? plan.workflowId ?? 0);
  const workflowRunId = Number(ctx.workflowRunId ?? plan.workflowRunId ?? 0);
  if (!workflowId || !workflowRunId) return null;
  return { workflowId, workflowRunId };
}

export async function loadExistingChatGptAuditCsv(run: AgentRun): Promise<string | undefined> {
  const binding = readWorkflowBinding(run);
  if (!binding) return undefined;

  const fileName = chatgptAuditCsvFileName({
    runId: run.id,
    workflowRunId: binding.workflowRunId,
  });
  const outputs = await fetchWorkflowStepOutputs(
    run.teamId,
    binding.workflowId,
    binding.workflowRunId,
  );

  for (const output of [...outputs].reverse()) {
    for (const ref of output.fileRefs ?? []) {
      if (ref.name !== fileName || !ref.url?.trim()) continue;
      return fetchAppApiText(ref.url);
    }
  }
  return undefined;
}

export async function patchBrowserPreviewLocally(
  runId: number,
  label: string,
  screenshotBase64: string,
  mime = "image/jpeg",
): Promise<void> {
  const artifact: AgentRunStepArtifact = {
    id: `preview-live-${Date.now()}`,
    name: "browser-preview.jpg",
    url: agentRunBrowserPreviewDataUrl(screenshotBase64, mime),
    mime,
  };
  const at = new Date().toISOString();
  patchAgentRunInList(runId, (run) => {
    const steps = run.steps ?? [];
    const idx = steps.findIndex((step) => step.stepKey === "browser_preview");
    if (idx >= 0) {
      const next = [...steps];
      next[idx] = {
        ...steps[idx]!,
        label,
        status: "running",
        payload: { artifacts: [artifact] },
        updatedAt: at,
      };
      return { steps: next };
    }
    return {
      steps: [
        ...steps,
        {
          id: Date.now(),
          stepIndex: steps.length,
          stepKey: "browser_preview",
          label,
          status: "running",
          payload: { artifacts: [artifact] },
          createdAt: at,
          updatedAt: at,
        },
      ],
    };
  });
}

export function patchRunSessionState(
  run: AgentRun,
  patch: {
    jobId?: string;
    sessionReady?: boolean;
    responseCount?: number;
  },
): void {
  patchAgentRunInList(run.id, (current) => {
    const prev: AgentRunResult = current.result ?? {};
    const nextResult: AgentRunResult = {
      ...prev,
      jobId: patch.jobId ?? prev.jobId,
      sessionReady: patch.sessionReady ?? prev.sessionReady,
      responseCount: patch.responseCount ?? prev.responseCount,
    };
    delete nextResult.responses;
    void patchAgentRun(run.teamId, run.id, {
      result: nextResult,
    });
    return { result: nextResult };
  });
}

export function readPriorChatGptAuditFailure(run: AgentRun): string | null {
  const message = run.errorMessage?.trim();
  if (message) return message;
  const steps = run.steps ?? [];
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.status === "error" && step.label?.trim()) {
      return step.label.trim();
    }
  }
  return null;
}

async function persistBrowserPreviewArtifact(
  run: AgentRun,
  label: string,
  screenshotBase64: string,
): Promise<void> {
  await persistAgentRunArtifact(run.teamId, run, {
    stepKey: "browser_preview",
    stepLabel: label,
    name: "browser-preview.jpg",
    mime: "image/jpeg",
    content: screenshotBase64,
  });
}

export async function persistChatGptAuditCsv(
  run: AgentRun,
  site: WordPressSite,
  clientUrl: string,
  responses: ChatGptAuditQueryResponse[],
  saveLocalArchive: boolean,
  existingContent?: string,
): Promise<TaskArchiveFileInput> {
  const binding = readWorkflowBinding(run);
  const priorContent = existingContent ?? (await loadExistingChatGptAuditCsv(run));
  const csvFile = chatgptAuditCumulativeCsvFile({
    runId: run.id,
    workflowRunId: binding?.workflowRunId,
    clientUrl,
    clientName: site.name,
    responses,
    existingContent: priorContent,
  });

  if (!csvFile.content.trim()) {
    throw new Error("ChatGPT audit CSV is empty.");
  }

  await commitAgentRunDeliverable({
    run,
    stepKey: "chatgpt_session",
    stepLabel: "ChatGPT audit CSV",
    files: [csvFile],
    textPreview: `${parseChatGptAuditRowCount(csvFile.content)} row(s) in ${csvFile.fileName}`,
    saveLocalArchive,
    replaceOutput: true,
  });

  syncAgentRunHostedFilesFromBulk(run.id, [
    {
      id: `chatgpt-audit-csv-${run.id}`,
      rowIndex: 0,
      fileName: csvFile.fileName,
      content: csvFile.content,
      mimeType: csvFile.mime,
      status: "completed",
      timestamp: Date.now(),
      rowData: { title: site.name, keyword: clientUrl },
    } satisfies BulkGeneratedFile,
  ]);

  return csvFile;
}

function parseChatGptAuditRowCount(content: string): number {
  const lines = content.trim().split(/\r?\n/).filter(Boolean);
  return Math.max(0, lines.length - 1);
}
