import { useCallback } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_OPENROUTER_IN_SETTINGS } from "@/lib/notify-messages";
import { buildLocalGridSummary, dominantKeywordFromRows, parseLocalDominatorCsv, wikipediaSearchAugmentFromGridRows } from "@/lib/local-dominator-csv";
import { normalizeEntityCountInputChange, parseEntityTotalInput, splitEntityTotalIntoAdGroupsAndAds } from "@/lib/local-analysis/entity-ad-group-budget";
import { GENERATOR_PERIOD_ENTITY_TARGET } from "@/lib/generator/generator-profile-defaults";
import { computeRemainingGenerateCount, quarterEditorialEntityTotal } from "@/lib/generator/generator-profile-remaining";
import { LOCAL_ANALYSIS_DEFAULT_SAP_PAGES as DEFAULT_SAP_PAGES, LOCAL_ANALYSIS_SAP_MAX, LOCAL_ANALYSIS_SAP_MIN } from "@/lib/local-analysis-target-constants";

import { newTargetRowId, type KeywordTargetRow, type LocalAnalysisWorkspaceControls, type SapGeneratorLocalWorkspaceMode } from "@/components/sap-generator/local-analysis-helpers";
import { finalizeEntitySapRowsForAdGroups } from "@/lib/local-analysis/sap-entity-ad-groups";
import { downloadLocalAnalysisBulkCsv } from "@/lib/local-analysis-csv-export";
import { logClustersButtonPress, logClustersPipeline } from "@/lib/local-analysis/entity-clusters-console-log";
import { allRowIndicesSet } from "@/lib/bulk-processing-order";
import type { EntitySapKeywordSources } from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import { ensureClusterGscQueries } from "@/lib/local-analysis/entity-gsc-inventory-fallback";
import { runEntityGridLocationClusterAgent } from "@/lib/local-analysis/entity-grid-location-wiki-agent";
import { assertEntityRowsHaveKeywords, countDistinctEntityLabels, validateEntityClusterResult } from "@/lib/local-analysis/entity-cluster-validate";
import { hydratePreloadedEntitySapRows, keywordTargetsFromPreloadedSapRows } from "@/lib/local-analysis/entity-preload-clusters-hydrate";
import { yieldFrameForDetailsPaint } from "@/lib/bulk/bulk-sitemap-inventory-session";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { getPrimaryCityStateLabel, getPrimaryLocationLabel, resolveEntityClusterLocationLabel, resolveEntityClusterLocationLabelAsync } from "@/lib/primary-location-from-site";
import { entityClusterHeaderProgress, entityClusterStageFromPhase, type EntityClusterRunStage } from "@/lib/local-analysis/entity-cluster-run-progress";

export type {
  KeywordTargetRow,
  LocalAnalysisWorkspaceControls,
  SapGeneratorLocalWorkspaceMode,
} from "@/components/sap-generator/local-analysis-helpers";

/** Per-keyword SAP default for new rows (not the campaign total in DEFAULT_SAP_PAGES). */
import type { LocalAnalysisState } from "@/components/sap-generator/use-local-analysis-state";
import type { LocalAnalysisEffects } from "@/components/sap-generator/use-local-analysis-effects";

