import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { OptimizationArtifactDownloads } from "@/components/integrations/wordpress/OptimizationArtifactDownloads";
import {
  CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
  CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { WorkspaceDetailsLiveMessage } from "@/components/shared/WorkspaceDetailsStack";
import { formatAgentRunLogTimeline } from "@/lib/agent-runs/agent-run-log-format";
import {
  agentRunShowsBrowserPreview,
  agentRunShowsUrlProgress,
  resolveAgentRunRecipeKey,
} from "@/lib/agent-runs/agent-run-navigation";
import { findAgentRunBrowserPreviewArtifact, agentRunBrowserPreviewBase64FromArtifact } from "@/lib/agent-runs/agent-run-browser-preview";
import {
  downloadAgentRunLog,
  downloadWorkflowRunAgentLogs,
  workflowRunIdFromAgentRun,
} from "@/lib/agent-runs/agent-run-log-download";
import { useTeam } from "@/contexts/TeamContext";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import type { AgentRun, AgentRunUploadedPost } from "@/lib/agent-runs-types";
import { isAgentRunTerminal } from "@/lib/agent-runs-types";
import { cn } from "@/lib/utils";
import { driveFolderDisplayName, driveFolderMonthLeafName } from "@/lib/google-drive/google-drive-folder-hierarchy";
import { useAgentRunLiveSnapshot } from "./use-agent-run-live-snapshot";
import { useAgentRunEnrichedProgressSteps } from "./use-agent-run-enriched-progress-steps";
import { AgentRunProgressLog } from "./AgentRunProgressLog";
import { AgentRunBrowserPreviewModal } from "./AgentRunBrowserPreviewModal";
import { ChatGptAuditQueryPanel } from "./ChatGptAuditQueryPanel";
import { Button } from "@/ui";
type AgentRunsDetailsDrawerProps = {
  run: AgentRun;
  resumable?: boolean;
  showCancel?: boolean;
  showResume?: boolean;
  onCancel?: () => void;
  onResume?: () => void;
};

function agentRunUploadedPostsForDisplay(run: AgentRun): AgentRunUploadedPost[] {
  const posts = run.result?.uploadedPosts ?? [];
  if (posts.length > 0) return posts;
  return (run.result?.urls ?? []).map((url) => ({ url }));
}

function googleDriveResultLinkLabel(run: AgentRun, url: string): string {
  if (!url.includes("/drive/folders/")) return "Open in Google Docs";
  const candidates = [
    run.result?.googleDriveFolderLabel ?? "",
    (run.result?.googleDriveFoldersCreated ?? []).join(" / "),
    ...(run.steps ?? []).map((step) => step.label),
  ];
  for (const candidate of candidates) {
    const month = driveFolderMonthLeafName(candidate);
    if (month) return month;
  }
  return driveFolderDisplayName(run.result?.googleDriveFolderLabel ?? "") || "View folder";
}

export function AgentRunsDetailsDrawer({
  run,
  resumable = false,
  showCancel = false,
  showResume = false,
  onCancel,
  onResume,
}: AgentRunsDetailsDrawerProps) {
  const [browserPreviewOpen, setBrowserPreviewOpen] = useState(false);
  const live = useAgentRunLiveSnapshot(run);
  const { activeTeam } = useTeam();
  const { refreshRuns, runs } = useAgentRunsContext();
  const isRunning = !isAgentRunTerminal(run.status);
  const workflowRunId = useMemo(() => workflowRunIdFromAgentRun(run), [run]);
  const workflowRunLogCount = useMemo(() => {
    if (!workflowRunId) return 0;
    return runs.filter((item) => workflowRunIdFromAgentRun(item) === workflowRunId).length;
  }, [runs, workflowRunId]);
  const showResumableError = resumable && Boolean(run.errorMessage?.trim());
  const progressSteps = useAgentRunEnrichedProgressSteps(run, live?.progressLabel ?? null);
  const timelineRows = formatAgentRunLogTimeline(run, progressSteps, live?.progressLabel ?? null);
  const recipeKey = resolveAgentRunRecipeKey(run);
  const showsUrlProgress = agentRunShowsUrlProgress(recipeKey);
  const showsBrowserPreview = agentRunShowsBrowserPreview(recipeKey);
  const browserPreviewArtifact = findAgentRunBrowserPreviewArtifact(run);
  const browserPreviewStep = run.steps?.find((step) => step.stepKey === "browser_preview");
  const liveScreenshotBase64 = agentRunBrowserPreviewBase64FromArtifact(browserPreviewArtifact);
  const previewCacheKey = browserPreviewStep?.updatedAt ?? browserPreviewStep?.createdAt ?? null;

  const currentUrl = showsUrlProgress ? (live?.currentUrl ?? null) : null;
  const postTitle = live?.postTitle ?? null;
  const generatedFiles = live?.generatedFiles ?? [];

  const uploadedPosts = agentRunUploadedPostsForDisplay(run);
  const showsUploadedPosts =
    (recipeKey === "post_creator" || recipeKey === "entity_page_creator") &&
    (uploadedPosts.length > 0 || (recipeKey === "post_creator" && Boolean(run.result?.blockedRows?.length)));

  let stripeIndex = 0;

  return (
    <div className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS}>
      {showResumableError ? (
        <WorkspaceDetailsLiveMessage message={run.errorMessage!.trim()} stripeIndex={stripeIndex++} />
      ) : null}

      {showsUrlProgress && currentUrl ? (
        <div
          className={cn(
            contentOptimizerRowStripeClass(stripeIndex++, { isActiveOptimize: isRunning && Boolean(currentUrl) }),
            isRunning && currentUrl && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
          )}
        >
          <div className="agent-runs-card__current border-0 px-2.5 py-2 sm:px-3">
            <div className="agent-runs-card__current-link min-h-[1.5rem]">
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "text-base font-semibold underline [overflow-wrap:anywhere]",
                  isRunning
                    ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS
                    : "text-semantic-analysis-foreground hover:text-semantic-analysis-foreground",
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {postTitle || currentUrl}
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {showsUploadedPosts ? (
        <div className={contentOptimizerRowStripeClass(stripeIndex++)}>
          <div className="space-y-2 border-0 px-2.5 py-2 sm:px-3">
            {uploadedPosts.length ? (
              <div>
                <p className="text-base text-muted-foreground">
                  {recipeKey === "entity_page_creator" ? "Created pages" : "Uploaded posts"}
                </p>
                <ul className="mt-1 space-y-1">
                  {uploadedPosts.map((post) => (
                    <li key={post.url}>
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-base font-semibold text-semantic-analysis-foreground hover:underline [overflow-wrap:anywhere]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {post.title || post.url}
                      </a>
                      {post.postId != null || post.scheduledFor ? (
                        <span className="ml-2 text-base text-muted-foreground">
                          {post.postId != null ? `ID ${post.postId}` : ""}
                          {post.postId != null && post.scheduledFor ? ", " : ""}
                          {post.scheduledFor ? `scheduled ${post.scheduledFor}` : ""}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {recipeKey === "post_creator" && run.result?.blockedRows?.length ? (
              <div>
                <p className="text-base text-muted-foreground">Blocked (cannibalization)</p>
                <ul className="mt-1 space-y-1">
                  {run.result.blockedRows.map((row) => (
                    <li key={`${row.keyword}-${row.reason}`} className="text-base text-foreground [overflow-wrap:anywhere]">
                      {row.keyword}: {row.reason}
                      {row.conflictingUrl ? (
                        <>
                          {" "}
                          <a
                            href={row.conflictingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-semantic-analysis-foreground hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {row.conflictingUrl}
                          </a>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {recipeKey === "chatgpt_website_audit" ? (
        <div className={contentOptimizerRowStripeClass(stripeIndex++)}>
          <div className="border-0 px-2.5 py-2 sm:px-3">
            <ChatGptAuditQueryPanel
              run={run}
              isRunning={isRunning}
              onRefresh={() => {
                void refreshRuns();
              }}
            />
          </div>
        </div>
      ) : null}

      {typeof run.result?.googleDriveWebViewLink === "string" &&
      run.result.googleDriveWebViewLink.trim() ? (
        <div className={contentOptimizerRowStripeClass(stripeIndex++)}>
          <div className="border-0 px-2.5 py-2 sm:px-3">
            <p className="text-base text-muted-foreground">Google Drive</p>
            <a
              href={run.result.googleDriveWebViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-base font-semibold text-semantic-analysis-foreground hover:underline [overflow-wrap:anywhere]"
              onClick={(e) => e.stopPropagation()}
            >
              {googleDriveResultLinkLabel(run, run.result.googleDriveWebViewLink)}
            </a>
          </div>
        </div>
      ) : null}

      <div className={contentOptimizerRowStripeClass(stripeIndex++)}>
        <div className="border-0 py-1 px-2.5 sm:px-3">
          <AgentRunProgressLog rows={timelineRows} />
        </div>
      </div>

      <div className={contentOptimizerRowStripeClass(stripeIndex++)}>
        <div className="flex min-h-[2.75rem] min-w-0 items-center gap-2 border-0 px-2.5 py-2 sm:px-3">
          {showCancel ? (
            <Button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancel?.();
              }}
            >
              Cancel
            </Button>
          ) : showResume ? (
            <Button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onResume?.();
              }}
            >
              Resume
            </Button>
          ) : null}
          {showsBrowserPreview && (isRunning || browserPreviewArtifact) ? (
            <Button
              variant="quiet"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setBrowserPreviewOpen(true);
              }}
            >
              View browser
            </Button>
          ) : null}
          <Button
            variant="quiet"
            type="button"
            aria-label="Download log (JSON)"
            onClick={(e) => {
              e.stopPropagation();
              void downloadAgentRunLog(run, progressSteps, activeTeam?.id ?? null);
            }}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
          </Button>
          {workflowRunId && workflowRunLogCount > 1 ? (
            <Button
              variant="quiet"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void downloadWorkflowRunAgentLogs(activeTeam?.id ?? null, workflowRunId, runs);
              }}
            >
              All logs ({workflowRunLogCount})
            </Button>
          ) : null}
          {generatedFiles.length > 0 ? (
            <div className="ml-auto min-w-0">
              <OptimizationArtifactDownloads files={generatedFiles} variant="details" />
            </div>
          ) : null}
        </div>
      </div>

      {showsBrowserPreview ? (
        <AgentRunBrowserPreviewModal
          run={run}
          open={browserPreviewOpen}
          onOpenChange={setBrowserPreviewOpen}
          timelineRows={timelineRows}
          liveScreenshotBase64={liveScreenshotBase64}
          liveLabel={live?.progressLabel ?? browserPreviewStep?.label ?? null}
          previewCacheKey={previewCacheKey}
        />
      ) : null}
    </div>
  );
}
