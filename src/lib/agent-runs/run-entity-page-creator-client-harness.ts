import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import {
  initPostCreatorProof,
  syncPostCreatorProof,
} from "@/lib/agent-runs/agent-run-post-creator-proof";
import { AGENT_RUN_STEP_KEYS } from "@/lib/agent-runs/agent-run-step-keys";
import type { AgentRun, AgentRunResult, AgentRunResumePoint } from "@/lib/agent-runs-types";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import type { EntityPageCreatorExecutionPayload, TaskExecutionClientRunContract } from "@/lib/tasks-types";
import { patchTaskExecutionProgress } from "@/lib/tasks-api";
import { effectiveSaveLocalArchive } from "@/lib/schedule-output-destination";
import {
  automationTitleFromRun,
  executionKindFromRun,
} from "@/lib/automation-email-delivery";
import { commitAgentRunDeliverable } from "@/lib/agent-runs/commit-agent-run-deliverable";
import { fetchWorkflowStepOutputs } from "@/lib/workflow/workflow-api";
import { completeAgentRunExecution } from "@/lib/workflow/workflow-deliveries-skip";
import {
  entityPageCreatorPayloadFromContract,
} from "@/lib/entity-page-creator/entity-page-creator-schedule";
import {
  generateEntityLocationRows,
  hydrateAndPublishEntityPages,
} from "@/lib/entity-page-creator/entity-page-creator-phases";
import { shouldRunSapGeneratorHarness } from "@/lib/agent-runs/run-sap-generator-client-harness";

function resolveSite(siteId: string, sites: WordPressSite[]): WordPressSite {
  const fromList = sites.find((s) => s.id === siteId);
  if (fromList) return fromList;
  const stored = getStoredSites().find((s) => s.id === siteId);
  if (stored) return stored;
  throw new Error("WordPress site not found for this entity page creator run.");
}

function isEntityPageCreatorContract(contract: TaskExecutionClientRunContract): boolean {
  if (shouldRunSapGeneratorHarness(contract)) return false;
  const payload = contract as EntityPageCreatorExecutionPayload;
  if (payload.locationSource === "grid" || payload.gridInputSource != null) return true;
  if (payload.entityAdGroupCount != null || payload.entityPageCount != null) return true;
  if (payload.gridInputSource != null) return true;
  return false;
}

function buildResultMessage(result: {
  created: number;
  failed: number;
  skipped?: number;
  postCount: number;
}): string {
  const base = `Created ${result.created}/${result.postCount} entity page${result.postCount === 1 ? "" : "s"}`;
  const skipped = result.skipped ?? 0;
  if (skipped > 0) {
    return `${base} (${skipped} skipped)`;
  }
  if (result.failed > 0) {
    return `${base} (${result.failed} failed during generation)`;
  }
  return base;
}

async function appendEntityPagesSummaryStep(
  ctx: AgentRunHarnessContext,
  uploadedPosts: import("@/lib/agent-runs-types").AgentRunUploadedPost[],
): Promise<void> {
  if (uploadedPosts.length === 0) return;
  await ctx.onStep?.(
    `Created pages (${uploadedPosts.length})`,
    "done",
    {
      artifacts: uploadedPosts.map((post, index) => ({
        id: `entity-post-${index}`,
        name: post.title?.trim() || post.url,
        url: post.url,
      })),
    },
    "entity_pages_created",
  );
}

export async function runEntityPageCreatorAgentHarness(args: {
  site: WordPressSite;
  payload: EntityPageCreatorExecutionPayload;
  run: AgentRun;
  executionId?: number;
  resumePoint?: AgentRunResumePoint | null;
  onProgress?: (
    label: string,
    progress?: number,
    resumePayload?: Record<string, unknown>,
  ) => void;
  onFilesChanged?: (files: BulkGeneratedFile[]) => void;
  onHarnessSection?: (payload: BulkHarnessSectionPayload) => void;
  isCancelled?: () => Promise<boolean>;
}): Promise<{
  created: number;
  failed: number;
  skipped: number;
  postCount: number;
  urls: string[];
  uploadedPosts: import("@/lib/agent-runs-types").AgentRunUploadedPost[];
  bulkCsv: string;
  gridInputResolved?: boolean;
}> {
  const resumePayload = args.resumePoint?.payload ?? {};
  const resumePhase = String(resumePayload.phase ?? "");

  if (resumePhase === "bulk") {
    return hydrateAndPublishEntityPages({
      site: args.site,
      payload: args.payload,
      run: args.run,
      executionKind: "entity_page_creator",
      rows: [],
      resumePoint: args.resumePoint,
      onProgress: args.onProgress,
      onFilesChanged: args.onFilesChanged,
      onHarnessSection: args.onHarnessSection,
      isCancelled: args.isCancelled,
    });
  }

  const location = await generateEntityLocationRows({
    site: args.site,
    payload: args.payload,
    run: args.run,
    onProgress: (label, progress) => args.onProgress?.(label, progress),
  });

  const publish = await hydrateAndPublishEntityPages({
    site: args.site,
    payload: args.payload,
    run: args.run,
    executionKind: "entity_page_creator",
    rows: location.rows,
    locationResult: location.locationResult,
    resumePoint: args.resumePoint,
    onProgress: args.onProgress,
    onFilesChanged: args.onFilesChanged,
    onHarnessSection: args.onHarnessSection,
    isCancelled: args.isCancelled,
  });

  return {
    ...publish,
    gridInputResolved: location.gridInputResolved,
  };
}

