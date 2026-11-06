import React from "react";
import type { OverviewStudioRevision } from "@/lib/overview/studio-doc-revisions-store";
import type { OverviewStudioRevisionsReport } from "@/lib/overview/overview-studio-revisions-ai-summary";
import {
  formatRevisionDateTime,
  revisionRowTitle,
  sortRevisionsChronological,
} from "@/lib/overview/studio-doc-revisions-grouping";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

export type OverviewStudioRevisionsReportPanelProps = {
  pageTitle: string;
  pageUrl: string;
  runLabel: string;
  revisions: OverviewStudioRevision[];
  report: OverviewStudioRevisionsReport | null;
  reportError: string | null;
  reportLoading: boolean;
  onGenerateReport: () => void;
  onPrint: () => void;
  className?: string;
};

function itemSummary(
  report: OverviewStudioRevisionsReport | null,
  revisionId: string,
): string | null {
  if (!report) return null;
  return report.items.find((i) => i.revisionId === revisionId)?.changeSummary ?? null;
}

function itemSeo(
  report: OverviewStudioRevisionsReport | null,
  revisionId: string,
): string | null {
  if (!report) return null;
  return report.items.find((i) => i.revisionId === revisionId)?.seoImpact?.trim() || null;
}

export function OverviewStudioRevisionsReportPanel({
  pageTitle,
  pageUrl,
  runLabel,
  revisions,
  report,
  reportError,
  reportLoading,
  onGenerateReport,
  onPrint,
  className,
}: OverviewStudioRevisionsReportPanelProps) {
  const ordered = sortRevisionsChronological(revisions);
  const generatedAt = formatRevisionDateTime(Date.now());

  return (
    <div
      id="overview-revisions-print-root"
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto bg-black p-4 text-base text-foreground print:bg-white print:text-black",
        className,
      )}
    >
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <p className="text-base text-muted-foreground">
          Printable summary for this version. Generate AI overview once, then print or save as PDF.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={reportLoading || revisions.length === 0}
            onClick={onGenerateReport}
          >
            {reportLoading ? "Generating…" : report ? "Regenerate AI summary" : "Generate AI summary"}
          </Button>
          <Button
            disabled={!report}
            onClick={onPrint}
          >
            Print report
          </Button>
        </div>
      </div>

      {reportError ? (
        <p className="no-print text-base text-ui-danger-hover" role="alert">
          {reportError}
        </p>
      ) : null}

      <article className="mx-auto w-full max-w-4xl space-y-6 print:max-w-none">
        <header className="space-y-1 border-b border-white/10 pb-4 print:border-border">
          <h2 className="text-lg font-semibold text-white print:text-black">SEO revision report</h2>
          <p className="font-semibold text-white print:text-black">{pageTitle}</p>
          <p className="font-mono text-base text-semantic-analysis-foreground print:text-black">{pageUrl}</p>
          <p className="text-base text-muted-foreground print:text-muted-foreground">
            {runLabel} · Report generated {generatedAt}
          </p>
        </header>

        {report ? (
          <section className="space-y-2">
            <h3 className="text-base font-semibold text-white print:text-black">Executive summary</h3>
            <p className="leading-relaxed text-foreground print:text-black">{report.executiveSummary}</p>
            {report.reviewBeforePublish?.length ? (
              <div className="mt-3 space-y-1">
                <h4 className="text-base font-semibold text-semantic-warning-foreground print:text-black">Review before publish</h4>
                <ul className="list-disc space-y-1 pl-5">
                  {report.reviewBeforePublish.map((line) => (
                    <li key={line} className="leading-relaxed">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : (
          <p className="text-base text-muted-foreground print:hidden">
            Generate the AI summary to fill the executive overview and per-step change notes below.
          </p>
        )}

        <section className="space-y-6">
          <h3 className="text-base font-semibold text-white print:text-black">
            Changes ({ordered.length} steps)
          </h3>
          {ordered.map((rev, index) => {
            const title = revisionRowTitle(rev);
            const summary = itemSummary(report, rev.id);
            const seo = itemSeo(report, rev.id);
            return (
              <div
                key={rev.id}
                className="break-inside-avoid space-y-2 border-b border-white/10 pb-6 print:border-border"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="text-base font-semibold text-white print:text-black">
                    {index + 1}. {title}
                  </h4>
                  <span className="tabular-nums text-muted-foreground print:text-muted-foreground">
                    {formatRevisionDateTime(rev.at)} · {rev.changed ? "Changed" : "Unchanged"}
                  </span>
                </div>
                {summary ? (
                  <p className="leading-relaxed text-foreground print:text-black">
                    <span className="font-medium text-white print:text-black">Summary: </span>
                    {summary}
                  </p>
                ) : null}
                {seo ? (
                  <p className="leading-relaxed text-muted-foreground print:text-black">
                    <span className="font-medium">SEO: </span>
                    {seo}
                  </p>
                ) : null}
                <div className="grid grid-cols-1 gap-3 print:grid-cols-2">
                  <div>
                    <p className="mb-1 text-base font-medium text-muted-foreground print:text-muted-foreground">Before</p>
                    <div className="whitespace-pre-wrap bg-ui-field p-3 leading-relaxed print:border print:border-border print:bg-white">
                      {rev.beforePlain.trim() || "(empty)"}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-base font-medium text-muted-foreground print:text-muted-foreground">After</p>
                    <div className="whitespace-pre-wrap bg-ui-field p-3 leading-relaxed print:border print:border-border print:bg-white">
                      {rev.afterPlain.trim() || "(empty)"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </article>
    </div>
  );
}