import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Copy, Download, Sparkles, Table2, Upload, X } from "lucide-react";
import type {
  CompetitorSeedMetrics,
  CompetitorSeedOverview,
  GscCompetitorDateRange,
  GscSiteQueryRow,
} from "@/lib/competitor-research/types";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { buildPortfolioBlockedHosts } from "@/lib/portfolio-link-blocklist";
import { useManagerSeedWorkspace } from "@/contexts/manager-seed-workspace-context";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import {
  fetchCompetitorResearchForTab,
  fetchManualCompetitorDomainForTab,
} from "@/lib/competitor-research/competitor-research-fetch";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import {
  filterCompetitorResearchBySelection,
  filterTieredCompetitorsBySelection,
} from "@/lib/competitor-research/competitor-selection-filter";
import {
  fetchCompetitorGscQueries,
  getDefaultGscCompetitorDateRange,
  isGscSiteNotInListFailure,
  type FetchCompetitorGscQueriesResult,
} from "@/lib/competitor-research/competitor-gsc-queries";
import { buildDemandQueriesFromSeedKeywords } from "@/lib/competitor-research/competitor-seed-demand-as-gq";
import { filterMainCompetitorResearchResponse } from "@/lib/competitor-research/filter-main-competitor-rows";
import { filterCompetitorsByGscRelevance } from "@/lib/competitor-research/filter-competitors-by-gsc-relevance";
import { runCompetitorTierAgent } from "@/lib/competitor-research/competitor-tier-agent";
import {
  runCompetitorReportAgent,
  type StrategistSectionReadyPayload,
} from "@/lib/competitor-research/competitor-report-agent";
import {
  REPORT_PIPELINE_MICRO_TOTAL,
  type CompetitorReportMicroStepPayload,
  type CompetitorReportRequestStats,
} from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { parseCompetitorGridTopPlaces } from "@/lib/competitor-research/local-dominator-grid-parse";
import { fetchGridCompetitorHostnamesParallel } from "@/lib/competitor-research/competitor-grid-dfs-client";
import { mergeGridCompetitorsAsDirectTier } from "@/lib/competitor-research/competitor-grid-tier-merge";
import { isNonMainCompetitorDomain } from "@/lib/competitor-research/filter-main-competitor-rows";
import type { CompetitorResearchSemrushResponse, TieredCompetitorsResult } from "@/lib/competitor-research/types";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ADD_COMPETITORS, NOTIFY_ALL_LINES_WERE_ALREADY_IN_THE_LIST, NOTIFY_COULD_NOT_COPY, NOTIFY_ENTER_AT_LEAST_ONE_DOMAIN_OR_URL_ONE_PER, NOTIFY_ENTER_A_SEED_SITE_URL, NOTIFY_ENTER_A_SEED_SITE_URL_FIRST, NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM, NOTIFY_EVERY_OVERLAPPING_DOMAIN_WAS_A_MEGA_PLAT, NOTIFY_GENERATE_A_REPORT_FIRST, NOTIFY_GENERATE_REPORT_FIRST, NOTIFY_GRID_IMPORT_DONE, NOTIFY_NO_COMPETITORS_RETURNED, NOTIFY_NO_COMPETITOR_ROWS_RETURNED_FOR_THIS_DOM, NOTIFY_NO_NEW_COMPETITORS_FROM_GRID, NOTIFY_NO_NEW_COMPETITORS_WERE_ADDED, NOTIFY_REPORT_GENERATED, NOTIFY_RUN_ANALYZE_AGAIN, NOTIFY_RUN_ANALYZE_FIRST, NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR, NOTIFY_SELECT_A_CONNECTED_SITE, NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL, notifyAddedXFromGrid, notifyDfsSkipX, notifyDfsXXNoWebsite, notifyDfsXXX, notifyExcludedXNonCompetitorDomainSEGY, notifyFileTooLargeMaxXMb, notifyGridImportXUpdatedX, notifyGscRelevanceFilterRemovedXCompetito, notifyGscX, notifySeedMetricsReadyX, notifySkippedInvalidLineXx, notifyUpdatedXFromGrid, notifyXDuplicateLineSSkippedAlreadyQueue, notifyXLineSCouldNotBeParsedAsADomain, notifyXLineSSkippedAlreadyInTheTable, notifyXLineSSkippedPortfolioBlocklist, notifyXLineSSkippedSameAsYourSeedSite, notifyCompetitorDataSourceWarning, notifyXX2, notifyXXX2 } from "@/lib/notify-messages";
import { MAX_LOCAL_CSV_FILE_BYTES } from "@/lib/local-dominator-csv";
import { CompetitorSiteGrid } from "@/components/research/competitor/CompetitorSiteGrid";
import { downloadCompetitorBulkContentCsv } from "@/lib/competitor-research/competitor-bulk-content-csv";
import {
  buildDomainOrganicCsvFromKeywordRows,
  DOMAIN_ORGANIC_CSV_TOP_ROWS,
} from "@/lib/competitor-research/competitor-domain-organic-csv";
import { formatCompetitorMetricCell } from "@/lib/competitor-research/competitor-report-number-format";
import type { CompetitorReportSectionIndex } from "@/lib/competitor-research/competitor-report-system-prompt";
import { cn } from "@/lib/utils";
import { Button, Field, FileInput, TextButton, TextareaField } from "@/ui";
import {
  fmtSeedMoney,
  fmtSeedNum,
  formatCompetitorReportTabProgressLine,
  formatOpenRouterPayloadBytes,  isPortfolioBlockedHost,
  REPORT_SUMMARIZE_WAIT_HINTS,
  REPORT_WRITE_WAIT_HINTS,
  safeDomainForFilename,  splitCompetitorInputLines,
  STRATEGIST_SECTION_LABELS,
  triggerDownloadCsv,
} from "@/components/research/competitor/competitor-research-tab-helpers";
import {
  GscStatusLabel,
  SeedMetricsStrip,
  SeedOverviewStrip,
} from "@/components/research/competitor/competitor-research-tab-components";
import { useCompetitorResearchState } from "@/components/research/competitor/use-competitor-research-state";
import { useCompetitorAnalyze } from "@/components/research/competitor/use-competitor-analyze";
import { useCompetitorManualAdds } from "@/components/research/competitor/use-competitor-manual-adds";
import { useCompetitorReportRun } from "@/components/research/competitor/use-competitor-report-run";
import { CompetitorResearchControls } from "@/components/research/competitor/CompetitorResearchControls";


