import { useMemo } from "react";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { humanizeSlugFromUrl } from "@/hooks/content-optimization/bulk-optimization-constants";
import { computeBatchProgress } from "@/lib/content-optimization/content-optimizer-run-progress";
import { resolveAgentRunBatchKey } from "@/lib/agent-runs/agent-run-batch-key";
import { buildAgentRunProgressLabel, isAgentRunNodeDiagnosticLabel } from "@/lib/agent-runs/agent-run-display";
import { readAgentRunCheckpoint } from "@/lib/agent-runs/agent-run-checkpoint";
import { resolveAgentRunRecipeKey } from "@/lib/agent-runs/agent-run-navigation";
import type { AgentRun, AgentRunCheckpoint } from "@/lib/agent-runs-types";
import { isAgentRunTerminal } from "@/lib/agent-runs-types";
import { isTaskExecutionTargetAll } from "@/lib/task-execution-target";

export type AgentRunGeneratedFile = {
  name: string;
  content: string;
  mimeType: string;
};

export type AgentRunCompletedUrlFiles = {
  url: string;
  postTitle: string;
  files: AgentRunGeneratedFile[];
};

export type AgentRunLiveSnapshot = {
  isLive: boolean;
  currentUrl: string | null;
  postTitle: string | null;
  progressLabel: string | null;
  positionLabel: string | null;
  percent: number | null;
  generatedFiles: AgentRunGeneratedFile[];
  completedUrlFiles: AgentRunCompletedUrlFiles[];
};

function agentRunSiteId(run: AgentRun): string {
  return run.plan?.clientRunContract?.siteId?.trim() || run.context.siteId?.trim() || "";
}

function lastStepLabel(run: AgentRun): string | null {
  const steps = run.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const label = steps[i]?.label?.trim() || "";
    if (label && !isAgentRunNodeDiagnosticLabel(label)) return label;
  }
  return null;
}

function usefulProgressMessage(message: string | null | undefined): string {
  const trimmed = message?.trim() ?? "";
  if (!trimmed || isAgentRunNodeDiagnosticLabel(trimmed)) return "";
  return trimmed;
}

function normalizeGeneratedFiles(
  files: Array<{ name: string; content: string; mimeType: string }> | undefined,
): AgentRunGeneratedFile[] {
  if (!files?.length) return [];
  return files.map((file) => ({
    name: file.name,
    content: file.content,
    mimeType: file.mimeType,
  }));
}

function buildCompletedEntries(
  urlStatuses: Record<string, string> | undefined,
  urlGeneratedFiles: Record<string, Array<{ name: string; content: string; mimeType: string }>> | undefined,
  checkpoint: AgentRunCheckpoint,
  currentUrl: string | null,
): AgentRunCompletedUrlFiles[] {
  const completedUrls = new Set<string>();

  if (urlStatuses) {
    for (const [url, status] of Object.entries(urlStatuses)) {
      if (url && url !== currentUrl && status === "completed") {
        completedUrls.add(url);
      }
    }
  }

  const uploaded = checkpoint.uploadedUrls.length > 0 ? checkpoint.uploadedUrls : checkpoint.completedUrls;
  for (const url of uploaded) {
    if (url && url !== currentUrl) {
      completedUrls.add(url);
    }
  }

  const summaries = new Map(
    (checkpoint.completedUrlSummaries ?? []).map((entry) => [entry.url, entry.postTitle || humanizeSlugFromUrl(entry.url)]),
  );

  return Array.from(completedUrls).map((url) => ({
    url,
    postTitle: summaries.get(url) || humanizeSlugFromUrl(url),
    files: normalizeGeneratedFiles(urlGeneratedFiles?.[url]),
  }));
}

function completedUrlCount(checkpoint: AgentRunCheckpoint): number {
  return checkpoint.uploadedUrls.length > 0
    ? checkpoint.uploadedUrls.length
    : checkpoint.completedUrls.length;
}

function resolveCurrentUrlFromBulk(
  bulkState: {
    currentUrl?: string;
    currentIndex?: number;
    urls?: string[];
    urlStatuses?: Record<string, string>;
  } | undefined,
  checkpoint: AgentRunCheckpoint,
  contractUrl: string | null,
): string | null {
  const urls = bulkState?.urls ?? [];
  const uploadedCount = completedUrlCount(checkpoint);
  const uploadedSet = new Set(
    (checkpoint.uploadedUrls.length > 0 ? checkpoint.uploadedUrls : checkpoint.completedUrls).map((url) =>
      url.trim(),
    ),
  );

  if (urls.length > 0) {
    if (typeof bulkState?.currentIndex === "number") {
      const indexedUrl = urls[bulkState.currentIndex]?.trim();
      if (indexedUrl && !uploadedSet.has(indexedUrl)) {
        return indexedUrl;
      }
    }

    if (uploadedCount > 0 && uploadedCount < urls.length) {
      const nextUrl = urls[uploadedCount]?.trim();
      if (nextUrl) return nextUrl;
    }

    for (const url of urls) {
      const trimmed = url?.trim();
      if (!trimmed || uploadedSet.has(trimmed)) continue;
      const status = bulkState?.urlStatuses?.[trimmed];
      if (status !== "completed" && status !== "skipped") {
        return trimmed;
      }
    }
  }

  const bulkCurrentUrl = bulkState?.currentUrl?.trim() || null;
  if (bulkCurrentUrl && !uploadedSet.has(bulkCurrentUrl)) {
    return bulkCurrentUrl;
  }

  const checkpointUrl = checkpoint.currentUrl?.trim() || null;
  if (checkpointUrl && uploadedSet.has(checkpointUrl) && urls.length > uploadedCount) {
    return urls[uploadedCount]?.trim() || checkpointUrl;
  }

  if (checkpointUrl) return checkpointUrl;

  if (typeof checkpoint.currentIndex === "number" && urls[checkpoint.currentIndex]?.trim()) {
    return urls[checkpoint.currentIndex].trim();
  }

  return contractUrl;
}

