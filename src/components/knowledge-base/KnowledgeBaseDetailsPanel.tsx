import { Activity } from "lucide-react";
import { Progress } from "@/ui";

import { SiteScraperTargetingSequence } from "@/components/knowledge-base/SiteScraperTargetingSequence";
import { SCRAPER_STEP_LABELS } from "@/lib/knowledge-base/scraper-constants";
import type { ScraperLogEntry } from "@/lib/knowledge-base/types";
import {
  WorkspaceDetailsKvRow,
  WorkspaceDetailsSection,
  WorkspaceDetailsStack,
} from "@/components/shared/WorkspaceDetailsStack";

export type KnowledgeBaseDetailsPanelProps = {
  profileName?: string | null;
  fileCount?: number;
  scraperUrl?: string;
  isUploading: boolean;
  uploadProgress: number;
  isScraping: boolean;
  scraperProgress: number;
  scraperStep: string | null;
  scraperLog: ScraperLogEntry[];
};

export function KnowledgeBaseDetailsPanel({
  profileName,
  fileCount = 0,
  scraperUrl,
  isUploading,
  uploadProgress,
  isScraping,
  scraperProgress,
  scraperStep,
  scraperLog,
}: KnowledgeBaseDetailsPanelProps) {
  const mode = isUploading ? "Upload" : isScraping ? "Scrape" : "Idle";
  let kvIndex = 0;

  return (
    <WorkspaceDetailsStack>
      <WorkspaceDetailsSection title="Workspace" stripeIndex={0}>
        {profileName ? (
          <WorkspaceDetailsKvRow label="Profile" value={profileName} stripeIndex={kvIndex++} />
        ) : null}
        <WorkspaceDetailsKvRow label="Mode" value={mode} stripeIndex={kvIndex++} />
        {fileCount > 0 ? (
          <WorkspaceDetailsKvRow label="Files" value={String(fileCount)} stripeIndex={kvIndex++} />
        ) : null}
        {scraperUrl ? (
          <WorkspaceDetailsKvRow label="Scrape URL" value={scraperUrl} stripeIndex={kvIndex++} />
        ) : null}
      </WorkspaceDetailsSection>

      <WorkspaceDetailsSection title="Run detail" stripeIndex={1} defaultOpen>
        {isUploading ? (
          <>
            <WorkspaceDetailsKvRow label="Phase" value="Chunking files" stripeIndex={0} />
            <div className="space-y-2 px-2.5 py-2 sm:px-3">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-muted-foreground">{uploadProgress}% completed</p>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-2.5 py-2 sm:px-3">
              <div className="flex items-center gap-2 font-mono text-primary">
                <Activity className="h-4 w-4" aria-hidden />
                <span>Site Scraper Telemetry</span>
              </div>
              <span className="font-mono text-muted-foreground">
                {isScraping ? "ONLINE" : "IDLE"} · {scraperProgress}%
              </span>
            </div>
            <WorkspaceDetailsKvRow
              label="Sequence"
              value={scraperStep ? SCRAPER_STEP_LABELS[scraperStep] || scraperStep : "Idle"}
              stripeIndex={1}
            />
            <div className="px-2.5 py-2 sm:px-3">
              <Progress value={scraperProgress} className="h-1.5 bg-primary/10" />
            </div>
            <SiteScraperTargetingSequence currentStepKey={scraperStep} />
            <div className="max-h-48 space-y-1 overflow-y-auto border-0 bg-black p-2">
              {scraperLog.length === 0 ? (
                <p className="font-mono text-muted-foreground">
                  Awaiting telemetry. Pages appear here as they are scraped.
                </p>
              ) : (
                scraperLog.map((entry) => (
                  <div
                    key={`${entry.index}-${entry.url}`}
                    className="flex items-start gap-2 font-mono text-base text-foreground"
                  >
                    <span className="text-primary">
                      [{entry.index}/{entry.total}]
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="break-words">{entry.title}</div>
                      <div className="break-words text-muted-foreground">{entry.url}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </WorkspaceDetailsSection>
    </WorkspaceDetailsStack>
  );
}
