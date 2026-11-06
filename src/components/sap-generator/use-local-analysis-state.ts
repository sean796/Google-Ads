import { useCallback, useMemo, useRef, useState } from "react";
import { notify } from "@/lib/app-notifications";
import { extractTopPlaceHintsFromRows, parseLocalDominatorCsv, placeWeaknessWeightsFromRows, wikipediaSearchAugmentFromGridRows } from "@/lib/local-dominator-csv";
import type { GridKeywordWeight, PlaceWeaknessWeight } from "@/lib/process-local-dominator-upload";
import { mergeWikipediaSearchAugmentParts } from "@/lib/local-analysis-metro-context";
import { normalizeEntityCountInputChange, parseEntityTotalInput, splitEntityTotalIntoAdGroupsAndAds } from "@/lib/local-analysis/entity-ad-group-budget";
import { GENERATOR_PERIOD_ENTITY_TARGET } from "@/lib/generator/generator-profile-defaults";
import { computeRemainingGenerateCount, quarterEditorialEntityTotal } from "@/lib/generator/generator-profile-remaining";
import { useQuarterEditorialCounts } from "@/hooks/use-quarter-editorial-counts";
import { LOCAL_ANALYSIS_DEFAULT_SAP_PAGES as DEFAULT_SAP_PAGES, LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET } from "@/lib/local-analysis-target-constants";