function resolvePositionLabel(
  bulkState: { currentIndex?: number; urls?: string[] } | undefined,
  checkpoint: AgentRunCheckpoint,
  currentUrl: string | null,
): string | null {
  const total = bulkState?.urls?.length ?? checkpoint.totalCount ?? null;
  if (!total || total <= 0) return null;

  if (bulkState?.urls?.length && currentUrl) {
    const idx = bulkState.urls.findIndex((url) => url.trim() === currentUrl.trim());
    if (idx >= 0) return `${idx + 1}/${total}`;
  }

  if (typeof bulkState?.currentIndex === "number") {
    return `${Math.min(bulkState.currentIndex + 1, total)}/${total}`;
  }

  if (typeof checkpoint.currentIndex === "number") {
    return `${Math.min(checkpoint.currentIndex + 1, total)}/${total}`;
  }

  const uploadedCount = completedUrlCount(checkpoint);
  return `${Math.min(uploadedCount + 1, total)}/${total}`;
}

function percentFromCheckpoint(checkpoint: AgentRunCheckpoint): number | null {
  if (!checkpoint.totalCount || checkpoint.totalCount <= 0) {
    return typeof checkpoint.currentUrlProgress === "number" ? checkpoint.currentUrlProgress : null;
  }
  const completedCount =
    checkpoint.uploadedUrls.length > 0 ? checkpoint.uploadedUrls.length : checkpoint.completedUrls.length;
  return computeBatchProgress({
    prepComplete: completedCount > 0 || (checkpoint.currentIndex ?? 0) > 0,
    completedUrls: completedCount,
    totalUrls: checkpoint.totalCount,
    currentUrlProgress: checkpoint.currentUrlProgress ?? 0,
  });
}

function snapshotFromPostCreatorResult(run: AgentRun): AgentRunLiveSnapshot | null {
  const uploaded = run.result?.uploadedPosts ?? [];
  const blocked = run.result?.blockedRows ?? [];
  if (uploaded.length === 0 && blocked.length === 0) return null;

  const completedUrlFiles = uploaded.map((post) => ({
    url: post.url,
    postTitle: post.title || humanizeSlugFromUrl(post.url),
    files: [],
  }));

  const postCount = run.result?.postCount ?? uploaded.length + blocked.length;
  const message = run.result?.message?.trim() || lastStepLabel(run);

  return {
    isLive: false,
    currentUrl: uploaded[0]?.url ?? null,
    postTitle: uploaded[0]?.title || (uploaded[0] ? humanizeSlugFromUrl(uploaded[0].url) : null),
    progressLabel: message,
    positionLabel: uploaded.length > 0 ? `${uploaded.length}/${postCount}` : null,
    percent: postCount > 0 ? Math.round((uploaded.length / postCount) * 100) : null,
    generatedFiles: [],
    completedUrlFiles,
  };
}

function snapshotFromCheckpoint(run: AgentRun, checkpoint: AgentRunCheckpoint): AgentRunLiveSnapshot {
  const contract = run.plan?.clientRunContract;
  const uploadedSet = new Set(
    (checkpoint.uploadedUrls.length > 0 ? checkpoint.uploadedUrls : checkpoint.completedUrls).map((url) =>
      url.trim(),
    ),
  );
  let resolvedCurrentUrl =
    checkpoint.currentUrl?.trim() ||
    (contract?.url && !isTaskExecutionTargetAll(contract.url) ? contract.url.trim() : null);

  if (resolvedCurrentUrl && uploadedSet.has(resolvedCurrentUrl)) {
    resolvedCurrentUrl = null;
  }

  const postTitle = resolvedCurrentUrl
    ? humanizeSlugFromUrl(resolvedCurrentUrl)
    : contract?.resolvedPost?.slug
      ? humanizeSlugFromUrl(contract.resolvedPost.link ?? contract.url)
      : null;

  const positionLabel = resolvePositionLabel(undefined, checkpoint, resolvedCurrentUrl);

  return {
    isLive: true,
    currentUrl: resolvedCurrentUrl,
    postTitle,
    progressLabel: usefulProgressMessage(checkpoint.lastMessage) || lastStepLabel(run),
    positionLabel,
    percent: percentFromCheckpoint(checkpoint),
    generatedFiles: [],
    completedUrlFiles: buildCompletedEntries(undefined, undefined, checkpoint, resolvedCurrentUrl),
  };
}

