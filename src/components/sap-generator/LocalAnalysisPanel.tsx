import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notify } from "@/lib/app-notifications";
import { ensureMasterInstructionsInMemory, hasMasterInstructions } from "@/lib/master-instructions-storage";
import { NOTIFY_ADD_AT_LEAST_ONE_TARGET_KEYWORD, NOTIFY_ADD_AT_LEAST_ONE_TARGET_KEYWORD_OR_CONNE, NOTIFY_ADD_SAP_BUDGET_ON_MEMBER_ROWS_OR_A_SINGL, NOTIFY_CONNECT_A_SITE_WITH_A_BUSINESS_NAME_IN_I, NOTIFY_DERIVING_KEYWORDS_FROM_POSTS, NOTIFY_ENTER_A_WEBSITE_URL_OR_A_FOCUS_LOCATION_, NOTIFY_ENTER_A_WHOLE_NUMBER_FOR_TOTAL_SAP_PAGES, NOTIFY_GENERATE_SAP_ROWS_FIRST, NOTIFY_GENERATING_SAP_ROWS, NOTIFY_GREPPING_WIKI_FOR_LOCATIONS, NOTIFY_LOADING_WORDPRESS_POST_LIBRARY, NOTIFY_NO_SAP_ROWS_TO_APPROVE, NOTIFY_NO_WORDPRESS_POST_LIST_IN_THIS_RESPONSE_, NOTIFY_OPENROUTER_IN_SETTINGS, NOTIFY_PREPARING_SAP, NOTIFY_RATE_LIMITED_429_RETRY_LATER, NOTIFY_READING_MASTER_RULES, NOTIFY_SAP_ROWS_APPROVED_FOR_CONTENT_PRODUCTION, NOTIFY_SAP_ROWS_READY, NOTIFY_SEED_SITE_URL_EXAMPLE, NOTIFY_SUGGESTING_KEYWORDS, NOTIFY_WORDPRESS_POST_LIBRARY_IS_EMPTY_ADD_KEYW, notifyCheckXEntityRowSVsCsv, notifyEnterAValidTotalSapPagesValueAtL, notifyFileTooLargeMaxXMb, notifyGridLoadedXPoints, notifySapScaledToXMaxX, notifyTotalSapPagesAcrossTargetsCannotEx, notifyTotalSapPagesCannotExceedX, notifyWikipediaXX, notifyXTargetsXSapGridNoWpInventory, notifyXTargetsXSapXPosts } from "@/lib/notify-messages";
import type { WordPressSite } from "@/components/integrations/types";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import { SapGeneratorWorkspaceHeader } from "@/components/sap-generator/SapGeneratorWorkspaceHeader";
import {
  BLOG_GENERATOR_WORKSPACE_BODY_CLASS,
  BLOG_GENERATOR_WORKSPACE_HEADER_CLASS,
} from "@/components/keyword-research/blog-generator-tab-classes";
import { EntitySubmodePills } from "@/components/sap-generator/EntitySubmodePills";
import type { EntityGeneratorSubmode } from "@/components/sap-generator/entity-generator-submode";
import {
  buildLocalGridSummary,
  defaultSeedEntityHintFromGrid,
  dominantKeywordFromRows,
  entityMatchesCsvPlaceHints,
  extractTopPlaceHintsFromRows,
  MAX_LOCAL_CSV_FILE_BYTES,
  parseLocalDominatorCsv,
  placeWeaknessWeightsFromRows,
  wikipediaSearchAugmentFromGridRows,
} from "@/lib/local-dominator-csv";
import {
  LOCAL_CSV_WORKER_FILE_BYTES_THRESHOLD,
  processLocalDominatorCsvText,
  type GridKeywordWeight,
  type PlaceWeaknessWeight,
} from "@/lib/process-local-dominator-upload";
import { fetchLocalSeoStrategyFromGrid } from "@/lib/local-seo-strategy-from-grid";
import {
  buildLocalAnalysisClientAudienceMarkdown,
  getPrimaryLabelForWikipediaAugment,
  mergeWikipediaSearchAugmentParts,
} from "@/lib/local-analysis-metro-context";
import { applySapOriginFromTitleToRows } from "@/lib/sap-origin-from-title";
import {
  entityTotalFromInput,
  normalizeEntityCountInputChange,
  parseEntityTotalInput,
  splitEntityTotalIntoAdGroupsAndAds,
} from "@/lib/local-analysis/entity-ad-group-budget";
import { GENERATOR_PERIOD_ENTITY_TARGET } from "@/lib/generator/generator-profile-defaults";
import {
  computeRemainingGenerateCount,
  quarterEditorialEntityTotal,
} from "@/lib/generator/generator-profile-remaining";
import { useQuarterEditorialCounts } from "@/hooks/use-quarter-editorial-counts";
import {
  LOCAL_ANALYSIS_DEFAULT_SAP_PAGES as DEFAULT_SAP_PAGES,
  LOCAL_ANALYSIS_SAP_MAX,
  LOCAL_ANALYSIS_SAP_MIN,
  LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET,
} from "@/lib/local-analysis-target-constants";

