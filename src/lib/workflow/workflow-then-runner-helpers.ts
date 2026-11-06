import { fetchAgentRun } from "@/lib/agent-runs-api";
import {
  fetchAgentRunSiteIdentity,
  resolveWordPressSiteIdentity,
} from "@/lib/agent-runs/resolve-agent-run-site";
import type { AutomationEmailTokenContext } from "@/lib/automation-email-delivery";
import { googleDriveDeliveryFolderIsMonthLeaf } from "@/lib/google-drive/google-drive-folder-hierarchy";
import { loadArchiveFilesFromStepOutput } from "@/lib/workflow/workflow-then-deliverable-loader";
import { resolveEffectiveThenConfig } from "@/lib/workflow/workflow-then-aggregate";
import type { TaskExecutionClientRunContract, TaskExecutionKind, TaskExecutionPayload } from "@/lib/tasks-types";
import type { TaskArchiveFileInput } from "@/lib/task-execution-archive";
import type {
  WorkflowActionConfig,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowStepDeliveryMeta,
  WorkflowStepOutput,
} from "@/lib/workflow/workflow-types";

export type WorkflowThenRunContext = {
  workflow: WorkflowDefinition;
  siteId?: string;
  siteName: string;
  siteUrl?: string;
  executionKind?: string;
  allSiteIds?: string[];
  allOutputs?: WorkflowStepOutput[];
  /** Step test: resolve target folder only when no upstream deliverable exists. */
  folderTestOnly?: boolean;
};

export function deliveryFolderIsMonthLeaf(label: string): boolean {
  return googleDriveDeliveryFolderIsMonthLeaf(label);
}

