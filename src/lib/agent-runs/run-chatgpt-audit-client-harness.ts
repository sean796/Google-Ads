import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import type { AgentRun, AgentRunResult } from "@/lib/agent-runs-types";
import { buildExecutionCompletePayload } from "@/lib/task-execution-archive";
import { completeTaskExecution, patchTaskExecutionProgress } from "@/lib/tasks-api";
import type { TaskExecutionClientRunContract, TaskExecutionPayload } from "@/lib/tasks-types";
import { effectiveSaveLocalArchive } from "@/lib/schedule-output-destination";
import { automationTitleFromRun } from "@/lib/automation-email-delivery";
import { completeAgentRunExecution } from "@/lib/workflow/workflow-deliveries-skip";
import { ensureChatGptAuditExecutionPayload } from "@/lib/workflow/resolve-chatgpt-audit-workflow-payload";
import { clientUrlFromSite, resolveSite } from "@/lib/agent-runs/run-chatgpt-audit-client-harness-helpers";
import { runChatGptAuditSession } from "@/lib/agent-runs/run-chatgpt-audit-client-harness-session";

export { resolveSite };

export async function runChatGptAuditDirectHarness(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
): Promise<AgentRunResult> {
  const siteId = String(run.context?.siteId ?? "").trim();
  if (!siteId) {
    throw new Error("Set a client on the workflow before running.");
  }

  const site = resolveSite(siteId, getStoredSites());
  const planPayload = (run.plan ?? {}) as Record<string, unknown>;
  const contract = ensureChatGptAuditExecutionPayload(
    (planPayload.executionPayload ?? planPayload.clientRunContract ?? planPayload) as TaskExecutionPayload,
  ) as TaskExecutionClientRunContract | Record<string, unknown>;

  await ctx.onStep?.("Starting ChatGPT audit session", "running");

  const { archiveFiles, responses, summary } = await runChatGptAuditSession(run, site, ctx, contract);
  const saveLocalArchive = effectiveSaveLocalArchive("chatgpt_website_audit", contract);

  if (saveLocalArchive && run.plan?.taskExecutionId) {
    await completeTaskExecution(
      run.teamId,
      Number(run.plan.taskExecutionId),
      buildExecutionCompletePayload({
        ok: true,
        run,
        saveLocalArchive: true,
        archiveFiles,
        result: {
          clientName: site.name,
          clientUrl: clientUrlFromSite(site),
          responseCount: responses.length,
          completedUrls: Array.isArray(summary?.completedUrls)
            ? (summary.completedUrls as string[])
            : undefined,
          urlCount: Number(summary?.urlCount ?? 0) || undefined,
        },
      }),
    );
  }

  const completedUrlCount = Array.isArray(summary?.completedUrls)
    ? (summary.completedUrls as string[]).length
    : 0;
  const totalUrlCount = Number(summary?.urlCount ?? completedUrlCount) || completedUrlCount;
  await ctx.onStep?.(
    totalUrlCount > 1
      ? `Session complete (${completedUrlCount} of ${totalUrlCount} URLs)`
      : "Session complete",
    "done",
  );

  return {
    updated: responses.length,
    message: `ChatGPT audit saved ${responses.length} repl${responses.length === 1 ? "y" : "ies"} for ${site.name}`,
    batchKey: run.clientBatchKey || undefined,
  };
}

export async function runChatGptAuditClientHarness(
  run: AgentRun,
  site: WordPressSite,
  contract: TaskExecutionClientRunContract,
  executionId: number,
  ctx: AgentRunHarnessContext,
  batchKey: string,
): Promise<AgentRunResult> {
  await ctx.onStep?.("Starting ChatGPT audit session", "running");
  await patchTaskExecutionProgress(run.teamId, executionId, {
    stepId: "preflight",
    message: `Opening ChatGPT for ${site.name}…`,
    progress: 0.05,
  });

  const { archiveFiles, responses, summary } = await runChatGptAuditSession(run, site, ctx, contract);
  const saveLocalArchive = effectiveSaveLocalArchive("chatgpt_website_audit", contract);
  const summaryText = archiveFiles.map((file) => file.content).join("\n\n");
  const completedUrls = Array.isArray(summary?.completedUrls)
    ? (summary.completedUrls as string[])
    : [];

  const deliveryResult = await completeAgentRunExecution({
    teamId: run.teamId,
    executionId,
    contract,
    run,
    saveLocalArchive,
    ok: true,
    archiveFiles,
    summaryText,
    fileNameHint: `${site.name} ChatGPT audit`,
    tokenContext: {
      siteName: site.name,
      automationTitle: automationTitleFromRun(run),
      executionKind: "chatgpt_website_audit",
      summary: `ChatGPT audit saved ${responses.length} repl${responses.length === 1 ? "y" : "ies"} across ${completedUrls.length || 1} URL${completedUrls.length === 1 ? "" : "s"}`,
    },
    result: {
      clientName: site.name,
      clientUrl: clientUrlFromSite(site),
      responseCount: responses.length,
      completedUrls,
      urlCount: Number(summary?.urlCount ?? completedUrls.length) || undefined,
    },
    onStep: (label, status) => ctx.onStep?.(label, status ?? "running"),
  });

  return {
    updated: responses.length,
    message: `ChatGPT audit saved ${responses.length} repl${responses.length === 1 ? "y" : "ies"} for ${site.name}`,
    batchKey,
    ...deliveryResult,
  };
}
