import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Download, FileText, GitCompare, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import {
  OverviewRevisionComparePanes,
  OverviewRevisionListItem,
  triggerRevisionsJsonDownload,
} from "@/components/overview/studio/overview-revision-compare-ui";
import {
  OverviewStudioRevisionsReportPanel,
  printOverviewStudioRevisionsReport,
} from "@/components/overview/studio/OverviewStudioRevisionsReport";
import {
  generateOverviewStudioRevisionsReport,
  reportItemForRevision,
  type OverviewStudioRevisionsReport,
} from "@/lib/overview/overview-studio-revisions-ai-summary";
import { groupOverviewStudioRevisionsIntoRuns } from "@/lib/overview/studio-doc-revisions-grouping";
import {
  getRevisionsForUrl,
  subscribeOverviewStudioRevisions,
} from "@/lib/overview/studio-doc-revisions-store";
import {
  metaDisplayTitle,
  overviewRowUrlPathLabel,
  overviewTitlePrimarySegment,
} from "@/lib/overview/overview-tab-display";
import { cn } from "@/lib/utils";

export type OverviewStudioRevisionsPageProps = {
  row: OverviewRow;
  wpTitlesByUrl: Record<string, string>;
  siteId?: string | null;
  onBackToEditor: () => void;
};

type RevisionsViewMode = "compare" | "versions" | "report";

