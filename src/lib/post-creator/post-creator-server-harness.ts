import type { WordPressSite } from "@/components/integrations/types";
import { AGENT_RUN_STEP_KEYS } from "@/lib/agent-runs/agent-run-step-keys";
import { checkpointFieldsFromStepPayload, readAgentRunCheckpoint } from "@/lib/agent-runs/agent-run-checkpoint";
import type { AgentRun, AgentRunCheckpoint, AgentRunResult, AgentRunResumePoint, AgentRunServerCheckpoint } from "@/lib/agent-runs-types";
import {
  postCreatorPayloadFromContract,
  runPostCreatorAgentHarness,
  type PostCreatorAgentHarnessResult,
} from "@/lib/post-creator/post-creator-agent-harness";
import {
  serverFetchAgentRun,
  serverPatchAgentRun,
  serverUploadAgentRunArtifact,
  type PostCreatorServerApiConfig,
} from "@/lib/post-creator/post-creator-server-api";
import {
  buildPostCreatorServerPreflightFromPayload,
  preflightFromWorkerCheckpoint,
} from "@/lib/post-creator/post-creator-server-preflight";
import { setPostCreatorWorkerApiBase } from "@/lib/wordpress-api/connection";
import { setServerHarnessSitesOverride } from "@/components/integrations/storage";

export type PostCreatorServerJobPayload = {
  teamId: number;
  runId: number;
  userId: number;
  apiBase: string;
  bearerToken: string;
  openRouterApiKey?: string;
  dataForSeoApiKey?: string;
  site: WordPressSite;
  contract: Record<string, unknown>;
  resumeCheckpoint?: Record<string, unknown>;
  preflight?: {
    bucketJson: string;
    siteKwJsonText: string;
  };
};

export type PostCreatorServerJobResult = {
  ok: boolean;
  error?: string;
  result?: PostCreatorAgentHarnessResult;
};

function applyServerEnvKeys(payload: PostCreatorServerJobPayload): void {
  if (payload.apiBase?.trim()) {
    setPostCreatorWorkerApiBase(payload.apiBase);
    process.env.VITE_BACKEND_API_BASE = payload.apiBase.trim();
  }
  if (payload.openRouterApiKey?.trim()) {
    process.env.OPENROUTER_API_KEY = payload.openRouterApiKey.trim();
  }
  if (payload.dataForSeoApiKey?.trim()) {
    process.env.DATAFORSEO_API_KEY = payload.dataForSeoApiKey.trim();
  }
  setServerHarnessSitesOverride([payload.site]);
}

function apiConfig(payload: PostCreatorServerJobPayload): PostCreatorServerApiConfig {
  return {
    apiBase: payload.apiBase,
    bearerToken: payload.bearerToken,
    openRouterApiKey: payload.openRouterApiKey,
  };
}

function readCheckpointServer(run: AgentRun | null | undefined): Record<string, unknown> {
  const checkpoint = run?.result?.checkpoint;
  if (!checkpoint || typeof checkpoint !== "object") return {};
  const server = (checkpoint as { server?: unknown }).server;
  return server && typeof server === "object" ? (server as Record<string, unknown>) : {};
}

function mergeWorkerServerCheckpoint(
  run: AgentRun,
  resumePayload: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const prevServer = readCheckpointServer(run);
  const orchestratorPhase =
    typeof prevServer.orchestratorPhase === "string"
      ? prevServer.orchestratorPhase
      : "worker_poll";
  return {
    ...prevServer,
    orchestratorPhase,
    workerPhase: resumePayload?.phase,
    ...(resumePayload ?? {}),
  };
}

function resumePointFromCheckpoint(
  checkpoint?: Record<string, unknown>,
): AgentRunResumePoint | null {
  if (!checkpoint || typeof checkpoint !== "object") return null;
  const server = checkpoint.server;
  if (!server || typeof server !== "object") return null;
  const s = server as Record<string, unknown>;
  const workerPhase =
    typeof s.workerPhase === "string"
      ? s.workerPhase
      : typeof s.phase === "string"
        ? s.phase
        : "";
  if (workerPhase !== "bulk" && workerPhase !== "ideation") return null;
  return {
    label: typeof checkpoint.lastStepLabel === "string" ? checkpoint.lastStepLabel : "Resume bulk generation",
    status: "done",
    createdAt: typeof checkpoint.lastStepAt === "string" ? checkpoint.lastStepAt : new Date().toISOString(),
    stepIndex: 0,
    payload: {
      phase: workerPhase,
      rowIndex: typeof s.rowIndex === "number" ? s.rowIndex : 0,
      postCount: typeof s.postCount === "number" ? s.postCount : undefined,
      checklistRows: s.checklistRows,
      uploadedPosts: s.uploadedPosts,
      blockedRows: s.blockedRows,
      intraRowPhase: s.intraRowPhase,
    },
  };
}