/** Per-keyword SAP default for new rows (not the campaign total in DEFAULT_SAP_PAGES). */
const PER_ROW_SAP_DEFAULT = LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET;
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { parseCityRegionFromLooseLabel } from "@/lib/gmb-dfs-parse";
import {
  finalizeEntitySapRowsForAdGroups,
} from "@/lib/local-analysis/sap-entity-ad-groups";
import {
  localAnalysisInventoryStorageKey,
} from "@/lib/local-analysis-suggest-from-inventory";
import {
  groupKeywordTargetRowsInOrder,
  inheritKeywordTargetEntityHints,
  keywordTargetsInGenerationOrder,
  migrateClusterSapToMembers,
  resolveClusterSeedEntityHint,
  seedRowIdForKeywordTarget,
  splitIntegerTotalAcrossMemberSlots,
} from "@/lib/local-analysis-keyword-cluster";
import { applySapTargetSlugsFromKeywordEntity } from "@/lib/sap-slug-from-keyword-entity";
import { repairSapPageAllocation, type SuggestedKeywordTarget } from "@/lib/local-analysis-suggest-keyword-targets";
import { fillKeywordsFromWpInventoryPosts } from "@/lib/local-analysis-fill-keywords-from-wp-inventory";
import { ensureBulkGenerationWpInventory, getBulkGenerationWpInventoryIfReady } from "@/lib/bulk/bulk-generation-wp-inventory";
import { downloadLocalAnalysisBulkCsv } from "@/lib/local-analysis-csv-export";
import {
  logClustersButtonPress,
  logClustersPipeline,
} from "@/lib/local-analysis/entity-clusters-console-log";
import { allRowIndicesSet } from "@/lib/bulk-processing-order";
import { fillSapRowMetaFromOpenRouter } from "@/lib/local-analysis/entity-sap-meta-agent";
import { fillSapRowTitlesFromOpenRouter } from "@/lib/local-analysis/entity-sap-title-agent";
import {
  fillEntitySapRowKeywordsFromInventoryAndGsc,
  type EntitySapKeywordSources,
} from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import {
  ensureEntitySiteWarmCache,
  gscAllQueriesFromWarmBundle,
} from "@/lib/local-analysis/entity-site-warm-cache";
import {
  ensureClusterGscQueries,
  mergeGscQueriesWithInventoryFallback,
} from "@/lib/local-analysis/entity-gsc-inventory-fallback";
import { runEntityGridLocationClusterAgent } from "@/lib/local-analysis/entity-grid-location-wiki-agent";
import {
  assertEntityRowsHaveKeywords,
  countDistinctEntityLabels,
  validateEntityClusterResult,
} from "@/lib/local-analysis/entity-cluster-validate";
import {
  hydratePreloadedEntitySapRows,
  keywordTargetsFromPreloadedSapRows,
} from "@/lib/local-analysis/entity-preload-clusters-hydrate";
import {
  clearEntityGridCsv,
  saveEntityGridCsv,
} from "@/lib/local-analysis/entity-grid-csv-store";
import { BULK_GENERATOR_EMPTY_ROW_COUNT } from "@/components/keyword-research/blog-generator-tab-classes";
import {
  entityGeneratorKeywordInventoryCount,
  mapEntityGeneratorKeywordInventoryPayload,
  pickEntityGeneratorKeywordInventoryRows,
} from "@/lib/local-analysis/entity-generator-keyword-inventory";
import {
  revokeBulkSitemapInventoryLinks,
  yieldFrameForDetailsPaint,
} from "@/lib/bulk/bulk-sitemap-inventory-session";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import {
  createBulkGscKeywordsHostedLink,
  revokeBulkGscKeywordsHostedLink,
  type BulkGscKeywordsHostedLink,
} from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { GscCompetitorDateRange, GscSiteQueryRow } from "@/lib/competitor-research/types";
import {
  buildEntityTitleClusterJobs,
  buildEntityTitleClusterJobsFromTargets,
  type EntityTitleClusterKeywordTarget,
} from "@/lib/local-analysis/entity-sap-title-cluster-jobs";
import {
  buildEntityTitleHarnessGroupsFromTargets,
  countEntityHarnessSteps,
  hydrateEntityTitleHarnessFromSapRows,
  mergeEntityGenerateProgress,
  titlesMapFromRows,
} from "@/lib/local-analysis/entity-title-harness-state";
import { resolveEntityDetailsCurrentRow } from "@/lib/local-analysis/entity-details-current-row";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { loadApiKey } from "@/lib/api";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import {
  getPrimaryCityStateLabel,
  getPrimaryLocationLabel,
  resolveEntityClusterLocationLabel,
  resolveEntityClusterLocationLabelAsync,
  resolvePrimaryLocationLabel,
} from "@/lib/primary-location-from-site";
import { getStoredSites } from "@/components/integrations/storage";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import {
  canUseBlindMagicKeywordOption,
  findBlindMagicPeerSite,
  loadBlindMagicPeerGscQueries,
} from "@/lib/local-analysis/blind-magic-peer-gsc";
import { enrichSapRowsWithWikipediaLookupsInBatches, lookupEntityHintWikipedia, type EntityHintWikiLookup, type LookupEntityHintWikipediaOptions } from "@/lib/wikipedia-api";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ENTITY_GEOGRAPHIC_LEVEL,
  DEFAULT_ENTITY_TYPE_FOCUS,
  entityTypesForLevel,
  resolveEntityGeographicLevel,
  type EntityGeographicLevel,
} from "@/lib/entity-geographic-level";
import {
  buildLocalAnalysisMicroSnapshot,
  type LocalAnalysisHeaderProgress,
} from "@/lib/local-analysis/header-progress";
import {
  entityClusterHeaderProgress,
  entityClusterStageFromPhase,
  type EntityClusterRunStage,
} from "@/lib/local-analysis/entity-cluster-run-progress";
import { BulkEntityWorkspaceBody } from "@/components/keyword-research/bulk/BulkEntityWorkspaceBody";
import type { LocalAnalysisDetailsPanelProps } from "@/components/sap-generator/LocalAnalysisDetailsPanel";
import {
  ENTITY_DETAILS_PIPELINE_SECTION_TITLES,
} from "@/components/sap-generator/LocalAnalysisDetailsPanel";
import {
  buildEntityClusterLiveHarnessSections,
  ENTITY_CLUSTER_PIPELINE_TITLES,
} from "@/lib/overview/overview-content-prep-harness-sections";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";

export { DEFAULT_SAP_PAGES };

export type SapGeneratorLocalWorkspaceMode = "connected" | "temp";

export type LocalAnalysisWorkspaceControls = {
  mode: SapGeneratorLocalWorkspaceMode;
  onModeChange: (m: SapGeneratorLocalWorkspaceMode) => void;
  tempSeedUrl: string;
  onTempSeedUrlChange: (v: string) => void;
  showConnectedToggle: boolean;
  connectedSiteUrl: string | null;
  onPickTempFromConnected: () => void;
};

type WikiCellState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; lookup: EntityHintWikiLookup }
  | { status: "error" };