export function OverviewStudioRevisionsPage({
  row,
  wpTitlesByUrl,
  siteId = null,
  onBackToEditor,
}: OverviewStudioRevisionsPageProps) {
  const pageUrl = row.url;
  const list = useSyncExternalStore(
    subscribeOverviewStudioRevisions,
    () => getRevisionsForUrl(pageUrl),
    () => getRevisionsForUrl(pageUrl),
  );

  const runs = useMemo(() => groupOverviewStudioRevisionsIntoRuns(list), [list]);

  const [viewMode, setViewMode] = useState<RevisionsViewMode>("compare");
  const [activeRunKey, setActiveRunKey] = useState<string | null>(() => runs[0]?.runKey ?? null);

  useEffect(() => {
    if (runs.length === 0) {
      setActiveRunKey(null);
      return;
    }
    if (!activeRunKey || !runs.some((r) => r.runKey === activeRunKey)) {
      setActiveRunKey(runs[0]!.runKey);
    }
  }, [runs, activeRunKey, pageUrl]);

  const activeRun = runs.find((r) => r.runKey === activeRunKey) ?? runs[0] ?? null;
  const visibleList = activeRun?.revisions ?? list;

  const [selectedId, setSelectedId] = useState<string | null>(() => visibleList[0]?.id ?? null);

  useEffect(() => {
    if (visibleList.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visibleList.some((r) => r.id === selectedId)) {
      setSelectedId(visibleList[0]!.id);
    }
  }, [visibleList, selectedId, pageUrl]);

  const [reportByRunKey, setReportByRunKey] = useState<Record<string, OverviewStudioRevisionsReport>>({});
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const selected = visibleList.find((r) => r.id === selectedId) ?? visibleList[0] ?? null;
  const activeReport = activeRun ? reportByRunKey[activeRun.runKey] ?? null : null;
  const selectedItemSummary = selected ? reportItemForRevision(activeReport, selected.id) : null;

  const rawTitle = metaDisplayTitle(row, wpTitlesByUrl);
  const displayTitle =
    overviewTitlePrimarySegment(rawTitle) ||
    overviewRowUrlPathLabel(row.url) ||
    row.url;

  const generateReport = useCallback(async () => {
    if (!activeRun) return;
    setReportLoading(true);
    setReportError(null);
    try {
      const report = await generateOverviewStudioRevisionsReport({
        pageTitle: displayTitle,
        pageUrl: row.url,
        revisions: activeRun.revisions,
        siteId,
      });
      setReportByRunKey((prev) => ({ ...prev, [activeRun.runKey]: report }));
    } catch (err) {
      setReportError(err instanceof Error ? err.message : String(err));
    } finally {
      setReportLoading(false);
    }
  }, [activeRun, displayTitle, row.url, siteId]);

  const viewTabs: { id: RevisionsViewMode; label: string; icon: React.ReactNode }[] = [
    { id: "compare", label: "Compare", icon: <GitCompare className="h-4 w-4" aria-hidden /> },
    { id: "versions", label: "Version history", icon: <History className="h-4 w-4" aria-hidden /> },
    { id: "report", label: "Summary report", icon: <FileText className="h-4 w-4" aria-hidden /> },
  ];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950 font-sans text-base text-white">
      <header className="no-print flex shrink-0 flex-col gap-2 border-b border-white/10 bg-black px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBackToEditor}
            className="h-8 rounded-none border-0 bg-zinc-900 px-2.5 text-base text-white hover:bg-zinc-800"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4 text-muted-foreground" aria-hidden />
            Back to editor
          </Button>
          <div className="flex items-center gap-1.5">
            {list.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-none border-0 bg-zinc-900 px-2.5 text-base text-cyan-400 hover:bg-zinc-800 hover:text-white"
                onClick={() => triggerRevisionsJsonDownload(list)}
                title="Download revisions JSON"
              >
                <Download className="mr-1.5 h-4 w-4" aria-hidden />
                Download JSON
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
          <h1 className="text-base font-semibold text-white">{displayTitle}</h1>
          <span className="tabular-nums text-sky-400">
            {runs.length} {runs.length === 1 ? "version" : "versions"} · {list.length} steps
          </span>
        </div>
        <p className="font-mono text-base text-cyan-400">{overviewRowUrlPathLabel(row.url)}</p>
        {list.length > 0 ? (
          <nav className="flex flex-wrap gap-1 pt-1" aria-label="Revisions views">
            {viewTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 px-3 text-base transition-colors",
                  viewMode === tab.id
                    ? "bg-zinc-900 text-cyan-400"
                    : "text-zinc-300 hover:bg-zinc-900/60 hover:text-white",
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        ) : null}
      </header>

      {list.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-base text-muted-foreground">
          <p className="max-w-md text-white">No revisions recorded for this page yet.</p>
          <p>Run Auto SEO or rewrite a section, then return here to compare before and after copy.</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBackToEditor}
            className="mt-2 h-8 rounded-none border-0 bg-zinc-900 px-3 text-base text-primary hover:bg-zinc-800"
          >
            Back to editor
          </Button>
        </div>
      ) : viewMode === "report" ? (
        <OverviewStudioRevisionsReportPanel
          pageTitle={displayTitle}
          pageUrl={row.url}
          runLabel={activeRun?.label ?? "All revisions"}
          revisions={visibleList}
          report={activeReport}
          reportError={reportError}
          reportLoading={reportLoading}
          onGenerateReport={() => void generateReport()}
          onPrint={printOverviewStudioRevisionsReport}
        />
      ) : viewMode === "versions" ? (
        <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
          <aside className="no-print flex w-[min(100%,22rem)] shrink-0 flex-col border-r border-white/10 bg-black">
            <p className="shrink-0 px-3 py-2 text-base text-muted-foreground">
              Select a version (newest first). Each run is one Auto SEO or optimize session.
            </p>
            <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Version history">
              {runs.map((run, index) => {
                const selectedRun = run.runKey === activeRunKey;
                return (
                  <li key={run.runKey}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRunKey(run.runKey);
                        setViewMode("compare");
                      }}
                      className={cn(
                        "flex w-full flex-col gap-1 border-b border-white/10 px-3 py-3 text-left text-base transition-colors",
                        selectedRun ? "bg-zinc-900 text-white" : "text-zinc-200 hover:bg-zinc-900/60",
                      )}
                    >
                      <span className="font-medium text-white">
                        {index === 0 ? "Current version" : `Version ${runs.length - index}`}
                      </span>
                      <span className="text-base text-muted-foreground">{run.label}</span>
                      {reportByRunKey[run.runKey]?.executiveSummary ? (
                        <span className="line-clamp-2 text-base text-zinc-400">
                          {reportByRunKey[run.runKey]!.executiveSummary}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
            {activeRun ? (
              <>
                <p className="shrink-0 text-base text-muted-foreground">{activeRun.label}</p>
                <ul className="min-h-0 flex-1 overflow-y-auto bg-black" aria-label="Steps in this version">
                  {activeRun.revisions.map((rev) => (
                    <OverviewRevisionListItem
                      key={rev.id}
                      rev={rev}
                      selected={false}
                      onSelect={() => {
                        setSelectedId(rev.id);
                        setViewMode("compare");
                      }}
                    />
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
          <aside className="no-print flex w-[min(100%,20rem)] shrink-0 flex-col border-r border-white/10 bg-black">
            {runs.length > 1 ? (
              <label className="flex shrink-0 flex-col gap-1 border-b border-white/10 px-3 py-2">
                <span className="text-base text-muted-foreground">Version</span>
                <select
                  value={activeRunKey ?? ""}
                  onChange={(e) => setActiveRunKey(e.target.value)}
                  className="h-8 border-0 bg-zinc-900 px-2 text-base text-white focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Revision version"
                >
                  {runs.map((run, index) => (
                    <option key={run.runKey} value={run.runKey}>
                      {index === 0 ? "Current · " : ""}
                      {run.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Revision steps">
              {visibleList.map((rev) => (
                <OverviewRevisionListItem
                  key={rev.id}
                  rev={rev}
                  selected={rev.id === selected?.id}
                  onSelect={() => setSelectedId(rev.id)}
                />
              ))}
            </ul>
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-4">
            {selected ? (
              <>
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                  <p className="text-base font-semibold text-white">
                    {selected.stepLabel}
                    {selected.sectionTitle?.trim() && selected.sectionTitle !== selected.stepLabel
                      ? ` · ${selected.sectionTitle.trim()}`
                      : null}
                  </p>
                  {!activeReport ? (
                    <button
                      type="button"
                      disabled={reportLoading}
                      onClick={() => void generateReport()}
                      className="no-print h-8 border-0 bg-zinc-900 px-2.5 text-base text-cyan-400 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {reportLoading ? "Summarizing…" : "AI summary for this version"}
                    </button>
                  ) : null}
                </div>
                {selectedItemSummary ? (
                  <div className="shrink-0 space-y-1 bg-zinc-900 px-3 py-2">
                    <p className="text-base font-medium text-cyan-400">AI change overview</p>
                    <p className="leading-relaxed text-zinc-200">{selectedItemSummary.changeSummary}</p>
                    {selectedItemSummary.seoImpact?.trim() ? (
                      <p className="text-base text-muted-foreground">
                        <span className="text-white">SEO: </span>
                        {selectedItemSummary.seoImpact}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <OverviewRevisionComparePanes rev={selected} className="min-h-0 flex-1" />
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