export async function runEntityPageCreatorClientHarness(
  run: AgentRun,
  site: WordPressSite,
  contract: TaskExecutionClientRunContract,
  executionId: number,
  ctx: AgentRunHarnessContext,
  batchKey: string,
): Promise<AgentRunResult> {
  const payload = entityPageCreatorPayloadFromContract(contract as Record<string, unknown>);
  const postCount = payload.entityPageCount ?? payload.postCount ?? 1;

  initPostCreatorProof(run.id, postCount, true);

  if (!ctx.isResume) {
    await ctx.onStep?.("Preflight", "running", undefined, AGENT_RUN_STEP_KEYS.preflight);
  }
  await patchTaskExecutionProgress(run.teamId, executionId, {
    stepId: "preflight",
    message: "Starting entity page creator…",
    progress: 0.02,
  });

  const result = await runEntityPageCreatorAgentHarness({
    site,
    payload,
    run,
    executionId,
    resumePoint: ctx.resumePoint,
    isCancelled: ctx.isCancelled,
    onProgress: (label, progress, resumePayload) => {
      void patchTaskExecutionProgress(run.teamId, executionId, {
        message: label,
        progress,
      });
      return ctx.onStep?.(label, "running", resumePayload);
    },
  });

  syncPostCreatorProof(run.id, {
    postCount,
    files: [],
    featuredImageEnabled: true,
    uploadedPosts: result.uploadedPosts,
  });

  await appendEntityPagesSummaryStep(ctx, result.uploadedPosts);

  const message = buildResultMessage(result);
  const saveLocalArchive = effectiveSaveLocalArchive("entity_page_creator", contract);

  const entityArchiveFiles = [
    {
      fileName: "entity-bulk.csv",
      mime: "text/csv",
      content: result.bulkCsv,
    },
  ];
  const workflowId = Number(run.context?.workflowId ?? run.plan?.workflowId ?? 0);
  const workflowRunId = Number(run.context?.workflowRunId ?? run.plan?.workflowRunId ?? 0);
  const workflowOutputs =
    workflowId > 0 && workflowRunId > 0
      ? await fetchWorkflowStepOutputs(run.teamId, workflowId, workflowRunId)
      : undefined;
  await commitAgentRunDeliverable({
    run,
    stepKey: "entity_bulk_csv",
    stepLabel: "Entity bulk CSV",
    files: entityArchiveFiles,
    textPreview: message,
    saveLocalArchive,
    workflowOutputs,
  });

  const emailResult = await completeAgentRunExecution({
    teamId: run.teamId,
    executionId,
    contract,
    run,
    saveLocalArchive,
    ok: true,
    summaryText: message,
    fileNameHint: `${site.name} entity pages`,
    tokenContext: {
      siteName: site.name,
      automationTitle: automationTitleFromRun(run),
      executionKind: executionKindFromRun(run) || "entity_page_creator",
      summary: message,
    },
    result: {
      created: result.created,
      failed: result.failed,
      skipped: result.skipped,
      postCount: result.postCount,
      gridInputResolved: result.gridInputResolved,
      urls: result.urls,
      uploadedPosts: result.uploadedPosts,
    },
    onStep: (label, status) => ctx.onStep?.(label, status ?? "running"),
  });

  return {
    updated: result.created,
    failed: result.failed,
    skipped: result.skipped,
    postCount: result.postCount,
    message,
    batchKey,
    gridInputResolved: result.gridInputResolved,
    urls: result.urls,
    uploadedPosts: result.uploadedPosts,
    ...emailResult,
  };
}

export async function runEntityPageCreatorDirectHarness(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
): Promise<AgentRunResult> {
  const siteId = String(run.context?.siteId ?? "").trim();
  if (!siteId) {
    throw new Error("Select a WordPress site before running entity page creator.");
  }

  const site = resolveSite(siteId, getStoredSites());
  const plan = (run.plan ?? {}) as Record<string, unknown>;
  const payload = entityPageCreatorPayloadFromContract(
    (plan.executionPayload ?? plan.clientRunContract ?? plan) as Record<string, unknown>,
  );
  const postCount = payload.entityPageCount ?? payload.postCount ?? 1;

  initPostCreatorProof(run.id, postCount, true);
  await ctx.onStep?.("Starting entity page creator…", "running", undefined, AGENT_RUN_STEP_KEYS.starting);

  const result = await runEntityPageCreatorAgentHarness({
    site,
    payload,
    run,
    resumePoint: ctx.resumePoint,
    isCancelled: ctx.isCancelled,
    onProgress: async (label, _progress, resumePayload) => {
      await ctx.onStep?.(label, "running", resumePayload);
    },
  });

  syncPostCreatorProof(run.id, {
    postCount,
    files: [],
    featuredImageEnabled: true,
    uploadedPosts: result.uploadedPosts,
  });

  await appendEntityPagesSummaryStep(ctx, result.uploadedPosts);

  const message = buildResultMessage(result);

  return {
    updated: result.created,
    failed: result.failed,
    skipped: result.skipped,
    postCount: result.postCount,
    message,
    gridInputResolved: result.gridInputResolved,
    urls: result.urls,
    uploadedPosts: result.uploadedPosts,
  };
}

export function shouldRunEntityPageCreatorHarness(contract: TaskExecutionClientRunContract): boolean {
  return isEntityPageCreatorContract(contract);
}
