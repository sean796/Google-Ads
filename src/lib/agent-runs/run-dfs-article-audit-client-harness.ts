import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import { commitAgentRunDeliverable } from "@/lib/agent-runs/commit-agent-run-deliverable";
import type { AgentRun, AgentRunResult } from "@/lib/agent-runs-types";
import {
  dfsArticleAuditCompletionSummary,
  dfsArticleAuditTextPreview,
  resolveDfsArticleAuditPlatformsForRun,
} from "@/lib/dfs-article-audit/dfs-article-audit-types";
import { fetchDfsArticleAudit } from "@/lib/dfs-article-audit/fetch-dfs-article-audit";
import {
  dfsArticleAuditArtifactName,
  dfsArticleAuditUrlSlug,
  serializeWorkflowDfsArticleAudit,
} from "@/lib/workflow/workflow-dfs-article-audit-cache";
import { resolveDfsArticleAuditWorkflowPayload } from "@/lib/workflow/resolve-dfs-article-audit-workflow-payload";
import { completeAgentRunExecution } from "@/lib/workflow/workflow-deliveries-skip";
import { fetchWorkflowStepOutputs } from "@/lib/workflow/workflow-api";
import { patchTaskExecutionProgress } from "@/lib/tasks-api";
import { AGENT_RUN_STEP_KEYS } from "@/lib/agent-runs/agent-run-step-keys";
import { effectiveSaveLocalArchive } from "@/lib/schedule-output-destination";
import type { TaskExecutionClientRunContract } from "@/lib/tasks-types";
import type { TaskArchiveFileInput } from "@/lib/task-execution-archive";
import { automationTitleFromRun } from "@/lib/automation-email-delivery";

function resolveSite(siteId: string, sites: WordPressSite[]): WordPressSite {
  const fromList = sites.find((s) => s.id === siteId);
  if (fromList) return fromList;
  const stored = getStoredSites().find((s) => s.id === siteId);
  if (stored) return stored;
  throw new Error("WordPress site not found for this DFS article audit run.");
}

/** Contract merged from executionPayload at run time; payload-only keyword/url fields may be present. */
type DfsArticleAuditContract = TaskExecutionClientRunContract & {
  focusKeyword?: string;
  primaryKeyword?: string;
  targetUrl?: string;
};

function focusKeywordFromContract(contract: DfsArticleAuditContract): string {
  const fromPayload =
    String(contract.focusKeyword ?? contract.keyword ?? contract.primaryKeyword ?? "").trim();
  if (fromPayload) return fromPayload;
  const url = String(contract.url ?? "").trim();
  if (!url) return "";
  try {
    const slug = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    return slug.replace(/-/g, " ").trim();
  } catch {
    return "";
  }
}