import { PER_ROW_SAP_DEFAULT, newTargetRowId, type KeywordTargetRow, type LocalAnalysisWorkspaceControls, type SapGeneratorLocalWorkspaceMode, type WikiCellState } from "@/components/sap-generator/local-analysis-helpers";
import type { EntitySapKeywordSources } from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import { ensureEntitySiteWarmCache, gscAllQueriesFromWarmBundle } from "@/lib/local-analysis/entity-site-warm-cache";
import { mergeGscQueriesWithInventoryFallback } from "@/lib/local-analysis/entity-gsc-inventory-fallback";
import { revokeBulkSitemapInventoryLinks } from "@/lib/bulk/bulk-sitemap-inventory-session";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import { createBulkGscKeywordsHostedLink, revokeBulkGscKeywordsHostedLink, type BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { GscCompetitorDateRange, GscSiteQueryRow } from "@/lib/competitor-research/types";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { loadApiKey } from "@/lib/api";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { getPrimaryCityStateLabel } from "@/lib/primary-location-from-site";
import { getStoredSites } from "@/components/integrations/storage";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { canUseBlindMagicKeywordOption, findBlindMagicPeerSite, loadBlindMagicPeerGscQueries } from "@/lib/local-analysis/blind-magic-peer-gsc";
import { DEFAULT_ENTITY_GEOGRAPHIC_LEVEL, DEFAULT_ENTITY_TYPE_FOCUS, type EntityGeographicLevel } from "@/lib/entity-geographic-level";
import { buildLocalAnalysisMicroSnapshot, type LocalAnalysisHeaderProgress } from "@/lib/local-analysis/header-progress";

export type {
  KeywordTargetRow,
  LocalAnalysisWorkspaceControls,
  SapGeneratorLocalWorkspaceMode,
} from "@/components/sap-generator/local-analysis-helpers";

/** Per-keyword SAP default for new rows (not the campaign total in DEFAULT_SAP_PAGES). */
import type { LocalAnalysisPanelProps } from "@/components/sap-generator/LocalAnalysisPanel";

export function useLocalAnalysisState(props: LocalAnalysisPanelProps) {
  const {
    site,
    workspace,
    activeSection,
    onSectionChange,
    apiKey,
    dataForSEOApiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    flowPurpose,
    entitySubmode,
    onEntitySubmodeChange,
  } = props;

  const [uploadLabel, setUploadLabel] = useState<string>("");
  const [csvParsing, setCsvParsing] = useState(false);
  const [gridSummaryMarkdown, setGridSummaryMarkdown] = useState<string>("");
  /** Weakness-by-keyword from last grid CSV (drives weighted SAP allocation on suggest). */
  const [gridKeywordWeights, setGridKeywordWeights] = useState<GridKeywordWeight[]>([]);
  /** Per City, ST from grid CSV (weaker avg rank = higher weight; wiki snap order + RAG). */
  const [gridPlaceWeaknessWeights, setGridPlaceWeaknessWeights] = useState<PlaceWeaknessWeight[]>([]);
  /** City/region hints from last successful CSV parse (soft entity check after model run). */
  const [csvPlaceHints, setCsvPlaceHints] = useState<string[]>([]);
  /** Last uploaded grid CSV text (full file - passed verbatim to AI suggest with the markdown scan). */
  const [gridCsvFullText, setGridCsvFullText] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [keywordTargets, setKeywordTargets] = useState<KeywordTargetRow[]>(() => {
    const cid = newTargetRowId();
    return [{ id: newTargetRowId(), keyword: "", entityHint: "", sapPages: PER_ROW_SAP_DEFAULT, clusterRole: "seed", clusterId: cid }];
  });
  const [sapRows, setSapRows] = useState<CSVRow[]>([]);
  const [entitySelectedRowIndices, setEntitySelectedRowIndices] = useState<Set<number>>(() => new Set());
  const [sitemapInventoryLinks, setSitemapInventoryLinks] = useState<PromptBulkSitemapInventoryLink[]>([]);
  const sitemapLinksRef = useRef<PromptBulkSitemapInventoryLink[]>([]);
  const [gscKeywordsHostedLink, setGscKeywordsHostedLink] = useState<BulkGscKeywordsHostedLink | null>(null);
  const gscLinkRef = useRef<BulkGscKeywordsHostedLink | null>(null);
  const entityKeywordSourcesRef = useRef<EntitySapKeywordSources | null>(null);
  /** Location rationale markdown from last grid analysis (download + session). */
  const [strategyMarkdown, setStrategyMarkdown] = useState("");
  const [questionsByKeyword, setQuestionsByKeyword] = useState<Record<string, string[]>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [headerProgress, setHeaderProgress] = useState<LocalAnalysisHeaderProgress | null>(null);
  const [pipelineErrorMessage, setPipelineErrorMessage] = useState<string | null>(null);
  const [sitePrepLoading, setSitePrepLoading] = useState(false);
  const [entityTotalCountInput, setEntityTotalCountInput] = useState("");
  /** Optional: most suggested keywords will center on this theme (OpenRouter). */
  const [suggestFocusKeyword, setSuggestFocusKeyword] = useState("");
  const [suggestFocusLocation, setSuggestFocusLocation] = useState("");
  const { sites: portfolioSites } = useWordPressSites();
  const editorialCountSites = useMemo(() => [site], [site]);
  const { bySiteId: quarterEditorialBySiteId } = useQuarterEditorialCounts(editorialCountSites);
  const [useBlindMagicKeywords, setUseBlindMagicKeywords] = useState(() =>
    canUseBlindMagicKeywordOption(getStoredSites(), site),
  );
  const [entityGeographicLevel, setEntityGeographicLevel] = useState<EntityGeographicLevel>(
    DEFAULT_ENTITY_GEOGRAPHIC_LEVEL
  );
  const [entityTypeFocus, setEntityTypeFocus] = useState<string[]>(() => [...DEFAULT_ENTITY_TYPE_FOCUS]);
  const [wikiByTargetId, setWikiByTargetId] = useState<Record<string, WikiCellState>>({});
  /** Wikipedia for generated SAP rows, keyed by global row index - filled once per Generate, not refetched on edit. */
  const [wikiBySapRowIndex, setWikiBySapRowIndex] = useState<Record<number, WikiCellState>>({});
  /** Reuse keyword entity-hint lookups when the same hint string appears again (avoids refetch on unrelated re-renders). */
  const wikiHintCacheRef = useRef<Map<string, WikiCellState>>(new Map());
  const wikiByTargetIdRef = useRef(wikiByTargetId);
  wikiByTargetIdRef.current = wikiByTargetId;
  /** Primary city/region from site (ACF/sync); refined async for Wikipedia augment merge. */
  const [primaryWikiAugmentLabel, setPrimaryWikiAugmentLabel] = useState<string | undefined>(() =>
    getPrimaryCityStateLabel(site)?.trim() || undefined
  );
  /** Canonical `###` titles from `buildWikipediaGranularEntityPool` for pool-first Wikipedia resolution. */
  const [granularPoolTitles, setGranularPoolTitles] = useState<string[]>([]);

  const showBlindMagicKeywords = canUseBlindMagicKeywordOption(portfolioSites, site);

  const isTempWorkspace = workspace.mode === "temp";
  const researchModel = useMemo(
    () => getResearchModel(isTempWorkspace ? undefined : site.id),
    [isTempWorkspace, site.id]
  );
  const openRouterKey = apiKey?.trim() || loadApiKey();

  const workspaceBusy = csvParsing || isAnalyzing || suggestLoading;
  const clusterProgressPctRef = useRef(0);

  const handleApplyRemainingEntityCount = useCallback(() => {
    const target = GENERATOR_PERIOD_ENTITY_TARGET;
    const stats = quarterEditorialBySiteId[site.id];
    const detected = quarterEditorialEntityTotal(stats);
    const { remaining, detected: det, usedFallbackTarget } = computeRemainingGenerateCount(
      target,
      detected,
    );

    if (usedFallbackTarget) {
      notify.warning(
        "Period entity counts not loaded yet — enter how many to generate, or wait for Properties counts to load.",
      );
      return;
    }

    setEntityTotalCountInput(normalizeEntityCountInputChange(String(remaining)));
    if (det != null) {
      if (remaining === 0) {
        notify.info(`Already at period target (${det} of ${target} entities).`);
        return;
      }
      notify.info(`Set entities to ${remaining} (${det} of ${target} already this period).`);
    }
  }, [quarterEditorialBySiteId, site]);

  const maxSapBudget = useMemo(
    () => parseEntityTotalInput(entityTotalCountInput) ?? 0,
    [entityTotalCountInput],
  );
  const { adGroupCount: entityAdGroupCount, adsPerGroup: entityAdsPerGroup } = useMemo(
    () => splitEntityTotalIntoAdGroupsAndAds(maxSapBudget),
    [maxSapBudget],
  );
  const sapRowsRef = useRef(sapRows);
  sapRowsRef.current = sapRows;
  const neighbourhoodLayoutKeyRef = useRef<string | null>(null);
  const neighbourhoodPlanGenerationRef = useRef(0);

  /** User SAP row budget (wand number); caps generate + displayed SAP rows / confirm, not padded upward. */

  const placeWeaknessForSuggest = useMemo(() => {
    if (gridPlaceWeaknessWeights.length > 0) return gridPlaceWeaknessWeights;
    const t = gridCsvFullText.trim();
    if (!t) return [];
    const parsed = parseLocalDominatorCsv(t);
    if (parsed.error || parsed.rows.length === 0) return [];
    return placeWeaknessWeightsFromRows(parsed.rows);
  }, [gridPlaceWeaknessWeights, gridCsvFullText]);

  const gridCsvWikipediaAugment = useMemo(() => {
    const t = gridCsvFullText.trim();
    if (!t) return undefined;
    const parsed = parseLocalDominatorCsv(t);
    if (parsed.error || parsed.rows.length === 0) return undefined;
    return wikipediaSearchAugmentFromGridRows(parsed.rows);
  }, [gridCsvFullText]);

  const gridLocations = useMemo(() => {
    const t = gridCsvFullText.trim();
    if (!t) return [];
    const parsed = parseLocalDominatorCsv(t);
    if (parsed.error || parsed.rows.length === 0) return [];
    const limit = Math.ceil(maxSapBudget / LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET) + 10;
    return extractTopPlaceHintsFromRows(parsed.rows, limit);
  }, [gridCsvFullText, maxSapBudget]);

  const mergedWikipediaSearchAugment = useMemo(
    () =>
      mergeWikipediaSearchAugmentParts({
        gridCsvAugment: gridCsvWikipediaAugment,
        suggestFocusLocation: suggestFocusLocation?.trim() || undefined,
        primarySiteLabel: primaryWikiAugmentLabel,
      }),
    [gridCsvWikipediaAugment, suggestFocusLocation, primaryWikiAugmentLabel]
  );

  const progressSnapshot = useMemo(
    () => buildLocalAnalysisMicroSnapshot(headerProgress),
    [headerProgress],
  );

  const commitSitemapInventoryLinks = useCallback((links: PromptBulkSitemapInventoryLink[]) => {
    revokeBulkSitemapInventoryLinks(sitemapLinksRef.current);
    sitemapLinksRef.current = links;
    setSitemapInventoryLinks(links);
  }, []);

  const commitGscKeywordsHostedLink = useCallback(
    (siteUrl: string, queries: GscSiteQueryRow[], dateRange?: GscCompetitorDateRange) => {
      revokeBulkGscKeywordsHostedLink(gscLinkRef.current);
      const link = createBulkGscKeywordsHostedLink(siteUrl, queries, dateRange);
      gscLinkRef.current = link;
      setGscKeywordsHostedLink(link);
    },
    [],
  );

  const clearGscKeywordsHostedLink = useCallback(() => {
    revokeBulkGscKeywordsHostedLink(gscLinkRef.current);
    gscLinkRef.current = null;
    setGscKeywordsHostedLink(null);
  }, []);

  const applySitePrepFromWarm = useCallback(
    (warm: Awaited<ReturnType<typeof ensureEntitySiteWarmCache>>, siteUrl: string) => {
      if (warm.inventory.links.length > 0) {
        commitSitemapInventoryLinks(warm.inventory.links);
      }
      const allGsc = gscAllQueriesFromWarmBundle(warm);
      const mergedGsc = mergeGscQueriesWithInventoryFallback(allGsc, warm.inventory.buckets);
      if (siteUrl && mergedGsc.length > 0) {
        commitGscKeywordsHostedLink(siteUrl, mergedGsc, warm.gsc.dateRange);
      } else {
        clearGscKeywordsHostedLink();
      }
      entityKeywordSourcesRef.current = {
        links: warm.inventory.links,
        buckets: warm.inventory.buckets,
        gscQueries: mergedGsc,
        gscDateRange: warm.gsc.dateRange,
      };
      return entityKeywordSourcesRef.current;
    },
    [commitSitemapInventoryLinks, commitGscKeywordsHostedLink, clearGscKeywordsHostedLink],
  );

  const loadSitePrep = useCallback(async () => {
    const siteUrl = isTempWorkspace ? workspace.tempSeedUrl.trim() : (site.siteUrl?.trim() ?? "");
    const warm = await ensureEntitySiteWarmCache(site, { requireGsc: false });
    return applySitePrepFromWarm(warm, siteUrl);
  }, [site, isTempWorkspace, workspace.tempSeedUrl, applySitePrepFromWarm]);

  const loadSitePrepAndGsc = useCallback(async () => {
    const siteUrl = isTempWorkspace ? workspace.tempSeedUrl.trim() : (site.siteUrl?.trim() ?? "");
    const warm = await ensureEntitySiteWarmCache(site, { requireGsc: !useBlindMagicKeywords });
    if (warm.error && !useBlindMagicKeywords) {
      throw new Error(warm.error);
    }
    const sources = applySitePrepFromWarm(warm, siteUrl);
    if (useBlindMagicKeywords) {
      const peer = findBlindMagicPeerSite(portfolioSites, site.id);
      if (!peer) {
        throw new Error("Connect Blind Magic in Integrations to use its keywords.");
      }
      setHeaderProgress({
        kind: "suggest",
        phase: "Loading Blind Magic keywords",
        completed: 0,
        total: 1,
      });
      const peerGsc = await loadBlindMagicPeerGscQueries(peer);
      sources.gscQueries = peerGsc.queries;
      sources.gscDateRange = peerGsc.dateRange;
      entityKeywordSourcesRef.current = sources;
      const peerUrl = peer.siteUrl?.trim() ?? "";
      if (peerUrl && peerGsc.queries.length > 0) {
        commitGscKeywordsHostedLink(peerUrl, peerGsc.queries, peerGsc.dateRange);
      }
      return sources;
    }
    return sources;
  }, [
    site,
    isTempWorkspace,
    workspace.tempSeedUrl,
    applySitePrepFromWarm,
    useBlindMagicKeywords,
    commitGscKeywordsHostedLink,
    portfolioSites,
  ]);
  return {
    site,
    workspace,
    portfolioSites,
    quarterEditorialBySiteId,
    apiKey,
    dataForSEOApiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    flowPurpose,
    uploadLabel,
    setUploadLabel,
    csvParsing,
    setCsvParsing,
    gridSummaryMarkdown,
    setGridSummaryMarkdown,
    gridKeywordWeights,
    setGridKeywordWeights,
    gridPlaceWeaknessWeights,
    setGridPlaceWeaknessWeights,
    csvPlaceHints,
    setCsvPlaceHints,
    gridCsvFullText,
    setGridCsvFullText,
    businessName,
    setBusinessName,
    keywordTargets,
    setKeywordTargets,
    sapRows,
    setSapRows,
    entitySelectedRowIndices,
    setEntitySelectedRowIndices,
    sitemapInventoryLinks,
    setSitemapInventoryLinks,
    sitemapLinksRef,
    gscKeywordsHostedLink,
    setGscKeywordsHostedLink,
    gscLinkRef,
    entityKeywordSourcesRef,
    strategyMarkdown,
    setStrategyMarkdown,
    questionsByKeyword,
    setQuestionsByKeyword,
    isAnalyzing,
    setIsAnalyzing,
    suggestLoading,
    setSuggestLoading,
    headerProgress,
    setHeaderProgress,
    pipelineErrorMessage,
    setPipelineErrorMessage,
    sitePrepLoading,
    setSitePrepLoading,
    entityTotalCountInput,
    setEntityTotalCountInput,
    suggestFocusKeyword,
    setSuggestFocusKeyword,
    suggestFocusLocation,
    setSuggestFocusLocation,
    editorialCountSites,
    useBlindMagicKeywords,
    setUseBlindMagicKeywords,
    entityGeographicLevel,
    setEntityGeographicLevel,
    entityTypeFocus,
    setEntityTypeFocus,
    wikiByTargetId,
    setWikiByTargetId,
    wikiBySapRowIndex,
    setWikiBySapRowIndex,
    wikiHintCacheRef,
    wikiByTargetIdRef,
    primaryWikiAugmentLabel,
    setPrimaryWikiAugmentLabel,
    granularPoolTitles,
    setGranularPoolTitles,
    showBlindMagicKeywords,
    isTempWorkspace,
    researchModel,
    openRouterKey,
    workspaceBusy,
    clusterProgressPctRef,
    handleApplyRemainingEntityCount,
    maxSapBudget,
    sapRowsRef,
    neighbourhoodLayoutKeyRef,
    neighbourhoodPlanGenerationRef,
    placeWeaknessForSuggest,
    gridCsvWikipediaAugment,
    gridLocations,
    mergedWikipediaSearchAugment,
    progressSnapshot,
    commitSitemapInventoryLinks,
    commitGscKeywordsHostedLink,
    clearGscKeywordsHostedLink,
    applySitePrepFromWarm,
    loadSitePrep,
    loadSitePrepAndGsc,
  };
}

export type LocalAnalysisState = ReturnType<typeof useLocalAnalysisState>;
