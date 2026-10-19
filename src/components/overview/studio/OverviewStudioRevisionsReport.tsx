import React from "react";
import type { OverviewStudioRevision } from "@/lib/overview/studio-doc-revisions-store";
import type { OverviewStudioRevisionsReport } from "@/lib/overview/overview-studio-revisions-ai-summary";
import {
  formatRevisionDateTime,
  revisionRowTitle,
  sortRevisionsChronological,
} from "@/lib/overview/studio-doc-revisions-grouping";
import { cn } from "@/lib/utils";

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
        "flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto bg-zinc-950 p-4 text-base text-zinc-200 print:bg-white print:text-black",
        className,
      )}
    >
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <p className="text-base text-muted-foreground">
          Printable summary for this version. Generate AI overview once, then print or save as PDF.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={reportLoading || revisions.length === 0}
            onClick={onGenerateReport}
            className="h-8 border-0 bg-zinc-900 px-3 text-base text-cyan-400 hover:bg-zinc-800 disabled:opacity-50"
          >
            {reportLoading ? "Generating…" : report ? "Regenerate AI summary" : "Generate AI summary"}
          </button>
          <button
            type="button"
            disabled={!report}
            onClick={onPrint}
            className="h-8 border-0 bg-zinc-900 px-3 text-base text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            Print report
          </button>
        </div>
      </div>

      {reportError ? (
        <p className="no-print text-base text-red-400" role="alert">
          {reportError}
        </p>
      ) : null}

      <article className="mx-auto w-full max-w-4xl space-y-6 print:max-w-none">
        <header className="space-y-1 border-b border-white/10 pb-4 print:border-zinc-300">
          <h2 className="text-lg font-semibold text-white print:text-black">SEO revision report</h2>
          <p className="font-semibold text-white print:text-black">{pageTitle}</p>
          <p className="font-mono text-base text-cyan-400 print:text-zinc-700">{pageUrl}</p>
          <p className="text-base text-muted-foreground print:text-zinc-600">
            {runLabel} · Report generated {generatedAt}
          </p>
        </header>

        {report ? (
          <section className="space-y-2">
            <h3 className="text-base font-semibold text-white print:text-black">Executive summary</h3>
            <p className="leading-relaxed text-zinc-200 print:text-black">{report.executiveSummary}</p>
            {report.reviewBeforePublish?.length ? (
              <div className="mt-3 space-y-1">
                <h4 className="text-base font-semibold text-amber-400 print:text-black">Review before publish</h4>
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
                className="break-inside-avoid space-y-2 border-b border-white/10 pb-6 print:border-zinc-200"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="text-base font-semibold text-white print:text-black">
                    {index + 1}. {title}
                  </h4>
                  <span className="tabular-nums text-muted-foreground print:text-zinc-600">
                    {formatRevisionDateTime(rev.at)} · {rev.changed ? "Changed" : "Unchanged"}
                  </span>
                </div>
                {summary ? (
                  <p className="leading-relaxed text-zinc-300 print:text-zinc-800">
                    <span className="font-medium text-white print:text-black">Summary: </span>
                    {summary}
                  </p>
                ) : null}
                {seo ? (
                  <p className="leading-relaxed text-zinc-400 print:text-zinc-700">
                    <span className="font-medium">SEO: </span>
                    {seo}
                  </p>
                ) : null}
                <div className="grid grid-cols-1 gap-3 print:grid-cols-2">
                  <div>
                    <p className="mb-1 text-base font-medium text-muted-foreground print:text-zinc-600">Before</p>
                    <div className="whitespace-pre-wrap bg-zinc-900 p-3 leading-relaxed print:border print:border-zinc-300 print:bg-white">
                      {rev.beforePlain.trim() || "(empty)"}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-base font-medium text-muted-foreground print:text-zinc-600">After</p>
                    <div className="whitespace-pre-wrap bg-zinc-900 p-3 leading-relaxed print:border print:border-zinc-300 print:bg-white">
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

export function printOverviewStudioRevisionsReport(): void {
  document.body.classList.add("overview-revisions-printing");
  window.print();
  window.requestAnimationFrame(() => {
    document.body.classList.remove("overview-revisions-printing");
  });
}