function payloadText(source: Record<string, unknown> | undefined, key: string): string {
  const value = source?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function resolveThenSiteIdentity(
  ctx: WorkflowThenRunContext,
  upstream: WorkflowStepOutput | null,
): Promise<{ siteName: string; siteUrl?: string }> {
  if (upstream?.agentRunId && upstream.agentRunId > 0) {
    const fromAgent = await fetchAgentRunSiteIdentity(ctx.workflow.teamId, upstream.agentRunId);
    if (fromAgent.siteName.trim()) return fromAgent;
  }
  if (upstream?.siteId?.trim()) {
    const fromOutputSite = resolveWordPressSiteIdentity(upstream.siteId);
    if (fromOutputSite.siteName.trim()) return fromOutputSite;
  }
  if (ctx.siteId?.trim()) {
    const fromCtxSite = resolveWordPressSiteIdentity(ctx.siteId);
    if (fromCtxSite.siteName.trim()) return fromCtxSite;
  }
  let siteName = ctx.siteName.trim();
  let siteUrl = ctx.siteUrl?.trim() ?? "";
  if (siteName && siteUrl) return { siteName, siteUrl };
  if (upstream?.agentRunId && upstream.agentRunId > 0) {
    const run = await fetchAgentRun(ctx.workflow.teamId, upstream.agentRunId);
    const payload = (run?.plan?.executionPayload ?? run?.plan?.clientRunContract) as
      | Record<string, unknown>
      | undefined;
    if (!siteName) {
      siteName = payloadText(payload, "businessName") || payloadText(payload, "siteName");
    }
    if (!siteUrl) {
      siteUrl = payloadText(payload, "siteUrl") || payloadText(payload, "productionSiteUrl");
    }
  }
  return { siteName, siteUrl: siteUrl || undefined };
}

export async function resolveCompareLabelFromUpstream(
  teamId: number,
  upstream: WorkflowStepOutput | null,
): Promise<string | undefined> {
  if (!upstream?.agentRunId) return undefined;
  const run = await fetchAgentRun(teamId, upstream.agentRunId);
  const result = run?.result;
  const compareLabel = result && "compareLabel" in result ? result.compareLabel : undefined;
  return typeof compareLabel === "string" && compareLabel.trim() ? compareLabel.trim() : undefined;
}

export async function upstreamAgentBlocksDelivery(
  teamId: number,
  upstreamOutputs: WorkflowStepOutput[],
): Promise<string | null> {
  for (const output of upstreamOutputs) {
    if (!output.agentRunId || output.agentRunId <= 0) continue;
    const run = await fetchAgentRun(teamId, output.agentRunId);
    if (!run) continue;
    if (run.status !== "failed" && run.status !== "cancelled") continue;
    // Report may already be in RAG/artifacts (e.g. title-naming failed after deliverables saved).
    const files = await loadArchiveFilesFromStepOutput(teamId, output, 1);
    if (files.some((file) => file.content.trim())) continue;
    return "Upstream agent run failed. Google Drive delivery requires a completed report.";
  }
  return null;
}

export function buildThenContract(
  payload: TaskExecutionPayload,
  kind: WorkflowNode["kind"],
): TaskExecutionClientRunContract {
  const contract = { ...payload, executionId: 0, siteId: "" } as TaskExecutionClientRunContract;
  if (kind === "then_google_drive") contract.saveToGoogleDrive = true;
  if (kind === "then_email") contract.sendAutomationEmail = true;
  if (kind === "then_local") contract.saveLocalArchive = true;
  return contract;
}

function resolveUpstreamAgentNode(
  workflow: WorkflowDefinition,
  upstream: WorkflowStepOutput | null,
): WorkflowNode | null {
  if (upstream) {
    const fromOutput = workflow.nodes.find(
      (node) => node.id === upstream.nodeId && node.kind === "action_agent",
    );
    if (fromOutput) return fromOutput;
  }
  return workflow.nodes.find((node) => node.kind === "action_agent") ?? null;
}

export function buildThenEmailTokenContext(
  workflow: WorkflowDefinition,
  upstream: WorkflowStepOutput | null,
  ctx: WorkflowThenRunContext,
  extras?: Pick<AutomationEmailTokenContext, "driveLinks" | "deliverableCount" | "deliverableList">,
): AutomationEmailTokenContext {
  const agentNode = resolveUpstreamAgentNode(workflow, upstream);
  const agentConfig = agentNode ? (agentNode.config as WorkflowActionConfig) : null;
  const payload = (agentConfig?.executionPayload ?? {}) as Record<string, unknown>;
  const executionKind =
    (ctx.executionKind as TaskExecutionKind | undefined) ??
    (agentConfig?.executionKind as TaskExecutionKind | undefined) ??
    "gsc_reporting";
  const comparePreset =
    payload.comparePreset === "yoy" || payload.comparePreset === "mom"
      ? payload.comparePreset
      : undefined;

  return {
    siteName: ctx.siteName,
    siteUrl: ctx.siteUrl,
    automationTitle: agentConfig?.title?.trim() || agentNode?.label?.trim() || "Automation",
    executionKind,
    comparePreset,
    attachmentDateStamp: Date.now(),
    ...extras,
  };
}

function siteNameSlug(siteName: string): string {
  return siteName.replace(/\s+/g, "-").replace(/[^\w-]/g, "").toLowerCase();
}

export function pickFinalEmailAttachment(
  executionKind: TaskExecutionKind | undefined,
  archiveFiles: TaskArchiveFileInput[],
  siteName?: string,
): TaskArchiveFileInput | null {
  if (archiveFiles.length === 0) return null;

  if (executionKind === "gsc_reporting" || executionKind === "ads_reporting") {
    const gscReports = archiveFiles.filter((file) => {
      const lower = file.fileName.toLowerCase();
      return (lower.includes("gsc-report") || lower.includes("ppc-report")) && lower.endsWith(".md");
    });
    if (gscReports.length > 0) {
      const slug = siteName?.trim() ? siteNameSlug(siteName) : "";
      if (slug) {
        const matched = gscReports.find((file) => file.fileName.toLowerCase().includes(slug));
        if (matched) return matched;
      }
      if (gscReports.length === 1) return gscReports[0]!;
      return null;
    }
    return (
      archiveFiles.find((file) => {
        const lower = file.fileName.toLowerCase();
        return lower.endsWith(".md") && !lower.includes("meeting-notes");
      }) ?? null
    );
  }

  return (
    archiveFiles.find((file) => file.fileName.toLowerCase().includes("final-report")) ??
    archiveFiles.find((file) => file.fileName.toLowerCase().includes("gsc-report")) ??
    archiveFiles.find((file) => file.fileName.toLowerCase().endsWith(".md")) ??
    archiveFiles[0] ??
    null
  );
}

export function buildThenEmailContract(
  payload: TaskExecutionPayload,
  executionKind: TaskExecutionKind | undefined,
  resolved: ReturnType<typeof resolveEffectiveThenConfig>,
): TaskExecutionClientRunContract {
  const contract = buildThenContract(payload, "then_email");
  if ((executionKind === "gsc_reporting" || executionKind === "ads_reporting") && resolved.inputMode === "single") {
    contract.automationEmailAiIntro = true;
  }
  return contract;
}

export function mergeOutputFileRefs(outputs: WorkflowStepOutput[]): WorkflowStepOutput["fileRefs"] {
  const merged: WorkflowStepOutput["fileRefs"] = [];
  const seen = new Set<string>();
  for (const output of outputs) {
    for (const ref of output.fileRefs ?? []) {
      const key = ref.url?.trim() || ref.name?.trim() || "";
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(ref);
    }
  }
  return merged;
}

export function buildGoogleDriveStepTestFile(title: string): { fileName: string; content: string } {
  const safeTitle = title.trim() || "Workflow step";
  const timestamp = new Date().toISOString();
  const stampSlug = timestamp.replace(/[:.]/g, "-");
  const fileName = `${safeTitle.replace(/\s+/g, "-")}-test-${stampSlug}`;
  const content = `# ${safeTitle}\n\nTest file\n\n${timestamp}\n`;
  return { fileName, content };
}

export type WorkflowThenStepResult = {
  ok: boolean;
  error?: string;
  output?: {
    variableKey: string;
    label: string;
    textPreview: string;
    fileRefs: WorkflowStepOutput["fileRefs"];
    agentRunId?: number | null;
    deliveryMeta?: WorkflowStepDeliveryMeta;
  };
};

export const googleDriveThenFlights = new Map<string, Promise<WorkflowThenStepResult>>();

export function googleDriveThenFlightKey(
  ctx: WorkflowThenRunContext,
  node: WorkflowNode,
  outputs: WorkflowStepOutput[],
): string {
  const runId = (ctx.allOutputs ?? outputs)[0]?.runId ?? 0;
  const siteId = String(ctx.siteId ?? "").trim();
  return `${ctx.workflow.teamId}:${ctx.workflow.id}:${runId}:${node.id}:${siteId}`;
}

export function resetGoogleDriveThenFlightsForTests(): void {
  googleDriveThenFlights.clear();
}