export function CompetitorResearchTab() {
  const s = useCompetitorResearchState();
  const {
    competitorWorkspaceMode,
    tempSeedUrl,
    setTempSeedUrl,
    site,
    portfolioHosts,
    strategicBrief,
    setStrategicBrief,
    workspaceKey,
    activeWorkspaceKeyRef,
    effectiveSeedUrl,
    effectivePortfolioHosts,
    neutralResearchWire,
    semrushData,
    setSemrushData,
    gscQueries,
    setGscQueries,
    gscDateRange,
    setGscDateRange,
    gscError,
    setGscError,
    gscSkippedNotInList,
    setGscSkippedNotInList,
    tiers,
    setTiers,
    reportMd,
    setReportMd,
    keywordsMd,
    setKeywordsMd,
    phase,
    setPhase,
    error,
    setError,
    selectedCompetitorKeys,
    setSelectedCompetitorKeys,
    manualDomainInput,
    setManualDomainInput,
    pendingManualDomains,
    setPendingManualDomains,
    analyzeMode,
    setAnalyzeMode,
    semrushEnhanced,
    setSemrushEnhanced,
    gridCsvBusy,
    setGridCsvBusy,
    gridCsvProgress,
    setGridCsvProgress,
    reportPipelineStep,
    setReportPipelineStep,
    reportMicroLabel,
    setReportMicroLabel,
    reportOpenRouterStats,
    setReportOpenRouterStats,
    strategistSectionDrafts,
    setStrategistSectionDrafts,
    reportWaitHintIndex,
    gridCsvFileRef,
    onReportMicroStep,
    onKeywordsMarkdownReady,
    onStrategistSectionReady,
    semrushRows,
    semrushCsvDownloads,
  } = s;
  const analyzeActions = useCompetitorAnalyze(s);
  const manualActions = useCompetitorManualAdds(s);
  const reportActions = useCompetitorReportRun(s);
  const { toggleCompetitorSelection, toggleAllCompetitors } = analyzeActions;
  const { addManualCompetitor } = manualActions;
  const actions = { ...analyzeActions, ...manualActions, ...reportActions };

  const busy = phase !== "idle" || gridCsvBusy;

  return (
    <div className="local-analysis-panel space-y-2 px-0 py-1 sm:px-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <BarChart3 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold leading-[1.25] tracking-tight text-foreground">
          Competitor research
        </h2>
      </div>

      {competitorWorkspaceMode === "connected" && (!site || !site.siteUrl?.trim()) ? (
        <div className="neo-pulse-zone-tile--data px-2 py-3 text-base leading-normal text-muted-foreground">
          {!site
            ? "Connect a WordPress site and select it in the header, or switch to Temp seed for unconnected research."
            : "This site has no URL saved."}
        </div>
      ) : (
        <>
          <CompetitorResearchControls s={s} a={actions} busy={busy} />

          {semrushData?.seedMetrics ? <SeedMetricsStrip metrics={semrushData.seedMetrics} /> : null}
          {semrushData?.seedOverview ? <SeedOverviewStrip overview={semrushData.seedOverview} /> : null}

          {gscDateRange || gscError || gscQueries.length > 0 || gscSkippedNotInList ? (
            <GscStatusLabel
              dateRange={gscDateRange}
              queryCount={gscQueries.length}
              errorMessage={gscError}
              skippedNotInList={gscSkippedNotInList}
              demandSource={neutralResearchWire ? "dfs_seed" : "gsc"}
            />
          ) : null}

          <div className="neo-pulse-zone-tile--analysis mt-2 space-y-3 px-2 py-2 sm:px-3">
            {analyzeMode === "manual" && pendingManualDomains.length > 0 ? (
              <div className="rounded-md border border-border/50 bg-black/20 px-2 py-2">
                <p className="mb-2 min-h-[1rem] text-base leading-snug text-muted-foreground">
                  Queued competitors - metrics are fetched when you click Analyze. Paste multiple URLs in the box below, one
                  per line.
                </p>
                <ul className="space-y-1">
                  {pendingManualDomains.map((d, index) => (
                    <li
                      key={`${normalizeCompetitorDomainKey(d)}-${index}`}
                      className="flex items-center justify-between gap-2 font-mono text-base leading-normal text-foreground"
                    >
                      <span className="min-w-0 break-all">{d}</span>
                      <Button
                        size="icon" icon={X}
                        variant="quiet"
                        type="button"
                        disabled={busy}
                        aria-label={`Remove ${d} from queue`}
                        onClick={() => {
                          setPendingManualDomains((prev) => prev.filter((_, i) => i !== index));
                        }}
                      ></Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-[200px] flex-1">
                <TextareaField
                  id="competitor-manual-domain"
                  placeholder={"example.com\nhttps://competitor.com\n(one domain or URL per line)"}
                  aria-label="Competitor domains, one per line"
                  value={manualDomainInput}
                  onChange={(e) => setManualDomainInput(e.target.value)}
                  disabled={busy || (analyzeMode === "auto" && !semrushData)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      void addManualCompetitor();
                    }
                  }}
                  rows={4}
                />
              </div>
              <Button
                type="button"
                title="Add every non-empty line (Ctrl+Enter)"
                disabled={
                  busy ||
                  (analyzeMode === "auto" && !semrushData) ||
                  !manualDomainInput.trim()
                }
                onClick={() => void addManualCompetitor()}
              >
                Add rows
              </Button>
            </div>
            <CompetitorSiteGrid
              tiers={tiers}
              semrush={semrushData}
              selectedKeys={selectedCompetitorKeys}
              onToggleDomain={toggleCompetitorSelection}
              onToggleAll={toggleAllCompetitors}
            />
          </div>
        </>
      )}
    </div>
  );
}
