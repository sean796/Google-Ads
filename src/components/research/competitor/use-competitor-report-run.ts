import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CompetitorSeedMetrics,
  CompetitorSeedOverview,
  GscCompetitorDateRange,
  GscSiteQueryRow,
} from "@/lib/competitor-research/types";
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
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ADD_COMPETITORS, NOTIFY_ALL_LINES_WERE_ALREADY_IN_THE_LIST, NOTIFY_COULD_NOT_COPY, NOTIFY_ENTER_AT_LEAST_ONE_DOMAIN_OR_URL_ONE_PER, NOTIFY_ENTER_A_SEED_SITE_URL, NOTIFY_ENTER_A_SEED_SITE_URL_FIRST, NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM, NOTIFY_EVERY_OVERLAPPING_DOMAIN_WAS_A_MEGA_PLAT, NOTIFY_GENERATE_A_REPORT_FIRST, NOTIFY_GENERATE_REPORT_FIRST, NOTIFY_GRID_IMPORT_DONE, NOTIFY_NO_COMPETITORS_RETURNED, NOTIFY_NO_COMPETITOR_ROWS_RETURNED_FOR_THIS_DOM, NOTIFY_NO_NEW_COMPETITORS_FROM_GRID, NOTIFY_NO_NEW_COMPETITORS_WERE_ADDED, NOTIFY_REPORT_GENERATED, NOTIFY_RUN_ANALYZE_AGAIN, NOTIFY_RUN_ANALYZE_FIRST, NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR, NOTIFY_SELECT_A_CONNECTED_SITE, NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL, notifyAddedXFromGrid, notifyDfsSkipX, notifyDfsXXNoWebsite, notifyDfsXXX, notifyExcludedXNonCompetitorDomainSEGY, notifyFileTooLargeMaxXMb, notifyGridImportXUpdatedX, notifyGscRelevanceFilterRemovedXCompetito, notifyGscX, notifySeedMetricsReadyX, notifySkippedInvalidLineXx, notifyUpdatedXFromGrid, notifyXDuplicateLineSSkippedAlreadyQueue, notifyXLineSCouldNotBeParsedAsADomain, notifyXLineSSkippedAlreadyInTheTable, notifyXLineSSkippedPortfolioBlocklist, notifyXLineSSkippedSameAsYourSeedSite, notifyCompetitorDataSourceWarning, notifyXX2, notifyXXX2 } from "@/lib/notify-messages";
import { downloadCompetitorBulkContentCsv } from "@/lib/competitor-research/competitor-bulk-content-csv";
import type { CompetitorReportSectionIndex } from "@/lib/competitor-research/competitor-report-system-prompt";
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
import type { CompetitorResearchState } from "@/components/research/competitor/use-competitor-research-state";
import { useCompetitorReportDownloads } from "@/components/research/competitor/use-competitor-report-downloads";