async function enrichSapRowsWithWikiLinks(
  rows: CSVRow[],
  options: LookupEntityHintWikipediaOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<{ enriched: CSVRow[]; wikiByIndex: Record<number, WikiCellState> }> {
  const total = rows.length;
  let done = 0;
  const enriched = await enrichSapRowsWithWikipediaLookupsInBatches(rows, options, 12);
  const wikiByIndex: Record<number, WikiCellState> = {};
  for (let gIdx = 0; gIdx < enriched.length; gIdx++) {
    wikiByIndex[gIdx] = sapRowToWikiCellState(enriched[gIdx]!);
    done += 1;
    onProgress?.(done, total);
  }
  return { enriched, wikiByIndex };
}

/** Build Wikipedia cell state from enriched SAP row (URLs from `enrichSapRowsWithWikipediaLookups*`). */
function sapRowToWikiCellState(row: CSVRow): WikiCellState {
  const url = row.wikipedia_url?.trim();
  const title = row.wikipedia_title?.trim();
  if (url && title) {
    return { status: "done", lookup: { kind: "exact", title, url } };
  }
  const entity = (row.entity ?? "").trim();
  if (!entity.length) return { status: "idle" };
  return { status: "done", lookup: { kind: "none", searchedQuery: entity } };
}

const SAP_COUNT_MIN = LOCAL_ANALYSIS_SAP_MIN;
const SAP_COUNT_MAX = LOCAL_ANALYSIS_SAP_MAX;
/** Soft warning when a large unfiltered grid may include many competitor rows. */

const LA_SESSION_KEY = (siteId: string) => `neo-pulse.local-analysis.v1.${siteId}`;

function newTargetRowId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** SAP rows worth showing instead of preload slots (post-Clusters or titled generate). */
function sapRowsHaveDisplayContent(rows: readonly CSVRow[]): boolean {
  return rows.some(
    (r) =>
      Boolean(r.title?.trim()) ||
      Boolean(r.keyword?.trim()) ||
      Boolean((r.entity ?? "").trim()),
  );
}

export interface KeywordTargetRow {
  id: string;
  keyword: string;
  /** Optional geographic/service-area hint for SAP rows for this keyword; blank = model chooses from grid. */
  entityHint: string;
  sapPages: number;
  /** Semantic cluster: members inherit seed Wikipedia; omitted = single-row cluster. */
  clusterId?: string;
  clusterRole?: "seed" | "member";
}

type NormalizedKeywordTarget = {
  id: string;
  keyword: string;
  sapPages: number;
  entityHint?: string;
  clusterId?: string;
  clusterRole?: "seed" | "member";
};

function normalizeKeywordTargets(rows: KeywordTargetRow[]): {
  targets: NormalizedKeywordTarget[];
  total: number;
} {
  const migrated = migrateClusterSapToMembers(rows);
  const inherited = inheritKeywordTargetEntityHints(migrated) as KeywordTargetRow[];
  const hasMemberByCluster = new Set<string>();
  for (const r of inherited) {
    if (r.clusterRole === "member" && r.clusterId?.trim()) hasMemberByCluster.add(r.clusterId.trim());
  }
  const targets = inherited
    .map((r) => {
      const keyword = r.keyword.trim();
      const hint = normalizeEntityHintCommaLabel(r.entityHint ?? "");
      const isMember = r.clusterRole === "member";
      const cid = r.clusterId?.trim();
      const seedWithMembers = !isMember && cid != null && hasMemberByCluster.has(cid);
      const sapPages = isMember
        ? Math.min(SAP_COUNT_MAX, Math.max(SAP_COUNT_MIN, Math.floor(r.sapPages) || 0))
        : seedWithMembers
          ? 0
          : Math.min(SAP_COUNT_MAX, Math.max(SAP_COUNT_MIN, Math.floor(r.sapPages) || SAP_COUNT_MIN));
      const base: NormalizedKeywordTarget = {
        id: r.id,
        keyword,
        sapPages,
        ...(hint.length > 0 ? { entityHint: hint } : {}),
      };
      if (r.clusterId) base.clusterId = r.clusterId;
      if (r.clusterRole) base.clusterRole = r.clusterRole;
      return base;
    })
    .filter((r) => r.keyword.length > 0);
  const total = targets.reduce((s, t) => s + t.sapPages, 0);
  return { targets, total };
}

function sapBearingTargetsForAllocation(targets: NormalizedKeywordTarget[]): NormalizedKeywordTarget[] {
  const rowsForGrouping: KeywordTargetRow[] = targets.map((t) => ({
    id: t.id,
    keyword: t.keyword,
    entityHint: t.entityHint ?? "",
    sapPages: t.sapPages,
    clusterId: t.clusterId,
    clusterRole: t.clusterRole,
  }));
  const groups = groupKeywordTargetRowsInOrder(rowsForGrouping);
  const out: NormalizedKeywordTarget[] = [];
  for (const g of groups) {
    if (g.members.length > 0) {
      for (const m of g.members) {
        const nt = targets.find((x) => x.id === m.id);
        if (nt) out.push(nt);
      }
    } else if (g.seed.keyword.trim() && (Math.floor(g.seed.sapPages) || 0) > 0) {
      const nt = targets.find((x) => x.id === g.seed.id);
      if (nt) out.push(nt);
    }
  }
  return out;
}

function mergeRepairedSapBearingIntoTargets(
  allTargets: NormalizedKeywordTarget[],
  sapBearing: NormalizedKeywordTarget[],
  repaired: SuggestedKeywordTarget[]
): NormalizedKeywordTarget[] {
  if (repaired.length === sapBearing.length) {
    const byId = new Map(sapBearing.map((t, i) => [t.id, repaired[i]!.sapPages]));
    return allTargets.map((t) => (byId.has(t.id) ? { ...t, sapPages: byId.get(t.id)! } : t));
  }
  const totalRepaired = repaired.reduce((s, r) => s + r.sapPages, 0);
  if (totalRepaired <= 0 || sapBearing.length === 0) return allTargets;
  const splits = splitIntegerTotalAcrossMemberSlots(
    totalRepaired,
    sapBearing.length,
    LOCAL_ANALYSIS_SAP_MIN,
    LOCAL_ANALYSIS_SAP_MAX
  );
  const byId = new Map(sapBearing.map((t, i) => [t.id, splits[i]!]));
  return allTargets.map((t) => (byId.has(t.id) ? { ...t, sapPages: byId.get(t.id)! } : t));
}

/** Map suggest API rows to panel rows; normalize (0→1 for lone seeds) then repair down to wand budget if needed. */
function keywordTargetsFromSuggestResult(
  result: SuggestedKeywordTarget[],
  maxSapBudget: number,
): KeywordTargetRow[] {
  const rows: KeywordTargetRow[] = result.map((t) => ({
    id: newTargetRowId(),
    keyword: t.keyword,
    entityHint: t.clusterRole === "member" ? "" : (t.entityHint ?? ""),
    sapPages: t.sapPages,
    ...(t.clusterId ? { clusterId: t.clusterId } : {}),
    ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
  }));
  const { targets, total } = normalizeKeywordTargets(rows);
  if (targets.length === 0) return rows;
  const sapBearing = sapBearingTargetsForAllocation(targets);
  if (sapBearing.length === 0) return rows;
  if (total === maxSapBudget) {
    return targets.map((t) => ({
      id: t.id,
      keyword: t.keyword,
      entityHint: t.entityHint ?? "",
      sapPages: t.sapPages,
      ...(t.clusterId ? { clusterId: t.clusterId } : {}),
      ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
    }));
  }
  const repaired = repairSapPageAllocation(
    sapBearing.map((t) => ({
      keyword: t.keyword,
      sapPages: t.sapPages,
      ...(t.entityHint ? { entityHint: t.entityHint } : {}),
      ...(t.clusterId ? { clusterId: t.clusterId } : {}),
      ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
    })),
    maxSapBudget,
    LOCAL_ANALYSIS_SAP_MIN,
    LOCAL_ANALYSIS_SAP_MAX,
  );
  const merged = mergeRepairedSapBearingIntoTargets(targets, sapBearing, repaired);
  return merged.map((t) => ({
    id: t.id,
    keyword: t.keyword,
    entityHint: t.entityHint ?? "",
    sapPages: t.sapPages,
    ...(t.clusterId ? { clusterId: t.clusterId } : {}),
    ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
  }));
}

function keywordTargetsForApi(targets: NormalizedKeywordTarget[]): { keyword: string; sapPages: number; entityHint?: string }[] {
  return targets
    .filter((t) => t.sapPages > 0)
    .map(({ keyword, sapPages, entityHint }) => ({
      keyword,
      sapPages,
      ...(entityHint != null && entityHint.length > 0 ? { entityHint } : {}),
    }));
}

function keywordTargetRowsToTitleTargets(rows: KeywordTargetRow[]): EntityTitleClusterKeywordTarget[] {
  return rows.map((t) => ({
    id: t.id,
    keyword: t.keyword,
    entityHint: t.entityHint ?? "",
    sapPages: t.sapPages,
    ...(t.clusterId ? { clusterId: t.clusterId } : {}),
    ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
  }));
}

/** Slots from OpenRouter cluster targets — entity is the OpenRouter neighbourhood label only. */
function previewRowsFromKeywordTargets(
  rows: KeywordTargetRow[],
  maxBudget: number,
): { rows: CSVRow[]; seedKeywords: string[] } {
  const ordered = keywordTargetsInGenerationOrder(
    rows.map((r) => ({
      id: r.id,
      keyword: r.keyword,
      entityHint: r.entityHint ?? "",
      sapPages: r.sapPages,
      ...(r.clusterId ? { clusterId: r.clusterId } : {}),
      ...(r.clusterRole ? { clusterRole: r.clusterRole } : {}),
    })),
  ) as KeywordTargetRow[];
  const { targets } = normalizeKeywordTargets(ordered);
  const out: CSVRow[] = [];
  const seedKeywords: string[] = [];
  for (const t of targets) {
    if (!t.keyword.trim() || t.sapPages <= 0) continue;
    const entity = normalizeEntityHintCommaLabel((t.entityHint ?? "").trim());
    if (!entity) {
      throw new Error(`Cluster target missing neighbourhood entity for keyword «${t.keyword}».`);
    }
    for (let p = 0; p < t.sapPages; p++) {
      out.push({
        keyword: "",
        entity,
        title: "",
        modifier: "",
        featuredImage: "google-maps",
      });
      seedKeywords.push(t.keyword);
      if (out.length >= maxBudget) return { rows: out, seedKeywords };
    }
  }
  return { rows: out, seedKeywords };
}

/** First row index in `apiTargets` that shares the cluster and is not a member (seed). */
function seedRowIndexForTargetTi(apiTargets: NormalizedKeywordTarget[], ti: number): number {
  const row = apiTargets[ti];
  if (!row) return ti;
  const cid = row.clusterId?.trim();
  if (cid) {
    const idx = apiTargets.findIndex((x) => x.clusterId?.trim() === cid && x.clusterRole !== "member");
    if (idx >= 0) return idx;
  }
  return ti;
}

export interface LocalAnalysisPanelProps {
  site: WordPressSite;
  workspace: LocalAnalysisWorkspaceControls;
  activeSection: BlogGeneratorSectionId;
  onSectionChange: (id: BlogGeneratorSectionId) => void;
  apiKey: string;
  dataForSEOApiKey: string;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  flowPurpose?: string;
  entitySubmode: EntityGeneratorSubmode;
  onEntitySubmodeChange: (mode: EntityGeneratorSubmode) => void;
}

export const LocalAnalysisPanel: React.FC<LocalAnalysisPanelProps> = ({
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
}) => {
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

  useEffect(() => {
    let cancelled = false;
    setSitePrepLoading(true);
    void loadSitePrep()
      .then(() => {
        if (!cancelled) setPipelineErrorMessage(null);
      })
      .catch((e) => {
        if (!cancelled) {
          setPipelineErrorMessage(e instanceof Error ? e.message : "Site prep failed");
        }
      })
      .finally(() => {
        if (!cancelled) setSitePrepLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [site.id, loadSitePrep]);

  const clientAudienceContextMarkdown = useMemo(() => {
    let inv: { title: string; keyword: string }[] | undefined;
    if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem(localAnalysisInventoryStorageKey(site.id));
        if (raw) {
          const trimmed = raw.trim();
          if (!trimmed) {
            /* empty */
          } else if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
            inv = trimmed
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean)
              .slice(0, 12)
              .map((keyword) => ({ title: keyword, keyword }));
          } else {
            const p = JSON.parse(raw) as
              | string[]
              | { posts?: Array<{ title?: string; fields?: { title?: string; keyword?: string } }> };
            if (Array.isArray(p) && p.length > 0 && typeof p[0] === "string") {
              inv = p.slice(0, 12).map((keyword) => ({
                title: keyword.trim(),
                keyword: keyword.trim(),
              }));
            } else if (!Array.isArray(p) && p.posts?.length) {
              inv = p.posts.slice(0, 12).map((post) => ({
                title: post.title ?? post.fields?.title ?? "",
                keyword: post.fields?.keyword ?? "",
              }));
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
    const name = businessName.trim() || site.name?.trim();
    return buildLocalAnalysisClientAudienceMarkdown({
      ...(name ? { businessName: name } : {}),
      siteName: site.name,
      siteUrl: isTempWorkspace ? workspace.tempSeedUrl : site.siteUrl,
      focusKeyword: suggestFocusKeyword,
      focusLocation: suggestFocusLocation,
      entityGeographicLevel,
      ...(entityTypeFocus.length > 0 ? { entityTypeFocusLabels: entityTypeFocus } : {}),
      inventorySample: inv,
      themeMixGovernedByMasterRules: !isTempWorkspace && hasMasterInstructions(site.id),
    }).trim();
  }, [
    businessName,
    site.name,
    site.siteUrl,
    site.id,
    isTempWorkspace,
    workspace.tempSeedUrl,
    suggestFocusKeyword,
    suggestFocusLocation,
    entityGeographicLevel,
    entityTypeFocus,
  ]);

  const canOpenDetails = true;

  useEffect(() => {
    return () => {
      revokeBulkSitemapInventoryLinks(sitemapLinksRef.current);
      sitemapLinksRef.current = [];
      revokeBulkGscKeywordsHostedLink(gscLinkRef.current);
      gscLinkRef.current = null;
    };
  }, [site.id]);

  const granularPoolTitlesKey = useMemo(() => granularPoolTitles.slice(0, 400).join("\t"), [granularPoolTitles]);

  const localAnalysisWikiLookupOptions = useMemo(
    () => ({
      siteId: site.id,
      wikipediaSearchAugment: mergedWikipediaSearchAugment,
      ...(granularPoolTitles.length > 0 ? { preferredTitles: granularPoolTitles } : {}),
      ...(placeWeaknessForSuggest.length > 0 ? { gridPlaceWeights: placeWeaknessForSuggest } : {}),
    }),
    [site.id, mergedWikipediaSearchAugment, granularPoolTitles, placeWeaknessForSuggest]
  );

  useEffect(() => {
    let cancelled = false;
    void getPrimaryLabelForWikipediaAugment(site).then((label) => {
      if (cancelled || !label?.trim()) return;
      setPrimaryWikiAugmentLabel(label.trim());
    });
    return () => {
      cancelled = true;
    };
  }, [site]);

  useEffect(() => {
    const fromProfile = getPrimaryCityStateLabel(site)?.trim() ?? "";
    setPrimaryWikiAugmentLabel(fromProfile || undefined);
    setGranularPoolTitles([]);
    setEntityTotalCountInput("");
    setSuggestFocusLocation("");
    setSuggestFocusKeyword("");
  }, [site.id]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed by site id; full `site` would churn

  useEffect(() => {
    setUseBlindMagicKeywords(canUseBlindMagicKeywordOption(portfolioSites, site));
  }, [site.id, portfolioSites]); // eslint-disable-line react-hooks/exhaustive-deps -- availability keyed by site id + live portfolio list

  useEffect(() => {
    const allowed = new Set(entityTypesForLevel(entityGeographicLevel));
    setEntityTypeFocus((prev) => {
      const next = prev.filter((t) => allowed.has(t));
      return next.length === prev.length ? prev : next;
    });
  }, [entityGeographicLevel]);

  const keywordTargetsRef = useRef(keywordTargets);
  keywordTargetsRef.current = keywordTargets;

  useEffect(() => {
    wikiHintCacheRef.current.clear();
  }, [site.id, gridCsvFullText, mergedWikipediaSearchAugment, granularPoolTitlesKey]);

  useEffect(() => {
    if (!isTempWorkspace && site.name?.trim()) {
      setBusinessName((prev) => (prev === "" ? site.name.trim() : prev));
    }
  }, [isTempWorkspace, site.id, site.name]);

  const targetsWikiKey = useMemo(
    () =>
      JSON.stringify(
        keywordTargets
          .filter((r) => r.clusterRole !== "member")
          .map((r) => ({ id: r.id, h: r.entityHint }))
      ),
    [keywordTargets]
  );

  /* eslint-disable react-hooks/exhaustive-deps -- keywordTargets summarized in targetsWikiKey */
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const row of keywordTargets) {
      if (row.clusterRole === "member") continue;
      const hint = row.entityHint.trim();
      const { id } = row;
      if (!hint) {
        setWikiByTargetId((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        continue;
      }
      const cacheKey = `${hint.toLowerCase()}\t${mergedWikipediaSearchAugment ?? ""}\t${granularPoolTitlesKey}`;
      const cached = wikiHintCacheRef.current.get(cacheKey);
      if (cached?.status === "done") {
        setWikiByTargetId((prev) => ({ ...prev, [id]: cached }));
        continue;
      }
      const t = setTimeout(() => {
        setWikiByTargetId((prev) => ({ ...prev, [id]: { status: "loading" } }));
        void lookupEntityHintWikipedia(hint, localAnalysisWikiLookupOptions)
          .then((lookup) => {
            const current = keywordTargetsRef.current.find((r) => r.id === id)?.entityHint.trim();
            if (current !== hint) return;
            const done: WikiCellState = { status: "done", lookup };
            wikiHintCacheRef.current.set(cacheKey, done);
            setWikiByTargetId((prev) => ({ ...prev, [id]: done }));
          })
          .catch(() => {
            const current = keywordTargetsRef.current.find((r) => r.id === id)?.entityHint.trim();
            if (current !== hint) return;
            setWikiByTargetId((prev) => ({ ...prev, [id]: { status: "error" } }));
          });
      }, 450);
      timers.push(t);
    }
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [targetsWikiKey, site.id, mergedWikipediaSearchAugment, granularPoolTitlesKey, localAnalysisWikiLookupOptions]);
  /* eslint-enable react-hooks/exhaustive-deps */

  /** Leaving Entity (Forge tab switch) must not restore clusters/grid on return — same as Prompt workspace state. */
  useEffect(() => {
    return () => {
      try {
        sessionStorage.removeItem(LA_SESSION_KEY(site.id));
        sessionStorage.removeItem(localAnalysisInventoryStorageKey(site.id));
      } catch {
        /* ignore */
      }
      void clearEntityGridCsv(site.id);
    };
  }, [site.id]);

  const resetAnalysisOutput = useCallback(() => {
    neighbourhoodPlanGenerationRef.current += 1;
    setSuggestLoading(false);
    setHeaderProgress(null);
    setSapRows([]);
    setEntitySelectedRowIndices(new Set());
    setStrategyMarkdown("");
    setQuestionsByKeyword({});
    setWikiBySapRowIndex({});
  }, []);

  /** Full reset: grid upload, targets, generated SAP, strategies, and saved session for this site. */
  const clearLocalAnalysis = useCallback(() => {
    resetAnalysisOutput();
    setWikiByTargetId({});
    setGridSummaryMarkdown("");
    setGridKeywordWeights([]);
    setGridPlaceWeaknessWeights([]);
    setCsvPlaceHints([]);
    setGridCsvFullText("");
    if (isTempWorkspace) {
      setBusinessName("");
    }
    setUploadLabel("");
    void clearEntityGridCsv(site.id);
    setKeywordTargets(() => {
      const cid = newTargetRowId();
      return [{ id: newTargetRowId(), keyword: "", entityHint: "", sapPages: PER_ROW_SAP_DEFAULT, clusterRole: "seed", clusterId: cid }];
    });
    setEntityTotalCountInput("");
    setSuggestFocusKeyword("");
    setSuggestFocusLocation("");
    setEntityGeographicLevel(DEFAULT_ENTITY_GEOGRAPHIC_LEVEL);
    setEntityTypeFocus([...DEFAULT_ENTITY_TYPE_FOCUS]);
    setHeaderProgress(null);
    setPipelineErrorMessage(null);
    try {
      sessionStorage.removeItem(LA_SESSION_KEY(site.id));
      sessionStorage.removeItem(localAnalysisInventoryStorageKey(site.id));
    } catch {
      /* ignore */
    }
    notify.message(
      isTempWorkspace
        ? "Local analysis reset."
        : "Grid and keyword targets cleared (business name kept for this site).",
      { duration: 4_000 },
    );
  }, [resetAnalysisOutput, site.id, isTempWorkspace]);

  const runCsvPipeline = useCallback(
    async (text: string, fileSizeHint: number, fileLabel = "") => {
      const useWorker = fileSizeHint >= LOCAL_CSV_WORKER_FILE_BYTES_THRESHOLD;
      setCsvParsing(true);
      setHeaderProgress({ kind: "csv", phase: "Parsing grid CSV…", completed: 0, total: 0 });
      try {
        const result = await processLocalDominatorCsvText(text, useWorker);
        if (result.ok === false) {
          notify.error(result.error);
          setUploadLabel("");
          setGridSummaryMarkdown("");
          setGridKeywordWeights([]);
          setGridPlaceWeaknessWeights([]);
          setCsvPlaceHints([]);
          setGridCsvFullText("");
          return;
        }
        setGridCsvFullText(text);
        setGridSummaryMarkdown(result.gridSummaryMarkdown);
        setGridKeywordWeights(result.gridKeywordWeights);
        setGridPlaceWeaknessWeights(result.placeWeaknessWeights);
        setCsvPlaceHints(result.placeHints);
        const gridLocationHint = result.placeHints.find((h) => h.trim())?.trim();
        if (gridLocationHint) {
          setSuggestFocusLocation(gridLocationHint);
        }
        if (result.dominantKeyword.trim()) {
          setSuggestFocusKeyword(result.dominantKeyword.trim());
        }
        void saveEntityGridCsv({
          siteId: site.id,
          uploadLabel: fileLabel,
          csvText: text,
        });
        setKeywordTargets(() => {
          const cid = newTargetRowId();
          return [
            {
              id: newTargetRowId(),
              keyword: "",
              entityHint: "",
              sapPages: PER_ROW_SAP_DEFAULT,
              clusterRole: "seed" as const,
              clusterId: cid,
            },
          ];
        });
        notify.success(notifyGridLoadedXPoints(result.loadedRowCount));
      } finally {
        setCsvParsing(false);
      }
    },
    [site.id],
  );

  const onPickFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      if (file.size > MAX_LOCAL_CSV_FILE_BYTES) {
        notify.error(notifyFileTooLargeMaxXMb(Math.round(MAX_LOCAL_CSV_FILE_BYTES / (1024 * 1024))));
        return;
      }
      setUploadLabel(file.name);
      resetAnalysisOutput();
      const reader = new FileReader();
      reader.onload = () => {
        void (async () => {
          const text = String(reader.result ?? "");
          await runCsvPipeline(text, file.size, file.name);
        })();
      };
      reader.readAsText(file);
    },
    [resetAnalysisOutput, runCsvPipeline]
  );

  const assignUniqueEntitySapKeywords = useCallback(
    async (
      rows: CSVRow[],
      keywordTargetsForSeeds?: EntityTitleClusterKeywordTarget[],
    ): Promise<CSVRow[]> => {
      if (rows.length === 0) return rows;
      if (!openRouterKey) {
        throw new Error(NOTIFY_OPENROUTER_IN_SETTINGS);
      }
      const sources = entityKeywordSourcesRef.current;
      if (!sources) {
        throw new Error("Sitemap inventory and GSC keywords must be loaded before assigning row keywords.");
      }
      const siteName = businessName.trim() || site.name?.trim() || "Site";
      const siteUrl = isTempWorkspace ? workspace.tempSeedUrl.trim() : (site.siteUrl?.trim() ?? "");
      const seedKeywords = new Array<string>(rows.length).fill("");
      if (keywordTargetsForSeeds?.length) {
        const jobs = buildEntityTitleClusterJobsFromTargets(keywordTargetsForSeeds, rows.length);
        for (const job of jobs) {
          for (const idx of job.rowIndices) {
            if (idx >= 0 && idx < seedKeywords.length) seedKeywords[idx] = job.seedKeyword;
          }
        }
      }
      return fillEntitySapRowKeywordsFromInventoryAndGsc({
        apiKey: openRouterKey,
        model: researchModel,
        siteId: isTempWorkspace ? undefined : site.id,
        siteName,
        siteUrl,
        rows,
        seedKeywords,
        buckets: sources.buckets,
        gscQueries: sources.gscQueries,
        gridLocations,
        ...(entityTypeFocus.length > 0 ? { entityTypeFocus } : {}),
        ...(clientAudienceContextMarkdown.length > 0 ? { clientAudienceContextMarkdown } : {}),
      });
    },
    [openRouterKey, site, businessName, isTempWorkspace, workspace.tempSeedUrl, researchModel, entityTypeFocus, gridLocations, clientAudienceContextMarkdown],
  );

  const runAnalysis = useCallback(async (targetsOverride?: KeywordTargetRow[]) => {
    if (!openRouterKey) {
      notify.error(NOTIFY_OPENROUTER_IN_SETTINGS);
      return;
    }
    if (isTempWorkspace && !site.siteUrl?.trim()) {
      notify.error(NOTIFY_SEED_SITE_URL_EXAMPLE);
      return;
    }
    const FILL_KW_LOADING_ID = "local-analysis-fill-kw";
    /** Reuse one WordPress post library fetch when keyword fill and strategy both need it. */
    let sharedWpPostInventory: Awaited<ReturnType<typeof ensureBulkGenerationWpInventory>> | null = null;

    let rowsForRun = targetsOverride ?? keywordTargets;
    let { targets, total } = normalizeKeywordTargets(rowsForRun);

    if (targets.length === 0) {
      const seedUrl = site.siteUrl?.trim() ?? "";
      const hasWpCreds =
        !isTempWorkspace &&
        Boolean(site.username?.trim() && site.appPassword?.trim() && seedUrl);
      if (!hasWpCreds) {
        notify.error(
          "Add at least one target keyword, or connect WordPress (username + app password) to load your post library.",
        );
        return;
      }
      const emptyRows = rowsForRun.filter((r) => !r.keyword.trim());
      if (emptyRows.length === 0) {
        notify.error(NOTIFY_ADD_AT_LEAST_ONE_TARGET_KEYWORD);
        return;
      }
      try {
        notify.loading(NOTIFY_LOADING_WORDPRESS_POST_LIBRARY, { id: FILL_KW_LOADING_ID });
        setHeaderProgress({
          kind: "generate",
          phase: "Loading WordPress post library…",
          completed: 0,
          total: 0,
        });
        const inv = await ensureBulkGenerationWpInventory(site);
        const inventoryRows = pickEntityGeneratorKeywordInventoryRows(site, inv.rows ?? []);
        if (inv.error) {
          notify.error(inv.error);
          return;
        }
        if (!inventoryRows.length) {
          notify.error(
            "WordPress entity sitemap and post library are empty. Add keywords manually or ensure published entity or post URLs exist.",
          );
          return;
        }
        sharedWpPostInventory = inv;
        notify.loading(NOTIFY_DERIVING_KEYWORDS_FROM_POSTS, { id: FILL_KW_LOADING_ID });
        setHeaderProgress({
          kind: "generate",
          phase: "Deriving keywords from inventory…",
          completed: 0,
          total: emptyRows.length,
        });
        const fills = await fillKeywordsFromWpInventoryPosts({
          apiKey: openRouterKey,
          model: researchModel,
          siteId: site.id,
          siteName: site.name,
          siteUrl: site.siteUrl ?? "",
          posts: inventoryRows,
          rowsToFill: emptyRows.map((r) => ({
            id: r.id,
            entityHint: r.entityHint ?? "",
            sapPages: r.sapPages,
            ...(r.clusterRole ? { clusterRole: r.clusterRole } : {}),
            ...(r.clusterId ? { clusterId: r.clusterId } : {}),
          })),
          temperature,
          topP,
        });
        rowsForRun = rowsForRun.map((r) => {
          const kw = fills.get(r.id);
          return kw ? { ...r, keyword: kw } : r;
        });
        setKeywordTargets(rowsForRun);
        const norm2 = normalizeKeywordTargets(rowsForRun);
        targets = norm2.targets;
        total = norm2.total;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        notify.error(msg || "Could not load post library or derive keywords.");
        return;
      } finally {
        notify.dismiss(FILL_KW_LOADING_ID);
      }
    }

    if (targets.length === 0) {
      notify.error(NOTIFY_ADD_AT_LEAST_ONE_TARGET_KEYWORD);
      return;
    }
    const sapBearing = sapBearingTargetsForAllocation(targets);
    if (sapBearing.length === 0) {
      notify.error(NOTIFY_ADD_SAP_BUDGET_ON_MEMBER_ROWS_OR_A_SINGL);
      return;
    }
    let apiTargets = targets;
    let targetSapCount = Math.min(total, maxSapBudget);
    if (total !== maxSapBudget) {
      const repairedSapBearing = repairSapPageAllocation(
        sapBearing.map((t) => ({
          keyword: t.keyword,
          sapPages: t.sapPages,
          ...(t.entityHint ? { entityHint: t.entityHint } : {}),
          ...(t.clusterId ? { clusterId: t.clusterId } : {}),
          ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
        })),
        maxSapBudget,
        LOCAL_ANALYSIS_SAP_MIN,
        LOCAL_ANALYSIS_SAP_MAX,
      );
      apiTargets = mergeRepairedSapBearingIntoTargets(targets, sapBearing, repairedSapBearing);
      targetSapCount = maxSapBudget;
      if (total > maxSapBudget) {
        notify.message(notifySapScaledToXMaxX(targetSapCount, maxSapBudget), { duration: 8_000 });
      }
    }
    const generationTargets = keywordTargetsInGenerationOrder(
      apiTargets.map((t) => ({
        id: t.id,
        keyword: t.keyword,
        entityHint: t.entityHint ?? "",
        sapPages: t.sapPages,
        clusterId: t.clusterId,
        clusterRole: t.clusterRole,
      }))
    );
    const titleTargets = apiTargets.map((t) => ({
      id: t.id,
      keyword: t.keyword,
      entityHint: t.entityHint ?? "",
      sapPages: t.sapPages,
      ...(t.clusterId ? { clusterId: t.clusterId } : {}),
      ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
    }));
    let titleHarnessGroups = buildEntityTitleHarnessGroupsFromTargets(titleTargets, maxSapBudget);
    const plannedEntityCount = titleHarnessGroups.reduce((n, g) => n + g.entities.length, 0);
    let titleClusterJobs = buildEntityTitleClusterJobsFromTargets(titleTargets, maxSapBudget);

    setIsAnalyzing(true);
    setHeaderProgress({
      kind: "generate",
      phase: "Reading master rules…",
      completed: 0,
      total: plannedEntityCount,
      titleHarnessGroups,
      harnessPlannedSectionCount: plannedEntityCount,
    });
    try {
      const needsWpInventory =
        !isTempWorkspace &&
        Boolean(
          site.siteUrl?.trim() &&
            site.username?.trim() &&
            site.appPassword?.trim(),
        );

      notify.loading(NOTIFY_READING_MASTER_RULES, { id: "local-analysis-generate" });
      setHeaderProgress((prev) =>
        mergeEntityGenerateProgress(prev, {
          kind: "generate",
          phase: "Reading master rules…",
          completed: 0,
          total: plannedEntityCount,
        }),
      );
      const [, resolved, invFromParallel] = await Promise.all([
        ensureMasterInstructionsInMemory(isTempWorkspace ? undefined : site.id),
        resolvePrimaryLocationLabel(site).catch(() => null),
        needsWpInventory && !sharedWpPostInventory
          ? ensureBulkGenerationWpInventory(site).catch(() => null)
          : Promise.resolve(sharedWpPostInventory),
      ]);
      if (invFromParallel && !sharedWpPostInventory) {
        sharedWpPostInventory = invFromParallel;
      }

      const resolvedLabel = resolved?.trim();
      const gridMd = gridSummaryMarkdown.trim();
      let entityMarket: string | undefined;
      if (gridMd.length > 0) {
        const fromGrid = defaultSeedEntityHintFromGrid(csvPlaceHints, null).trim();
        entityMarket = fromGrid.length > 0 ? fromGrid : undefined;
      } else {
        entityMarket =
          getPrimaryCityStateLabel(site)?.trim() ||
          resolvedLabel ||
          undefined;
      }
      const focusLocationForSap = suggestFocusLocation.trim();

      let wordpressPostInventory: { title: string; keyword: string }[] | undefined;
      if (sharedWpPostInventory && !sharedWpPostInventory.error) {
        const picked = pickEntityGeneratorKeywordInventoryRows(
          site,
          sharedWpPostInventory.rows ?? [],
        );
        if (picked.length) {
          wordpressPostInventory = mapEntityGeneratorKeywordInventoryPayload(picked);
        }
      }

      notify.loading(NOTIFY_PREPARING_SAP, { id: "local-analysis-generate" });
      setHeaderProgress((prev) =>
        mergeEntityGenerateProgress(prev, {
          kind: "generate",
          phase: "Preparing SAP…",
          completed: 0,
          total: plannedEntityCount,
        }),
      );
      const result = await fetchLocalSeoStrategyFromGrid({
        apiKey: openRouterKey,
        model: researchModel,
        temperature,
        maxTokens,
        topP,
        targetSapCount,
        keywordTargets: keywordTargetsForApi(generationTargets as NormalizedKeywordTarget[]),
        gridSummaryMarkdown: gridSummaryMarkdown.trim() || "",
        manualTargetsOnly: !gridSummaryMarkdown.trim(),
        siteName: site.name,
        siteUrl: site.siteUrl,
        entityLocation: focusLocationForSap || entityMarket,
        siteId: site.id,
        wikipediaSearchAugment: mergedWikipediaSearchAugment,
        /** First OpenRouter completion only — no second pass rewriting keywords/titles. */
        refineSapRowKeywordsWithRag: false,
        // Never treat "one seed row holding all SAP pages" as single-seed mode: that forced the same
        // target keyword onto every row and skipped per-cluster / per-location keyword variation. Cluster
        // prompts + per-row model keywords handle both multi-member clusters and seed-only multi-page runs.
        localAnalysisSingleSeed: false,
        entityGeographicLevel,
        ...(entityTypeFocus.length > 0 ? { entityTypeFocus } : {}),
        ...(wordpressPostInventory?.length ? { wordpressPostInventory } : {}),
        ...(clientAudienceContextMarkdown.length > 0 ? { clientAudienceContextMarkdown } : {}),
        ...(granularPoolTitles.length > 0 ? { wikipediaPreferredTitles: granularPoolTitles } : {}),
        ...(placeWeaknessForSuggest.length > 0 ? { gridPlaceWeightsForWiki: placeWeaknessForSuggest } : {}),
        onWikiProgress: (done, total) => {
          notify.loading(notifyWikipediaXX(done, total), { id: "local-analysis-generate" });
          setHeaderProgress((prev) =>
            mergeEntityGenerateProgress(prev, {
              kind: "generate",
              phase: `Wikipedia ${done}/${total}…`,
              completed: done,
              total: plannedEntityCount,
            }),
          );
        },
        onSapGenerateStart: () => {
          notify.loading(NOTIFY_GENERATING_SAP_ROWS, { id: "local-analysis-generate" });
          setHeaderProgress((prev) =>
            mergeEntityGenerateProgress(prev, {
              kind: "generate",
              phase: "Generating SAP rows…",
              completed: 0,
              total: plannedEntityCount,
            }),
          );
        },
      });
      const sapRowsWithOrigin = applySapOriginFromTitleToRows(result.sapRows);
      titleClusterJobs = buildEntityTitleClusterJobs(titleTargets, sapRowsWithOrigin, maxSapBudget);
      titleHarnessGroups = hydrateEntityTitleHarnessFromSapRows(
        titleHarnessGroups,
        titleClusterJobs,
        sapRowsWithOrigin,
      );
      setHeaderProgress((prev) =>
        mergeEntityGenerateProgress(prev, {
          kind: "generate",
          phase: "Generating SAP rows…",
          completed: 0,
          total: plannedEntityCount,
          titleHarnessGroups: [...titleHarnessGroups],
        }),
      );
      const { enriched: sapRowsLinked, wikiByIndex } = await enrichSapRowsWithWikiLinks(
        sapRowsWithOrigin,
        localAnalysisWikiLookupOptions,
        (done, total) => {
          setHeaderProgress((prev) =>
            mergeEntityGenerateProgress(prev, {
              kind: "generate",
              phase: `Generating SAP rows… (${done}/${total} linked)`,
              completed: done,
              total: plannedEntityCount,
            }),
          );
        },
      ).catch((err: unknown) => {
        throw err instanceof Error ? err : new Error(String(err));
      });
      const sapRowsWithPerEntityWiki = sapRowsLinked;
      titleClusterJobs = buildEntityTitleClusterJobs(
        titleTargets,
        sapRowsWithPerEntityWiki,
        maxSapBudget,
      );
      titleHarnessGroups = hydrateEntityTitleHarnessFromSapRows(
        titleHarnessGroups,
        titleClusterJobs,
        sapRowsWithPerEntityWiki,
      );
      setHeaderProgress((prev) =>
        mergeEntityGenerateProgress(prev, {
          kind: "generate",
          phase: "Assigning unique keywords from GSC",
          completed: 0,
          total: plannedEntityCount,
          titleHarnessGroups: [...titleHarnessGroups],
        }),
      );
      const sapRowsWithSlugs = applySapTargetSlugsFromKeywordEntity(sapRowsWithPerEntityWiki);
      const sapRowsWithKeywords = await assignUniqueEntitySapKeywords(sapRowsWithSlugs, titleTargets);
      setHeaderProgress((prev) =>
        mergeEntityGenerateProgress(prev, {
          kind: "generate",
          phase: "Writing titles",
          completed: 0,
          total: plannedEntityCount,
          titleHarnessGroups: [...titleHarnessGroups],
          harnessPlannedSectionCount: plannedEntityCount,
        }),
      );
      const sapRowsTitled = await fillSapRowTitlesFromOpenRouter(sapRowsWithKeywords, {
        apiKey: openRouterKey,
        model: researchModel,
        siteId: isTempWorkspace ? undefined : site.id,
        siteName: site.name,
        gridLocations,
        ...(entityTypeFocus.length > 0 ? { entityTypeFocus } : {}),
        onProgress: (done, total) => {
          setHeaderProgress((prev) =>
            mergeEntityGenerateProgress(prev, {
              kind: "generate",
              phase: `Writing titles (${done}/${total})`,
              completed: done,
              total: plannedEntityCount,
              titleHarnessGroups: [...titleHarnessGroups],
              harnessPlannedSectionCount: plannedEntityCount,
            }),
          );
        },
      });
      const sapRowsWithMeta = await fillSapRowMetaFromOpenRouter(sapRowsTitled, {
        apiKey: openRouterKey,
        model: researchModel,
        siteId: isTempWorkspace ? undefined : site.id,
        siteName: businessName.trim() || site.name?.trim() || "Site",
      });
      const committedRows = applySapOriginFromTitleToRows(sapRowsWithMeta);
      if (committedRows.length > 0) {
        setSapRows(finalizeEntitySapRowsForAdGroups(committedRows));
        setEntitySelectedRowIndices(allRowIndicesSet(committedRows.length));
        setWikiBySapRowIndex({ ...wikiByIndex });
        setStrategyMarkdown(result.strategyMarkdown);
        setQuestionsByKeyword(result.questionsByKeyword);
      }
      if (total !== maxSapBudget) {
        setKeywordTargets(
          apiTargets.map((t) => ({
            id: t.id,
            keyword: t.keyword,
            entityHint: t.clusterRole === "member" ? "" : (t.entityHint ?? ""),
            sapPages: t.sapPages,
            ...(t.clusterId ? { clusterId: t.clusterId } : {}),
            ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
          }))
        );
      }
      const suspicious =
        csvPlaceHints.length > 0
          ? sapRowsLinked.filter((r) => !entityMatchesCsvPlaceHints(r.entity, csvPlaceHints))
          : [];
      if (suspicious.length > 0) {
        notify.message(notifyCheckXEntityRowSVsCsv(suspicious.length), { duration: 10_000 });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify.error(msg || "SAP generation failed");
    } finally {
      notify.dismiss("local-analysis-generate");
      setIsAnalyzing(false);
      setHeaderProgress(null);
    }
  }, [
    gridSummaryMarkdown,
    openRouterKey,
    researchModel,
    temperature,
    maxTokens,
    topP,
    keywordTargets,
    csvPlaceHints,
    site,
    maxSapBudget,
    isTempWorkspace,
    suggestFocusLocation,
    entityGeographicLevel,
    entityTypeFocus,
    mergedWikipediaSearchAugment,
    granularPoolTitles,
    clientAudienceContextMarkdown,
    placeWeaknessForSuggest,
    localAnalysisWikiLookupOptions,
    assignUniqueEntitySapKeywords,
  ]);

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
    [],
  );

  const reportClustersBlocker = useCallback((message: string) => {
    notify.error(message);
    clusterProgressPctRef.current = 0;
    setHeaderProgress({ kind: "suggest", phase: "Clusters stopped", completed: 0, total: 100, progressPct: 0 });
  }, []);

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
      let finalized = finalizeEntitySapRowsForAdGroups(result.rows.map((row) => ({ ...row })));
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
    workspace.tempSeedUrl,
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
    useBlindMagicKeywords,
    reportClustersBlocker,
    bumpClusterProgress,
    quarterEditorialBySiteId,
  ]);

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
  }, []);

  const entityListRows = useMemo(
    () => sapRows.slice(0, maxSapBudget),
    [sapRows, maxSapBudget],
  );
  const hasTitledSapRows = entityListRows.some((r) => r.title?.trim());
  const hasGeneratedSapRows = entityListRows.some(
    (r) => r.entity?.trim() || r.keyword?.trim() || r.title?.trim(),
  );
  const entityPreloadMode = hasGeneratedSapRows && !hasTitledSapRows;
  const entityHarnessByRow = useMemo(() => {
    const map = new Map<number, BulkHarnessSectionUi[]>();
    entityListRows.forEach((row, index) => {
      const keyword = row.keyword?.trim();
      const title = row.title?.trim();
      const meta = row.meta_description?.trim();
      if (!keyword && !title && !meta) return;
      const sections: BulkHarnessSectionUi[] = [];
      if (keyword) {
        sections.push({
          sectionIndex: 0,
          title: ENTITY_CLUSTER_PIPELINE_TITLES[0],
          status: "done",
          markdown: keyword,
        });
      }
      if (title) {
        sections.push({
          sectionIndex: 1,
          title: ENTITY_CLUSTER_PIPELINE_TITLES[1],
          status: "done",
          markdown: title,
        });
      }
      if (meta) {
        sections.push({
          sectionIndex: 2,
          title: ENTITY_CLUSTER_PIPELINE_TITLES[2],
          status: "done",
          markdown: meta,
        });
      }
      if (sections.length > 0) map.set(index, sections);
    });
    return map;
  }, [entityListRows]);

  const entityLiveHarnessSections = useMemo((): BulkHarnessSectionUi[] => {
    if (!workspaceBusy || !headerProgress) return [];
    if (
      headerProgress.kind === "generate" &&
      (headerProgress.titleHarnessGroups?.length ?? 0) > 0
    ) {
      return [];
    }
    const phase = headerProgress.phase?.trim();
    if (!phase) return [];
    if (headerProgress.kind === "suggest" || headerProgress.kind === "csv") {
      const clusterSections = buildEntityClusterLiveHarnessSections(phase);
      if (clusterSections.length > 0) return clusterSections;
    }
    return [
      {
        sectionIndex: 0,
        title: ENTITY_DETAILS_PIPELINE_SECTION_TITLES[0],
        status: "generating",
        markdown: phase,
      },
    ];
  }, [workspaceBusy, headerProgress]);

  const entityDetailsLiveMessage = useMemo(() => {
    if (pipelineErrorMessage?.trim()) return pipelineErrorMessage.trim();
    if (!workspaceBusy || !headerProgress?.phase?.trim()) return null;
    return headerProgress.phase.trim();
  }, [pipelineErrorMessage, workspaceBusy, headerProgress]);
  const entityDetailsCurrentRow = useMemo(
    () =>
      resolveEntityDetailsCurrentRow(
        headerProgress,
        workspaceBusy,
        entityListRows.length,
      ),
    [headerProgress, workspaceBusy, entityListRows.length],
  );
  /** Same as Prompt / PR: pad with placeholder stripes; no outer scroll until the list is full. */
  const entityPlaceholderOnlyBody =
    !hasGeneratedSapRows || entityListRows.length < BULK_GENERATOR_EMPTY_ROW_COUNT;

  const downloadLocalMarkdownFile = useCallback((content: string, baseName: string) => {
    const safe = baseName.replace(/[^\w-]+/g, "-").slice(0, 80) || "export";
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return (
    <>
      <div className={BLOG_GENERATOR_WORKSPACE_HEADER_CLASS}>
      <SapGeneratorWorkspaceHeader
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        titleRowMenu={
          <EntitySubmodePills
            submode={entitySubmode}
            onSubmodeChange={onEntitySubmodeChange}
            disabled={workspaceBusy}
          />
        }
        workspace={workspace}
        workspaceBusy={workspaceBusy}
        progressSnapshot={progressSnapshot}
        canOpenDetails={canOpenDetails}
        isProcessing={workspaceBusy}
        csvParsing={csvParsing}
        uploadLabel={uploadLabel}
        entityTotalCountInput={entityTotalCountInput}
        onEntityTotalCountInputChange={setEntityTotalCountInput}
        suggestFocusKeyword={suggestFocusKeyword}
        onSuggestFocusKeywordChange={setSuggestFocusKeyword}
        suggestFocusLocation={suggestFocusLocation}
        onSuggestFocusLocationChange={setSuggestFocusLocation}
        runLoading={suggestLoading}
        onPickFile={onPickFile}
        onRunClusters={() => void runClusters()}
        onClear={clearLocalAnalysis}
        entityGeographicLevel={entityGeographicLevel}
        entityTypeFocus={entityTypeFocus}
        onEntityTypeFocusChange={setEntityTypeFocus}
        hasSapRowsForCsv={hasSapRowsForCsv}
        onDownloadTargetsCsv={() => void downloadHeaderTargetsCsv()}
        showBlindMagicKeywords={showBlindMagicKeywords}
        useBlindMagicKeywords={useBlindMagicKeywords}
        onUseBlindMagicKeywordsChange={setUseBlindMagicKeywords}
        onApplyRemainingEntityCount={handleApplyRemainingEntityCount}
        detailsProps={{
          headerProgress,
          uploadLabel,
          keywordTargetCount: keywordTargets.filter((r) => r.keyword.trim()).length,
          sapRowCount: sapRows.length,
          entityGeographicLevel,
          entityTypeFocus,
          gridSummaryMarkdown,
          strategyMarkdown,
          hasSapRowsForCsv,
          displayRows: entityListRows,
          currentRow: entityDetailsCurrentRow,
          isProcessing: workspaceBusy,
          status: pipelineErrorMessage?.trim() || headerProgress?.phase?.trim() || "",
          harnessSections: entityLiveHarnessSections,
          harnessByRow: entityHarnessByRow,
          harnessPlannedSectionCount: null,
          pipelineSectionTitles:
            suggestLoading || csvParsing
              ? [...ENTITY_CLUSTER_PIPELINE_TITLES]
              : [...ENTITY_DETAILS_PIPELINE_SECTION_TITLES],
          liveMessage: entityDetailsLiveMessage,
          sitemapInventoryLinks,
          gscHostedLink: gscKeywordsHostedLink,
          sitemapInventoryLoading: sitePrepLoading,
          onDownloadTargetsCsv: () => void downloadHeaderTargetsCsv(),
          onDownloadStrategyMarkdown: () =>
            downloadLocalMarkdownFile(strategyMarkdown, `local-grid-strategy-${site.name}`),
        }}
      />
      </div>

      <div
        className={cn(
          BLOG_GENERATOR_WORKSPACE_BODY_CLASS,
          "relative flex flex-col",
          entityPlaceholderOnlyBody && "overflow-y-hidden",
        )}
      >
        <BulkEntityWorkspaceBody
          hasGeneratedSapRows={hasGeneratedSapRows}
          entityPreloadMode={entityPreloadMode}
          generatedRows={entityListRows}
          selectedRowIndices={entitySelectedRowIndices}
          setSelectedRowIndices={setEntitySelectedRowIndices}
          isGenerating={isAnalyzing}
          isProcessing={workspaceBusy}
          showBusySpinner={isAnalyzing}
          onRowChange={updateSapRowAt}
          directionsSiteName={businessName.trim() || site.name?.trim() || ""}
        />
      </div>
    </>
  );
};