export function useAgentRunLiveSnapshot(run: AgentRun): AgentRunLiveSnapshot | null {
  const opt = useWordPressOptimization();
  const siteId = agentRunSiteId(run);
  const batchKey = resolveAgentRunBatchKey(run, siteId);
  const contract = run.plan?.clientRunContract;
  const checkpoint = useMemo(() => readAgentRunCheckpoint(run), [run]);

  const bulkBusy = batchKey ? Boolean(opt.isOptimizingContent[batchKey]) : false;
  const siteBusy = siteId ? Boolean(opt.isOptimizingContent[siteId]) : false;
  const bulkState = batchKey ? opt.bulkOptimizationState[batchKey] : undefined;
  const batchProgress = batchKey ? opt.optimizationProgress[batchKey] : undefined;
  const siteProgress = siteId ? opt.optimizationProgress[siteId] : undefined;

  return useMemo(() => {
    const hasCheckpoint =
      checkpoint.totalCount != null ||
      checkpoint.completedUrls.length > 0 ||
      checkpoint.uploadedUrls.length > 0 ||
      Boolean(checkpoint.lastMessage);

    if (run.status !== "running") {
      if (resolveAgentRunRecipeKey(run) === "post_creator" && isAgentRunTerminal(run.status)) {
        const postCreatorSnapshot = snapshotFromPostCreatorResult(run);
        if (postCreatorSnapshot) return postCreatorSnapshot;
      }
      if (isAgentRunTerminal(run.status) && hasCheckpoint) {
        const snapshot = snapshotFromCheckpoint(run, checkpoint);
        const errorLabel = run.errorMessage?.trim();
        return {
          ...snapshot,
          isLive: false,
          progressLabel: errorLabel || snapshot.progressLabel,
        };
      }
      return null;
    }

    const contextLive = bulkBusy || siteBusy || Boolean(bulkState);

    if (contextLive) {
      const contractUrl =
        contract?.url && !isTaskExecutionTargetAll(contract.url) ? contract.url.trim() : null;

      const currentUrlKey = resolveCurrentUrlFromBulk(bulkState, checkpoint, contractUrl);

      const postTitle = currentUrlKey
        ? humanizeSlugFromUrl(currentUrlKey)
        : contract?.resolvedPost?.slug
          ? humanizeSlugFromUrl(contract.resolvedPost.link ?? contract.url)
          : null;

      const progress = batchProgress ?? siteProgress;
      const step = bulkState?.currentStep || progress?.step || "";
      const message =
        usefulProgressMessage(progress?.message) ||
        usefulProgressMessage(bulkState?.currentStepProgress?.message) ||
        usefulProgressMessage(checkpoint.lastMessage) ||
        "";
      const progressLabel = buildAgentRunProgressLabel(step, message);

      const positionLabel = resolvePositionLabel(bulkState, checkpoint, currentUrlKey);

      const percent =
        typeof bulkState?.currentProgress === "number"
          ? bulkState.currentProgress
          : typeof progress?.progress === "number"
            ? progress.progress
            : percentFromCheckpoint(checkpoint);

      const generatedFiles =
        currentUrlKey && bulkState?.urlGeneratedFiles?.[currentUrlKey]
          ? normalizeGeneratedFiles(bulkState.urlGeneratedFiles[currentUrlKey])
          : normalizeGeneratedFiles(progress?.generatedFiles);

      const completedUrlFiles = buildCompletedEntries(
        bulkState?.urlStatuses,
        bulkState?.urlGeneratedFiles,
        checkpoint,
        currentUrlKey,
      );

      return {
        isLive: true,
        currentUrl: currentUrlKey,
        postTitle,
        progressLabel,
        positionLabel,
        percent,
        generatedFiles,
        completedUrlFiles,
      };
    }

    if (hasCheckpoint && checkpoint.lastStepLabel?.trim()) {
      return snapshotFromCheckpoint(run, checkpoint);
    }

    const stepLabel = checkpoint.lastStepLabel?.trim() || lastStepLabel(run);
    if (!stepLabel) return null;

    const singleUrl =
      contract?.url && !isTaskExecutionTargetAll(contract.url) ? contract.url.trim() : null;

    return {
      isLive: true,
      currentUrl: singleUrl,
      postTitle: singleUrl ? humanizeSlugFromUrl(singleUrl) : null,
      progressLabel: stepLabel,
      positionLabel: null,
      percent: null,
      generatedFiles: normalizeGeneratedFiles(siteProgress?.generatedFiles),
      completedUrlFiles: [],
    };
  }, [
    batchProgress,
    bulkBusy,
    bulkState,
    checkpoint,
    contract?.resolvedPost?.link,
    contract?.resolvedPost?.slug,
    contract?.url,
    run,
    siteBusy,
    siteProgress,
  ]);
}