export function useCompetitorReportRun(s: CompetitorResearchState) {
  const {
    competitorWorkspaceMode,
    site,
    strategicBrief,
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
    setGscError,
    setGscSkippedNotInList,
    tiers,
    setTiers,
    reportMd,
    setReportMd,
    keywordsMd,
    setKeywordsMd,
    setPhase,
    error,
    setError,
    selectedCompetitorKeys,
    setSelectedCompetitorKeys,
    analyzeMode,
    semrushEnhanced,
    setReportPipelineStep,
    setReportMicroLabel,
    reportOpenRouterStats,
    setReportOpenRouterStats,
    strategistSectionDrafts,
    setStrategistSectionDrafts,
    onReportMicroStep,
    onKeywordsMarkdownReady,
    onStrategistSectionReady,
  } = s;
const generateReport = useCallback(async () => {
  if (!semrushData || !tiers) {
    notify.error(NOTIFY_RUN_ANALYZE_FIRST);
    return;
  }
  if (selectedCompetitorKeys.size === 0) {
    notify.error(NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR);
    return;
  }
  if (competitorWorkspaceMode === "connected") {
    if (!site?.siteUrl?.trim() || !site?.id) {
      notify.error(NOTIFY_SELECT_A_CONNECTED_SITE);
      return;
    }
  } else if (!effectiveSeedUrl) {
    notify.error(NOTIFY_ENTER_A_SEED_SITE_URL);
    return;
  }

  const runKeySnapshot = workspaceKey;
  const seedForApi = effectiveSeedUrl;
  const reportSiteId = neutralResearchWire ? undefined : site?.id;
  const reportSiteName = neutralResearchWire ? undefined : site?.name;
  const reportSiteUrl = neutralResearchWire ? undefined : site ? getPublicSiteUrl(site) : undefined;
  setError(null);

  try {
    const beforeRefetchSr = semrushData;
    const beforeRefetchTiers = tiers;
    const beforeRefetchKeys = new Set(selectedCompetitorKeys);

    setPhase("report");
    setReportPipelineStep(0);
    setReportMicroLabel(null);
    setReportOpenRouterStats(null);
    setStrategistSectionDrafts({});
    setKeywordsMd(null);

    let srForReport = semrushData;
    let tiersForReport = tiers;
    let gscForReport: GscSiteQueryRow[] = gscQueries;
    let gscDateForReport: GscCompetitorDateRange | null = gscDateRange;
    let mergedKeys = selectedCompetitorKeys;

    if (analyzeMode === "auto") {
      let srRaw: Awaited<ReturnType<typeof fetchCompetitorResearchForTab>>;
      let gscRes: FetchCompetitorGscQueriesResult;

      if (neutralResearchWire) {
        srRaw = await fetchCompetitorResearchForTab({
          semrushEnhanced,
          siteUrl: seedForApi,
          portfolioBlockedHosts: effectivePortfolioHosts,
          displayLimit: 50,
        });
      } else {
        const [srR, gscR] = await Promise.all([
          fetchCompetitorResearchForTab({
            semrushEnhanced,
            siteUrl: seedForApi,
            portfolioBlockedHosts: effectivePortfolioHosts,
            displayLimit: 50,
          }),
          fetchCompetitorGscQueries({ siteUrl: seedForApi }),
        ]);
        srRaw = srR;
        gscRes = gscR;
      }

      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        setReportPipelineStep(0);
        setReportMicroLabel(null);
        setReportOpenRouterStats(null);
        setStrategistSectionDrafts({});
        return;
      }

      if (!neutralResearchWire) {
        setGscDateRange(gscRes.dateRange);
        if (gscRes.ok === false) {
          setGscQueries([]);
          if (isGscSiteNotInListFailure(gscRes)) {
            setGscError(null);
            setGscSkippedNotInList(true);
          } else {
            setGscError(gscRes.error);
            setGscSkippedNotInList(false);
            notify.warning(notifyGscX(gscRes.error));
          }
        } else {
          setGscQueries(gscRes.queries);
          setGscError(null);
          setGscSkippedNotInList(false);
        }
      }

      let sr = filterMainCompetitorResearchResponse(srRaw);

      if (neutralResearchWire) {
        const dr = getDefaultGscCompetitorDateRange();
        const demandGq = buildDemandQueriesFromSeedKeywords(sr.seedTopKeywords ?? []);
        gscRes = { ok: true, queries: demandGq, dateRange: dr };
        setGscDateRange(dr);
        setGscQueries(demandGq);
        setGscError(null);
        setGscSkippedNotInList(false);
      }
      if (sr.errors?.length) {
        const msg = sr.errors.map((e) => e.message).join("; ");
        notify.warning(notifyCompetitorDataSourceWarning(semrushEnhanced ? "Semrush" : "DataForSEO", msg));
      }

      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        setReportPipelineStep(0);
        setReportMicroLabel(null);
        setReportOpenRouterStats(null);
        setStrategistSectionDrafts({});
        return;
      }

      if (srRaw.rows.length > 0 && sr.rows.length === 0) {
        setSemrushData(sr);
        setPhase("idle");
        setReportPipelineStep(0);
        setReportMicroLabel(null);
        setReportOpenRouterStats(null);
        setStrategistSectionDrafts({});
        notify.warning(
          "Every overlapping domain was a mega-platform (social, search, marketplaces, etc.). No main competitors left after filtering.",
        );
        return;
      }

      if (gscRes.ok && gscRes.queries.length > 0) {
        const beforeGsc = sr.rows.length;
        sr = filterCompetitorsByGscRelevance(sr, gscRes.queries);
        if (sr.rows.length < beforeGsc) {
          notify.info(notifyGscRelevanceFilterRemovedXCompetito(beforeGsc - sr.rows.length));
        }
      }

      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        setReportPipelineStep(0);
        setReportMicroLabel(null);
        setReportOpenRouterStats(null);
        setStrategistSectionDrafts({});
        return;
      }

      if (!sr.rows.length) {
        setPhase("idle");
        setReportPipelineStep(0);
        setReportMicroLabel(null);
        setReportOpenRouterStats(null);
        setStrategistSectionDrafts({});
        notify.info(NOTIFY_NO_COMPETITOR_ROWS_RETURNED_FOR_THIS_DOM);
        return;
      }

      const newDomainKeys = new Set(sr.rows.map((r) => normalizeCompetitorDomainKey(r.domain)));
      mergedKeys = new Set<string>();
      for (const k of selectedCompetitorKeys) {
        if (newDomainKeys.has(k)) mergedKeys.add(k);
      }

      if (mergedKeys.size === 0) {
        const tableDomainKeys = new Set(
          beforeRefetchSr.rows.map((r) => normalizeCompetitorDomainKey(r.domain)),
        );
        mergedKeys = new Set([...beforeRefetchKeys].filter((k) => tableDomainKeys.has(k)));
        if (mergedKeys.size === 0) {
          setPhase("idle");
          setReportPipelineStep(0);
          setReportMicroLabel(null);
          setReportOpenRouterStats(null);
          setStrategistSectionDrafts({});
          notify.error(NOTIFY_RUN_ANALYZE_AGAIN);
          return;
        }
        notify.info(
          neutralResearchWire
            ? "Fresh competitor API overlap did not include your current selections (e.g. grid imports vs API overlap). Using your table competitors with updated seed demand."
            : "Fresh competitor API overlap did not include your current selections (e.g. grid imports vs API overlap). Using your table competitors with updated GSC.",
        );
        srForReport = beforeRefetchSr;
        tiersForReport = beforeRefetchTiers;
        gscForReport = gscRes.ok ? gscRes.queries : [];
        gscDateForReport = gscRes.dateRange;
      } else {
        setSemrushData(sr);

        const tiered = await runCompetitorTierAgent(sr, {
          siteId: reportSiteId,
          siteName: reportSiteName,
          seedSiteUrl: seedForApi,
          semrushDatabase: sr.database,
          gscSiteQueries: gscRes.ok && gscRes.queries.length > 0 ? gscRes.queries : undefined,
          gscDateRange: gscRes.ok ? gscRes.dateRange : null,
        });

        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          setPhase("idle");
          setReportPipelineStep(0);
          setReportMicroLabel(null);
          setReportOpenRouterStats(null);
          setStrategistSectionDrafts({});
          return;
        }

        setTiers(tiered);
        setSelectedCompetitorKeys(mergedKeys);

        srForReport = sr;
        tiersForReport = tiered;
        gscForReport = gscRes.ok ? gscRes.queries : [];
        gscDateForReport = gscRes.dateRange;
      }
    } else if (neutralResearchWire) {
      const dr = getDefaultGscCompetitorDateRange();
      const demandGq = buildDemandQueriesFromSeedKeywords(semrushData?.seedTopKeywords ?? []);
      setGscDateRange(dr);
      setGscQueries(demandGq);
      setGscError(null);
      gscForReport = demandGq;
      gscDateForReport = dr;
    } else {
      const gscRes = await fetchCompetitorGscQueries({ siteUrl: seedForApi });
      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        setReportPipelineStep(0);
        setReportMicroLabel(null);
        setReportOpenRouterStats(null);
        setStrategistSectionDrafts({});
        return;
      }
      setGscDateRange(gscRes.dateRange);
      if (gscRes.ok === false) {
        setGscQueries([]);
        if (isGscSiteNotInListFailure(gscRes)) {
          setGscError(null);
          setGscSkippedNotInList(true);
        } else {
          setGscError(gscRes.error);
          setGscSkippedNotInList(false);
          notify.warning(notifyGscX(gscRes.error));
        }
      } else {
        setGscQueries(gscRes.queries);
        setGscError(null);
        setGscSkippedNotInList(false);
      }
      gscForReport = gscRes.ok ? gscRes.queries : [];
      gscDateForReport = gscRes.dateRange;
    }

    const srFiltered = filterCompetitorResearchBySelection(srForReport, mergedKeys);
    const trFiltered = filterTieredCompetitorsBySelection(tiersForReport, mergedKeys);
    if (!srFiltered.rows.length || !trFiltered.tiers.length) {
      notify.error(NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR);
      setPhase("idle");
      setReportPipelineStep(0);
      setReportMicroLabel(null);
      setReportOpenRouterStats(null);
      setStrategistSectionDrafts({});
      return;
    }

    const { markdown, keywordsMarkdown, semrushForReport } = await runCompetitorReportAgent(
      srFiltered,
      trFiltered,
      {
        siteId: reportSiteId,
        siteName: reportSiteName,
        siteUrl: reportSiteUrl,
        strategicBrief: strategicBrief.trim() || undefined,
        gscSiteQueries: gscForReport.length > 0 ? gscForReport : undefined,
        gscDateRange: gscDateForReport,
        gqDemandSource: neutralResearchWire ? "dfs_seed" : "gsc",
        onMicroStep: onReportMicroStep,
        onKeywordsMarkdownReady: onKeywordsMarkdownReady,
        onStrategistSectionReady: onStrategistSectionReady,
      },
    );
    if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
      setPhase("idle");
      setReportPipelineStep(0);
      setReportMicroLabel(null);
      setReportOpenRouterStats(null);
      setStrategistSectionDrafts({});
      setKeywordsMd(null);
      return;
    }
    setSemrushData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        seedTopKeywords: semrushForReport.seedTopKeywords,
        seedDomainOrganicCsv: semrushForReport.seedDomainOrganicCsv,
        domainOrganicCsvByDomain: {
          ...prev.domainOrganicCsvByDomain,
          ...semrushForReport.domainOrganicCsvByDomain,
        },
        enrichmentByDomain: { ...prev.enrichmentByDomain, ...semrushForReport.enrichmentByDomain },
      };
    });
    setReportMd(markdown);
    setKeywordsMd(keywordsMarkdown);
    setPhase("idle");
    setReportPipelineStep(0);
    setReportMicroLabel(null);
    notify.success(NOTIFY_REPORT_GENERATED);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setError(msg);
    setPhase("idle");
    setReportPipelineStep(0);
    setReportMicroLabel(null);
    setReportOpenRouterStats(null);
    setKeywordsMd(null);
  }
}, [
  semrushData,
  tiers,
  site,
  gscQueries,
  gscDateRange,
  selectedCompetitorKeys,
  onReportMicroStep,
  onKeywordsMarkdownReady,
  onStrategistSectionReady,
  analyzeMode,
  effectivePortfolioHosts,
  semrushEnhanced,
  competitorWorkspaceMode,
  effectiveSeedUrl,
  neutralResearchWire,
  workspaceKey,
  strategicBrief,
activeWorkspaceKeyRef, setError, setGscDateRange, setGscError, setGscQueries, setGscSkippedNotInList, setKeywordsMd, setPhase, setReportMd, setReportMicroLabel, setReportOpenRouterStats, setReportPipelineStep, setSelectedCompetitorKeys, setSemrushData, setStrategistSectionDrafts, setTiers]);

const { copyMarkdownBundle, downloadMarkdownBundle, downloadOpenRouterRequestJson, downloadStrategistSectionMarkdown, downloadStrategistSectionPostJson, downloadBulkContentCsv } = useCompetitorReportDownloads(s);
  return { generateReport, copyMarkdownBundle, downloadMarkdownBundle, downloadOpenRouterRequestJson, downloadStrategistSectionMarkdown, downloadStrategistSectionPostJson, downloadBulkContentCsv };
}
