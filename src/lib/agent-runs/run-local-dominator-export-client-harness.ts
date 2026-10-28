import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import type { AgentRun, AgentRunResult } from "@/lib/agent-runs-types";
import { persistAgentRunArtifact } from "@/lib/agent-runs/agent-run-artifacts";
import type { TaskExecutionClientRunContract } from "@/lib/tasks-types";
import { patchTaskExecutionProgress } from "@/lib/tasks-api";
import {
  effectiveSaveLocalArchive,
  effectiveSaveToDisk,
} from "@/lib/schedule-output-destination";
import {
  localDominatorArchiveFiles,
  persistTaskArchiveFiles,
} from "@/lib/task-execution-archive";
import { fetchWorkflow, fetchWorkflowStepOutputs } from "@/lib/workflow/workflow-api";
import { syncWorkflowRunArchiveDeliverables } from "@/lib/workflow/workflow-rag-archive";
import { syncAgentRunHostedFilesFromBulk } from "@/lib/agent-runs/agent-run-hosted-files";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import { automationTitleFromRun } from "@/lib/automation-email-delivery";
import { chainWorkflowOnGridExport } from "@/lib/workflow/workflow-grid-export-chain";
import { completeAgentRunExecution } from "@/lib/workflow/workflow-deliveries-skip";
import { readWorkflowAgentBinding } from "@/lib/workflow/workflow-agent-binding";
import { stashWorkflowGridCsv } from "@/lib/workflow/workflow-grid-csv-stash";
import {
  dominantKeywordFromRows,
  parseLocalDominatorCsv,
} from "@/lib/local-dominator-csv";
import {
  isLocalDominatorAutoGridKeyword,
  isLocalDominatorPropertyGridKeyword,
  resolveWorkflowLocalDominatorGridKeyword,
} from "@/lib/local-dominator/local-dominator-export-keyword";
import { resolvePropertyPrimaryLocalKeyword } from "@/lib/local-grid-studio/resolve-property-primary-local-keyword";
import { saveLocalGridScanOnServer } from "@/lib/local-grid-studio/local-grid-api";
import { runLocalGridExportForSite } from "@/lib/local-grid-studio/run-local-grid-export-for-site";
import { downloadLocalDominatorCsv } from "@/lib/local-dominator-export-api";

function resolveSite(siteId: string, sites: WordPressSite[]): WordPressSite {
  const fromList = sites.find((s) => s.id === siteId);
  if (fromList) return fromList;
  const stored = getStoredSites().find((s) => s.id === siteId);
  if (stored) return stored;
  throw new Error("WordPress site not found for this Local Grid export run.");
}

export function resolveEffectiveGridKeyword(
  keyword: string,
  csvContent: string,
  businessName?: string,
): string {
  const stored = String(keyword ?? "").trim();
  if (
    stored &&
    !isLocalDominatorAutoGridKeyword(stored) &&
    !isLocalDominatorPropertyGridKeyword(stored)
  ) {
    return stored;
  }
  const fallback = businessName?.trim() ?? "";
  const parsed = parseLocalDominatorCsv(csvContent, { defaultKeyword: fallback });
  const fromRows = dominantKeywordFromRows(parsed.rows).trim();
  return fromRows || fallback;
}

function contractFields(
  contract: TaskExecutionClientRunContract | Record<string, unknown>,
  site?: WordPressSite,
) {
  const rawBusinessName = String((contract as TaskExecutionClientRunContract).businessName ?? "").trim();
  const businessName = rawBusinessName || site?.name?.trim() || "";
  const rawKeyword = String((contract as TaskExecutionClientRunContract).keyword ?? "");
  const storedKeyword = resolveWorkflowLocalDominatorGridKeyword(
    { keyword: rawKeyword, businessName },
    rawKeyword,
    businessName,
  );
  const keyword = resolvePropertyPrimaryLocalKeyword(site, storedKeyword);
  if (!businessName) {
    throw new Error("businessName is required for Local Grid export.");
  }
  if (!keyword.trim()) {
    throw new Error(
      "Keyword is required for Local Grid export. Set Primary keyword on the property profile or choose a custom keyword on the task.",
    );
  }
  return { businessName, keyword: keyword.trim(), storedKeyword };
}