function buildResultMessage(result: PostCreatorAgentHarnessResult): string {
  const blockedCount = result.blockedRows.length;
  const base = `Created ${result.created}/${result.postCount} post${result.postCount === 1 ? "" : "s"}`;
  if (result.failed > 0 && blockedCount > 0) {
    return `${base} (${result.failed} failed, ${blockedCount} blocked: cannibalization)`;
  }
  if (result.failed > 0) {
    return `${base} (${result.failed} failed during generation)`;
  }
  if (blockedCount > 0) {
    return `${base} (${blockedCount} blocked: cannibalization)`;
  }
  return base;
}

export async function runPostCreatorServerJob(
  payload: PostCreatorServerJobPayload,
): Promise<PostCreatorServerJobResult> {
  applyServerEnvKeys(payload);
  const config = apiConfig(payload);
  const contractPayload = postCreatorPayloadFromContract(payload.contract);

  let run = await serverFetchAgentRun(config, payload.teamId, payload.runId);
  if (!run) {
    return { ok: false, error: "Agent run not found." };
  }

  const resumePoint = resumePointFromCheckpoint(payload.resumeCheckpoint);

  const serverPreflight = payload.preflight
    ? buildPostCreatorServerPreflightFromPayload(payload.preflight, payload.site.siteUrl)
    : preflightFromWorkerCheckpoint(payload.resumeCheckpoint, payload.site.siteUrl);

  try {
    const harnessResult = await runPostCreatorAgentHarness({
      site: payload.site,
      payload: contractPayload,
      run,
      runId: payload.runId,
      teamId: payload.teamId,
      resumePoint,
      serverPreflight,
      onProgress: async (p, resumePayload) => {
        run = (await serverFetchAgentRun(config, payload.teamId, payload.runId)) ?? run;
        const existingCheckpoint = readAgentRunCheckpoint(run);
        const stepAt = new Date().toISOString();
        const derived = checkpointFieldsFromStepPayload(
          p.label,
          stepAt,
          resumePayload ?? {},
          existingCheckpoint,
        );
        await serverPatchAgentRun(config, payload.teamId, payload.runId, {
          step: {
            label: p.label,
            status: "running",
            stepKey: p.stepKey,
            payload: resumePayload,
          },
          result: {
            ...(run.result ?? {}),
            executionMode: "server",
            checkpoint: {
              ...existingCheckpoint,
              ...derived,
              lastStepLabel: p.label,
              lastStepAt: stepAt,
              lastStepPayload: resumePayload,
              lastMessage: p.label,
              server: mergeWorkerServerCheckpoint(run, resumePayload ?? {}) as AgentRunServerCheckpoint,
            },
          },
        });
      },
      onArtifact: async (input) => {
        await serverUploadAgentRunArtifact(config, payload.teamId, payload.runId, {
          stepKey: input.stepKey,
          name: input.name,
          mime: input.mime,
          content: input.content,
        });
      },
    });

    const message = buildResultMessage(harnessResult);
    const done = await serverPatchAgentRun(config, payload.teamId, payload.runId, {
      status: "done",
      result: {
        executionMode: "server",
        message,
        created: harnessResult.created,
        failed: harnessResult.failed,
        skipped: harnessResult.skipped,
        postCount: harnessResult.postCount,
        urls: harnessResult.urls,
        uploadedPosts: harnessResult.uploadedPosts,
        blockedRows: harnessResult.blockedRows,
        checkpoint: {
          server: { orchestratorPhase: "done", phase: "done" } as AgentRunServerCheckpoint,
        } as AgentRunCheckpoint,
      } as AgentRunResult,
      step: {
        label: "Complete",
        status: "done",
        stepKey: "complete",
      },
    });

    if (!done.ok) {
      return { ok: false, error: done.error ?? "Could not mark run done.", result: harnessResult };
    }

    return { ok: true, result: harnessResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Post creator server job failed.";
    await serverPatchAgentRun(config, payload.teamId, payload.runId, {
      status: "failed",
      errorMessage: message,
      step: { label: message, status: "error", stepKey: "error" },
    });
    return { ok: false, error: message };
  }
}
