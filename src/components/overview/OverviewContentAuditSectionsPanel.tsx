import { Download, FileText } from "lucide-react";
import type { ContentAuditIssueRow } from "@/lib/overview/overview-content-analyze-fix";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

export type OverviewContentAuditSectionUiRow = {
  sectionIndex: number;
  title: string;
  html: string;
  status: "waiting" | "auditing" | "done";
  /** Issues kept for this slice after per-section QA (optional JSON download). */
  sliceIssues?: ContentAuditIssueRow[];
};

function triggerDownloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeFilenamePart(s: string): string {
  return s.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60) || "section";
}

const FINDING_SUMMARY_MAX = 220;
const MAX_FINDINGS_SHOWN = 8;

function clampSummary(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function ContentAuditSectionDoneSummary({ issues }: { issues: ContentAuditIssueRow[] }) {
  if (issues.length === 0) {
    return <span>No findings in this section.</span>;
  }
  const hidden = issues.length - MAX_FINDINGS_SHOWN;
  return (
    <ul className="mt-1 list-none space-y-2 border-l-2 border-border pl-3">
      {issues.slice(0, MAX_FINDINGS_SHOWN).map((iss, fi) => (
        <li key={fi} className="space-y-0.5">
          <div className="font-medium text-foreground">
            {iss.title?.trim() || `Finding ${fi + 1}`}
          </div>
          {iss.issue?.trim() ? (
            <div className="text-base text-muted-foreground">
              {clampSummary(iss.issue, FINDING_SUMMARY_MAX)}
            </div>
          ) : null}
          {iss.proposedFix?.trim() ? (
            <div className="text-base text-muted-foreground">
              <span className="font-medium text-foreground">Proposed fix: </span>
              {clampSummary(iss.proposedFix, FINDING_SUMMARY_MAX)}
            </div>
          ) : null}
        </li>
      ))}
      {hidden > 0 ? (
        <li className="text-base italic text-muted-foreground">+{hidden} more in JSON</li>
      ) : null}
    </ul>
  );
}

export interface OverviewContentAuditSectionsPanelProps {
  sections: OverviewContentAuditSectionUiRow[];
  isProcessing: boolean;
}

export function OverviewContentAuditSectionsPanel({
  sections,
  isProcessing,
}: OverviewContentAuditSectionsPanelProps) {
  if (sections.length === 0) return null;

  const doneCount = sections.filter((s) => s.status === "done").length;
  const pct = Math.round((doneCount / Math.max(sections.length, 1)) * 100);

  return (
    <div className={cn("mt-3 space-y-3 rounded-lg bg-black/25 p-3 sm:p-4")}>
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-base font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Content audit sections
          </h3>
        </div>
      </div>

      {isProcessing ? (
        <div className="space-y-1.5">
          <div className="neo-pulse-competitor-progress-track rounded-sm">
            <div
              className="neo-pulse-competitor-progress-fill h-2 rounded-sm transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="text-base text-muted-foreground">
            {doneCount}/{sections.length} sections complete
          </p>
        </div>
      ) : null}

      <ul className="space-y-2" aria-label="Content audit section list">
        {sections.map((s) => (
          <li
            key={`audit-sec-${s.sectionIndex}-${s.title}`}
            className="flex flex-col gap-2 rounded-md bg-black/20 px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="flex min-w-0 items-start gap-2">
              {s.status === "auditing" ? (
                null
              ) : s.status === "done" ? (
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary/80" aria-hidden />
              ) : (
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden />
              )}
              <div className="min-w-0">
                <div className="break-words text-base font-medium text-foreground">
                  <span className="text-muted-foreground">{s.sectionIndex + 1}. </span>
                  {s.title || `Section ${s.sectionIndex + 1}`}
                </div>
                <div className="space-y-2 text-base text-muted-foreground">
                  {s.status === "waiting" && <span>Waiting</span>}
                  {s.status === "auditing" && <span>Auditing</span>}
                  {s.status === "done" ? (
                    <ContentAuditSectionDoneSummary issues={s.sliceIssues ?? []} />
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {s.status === "done" && (s.html?.length ?? 0) > 0 ? (
                <Button
                  type="button"
                  onClick={() =>
                    triggerDownloadTextFile(
                      `audit-section-${s.sectionIndex + 1}-${sanitizeFilenamePart(s.title)}.html`,
                      s.html,
                      "text/html",
                    )
                  }
                >
                  <Download className="mr-1.5 h-4 w-4" aria-hidden />
                  HTML
                </Button>
              ) : null}
              {s.status === "done" ? (
                <Button
                  variant="quiet"
                  type="button"
                  onClick={() =>
                    triggerDownloadTextFile(
                      `audit-section-${s.sectionIndex + 1}-${sanitizeFilenamePart(s.title)}-issues.json`,
                      JSON.stringify({ issues: s.sliceIssues ?? [] }, null, 2),
                      "application/json",
                    )
                  }
                >
                  JSON
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