export async function runDfsArticleAuditClientHarness(
  run: AgentRun,
  site: WordPressSite,
  contract: DfsArticleAuditContract,
  executionId: number,
  ctx: AgentRunHarnessContext,
  batchKey: string,
): Promise<AgentRunResult> {
  const articleUrl = String(contract.url ?? "").trim();
  if (!articleUrl || articleUrl.toUpperCase() === "ALL") {
    throw new Error("A single article URL is required for DFS LLM article audit.");
  }

  const focusKeyword = focusKeywordFromContract(contract);
  if (!focusKeyword) {
    throw new Error("Focus keyword is required for DFS LLM article audit.");
  }

  const saveLocalArchive = effectiveSaveLocalArchive("dfs_llm_article_audit", contract);
  let workflowOutputs: Awaited<ReturnType<typeof fetchWorkflowStepOutputs>> | undefined;

  const bindingWorkflowId = Number(run.context?.workflowId ?? run.plan?.workflowId ?? 0);
  const bindingWorkflowRunId = Number(run.context?.workflowRunId ?? run.plan?.workflowRunId ?? 0);
  if (bindingWorkflowId > 0 && bindingWorkflowRunId > 0) {
    workflowOutputs = await fetchWorkflowStepOutputs(run.teamId, bindingWorkflowId, bindingWorkflowRunId);
  }

  await ctx.onStep?.(
    `Auditing ${articleUrl}…`,
    "running",
    undefined,
    AGENT_RUN_STEP_KEYS.dfsArticleAudit,
  );
  if (executionId > 0) {
    await patchTaskExecutionProgress(run.teamId, executionId, {
      stepId: "audit",
      message: `Auditing ${articleUrl}…`,
      progress: 0.1,
    });
  }

  const auditPlatforms = resolveDfsArticleAuditPlatformsForRun({
    auditPlatforms: contract.auditPlatforms,
    executionPayload: run.plan?.executionPayload,
  });

  const audit = await fetchDfsArticleAudit({
    articleUrl,
    focusKeyword,
    site,
    siteId: site.id,
    siteName: site.name,
    auditQuestions: contract.auditQuestions,
    auditPlatforms,
    seoResearchBrief: contract.seoResearchBrief,
    onProgress: (message) => {
      void ctx.onStep?.(message, "running", undefined, AGENT_RUN_STEP_KEYS.dfsArticleAudit);
      if (executionId <= 0) return;
      void patchTaskExecutionProgress(run.teamId, executionId, {
        stepId: "audit",
        message,
        progress: 0.5,
      });
    },
  });

  const artifactName = dfsArticleAuditArtifactName(articleUrl);
  const serialized = serializeWorkflowDfsArticleAudit(audit);
  const archiveFile: TaskArchiveFileInput = {
    fileName: artifactName,
    mime: "application/json",
    content: serialized,
  };

  const slug = dfsArticleAuditUrlSlug(articleUrl);
  await commitAgentRunDeliverable({
    run,
    stepKey: `dfs_article_audit_${slug}`,
    stepLabel: `DFS article audit: ${focusKeyword}`,
    files: [archiveFile],
    textPreview: dfsArticleAuditTextPreview(audit),
    saveLocalArchive,
    workflowOutputs,
  });

  const completionSummary = dfsArticleAuditCompletionSummary(audit);

  if (executionId > 0) {
    await patchTaskExecutionProgress(run.teamId, executionId, {
      stepId: "complete",
      message: completionSummary,
      progress: 1,
    });
  }

  await ctx.onStep?.(
    `Audit complete: ${completionSummary}`,
    "done",
    undefined,
    AGENT_RUN_STEP_KEYS.dfsArticleAudit,
  );

  const summaryText = dfsArticleAuditTextPreview(audit);
  const deliveryResult = await completeAgentRunExecution({
    teamId: run.teamId,
    executionId,
    contract,
    run,
    saveLocalArchive,
    ok: true,
    archiveFiles: [archiveFile],
    summaryText,
    fileNameHint: `${site.name} DFS article audit`,
    tokenContext: {
      siteName: site.name,
      automationTitle: automationTitleFromRun(run),
      executionKind: "dfs_llm_article_audit",
      summary: summaryText.slice(0, 120),
    },
    result: {
      articleUrl,
      focusKeyword,
      letterGrade: audit.merged?.letterGrade ?? null,
      overallScore: audit.merged?.overallScore ?? null,
    },
    onStep: (label, status) => ctx.onStep?.(label, status ?? "running"),
  });

  return {
    updated: 1,
    message: `DFS article audit: ${completionSummary}`,
    batchKey,
    ...deliveryResult,
  };
}

export async function runDfsArticleAuditDirectHarness(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
): Promise<AgentRunResult> {
  const siteId = String(run.context?.siteId ?? "").trim();
  if (!siteId) {
    throw new Error("Set a client on the workflow before running.");
  }
  const site = resolveSite(siteId, getStoredSites());
  const plan = run.plan ?? {};
  let contract: DfsArticleAuditContract = {
    ...(plan.executionPayload ?? {}),
    ...(plan.clientRunContract ?? {}),
    siteId,
    url: String(
      plan.clientRunContract?.url
      ?? plan.executionPayload?.targetUrl
      ?? (plan.executionPayload as { url?: string } | undefined)?.url
      ?? "",
    ).trim(),
  } as DfsArticleAuditContract;
  const articleUrl = String(contract.url ?? contract.targetUrl ?? "").trim();
  if (!articleUrl || articleUrl.toUpperCase() === "ALL") {
    const resolved = await resolveDfsArticleAuditWorkflowPayload(site, contract);
    contract = {
      ...contract,
      ...resolved,
      url: String(resolved.targetUrl ?? (resolved as { url?: string }).url ?? "").trim(),
    };
  }
  const executionId = Number(plan.taskExecutionId ?? 0);
  const batchKey = run.clientBatchKey || String(run.id);
  return runDfsArticleAuditClientHarness(run, site, contract, executionId, ctx, batchKey);
}

export { resolveSite as resolveDfsArticleAuditSite };