export function useLocalAnalysisClusters(s: LocalAnalysisState, fx: LocalAnalysisEffects) {
  const {
    site,
    workspace,
    quarterEditorialBySiteId,
    apiKey,
    gridSummaryMarkdown,
    gridKeywordWeights,
    gridCsvFullText,
    businessName,
    keywordTargets,
    setKeywordTargets,
    sapRows,
    setSapRows,
    setEntitySelectedRowIndices,
    sitemapInventoryLinks,
    gscKeywordsHostedLink,
    entityKeywordSourcesRef,
    suggestLoading,
    setSuggestLoading,
    setHeaderProgress,
    setPipelineErrorMessage,
    sitePrepLoading,
    entityTotalCountInput,
    setEntityTotalCountInput,
    suggestFocusKeyword,
    suggestFocusLocation,
    setSuggestFocusLocation,
    useBlindMagicKeywords,
    entityGeographicLevel,
    entityTypeFocus,
    primaryWikiAugmentLabel,
    isTempWorkspace,
    researchModel,
    openRouterKey,
    clusterProgressPctRef,
    maxSapBudget,
    gridCsvWikipediaAugment,
    gridLocations,
    mergedWikipediaSearchAugment,
    loadSitePrepAndGsc,
  } = s;

  const { clientAudienceContextMarkdown } = fx;
const bumpClusterProgress = useCallback(
  (
    phase: string,
    stage: EntityClusterRunStage,
    stepCompleted = 0,
    stepTotal = 1,
  ) => {
    const block = entityClusterHeaderProgress({
      phase,
      stage,
      stepCompleted,
      stepTotal,
      minPct: clusterProgressPctRef.current,
    });
    clusterProgressPctRef.current = block.progressPct ?? clusterProgressPctRef.current;
    setHeaderProgress({ kind: "suggest", ...block });
  },
  [clusterProgressPctRef, setHeaderProgress],
);

const reportClustersBlocker = useCallback((message: string) => {
  notify.error(message);
  clusterProgressPctRef.current = 0;
  setHeaderProgress({ kind: "suggest", phase: "Clusters stopped", completed: 0, total: 100, progressPct: 0 });
}, [clusterProgressPctRef, setHeaderProgress]);

const runClusters = useCallback(async () => {
  const gridTextSnapshot = gridCsvFullText.trim();
  logClustersButtonPress("locations", {
    site: {
      id: site.id,
      name: site.name,
      siteUrl: site.siteUrl,
      enabled: site.enabled,
    },
    isTempWorkspace,
    tempSeedUrl: isTempWorkspace ? workspace.tempSeedUrl : undefined,
    entityTotalCountInput,
    parsedEntityTotalInput: parseEntityTotalInput(entityTotalCountInput),
    suggestFocusKeyword: suggestFocusKeyword.trim(),
    suggestFocusLocation: suggestFocusLocation.trim(),
    businessName: businessName.trim(),
    hasGridCsv: Boolean(gridTextSnapshot),
    gridCsvCharLength: gridTextSnapshot.length,
    gridCsvLineCount: gridTextSnapshot ? gridTextSnapshot.split(/\r?\n/).length : 0,
    entityTypeFocus,
    entityGeographicLevel,
    openRouterConfigured: Boolean(openRouterKey),
    researchModel,
    sapRowsBeforeRun: sapRows.length,
    keywordTargetCount: keywordTargets.length,
    sitemapInventoryLinkCount: sitemapInventoryLinks.length,
    gscKeywordsHostedLink: gscKeywordsHostedLink
      ? {
          filename: gscKeywordsHostedLink.filename,
          rowCount: gscKeywordsHostedLink.rowCount,
          label: gscKeywordsHostedLink.label,
        }
      : null,
    sitePrepLoading,
    suggestLoading,
  });

  setPipelineErrorMessage(null);
  clusterProgressPctRef.current = 0;
  setSuggestLoading(true);
  bumpClusterProgress("Starting clusters", "start");

  let total = parseEntityTotalInput(entityTotalCountInput);
  if (total === null) {
    const stats = quarterEditorialBySiteId[site.id];
    const detected = quarterEditorialEntityTotal(stats);
    const { remaining } = computeRemainingGenerateCount(
      GENERATOR_PERIOD_ENTITY_TARGET,
      detected,
    );
    total =
      remaining > 0
        ? Math.min(remaining, LOCAL_ANALYSIS_SAP_MAX)
        : GENERATOR_PERIOD_ENTITY_TARGET;
    total = Math.max(LOCAL_ANALYSIS_SAP_MIN, total);
    setEntityTotalCountInput(normalizeEntityCountInputChange(String(total)));
  }

  const { adGroupCount, adsPerGroup } = splitEntityTotalIntoAdGroupsAndAds(total);

  if (!openRouterKey) {
    logClustersPipeline("locations", "blocked", { reason: "openrouter_not_configured" });
    setSuggestLoading(false);
    reportClustersBlocker(NOTIFY_OPENROUTER_IN_SETTINGS);
    return;
  }

  logClustersPipeline("locations", "budget_resolved", {
    total,
    adGroupCount,
    adsPerGroup,
  });

  const seedUrl = site.siteUrl?.trim() ?? "";
  const name = businessName.trim() || site.name?.trim() || "Site";
  const siteUrlForFill = isTempWorkspace ? workspace.tempSeedUrl.trim() : seedUrl;
  const gridText = gridCsvFullText.trim();

  setEntitySelectedRowIndices(new Set());
  setSapRows([]);
  bumpClusterProgress("Preparing site data", "prep");

  let clusterLocation = resolveEntityClusterLocationLabel(site, suggestFocusLocation);
  if (!gridText && !clusterLocation) {
    bumpClusterProgress("Reading profile location", "prep");
    clusterLocation = await resolveEntityClusterLocationLabelAsync(
      site,
      suggestFocusLocation,
      primaryWikiAugmentLabel,
    );
  }
  if (!clusterLocation && !gridText) {
    clusterLocation =
      getPrimaryCityStateLabel(site)?.trim() ||
      primaryWikiAugmentLabel?.trim() ||
      suggestFocusLocation.trim() ||
      name;
  }

  bumpClusterProgress(
    gridText
      ? "Clustering grid locations"
      : clusterLocation
        ? `Clustering ${clusterLocation}`
        : "Clustering locations",
    "cluster",
    0,
    total,
  );

  try {
    logClustersPipeline("locations", "prep_started", {
      clusterLocationPreview: clusterLocation,
      mode: gridText ? "grid-csv" : clusterLocation ? "profile-location" : "none",
    });
    await loadSitePrepAndGsc();
    await yieldFrameForDetailsPaint();
    logClustersPipeline("locations", "site_prep_complete", {
      gscQueryCount: entityKeywordSourcesRef.current?.gscQueries?.length ?? 0,
      sitemapLinkCount: entityKeywordSourcesRef.current?.links?.length ?? 0,
    });

    const refSources = entityKeywordSourcesRef.current;
    const buckets =
      refSources?.buckets ??
      ({
        pages: { json: "", rowCount: 0 },
        posts: { json: "", rowCount: 0 },
        sap: { json: "", rowCount: 0 },
      } as EntitySapKeywordSources["buckets"]);
    const gscQueries = ensureClusterGscQueries(refSources?.gscQueries ?? [], buckets, {
      focusKeyword: suggestFocusKeyword,
      businessName: name,
      locationLabel: clusterLocation,
      siteName: site.name?.trim() || name,
    });
    const keywordSources: EntitySapKeywordSources = {
      links: refSources?.links ?? [],
      buckets,
      gscQueries,
      gscDateRange: refSources?.gscDateRange,
    };
    entityKeywordSourcesRef.current = keywordSources;

    let rows: ReturnType<typeof finalizeEntitySapRowsForAdGroups>;
    let clusterWikipedia: Awaited<
      ReturnType<typeof runEntityGridLocationClusterAgent>
    >["clusterWikipedia"];

    if (gridText) {
      const pr = parseLocalDominatorCsv(gridText);
      if (pr.error) throw new Error(pr.error);
      if (pr.rows.length === 0) throw new Error("Grid CSV has no data rows.");

      const gridKw = suggestFocusKeyword.trim() || dominantKeywordFromRows(pr.rows);
      const clusterResult = await runEntityGridLocationClusterAgent({
        apiKey: openRouterKey,
        siteId: isTempWorkspace ? undefined : site.id,
        buckets: [],
        gridRows: pr.rows,
        gridKeywordWeights,
        gscQueries: keywordSources.gscQueries,
        gridFallbackKeywordBases: gridKw ? [gridKw] : [],
        gridLocations,
        gridSummaryMarkdown:
          gridSummaryMarkdown.trim() ||
          buildLocalGridSummary(pr.rows, { rowsForGeographicScope: pr.rows }).summaryMarkdown,
        wikipediaSearchAugment:
          gridCsvWikipediaAugment ?? wikipediaSearchAugmentFromGridRows(pr.rows),
        totalSapBudget: total,
        entityAdGroupCount: adGroupCount,
        entityAdsPerGroup: adsPerGroup,
        entityTypeFocus,
        businessName: name,
        siteName: site.name?.trim() || name,
        ...(clientAudienceContextMarkdown.length > 0
          ? { clientAudienceContextMarkdown }
          : {}),
        onClusterProgress: (_done, _clusterTotal, placeLabel, cumulativeSapRows) => {
          bumpClusterProgress(`Clustering ${placeLabel}`, "cluster", cumulativeSapRows, total);
        },
      });
      clusterWikipedia = clusterResult.clusterWikipedia;
      rows = finalizeEntitySapRowsForAdGroups(
        clusterResult.sapRows.slice(0, total).map((row) => ({ ...row })),
      );
      validateEntityClusterResult({
        rows,
        total,
        parentCityLabel: clusterLocation,
        entityTypeFocus,
      });
      setSapRows(rows);
      setEntitySelectedRowIndices(allRowIndicesSet(rows.length));
    } else if (clusterLocation) {
      const focusKw = suggestFocusKeyword.trim();
      const clusterResult = await runEntityGridLocationClusterAgent({
        apiKey: openRouterKey,
        siteId: isTempWorkspace ? undefined : site.id,
        buckets: [],
        gridRows: [],
        gridKeywordWeights: [],
        profileLocationLabel: clusterLocation,
        profileSampleAddress: getPrimaryLocationLabel(site) ?? undefined,
        gscQueries: keywordSources.gscQueries,
        gridFallbackKeywordBases: focusKw ? [focusKw] : [],
        gridLocations: [clusterLocation],
        gridSummaryMarkdown: "",
        wikipediaSearchAugment: mergedWikipediaSearchAugment,
        totalSapBudget: total,
        entityAdGroupCount: adGroupCount,
        entityAdsPerGroup: adsPerGroup,
        entityTypeFocus,
        businessName: name,
        siteName: site.name?.trim() || name,
        ...(clientAudienceContextMarkdown.length > 0
          ? { clientAudienceContextMarkdown }
          : {}),
        onClusterProgress: (_done, _clusterTotal, placeLabel, cumulativeSapRows) => {
          bumpClusterProgress(`Clustering ${placeLabel}`, "cluster", cumulativeSapRows, total);
        },
      });
      clusterWikipedia = clusterResult.clusterWikipedia;
      rows = finalizeEntitySapRowsForAdGroups(
        clusterResult.sapRows.slice(0, total).map((row) => ({ ...row })),
      );
      validateEntityClusterResult({
        rows,
        total,
        parentCityLabel: clusterLocation,
        entityTypeFocus,
      });
      setSapRows(rows);
      setEntitySelectedRowIndices(allRowIndicesSet(rows.length));
    } else {
      throw new Error("Set Location or upload a grid CSV before running Clusters.");
    }

    bumpClusterProgress("Assigning unique keywords from GSC", "keywords", 0, total);

    const preloadTargets = keywordTargetsFromPreloadedSapRows(rows, newTargetRowId);
    const canFillFromSite = !isTempWorkspace && Boolean(site.username?.trim() && site.appPassword?.trim());
    const result = await hydratePreloadedEntitySapRows({
      apiKey: openRouterKey,
      model: researchModel,
      siteId: isTempWorkspace ? undefined : site.id,
      site: canFillFromSite ? site : undefined,
      siteName: name,
      siteUrl: siteUrlForFill,
      rows,
      targets: preloadTargets,
      keywordSources: {
        buckets: keywordSources.buckets,
        gscQueries: keywordSources.gscQueries,
      },
      gridLocations: gridLocations.length > 0 ? gridLocations : clusterLocation ? [clusterLocation] : [],
      skipKeywordFill: !canFillFromSite,
      ...(clusterWikipedia && clusterWikipedia.length > 0 ? { clusterWikipedia } : {}),
      ...(entityTypeFocus.length > 0 ? { entityTypeFocus } : {}),
      ...(clientAudienceContextMarkdown.length > 0 ? { clientAudienceContextMarkdown } : {}),
      onPhase: (phase, completed = 0, stepTotal) => {
        bumpClusterProgress(
          phase,
          entityClusterStageFromPhase(phase),
          completed,
          stepTotal ?? total,
        );
      },
      onRowsUpdate: (partial) => {
        setSapRows(finalizeEntitySapRowsForAdGroups(partial.map((row) => ({ ...row }))));
      },
    });
    const finalized = finalizeEntitySapRowsForAdGroups(result.rows.map((row) => ({ ...row })));
    assertEntityRowsHaveKeywords(finalized);
    validateEntityClusterResult({
      rows: finalized,
      total,
      parentCityLabel: clusterLocation,
      entityTypeFocus,
    });
    setSapRows(finalized);
    const nextTargets = keywordTargetsFromPreloadedSapRows(finalized, newTargetRowId);
    setKeywordTargets(
      nextTargets.map((t) => ({
        id: t.id,
        keyword: t.keyword,
        entityHint: t.entityHint,
        sapPages: t.sapPages,
        ...(t.clusterId ? { clusterId: t.clusterId } : {}),
        ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
      })),
    );
    setEntitySelectedRowIndices(allRowIndicesSet(finalized.length));
    const distinctEntities = countDistinctEntityLabels(finalized);
    const keywordCount = finalized.filter((r) => r.keyword?.trim()).length;
    setPipelineErrorMessage(null);
    clusterProgressPctRef.current = 100;
    setHeaderProgress({
      kind: "suggest",
      phase: `Clusters ready: ${distinctEntities} neighbourhoods, ${keywordCount} keywords`,
      completed: 100,
      total: 100,
      progressPct: 100,
    });
    if (clusterLocation?.trim()) {
      setSuggestFocusLocation(clusterLocation.trim());
    }
    logClustersPipeline("locations", "run_finished", {
      sapRowCount: finalized.length,
      distinctEntities,
      keywordCount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Clusters failed";
    logClustersPipeline("locations", "run_failed", {
      message: msg,
      stack: e instanceof Error ? e.stack : undefined,
    });
    notify.error(msg);
    clusterProgressPctRef.current = 0;
    setHeaderProgress({ kind: "suggest", phase: "Clusters stopped", completed: 0, total: 100, progressPct: 0 });
  } finally {
    setSuggestLoading(false);
  }
}, [
  entityTotalCountInput,
  sapRows,
  site,
  businessName,
  workspace,
  openRouterKey,
  researchModel,
  isTempWorkspace,
  entityTypeFocus,
  entityGeographicLevel,
  keywordTargets.length,
  sitemapInventoryLinks.length,
  gscKeywordsHostedLink,
  sitePrepLoading,
  suggestLoading,
  gridLocations,
  gridCsvFullText,
  gridKeywordWeights,
  suggestFocusKeyword,
  suggestFocusLocation,
  primaryWikiAugmentLabel,
  mergedWikipediaSearchAugment,
  loadSitePrepAndGsc,
  reportClustersBlocker,
  bumpClusterProgress,
  quarterEditorialBySiteId,
clientAudienceContextMarkdown, clusterProgressPctRef, entityKeywordSourcesRef, gridCsvWikipediaAugment, gridSummaryMarkdown, setEntitySelectedRowIndices, setEntityTotalCountInput, setHeaderProgress, setKeywordTargets, setPipelineErrorMessage, setSapRows, setSuggestFocusLocation, setSuggestLoading]);

const hasSapRowsForCsv = sapRows.length > 0;

const downloadHeaderTargetsCsv = useCallback(() => {
  downloadLocalAnalysisBulkCsv(sapRows.slice(0, maxSapBudget), `entity-${site.name}`, {
    marketHint: suggestFocusLocation.trim() || undefined,
  });
}, [sapRows, maxSapBudget, site.name, suggestFocusLocation]);

const updateSapRowAt = useCallback((globalIdx: number, patch: Partial<CSVRow>) => {
  setSapRows((prev) => {
    if (globalIdx < 0 || globalIdx >= prev.length) return prev;
    const next = [...prev];
    next[globalIdx] = { ...next[globalIdx], ...patch };
    return next;
  });
}, [setSapRows]);
  return { bumpClusterProgress, reportClustersBlocker, runClusters, downloadHeaderTargetsCsv, updateSapRowAt, hasSapRowsForCsv };
}