function executionPayloadFromRun(run: AgentRun): TaskExecutionClientRunContract | Record<string, unknown> {
  const plan = (run.plan ?? {}) as Record<string, unknown>;
  return (plan.executionPayload ?? plan.clientRunContract ?? plan) as
    | TaskExecutionClientRunContract
    | Record<string, unknown>;
}

function syncLocalDominatorHostedFile(
  runId: number,
  fileName: string,
  csvContent: string,
  businessName: string,
  keyword: string,
): void {
  const file: BulkGeneratedFile = {
    id: `local-dominator-${runId}`,
    rowIndex: 0,
    fileName,
    content: csvContent,
    mimeType: "text/csv",
    status: "completed",
    timestamp: Date.now(),
    rowData: {
      keyword,
      title: businessName,
    },
  };
  syncAgentRunHostedFilesFromBulk(runId, [file]);
}

async function persistLocalDominatorDeliverable(
  run: AgentRun,
  archiveFiles: ReturnType<typeof localDominatorArchiveFiles>,
  onChainStep?: (label: string, status: "running" | "error") => void | Promise<void>,
): Promise<void> {
  const file = archiveFiles[0];
  if (!file) return;
  const artifact = await persistAgentRunArtifact(run.teamId, run, {
    stepKey: "grid_export",
    stepLabel: "Grid export CSV",
    name: file.fileName,
    mime: file.mime,
    content: file.content,
  });
  if (!artifact?.url) {
    throw new Error("Could not save grid export CSV to run archive.");
  }
  const fileRefs = [{ name: file.fileName, url: artifact.url, mime: file.mime }];
  if (run.taskId > 0) {
    await persistTaskArchiveFiles(run.teamId, run.taskId, archiveFiles);
  }
  const binding = readWorkflowAgentBinding(run);
  if (binding) {
    const contract = executionPayloadFromRun(run);
    const siteId = String(run.context?.siteId ?? "").trim();
    const site = siteId ? resolveSite(siteId, getStoredSites()) : undefined;
    const { businessName, storedKeyword } = contractFields(contract, site);
    const effectiveKeyword = resolveEffectiveGridKeyword(storedKeyword, file.content, businessName);
    stashWorkflowGridCsv(binding.workflowRunId, file.content, fileRefs, effectiveKeyword);
    const workflow = await fetchWorkflow(run.teamId, binding.workflowId);
    if (workflow) {
      const outputs = await fetchWorkflowStepOutputs(
        run.teamId,
        binding.workflowId,
        binding.workflowRunId,
      );
      await syncWorkflowRunArchiveDeliverables({
        teamId: run.teamId,
        workflowId: binding.workflowId,
        workflowRunId: binding.workflowRunId,
        nodes: workflow.nodes,
        outputs,
        agentRunId: run.id,
        textPreview: "Grid export CSV",
        extraFileRefs: fileRefs,
      });
    }
    await onChainStep?.("Chaining entity pages…", "running");
    try {
      await chainWorkflowOnGridExport(run, { fileRefs });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Workflow chain failed";
      await onChainStep?.(message, "error");
      throw err instanceof Error ? err : new Error(message);
    }
  }
}

async function finalizeLocalGridExport(
  run: AgentRun,
  site: WordPressSite,
  contract: TaskExecutionClientRunContract | Record<string, unknown>,
  exportResult: Awaited<ReturnType<typeof runLocalGridExportForSite>>,
  onChainStep?: (label: string, status: "running" | "error") => void | Promise<void>,
): Promise<{ csvContent: string; archiveFiles: ReturnType<typeof localDominatorArchiveFiles> }> {
  const { businessName, storedKeyword } = contractFields(contract, site);
  const csvContent = exportResult.csvContent;
  const effectiveKeyword = resolveEffectiveGridKeyword(
    storedKeyword,
    csvContent,
    businessName,
  );
  const archiveFiles = localDominatorArchiveFiles({
    fileName: exportResult.fileName,
    csvContent,
    businessName,
    keyword: effectiveKeyword,
  });

  const saveToDisk = effectiveSaveToDisk("local_dominator_export", contract);
  const saveLocalArchive = effectiveSaveLocalArchive("local_dominator_export", contract);

  if (saveToDisk && !saveLocalArchive) {
    downloadLocalDominatorCsv(archiveFiles[0]?.fileName ?? exportResult.fileName, csvContent);
  }

  syncLocalDominatorHostedFile(
    run.id,
    archiveFiles[0]?.fileName ?? exportResult.fileName,
    csvContent,
    businessName,
    effectiveKeyword,
  );

  await onChainStep?.("Saving Local Grid draft…", "running");
  const savedScan = await saveLocalGridScanOnServer(site.id, exportResult.scan);
  if (!savedScan) {
    throw new Error("Local Grid draft could not be saved. Open Local Grid for this property and retry.");
  }

  await persistLocalDominatorDeliverable(run, archiveFiles, onChainStep);

  return { csvContent, archiveFiles };
}

export async function runLocalDominatorExportDirectHarness(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
): Promise<AgentRunResult> {
  const siteId = String(run.context?.siteId ?? "").trim();
  if (!siteId) {
    throw new Error("Set a client on the workflow before running.");
  }

  const site = resolveSite(siteId, getStoredSites());
  const contract = executionPayloadFromRun(run);
  const { keyword } = contractFields(contract, site);

  await ctx.onStep?.("Preflight", "running");
  await ctx.onStep?.("Export grid CSV", "running");

  const exportResult = await runLocalGridExportForSite(site, {
    keyword,
    onProgress: (label) => ctx.onStep?.(label, "running"),
    shouldAbort: async () => (await ctx.isCancelled?.()) ?? false,
  });

  await finalizeLocalGridExport(run, site, contract, exportResult, (label, status) =>
    ctx.onStep?.(label, status === "error" ? "error" : "running"),
  );

  return {
    updated: 1,
    message: `Exported Local Grid for ${exportResult.businessName}`,
    batchKey: run.clientBatchKey || undefined,
  };
}

export async function runLocalDominatorExportClientHarness(
  run: AgentRun,
  site: WordPressSite,
  contract: TaskExecutionClientRunContract,
  executionId: number,
  ctx: AgentRunHarnessContext,
  batchKey: string,
): Promise<AgentRunResult> {
  const { businessName, keyword } = contractFields(contract, site);

  await ctx.onStep?.("Preflight", "running");
  await patchTaskExecutionProgress(run.teamId, executionId, {
    stepId: "preflight",
    message: "Starting Local Grid export…",
    progress: 0.05,
  });

  await ctx.onStep?.("Export grid CSV", "running");
  await patchTaskExecutionProgress(run.teamId, executionId, {
    message: `Scanning grid for ${businessName}…`,
    progress: 0.2,
  });

  const exportResult = await runLocalGridExportForSite(site, {
    keyword,
    onProgress: (label, progress) => {
      void patchTaskExecutionProgress(run.teamId, executionId, {
        message: label,
        progress: progress ?? undefined,
      });
      void ctx.onStep?.(label, "running");
    },
    shouldAbort: async () => (await ctx.isCancelled?.()) ?? false,
  });

  const { archiveFiles } = await finalizeLocalGridExport(
    run,
    site,
    contract,
    exportResult,
    (label, status) => ctx.onStep?.(label, status === "error" ? "error" : "running"),
  );

  const saveLocalArchive = effectiveSaveLocalArchive("local_dominator_export", contract);
  const fileName = archiveFiles[0]?.fileName ?? exportResult.fileName;

  const deliveryResult = await completeAgentRunExecution({
    teamId: run.teamId,
    executionId,
    contract,
    run,
    saveLocalArchive,
    ok: true,
    summaryText: archiveFiles[0]?.content ?? "",
    fileNameHint: fileName.replace(/\.csv$/i, ""),
    tokenContext: {
      siteName: site.name,
      automationTitle: automationTitleFromRun(run),
      executionKind: "local_dominator_export",
      summary: `Exported Local Grid for ${businessName}`,
    },
    result: {
      businessName,
      keyword: exportResult.effectiveKeyword,
      fileName,
      siteName: site.name,
    },
    onStep: (label, status) => ctx.onStep?.(label, status ?? "running"),
  });

  return {
    updated: 1,
    message: `Exported Local Grid for ${businessName}`,
    batchKey,
    ...deliveryResult,
  };
}

export { resolveSite };
