import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MY_SITES_FIELD } from "@/components/hosting/my-sites/my-sites-theme";
import {
  WorkspaceNestedInput,
  WorkspaceNestedTextarea,
} from "@/components/seo/WorkspaceNestedField";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { getDefaultGscCompetitorDateRange } from "@/lib/competitor-research/competitor-gsc-queries";
import { buildDemandQueriesFromSeedKeywords } from "@/lib/competitor-research/competitor-seed-demand-as-gq";
import {
  filterMainCompetitorResearchResponse,
  isNonMainCompetitorDomain,
} from "@/lib/competitor-research/filter-main-competitor-rows";
import { runCompetitorTierAgent } from "@/lib/competitor-research/competitor-tier-agent";
import { runCompetitorReportAgent } from "@/lib/competitor-research/competitor-report-agent";
import {
  REPORT_PIPELINE_MICRO_TOTAL,
  type CompetitorReportMicroStepPayload,
} from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { buildProposalMatrixContentCsvRows } from "@/lib/competitor-research/competitor-bulk-content-csv";
import { parseCompetitorGridTopPlaces } from "@/lib/competitor-research/local-dominator-grid-parse";
import { fetchGridCompetitorHostnamesParallel } from "@/lib/competitor-research/competitor-grid-dfs-client";
import { mergeGridCompetitorsAsDirectTier } from "@/lib/competitor-research/competitor-grid-tier-merge";
import {
  buildDomainOrganicCsvFromKeywordRows,
  DOMAIN_ORGANIC_CSV_TOP_ROWS,
} from "@/lib/competitor-research/competitor-domain-organic-csv";
import { MAX_LOCAL_CSV_FILE_BYTES } from "@/lib/local-dominator-csv";
import {
  LOCAL_CSV_WORKER_FILE_BYTES_THRESHOLD,
  processLocalDominatorCsvText,
  type GridKeywordWeight,
} from "@/lib/process-local-dominator-upload";
import {
  runLocalStrategyReportAgent,
  type LocalStrategyStrategistSectionReadyPayload,
} from "@/lib/local-strategy-research/local-strategy-report-agent";
import {
  LOCAL_STRATEGY_REQUIRED_H2,
  LOCAL_STRATEGY_SECTION_COUNT,
  type LocalStrategyReportSectionIndex,
} from "@/lib/local-strategy-research/local-strategy-report-system-prompt";
import {
  LOCAL_STRATEGY_REPORT_MICRO_TOTAL,
  type LocalStrategyReportMicroStepPayload,
} from "@/lib/local-strategy-research/local-strategy-report-openrouter-limits";
import type {
  CompetitorResearchSemrushResponse,
  GscCompetitorDateRange,
  GscSiteQueryRow,
  TieredCompetitorsResult,
} from "@/lib/competitor-research/types";
import type { LocalStrategyGmbOauthWire } from "@/lib/local-strategy-research/local-strategy-report-wire";
import {
  fetchLocalStrategyGmbDfsRaw,
  fetchLocalStrategyGmbOauthSnapshot,
} from "@/lib/local-strategy-research/local-strategy-gmb-fetch";
import { loadApiKey } from "@/lib/api";
import { DEFAULT_SETTINGS } from "@/components/integrations/wordpress/OptimizationSettingsPanel";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ANALYZE_DONE, NOTIFY_CLIENT_MEETING_SCRIPT_IS_NOT_READY_YET, NOTIFY_COULD_NOT_COPY, NOTIFY_DOWNLOADED_CLIENT_MEETING_SCRIPT_MD, NOTIFY_DOWNLOADED_STRATEGY_MD, NOTIFY_ENTER_A_SEED_SITE_URL_FIRST, NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM, NOTIFY_ENTITY_SAP_CSV_IS_NOT_READY_YET, NOTIFY_GENERATE_A_PROPOSAL_FIRST, NOTIFY_GRID_CSV_DOWNLOADED, NOTIFY_GRID_IMPORT_DONE, NOTIFY_LOCAL_ANALYSIS_DID_NOT_RETURN_COMPETITOR, NOTIFY_NO_NEW_COMPETITORS_FROM_GRID, NOTIFY_POSTS_CSV_IS_NOT_READY_YET, NOTIFY_PROPOSAL_COPIED, NOTIFY_PROPOSAL_INCOMPLETE_BLOG_ROWS_SAVED, NOTIFY_PROPOSAL_INCOMPLETE_SAP_AND_BLOG_ROWS_SA, NOTIFY_PROPOSAL_INCOMPLETE_SAP_ROWS_SAVED, NOTIFY_RUN_ANALYZE_FIRST_OR_IMPORT_A_GRID_CSV, NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR, NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL, NOTIFY_STRATEGY_MARKDOWN_IS_NOT_READY_YET, notifyAddedXCompetitorSFromGridCsv, notifyAddedXCompetitorSFromGridCsvUpdat, notifyFileTooLargeMaxXMb, notifyGridCsvSapScanX, notifyGridSkipX, notifyGridXXNoWebsite, notifyGridXXX, notifyGscX2, notifyPresenterTalkScriptFailedX, notifyResearchXX, notifySiteAuditFinishedWithXPartialError, notifySiteAuditSkippedX, notifySiteAuditSkippedX2, notifyUpdatedXCompetitorSFromGridCsvWer } from "@/lib/notify-messages";
import { CompetitorSiteGrid } from "@/components/research/competitor/CompetitorSiteGrid";
import { ProposalToolbar } from "@/components/research/proposal/ProposalToolbar";
import { ProposalWorkspaceHeader } from "@/components/research/proposal/ProposalWorkspaceHeader";
import type { GeneratorWorkspaceChromeBindings } from "@/components/blog-generator/generator-workspace-chrome-bindings";
import { WORKSPACE_DETAILS_DIM_OVERLAY_CLASS } from "@/components/overview/overview-tab/overview-tab-content-constants";
import {
  SEO_WORKSPACE_BODY_SCROLL_CLASS,
  SEO_WORKSPACE_HEADER_CLASS,
  SEO_WORKSPACE_SHELL_CLASS,
  SEO_WORKSPACE_TYPO_CLASS,
} from "@/components/seo/seo-workspace-layout";
import { BULK_HEADER_RUN_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { buildProposalReportMarkdown, downloadLocalAnalysisBulkCsv } from "@/lib/local-analysis-csv-export";
import { getOptimizationSettings, getResearchModel } from "@/lib/optimization-settings-storage";
import { getPrimaryCityStateLabel, resolvePrimaryLocationLabel } from "@/lib/primary-location-from-site";
import { buildLocalStrategyGridExportCsv } from "@/lib/local-strategy-research/local-strategy-grid-export-csv";
import {
  runManagerLocalAnalysisAnalyze,
} from "@/lib/local-strategy-research/manager-local-analysis-analyze";
import { runLocalAnalysisEntitySapPipeline } from "@/lib/local-strategy-research/local-analysis-entity-sap-pipeline";
import type { LocalDominatorRow } from "@/lib/local-dominator-csv";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { cn } from "@/lib/utils";
import { runProposalTalkScript } from "@/lib/research/proposal-talk-script";
import { pickProposalAuditPages } from "@/lib/research/proposal-audit-page-picker";
import { fetchProposalSiteAudit } from "@/lib/research/proposal-site-audit-fetch";
import type { ProposalSiteAuditResult } from "@/lib/research/proposal-site-audit-types";

/** Organic competitor research powers local strategy. */
const LOCAL_ORGANIC_SOURCE = false;

/**
 * Proposal report wave runs entity SAP, competitor strategist, and local blueprint in parallel (three concurrent
 * OpenRouter-heavy workloads). If you see HTTP 429 rate limits, set `VITE_MAX_PROPOSAL_PARALLEL_PIPELINES=1`
 * in `.env` to fall back to sequential SAP → competitor → local (slower, lower burst).
 */
function readMaxProposalParallelPipelines(): number {
  try {
    const raw = import.meta.env?.VITE_MAX_PROPOSAL_PARALLEL_PIPELINES;
    if (raw === undefined || raw === "") return 3;
    const n = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n)) return 3;
    return Math.max(1, Math.min(3, Math.floor(n)));
  } catch {
    return 3;
  }
}

function isPortfolioBlockedHost(dk: string, blocked: string[]): boolean {
  if (!dk || blocked.length === 0) return false;
  for (const b of blocked) {
    if (!b) continue;
    if (dk === b) return true;
    if (dk.endsWith(`.${b}`)) return true;
  }
  return false;
}

function triggerDownloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeDomainForFilename(d: string): string {
  const k = normalizeCompetitorDomainKey(d);
  return (k || "domain").replace(/[^a-z0-9.-]+/gi, "_").slice(0, 80);
}

const LOCAL_STRATEGY_SECTION_INDICES: LocalStrategyReportSectionIndex[] = Array.from(
  { length: LOCAL_STRATEGY_SECTION_COUNT },
  (_, i) => (i + 1) as LocalStrategyReportSectionIndex,
);

function localStrategySectionLabel(section: LocalStrategyReportSectionIndex): string {
  if (section === 1) return "Ascend & Expand opening (H1)";
  return LOCAL_STRATEGY_REQUIRED_H2[section - 2] ?? `Section ${section}`;
}

function buildCombinedProposalMarkdown(args: {
  competitorMd: string;
  keywordsMd: string | null;
  localMd: string;
}): string {
  const kw = args.keywordsMd?.trim();
  return [
    "# Competitor strategy\n\n",
    args.competitorMd.trim(),
    "\n\n# Local SEO strategy\n\n",
    args.localMd.trim(),
    kw ? `\n\n${kw}\n` : "",
  ].join("");
}

export type ProposalResearchTabProps = {
  generatorChrome: GeneratorWorkspaceChromeBindings;
  studioEmbedded?: boolean;
};

export function ProposalResearchTab({
  generatorChrome,
  studioEmbedded = false,
}: ProposalResearchTabProps) {
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [band2Target, setBand2Target] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!studioEmbedded) return;
    const el = document.getElementById("universal-studio-band-2-filters");
    setBand2Target(el);
  }, [studioEmbedded]);
  const { sites } = useWordPressSites();
  const {
    mode: workspaceMode,
    tempSeedUrl,
    debouncedTempSeed,
    connectedSite: site,
    enabledSites,
  } = useManagerSeedWorkspace();

  const portfolioHosts = useMemo(() => {
    if (!site) return [];
    return buildPortfolioBlockedHosts(sites, { excludeSiteId: site.id });
  }, [sites, site]);

  const workspaceKey = useMemo(() => {
    if (workspaceMode === "temp") {
      const n = normalizeCompetitorDomainKey(tempSeedUrl) || tempSeedUrl.trim() || "empty";
      return `temp:${n}`;
    }
    if (!site?.id) return "none";
    return `connected:${site.id}|${getPublicSiteUrl(site)}`;
  }, [workspaceMode, tempSeedUrl, site?.id, site?.siteUrl, site?.productionSiteUrl]);

  const activeWorkspaceKeyRef = useRef<string>("");
  activeWorkspaceKeyRef.current = workspaceKey;

  const effectiveSeedUrl = useMemo(() => {
    if (workspaceMode === "temp") return tempSeedUrl.trim();
    return site ? getPublicSiteUrl(site) : "";
  }, [workspaceMode, tempSeedUrl, site?.siteUrl, site?.productionSiteUrl]);

  const businessNameQuery = useMemo(() => {
    const fromSite = site?.name?.trim();
    if (fromSite) return fromSite;
    if (!effectiveSeedUrl) return "";
    try {
      const u = new URL(
        effectiveSeedUrl.includes("://") ? effectiveSeedUrl : `https://${effectiveSeedUrl}`,
      );
      return u.hostname.replace(/^www\./i, "");
    } catch {
      return "";
    }
  }, [site?.name, effectiveSeedUrl]);

  const effectivePortfolioHosts = useMemo(
    () => (workspaceMode === "temp" ? [] : portfolioHosts),
    [workspaceMode, portfolioHosts],
  );

  const neutralResearchWire = workspaceMode === "temp";

  const [semrushData, setSemrushData] = useState<CompetitorResearchSemrushResponse | null>(null);
  const [gscQueries, setGscQueries] = useState<GscSiteQueryRow[]>([]);
  const [gscDateRange, setGscDateRange] = useState<GscCompetitorDateRange | null>(null);
  const [gscError, setGscError] = useState<string | null>(null);
  const [tiers, setTiers] = useState<TieredCompetitorsResult | null>(null);
  const [reportMd, setReportMd] = useState<string | null>(null);
  const [combinedMd, setCombinedMd] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "semrush" | "report">("idle");
  const [proposalSubphase, setProposalSubphase] = useState<
    "competitor" | "local" | "sap" | "parallel" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompetitorKeys, setSelectedCompetitorKeys] = useState<Set<string>>(() => new Set());
  /** Competitor strategist micro-steps (proposal report phase). */
  const [competitorPipelineStep, setCompetitorPipelineStep] = useState(0);
  const [competitorPipelineLabel, setCompetitorPipelineLabel] = useState<string | null>(null);
  /** Local blueprint micro-steps (proposal report phase). */
  const [localPipelineStep, setLocalPipelineStep] = useState(0);
  const [localPipelineLabel, setLocalPipelineLabel] = useState<string | null>(null);
  const [reportMicroLabel, setReportMicroLabel] = useState<string | null>(null);
  const [gmbDfsRaw, setGmbDfsRaw] = useState<unknown | null>(null);
  const [gmbOauth, setGmbOauth] = useState<LocalStrategyGmbOauthWire | null>(null);
  const [scheduleMonths, setScheduleMonths] = useState(3);
  const [entitySapPerMonth, setEntitySapPerMonth] = useState(15);
  const [contentBlogsPerMonth, setContentBlogsPerMonth] = useState(3);
  const [strategistGuidance, setStrategistGuidance] = useState("");
  const [gridCsvBusy, setGridCsvBusy] = useState(false);
  const [gridCsvProgress, setGridCsvProgress] = useState<string | null>(null);
  const [gridSapSummaryMarkdown, setGridSapSummaryMarkdown] = useState("");
  const [gridSapPlaceHints, setGridSapPlaceHints] = useState<string[]>([]);
  const [gridSapKeywordWeights, setGridSapKeywordWeights] = useState<GridKeywordWeight[]>([]);
  /** Parsed grid pins for direct SAP (no OpenRouter-generated SAP rows). */
  const [gridSapParsedRows, setGridSapParsedRows] = useState<LocalDominatorRow[]>([]);
  const [lastSapScheduleRows, setLastSapScheduleRows] = useState<CSVRow[] | null>(null);
  const [lastPostsBulkRows, setLastPostsBulkRows] = useState<CSVRow[] | null>(null);
  const [talkScriptMd, setTalkScriptMd] = useState<string | null>(null);
  const [localStrategySectionDrafts, setLocalStrategySectionDrafts] = useState<
    Partial<Record<LocalStrategyReportSectionIndex, { markdown: string; requestBodyJson?: string }>>
  >({});
  const gridCsvFileRef = useRef<HTMLInputElement>(null);

  const onReportMicroStep = useCallback((info: LocalStrategyReportMicroStepPayload) => {
    setProposalSubphase("local");
    setLocalPipelineStep(info.step);
    setLocalPipelineLabel(info.label);
  }, []);

  const onLocalStrategySectionReady = useCallback((payload: LocalStrategyStrategistSectionReadyPayload) => {
    setLocalStrategySectionDrafts((prev) => ({
      ...prev,
      [payload.section]: {
        markdown: payload.markdown,
        requestBodyJson: payload.requestStats?.requestBodyJson,
      },
    }));
  }, []);

  const semrushRows = semrushData?.rows;
  const semrushRowsFingerprint = useMemo(() => {
    if (!semrushRows?.length) return "";
    return semrushRows.map((r) => normalizeCompetitorDomainKey(r.domain)).sort().join("|");
  }, [semrushRows]);

  const prevSemrushDomainKeysRef = useRef<Set<string>>(new Set());
  const prevWorkspaceClearKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key =
      workspaceMode === "temp"
        ? `temp:${debouncedTempSeed}`
        : site?.id
          ? `connected:${site.id}|${getPublicSiteUrl(site)}`
          : "none";
    if (prevWorkspaceClearKeyRef.current === null) {
      prevWorkspaceClearKeyRef.current = key;
      return;
    }
    if (prevWorkspaceClearKeyRef.current === key) return;
    prevWorkspaceClearKeyRef.current = key;
    setSemrushData(null);
    setGscQueries([]);
    setGscDateRange(null);
    setGscError(null);
    setTiers(null);
    setReportMd(null);
    setCombinedMd(null);
    setLastSapScheduleRows(null);
    setLastPostsBulkRows(null);
    setTalkScriptMd(null);
    setError(null);
    setPhase("idle");
    setProposalSubphase(null);
    setSelectedCompetitorKeys(new Set());
    setGmbDfsRaw(null);
    setGmbOauth(null);
    setGridSapSummaryMarkdown("");
    setGridSapPlaceHints([]);
    setGridSapKeywordWeights([]);
    setGridSapParsedRows([]);
    prevSemrushDomainKeysRef.current = new Set();
  }, [workspaceMode, debouncedTempSeed, site?.id, site?.siteUrl, site?.productionSiteUrl]);

  useEffect(() => {
    if (!semrushRows?.length) {
      prevSemrushDomainKeysRef.current = new Set();
      setSelectedCompetitorKeys(new Set());
      return;
    }
    const currentKeys = new Set(semrushRows.map((r) => normalizeCompetitorDomainKey(r.domain)));
    setSelectedCompetitorKeys((prev) => {
      if (prevSemrushDomainKeysRef.current.size === 0) {
        prevSemrushDomainKeysRef.current = new Set(currentKeys);
        return new Set(currentKeys);
      }
      const next = new Set<string>();
      for (const dk of currentKeys) {
        if (!prevSemrushDomainKeysRef.current.has(dk)) {
          next.add(dk);
        } else if (prev.has(dk)) {
          next.add(dk);
        }
      }
      prevSemrushDomainKeysRef.current = new Set(currentKeys);
      return next;
    });
  }, [semrushRowsFingerprint]);

  const analyze = useCallback(async () => {
    if (workspaceMode === "connected") {
      if (!site?.siteUrl?.trim()) {
        notify.error(NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL);
        return;
      }
    } else if (!effectiveSeedUrl) {
      notify.error(NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM);
      return;
    }
    const runKeySnapshot = workspaceKey;
    const seedForApi = effectiveSeedUrl;
    const tierSiteId = neutralResearchWire ? undefined : site?.id;
    const tierSiteName = neutralResearchWire ? undefined : site?.name;
    setError(null);
    setReportMd(null);
    setCombinedMd(null);
    setLastSapScheduleRows(null);
    setLastPostsBulkRows(null);
    setTiers(null);
    setSemrushData(null);
    setGscQueries([]);
    setGscDateRange(null);
    setGscError(null);
    setGmbDfsRaw(null);
    setGmbOauth(null);

    try {
      setPhase("semrush");
      setReportMicroLabel(
        "Step 1: Local analysis: researched organic competitors, tiering, GSC when connected, GBP snapshot when available.",
      );
      const out = await runManagerLocalAnalysisAnalyze({
        semrushEnhanced: LOCAL_ORGANIC_SOURCE,
        seedSiteUrl: seedForApi,
        portfolioBlockedHosts: effectivePortfolioHosts,
        neutralResearchWire,
        tierSiteId,
        tierSiteName,
        businessNameQuery,
        geoLabel: "",
        site,
      });

      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        setReportMicroLabel(null);
        return;
      }

      setSemrushData(out.semrush);
      setTiers(out.tiers);
      setSelectedCompetitorKeys(
        new Set(out.semrush.rows.map((r) => normalizeCompetitorDomainKey(r.domain))),
      );
      setGmbDfsRaw(out.gmbDfsRaw);
      setGmbOauth(out.gmbOauth);
      setGscQueries(out.gscQueries);
      setGscDateRange(out.gscDateRange);
      setGscError(out.gscError);
      if (out.gscError) {
        notify.warning(notifyGscX2(out.gscError));
      }

      setReportMicroLabel(null);
      setPhase("idle");
      notify.success(NOTIFY_ANALYZE_DONE);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setReportMicroLabel(null);
      setPhase("idle");
    }
  }, [
    workspaceMode,
    site,
    effectiveSeedUrl,
    workspaceKey,
    neutralResearchWire,
    effectivePortfolioHosts,
    businessNameQuery,
  ]);

  const reportDownloadSlug = useMemo(() => {
    if (neutralResearchWire && semrushData?.seedDomain) {
      return safeDomainForFilename(semrushData.seedDomain);
    }
    return (site?.name || "site").replace(/\s+/g, "-");
  }, [neutralResearchWire, semrushData?.seedDomain, site?.name]);

  const onCompetitorMicroStep = useCallback((info: CompetitorReportMicroStepPayload) => {
    setProposalSubphase("competitor");
    setCompetitorPipelineStep(info.step);
    setCompetitorPipelineLabel(info.label);
  }, []);

  const onCompetitorMicroStepParallel = useCallback((info: CompetitorReportMicroStepPayload) => {
    setProposalSubphase("parallel");
    setCompetitorPipelineStep(info.step);
    setCompetitorPipelineLabel(info.label);
  }, []);

  const onReportMicroStepParallel = useCallback((info: LocalStrategyReportMicroStepPayload) => {
    setProposalSubphase("parallel");
    setLocalPipelineStep(info.step);
    setLocalPipelineLabel(info.label);
  }, []);

  const generateProposal = useCallback(async () => {
    if (workspaceMode === "connected") {
      if (!site?.siteUrl?.trim()) {
        notify.error(NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL);
        return;
      }
    } else if (!effectiveSeedUrl) {
      notify.error(NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM);
      return;
    }

    const runKeySnapshot = workspaceKey;
    const seedForApi = effectiveSeedUrl;
    const reportSiteId = neutralResearchWire ? undefined : site?.id;
    const reportSiteName = neutralResearchWire ? undefined : site?.name;
    const reportSiteUrl = seedForApi;

    /** Preserve Local Analysis tab parity: do not replace with “all competitors” after refresh. */
    const competitorSelectionBeforeRun = selectedCompetitorKeys;

    let semrushForPipeline: CompetitorResearchSemrushResponse | null = semrushData;
    let tiersForPipeline = tiers;
    let gscQueriesForPipeline = gscQueries;
    let gscDateRangeForPipeline = gscDateRange;
    let gmbDfsForPipeline = gmbDfsRaw;
    let gmbOauthForPipeline = gmbOauth;

    /** Same pipeline as the Local Analysis tab Analyze button - always runs before entity SAP and reports. */
    setPhase("semrush");
    setReportMicroLabel(
      "Step 1: Local analysis: researched organic competitors, tiering, GSC when connected, GBP snapshot when available.",
    );
    try {
      const out = await runManagerLocalAnalysisAnalyze({
        semrushEnhanced: LOCAL_ORGANIC_SOURCE,
        seedSiteUrl: seedForApi,
        portfolioBlockedHosts: effectivePortfolioHosts,
        neutralResearchWire,
        tierSiteId: neutralResearchWire ? undefined : site?.id,
        tierSiteName: neutralResearchWire ? undefined : site?.name,
        businessNameQuery,
        geoLabel: "",
        site,
      });
      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        setReportMicroLabel(null);
        return;
      }
      semrushForPipeline = out.semrush;
      tiersForPipeline = out.tiers;
      gscQueriesForPipeline = out.gscQueries;
      gscDateRangeForPipeline = out.gscDateRange;
      gmbDfsForPipeline = out.gmbDfsRaw;
      gmbOauthForPipeline = out.gmbOauth;
      setSemrushData(out.semrush);
      setTiers(out.tiers);
      setGscQueries(out.gscQueries);
      setGscDateRange(out.gscDateRange);
      setGscError(out.gscError);
      setGmbDfsRaw(out.gmbDfsRaw);
      setGmbOauth(out.gmbOauth);
      {
        const availableKeys = new Set(
          out.semrush.rows.map((r) => normalizeCompetitorDomainKey(r.domain)),
        );
        const preserved = new Set(
          [...competitorSelectionBeforeRun].filter((k) => availableKeys.has(k)),
        );
        const merged = preserved.size > 0 ? preserved : availableKeys;
        setSelectedCompetitorKeys(merged);
      }
      if (out.gscError) {
        notify.warning(notifyGscX2(out.gscError));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase("idle");
      setReportMicroLabel(null);
      notify.error(msg);
      return;
    }

    if (!semrushForPipeline || !tiersForPipeline?.tiers?.length) {
      notify.error(NOTIFY_LOCAL_ANALYSIS_DID_NOT_RETURN_COMPETITOR);
      setPhase("idle");
      setReportMicroLabel(null);
      return;
    }

    const availableKeysForPipeline = new Set(
      semrushForPipeline.rows.map((r) => normalizeCompetitorDomainKey(r.domain)),
    );
    const preservedSelection = new Set(
      [...competitorSelectionBeforeRun].filter((k) => availableKeysForPipeline.has(k)),
    );
    const selectedKeysForPipeline =
      preservedSelection.size > 0 ? preservedSelection : availableKeysForPipeline;

    if (selectedKeysForPipeline.size === 0) {
      notify.error(NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR);
      return;
    }

    const srFiltered = filterCompetitorResearchBySelection(semrushForPipeline, selectedKeysForPipeline);
    const trFiltered = filterTieredCompetitorsBySelection(tiersForPipeline, selectedKeysForPipeline);
    if (!srFiltered.rows.length || !trFiltered.tiers.length) {
      notify.error(NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR);
      return;
    }

    const gscForReport: GscSiteQueryRow[] = neutralResearchWire
      ? gscQueriesForPipeline.length > 0
        ? gscQueriesForPipeline
        : buildDemandQueriesFromSeedKeywords(semrushForPipeline.seedTopKeywords ?? [])
      : gscQueriesForPipeline;
    const gscDateForReport: GscCompetitorDateRange | null =
      gscDateRangeForPipeline ?? (neutralResearchWire ? getDefaultGscCompetitorDateRange() : null);

    const months = Math.max(1, Math.min(6, Math.floor(scheduleMonths) || 1));
    const blogsPerMo = Math.max(0, Math.min(50, Math.floor(contentBlogsPerMonth) || 0));
    /** Content matrix only - entity SAP row count matches Local Analysis (default 45 = 3 mo × 15). */
    const contentMaxRows = months * blogsPerMo;

    const bizQ =
      businessNameQuery.trim() ||
      (neutralResearchWire ? "" : site?.name?.trim()) ||
      normalizeCompetitorDomainKey(seedForApi) ||
      "";

    const siteDisplayName = ((reportSiteName ?? bizQ) || reportDownloadSlug).trim() || "Site";
    const guidanceForStrategist = strategistGuidance.trim() || undefined;

    setPhase("report");
    setProposalSubphase(null);
    setCompetitorPipelineStep(0);
    setCompetitorPipelineLabel(null);
    setLocalPipelineStep(0);
    setLocalPipelineLabel(null);
    setReportMicroLabel(null);
    setReportMd(null);
    setCombinedMd(null);
    setLastSapScheduleRows(null);
    setLastPostsBulkRows(null);
    setTalkScriptMd(null);
    setLocalStrategySectionDrafts({});

    /** Built after competitor + local; see catch for partial save. */
    let contentRows: CSVRow[] = [];
    /** Filled after a successful entity SAP step so catch can persist rows if a later step fails. */
    let sapRowsForRecovery: CSVRow[] = [];

    try {
      const gridDirectSap = gridSapParsedRows.length > 0;
      const apiKeyForSap = loadApiKey();
      if (
        !gridDirectSap &&
        (typeof apiKeyForSap !== "string" || !apiKeyForSap.trim())
      ) {
        throw new Error(
          "Add an OpenRouter API key in settings. Required when entity SAP is generated without saved grid pins (AI-generated rows).",
        );
      }

      const opt =
        neutralResearchWire || !site?.id ? DEFAULT_SETTINGS : getOptimizationSettings(site.id);
      const researchModelId = getResearchModel(reportSiteId);
      let entityLocation: string | undefined;
      if (!neutralResearchWire && site) {
        const resolved = await resolvePrimaryLocationLabel(site).catch(() => null);
        entityLocation = resolved?.trim() || getPrimaryCityStateLabel(site);
      }

      const apiKeyForReports = loadApiKey();
      if (typeof apiKeyForReports !== "string" || !apiKeyForReports.trim()) {
        throw new Error("Add an OpenRouter API key in settings for competitor and local blueprint sections.");
      }

      let siteAuditForReport: ProposalSiteAuditResult | null = null;
      try {
        setReportMicroLabel("Site audit: selecting sample pages…");
        const auditUrls = await pickProposalAuditPages({
          seedUrl: seedForApi,
          site: neutralResearchWire ? null : site ?? null,
          gscDateRange: gscDateForReport,
        });
        if (auditUrls.length > 0 && activeWorkspaceKeyRef.current === runKeySnapshot) {
          setReportMicroLabel(
            `Site audit: Lighthouse desktop + mobile on ${auditUrls.length} pages (may take several minutes)…`,
          );
          const auditRes = await fetchProposalSiteAudit(auditUrls);
          if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
            setPhase("idle");
            setProposalSubphase(null);
            setReportMicroLabel(null);
            return;
          }
          if (auditRes.ok) {
            siteAuditForReport = auditRes.audit;
            if (auditRes.audit.errors.length > 0) {
              notify.warning(
                `Site audit finished with ${auditRes.audit.errors.length} partial errors; strategy will use available data.`,
              );
            }
          } else {
            notify.warning(notifySiteAuditSkippedX(auditRes.error));
          }
        }
      } catch (auditErr) {
        const auditMsg = auditErr instanceof Error ? auditErr.message : String(auditErr);
        notify.warning(notifySiteAuditSkippedX2(auditMsg));
      }

      const sapParams = {
        apiKey: typeof apiKeyForSap === "string" ? apiKeyForSap.trim() : "",
        model: researchModelId,
        temperature: opt.temperature,
        maxTokens: opt.maxTokens,
        topP: opt.topP,
        siteId: reportSiteId,
        siteName: siteDisplayName,
        siteUrl: reportSiteUrl,
        entityLocation: entityLocation ?? null,
        semrush: srFiltered,
        tiers: trFiltered,
        selectedDomainKeys: selectedKeysForPipeline,
        gscQueries: gscForReport.length > 0 ? gscForReport : undefined,
        geoLabel: null,
        gridSummaryMarkdown: gridSapSummaryMarkdown.trim() || null,
        gridPlaceHints: gridSapPlaceHints,
        gridKeywordWeights: gridSapKeywordWeights,
        gridParsedRows: gridSapParsedRows.length > 0 ? gridSapParsedRows : undefined,
      } as const;

      const maxParallel = readMaxProposalParallelPipelines();
      let competitorMd: string;
      let keywordsMarkdown: string | null | undefined;
      let semrushForReport: CompetitorResearchSemrushResponse;
      let localMd: string;

      if (maxParallel <= 1) {
        setProposalSubphase("sap");
        setReportMicroLabel(
          "Step 2: Entity SAP from grid CSV (deterministic rows + Wikipedia MediaWiki pass)…",
        );

        const { sapRows } = await runLocalAnalysisEntitySapPipeline(sapParams);
        sapRowsForRecovery = sapRows;

        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          setPhase("idle");
          setProposalSubphase(null);
          setCompetitorPipelineStep(0);
          setCompetitorPipelineLabel(null);
          setLocalPipelineStep(0);
          setLocalPipelineLabel(null);
          setReportMicroLabel(null);
          return;
        }

        setLastSapScheduleRows(sapRows.length ? sapRows : null);

        const compOut = await runCompetitorReportAgent(srFiltered, trFiltered, {
          siteId: reportSiteId,
          siteName: reportSiteName,
          siteUrl: reportSiteUrl,
          gscSiteQueries: gscForReport.length > 0 ? gscForReport : undefined,
          gscDateRange: gscDateForReport,
          gqDemandSource: neutralResearchWire ? "dfs_seed" : "gsc",
          planMonths: months,
          strategistGuidance: guidanceForStrategist,
          onMicroStep: onCompetitorMicroStep,
        });
        competitorMd = compOut.markdown;
        keywordsMarkdown = compOut.keywordsMarkdown;
        semrushForReport = compOut.semrushForReport;

        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          setPhase("idle");
          setProposalSubphase(null);
          setCompetitorPipelineStep(0);
          setCompetitorPipelineLabel(null);
          setLocalPipelineStep(0);
          setLocalPipelineLabel(null);
          setReportMicroLabel(null);
          setLocalStrategySectionDrafts({});
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
          };
        });
        setProposalSubphase("local");
        setLocalPipelineStep(0);
        setLocalPipelineLabel(null);

        const localOut = await runLocalStrategyReportAgent(srFiltered, trFiltered, {
          siteId: reportSiteId,
          siteName: reportSiteName ?? null,
          siteUrl: reportSiteUrl,
          businessNameQuery: bizQ || seedForApi,
          geoLabel: null,
          gmbDfsRaw: gmbDfsForPipeline ?? null,
          gmbOauth: gmbOauthForPipeline,
          gscSiteQueries: gscForReport.length > 0 ? gscForReport : undefined,
          gscDateRange: gscDateForReport,
          gqDemandSource: neutralResearchWire ? "dfs_seed" : "gsc",
          planMonths: months,
          siteAudit: siteAuditForReport,
          strategistGuidance: guidanceForStrategist,
          onMicroStep: onReportMicroStep,
          onStrategistSectionReady: onLocalStrategySectionReady,
        });
        localMd = localOut.markdown;

        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          setPhase("idle");
          setProposalSubphase(null);
          setCompetitorPipelineStep(0);
          setCompetitorPipelineLabel(null);
          setLocalPipelineStep(0);
          setLocalPipelineLabel(null);
          setReportMicroLabel(null);
          setLocalStrategySectionDrafts({});
          return;
        }
      } else {
        setProposalSubphase("parallel");
        setCompetitorPipelineStep(0);
        setCompetitorPipelineLabel(null);
        setLocalPipelineStep(0);
        setLocalPipelineLabel(null);
        setReportMicroLabel(
          maxParallel === 2
            ? "Steps 2–3: Entity SAP and competitor strategist (parallel); then local blueprint…"
            : "Steps 2–4: Entity SAP, competitor strategist, and local blueprint (parallel)…",
        );

        const sapPromise = runLocalAnalysisEntitySapPipeline(sapParams).then((r) => {
          sapRowsForRecovery = r.sapRows;
          if (activeWorkspaceKeyRef.current === runKeySnapshot) {
            setLastSapScheduleRows(r.sapRows.length ? r.sapRows : null);
          }
          return r;
        });

        const competitorPromise = runCompetitorReportAgent(srFiltered, trFiltered, {
          siteId: reportSiteId,
          siteName: reportSiteName,
          siteUrl: reportSiteUrl,
          gscSiteQueries: gscForReport.length > 0 ? gscForReport : undefined,
          gscDateRange: gscDateForReport,
          gqDemandSource: neutralResearchWire ? "dfs_seed" : "gsc",
          planMonths: months,
          strategistGuidance: guidanceForStrategist,
          onMicroStep: onCompetitorMicroStepParallel,
        });

        if (maxParallel === 2) {
          const [sapResult, compOut] = await Promise.all([sapPromise, competitorPromise]);

          if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
            setPhase("idle");
            setProposalSubphase(null);
            setCompetitorPipelineStep(0);
            setCompetitorPipelineLabel(null);
            setLocalPipelineStep(0);
            setLocalPipelineLabel(null);
            setReportMicroLabel(null);
            setLocalStrategySectionDrafts({});
            return;
          }

          sapRowsForRecovery = sapResult.sapRows;
          competitorMd = compOut.markdown;
          keywordsMarkdown = compOut.keywordsMarkdown;
          semrushForReport = compOut.semrushForReport;

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
            };
          });

          setProposalSubphase("local");
          setLocalPipelineStep(0);
          setLocalPipelineLabel(null);

          const localOut = await runLocalStrategyReportAgent(srFiltered, trFiltered, {
            siteId: reportSiteId,
            siteName: reportSiteName ?? null,
            siteUrl: reportSiteUrl,
            businessNameQuery: bizQ || seedForApi,
            geoLabel: null,
            gmbDfsRaw: gmbDfsForPipeline ?? null,
            gmbOauth: gmbOauthForPipeline,
            gscSiteQueries: gscForReport.length > 0 ? gscForReport : undefined,
            gscDateRange: gscDateForReport,
            gqDemandSource: neutralResearchWire ? "dfs_seed" : "gsc",
            planMonths: months,
            siteAudit: siteAuditForReport,
            strategistGuidance: guidanceForStrategist,
            onMicroStep: onReportMicroStep,
            onStrategistSectionReady: onLocalStrategySectionReady,
          });
          localMd = localOut.markdown;

          if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
            setPhase("idle");
            setProposalSubphase(null);
            setCompetitorPipelineStep(0);
            setCompetitorPipelineLabel(null);
            setLocalPipelineStep(0);
            setLocalPipelineLabel(null);
            setReportMicroLabel(null);
            setLocalStrategySectionDrafts({});
            return;
          }
        } else {
          const localPromise = runLocalStrategyReportAgent(srFiltered, trFiltered, {
            siteId: reportSiteId,
            siteName: reportSiteName ?? null,
            siteUrl: reportSiteUrl,
            businessNameQuery: bizQ || seedForApi,
            geoLabel: null,
            gmbDfsRaw: gmbDfsForPipeline ?? null,
            gmbOauth: gmbOauthForPipeline,
            gscSiteQueries: gscForReport.length > 0 ? gscForReport : undefined,
            gscDateRange: gscDateForReport,
            gqDemandSource: neutralResearchWire ? "dfs_seed" : "gsc",
            planMonths: months,
            siteAudit: siteAuditForReport,
            strategistGuidance: guidanceForStrategist,
            onMicroStep: onReportMicroStepParallel,
            onStrategistSectionReady: onLocalStrategySectionReady,
          });

          const [sapResult, compOut, localOut] = await Promise.all([
            sapPromise,
            competitorPromise,
            localPromise,
          ]);

          if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
            setPhase("idle");
            setProposalSubphase(null);
            setCompetitorPipelineStep(0);
            setCompetitorPipelineLabel(null);
            setLocalPipelineStep(0);
            setLocalPipelineLabel(null);
            setReportMicroLabel(null);
            setLocalStrategySectionDrafts({});
            return;
          }

          sapRowsForRecovery = sapResult.sapRows;
          competitorMd = compOut.markdown;
          keywordsMarkdown = compOut.keywordsMarkdown;
          semrushForReport = compOut.semrushForReport;
          localMd = localOut.markdown;

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
            };
          });
        }
      }

      setReportMd(localMd);
      const combined = buildCombinedProposalMarkdown({
        competitorMd,
        keywordsMd: keywordsMarkdown ?? null,
        localMd,
      });
      setCombinedMd(combined);

      setProposalSubphase(null);
      setCompetitorPipelineStep(0);
      setCompetitorPipelineLabel(null);
      setLocalPipelineStep(0);
      setLocalPipelineLabel(null);
      setReportMicroLabel("Content blog CSV (matrix)…");
      if (contentMaxRows > 0) {
        contentRows = buildProposalMatrixContentCsvRows({
          siteName: siteDisplayName,
          semrush: srFiltered,
          reportMd: competitorMd,
          maxRows: contentMaxRows,
        });
      }

      setLastPostsBulkRows(contentRows.length ? contentRows : null);

      setReportMicroLabel("Client meeting script for specialist (OpenRouter)…");
      let presenterTalkScriptOk = false;
      try {
        const script = await runProposalTalkScript({
          apiKey: apiKeyForReports.trim(),
          model: researchModelId,
          gridSummaryMarkdown: gridSapSummaryMarkdown.trim() || "",
          combinedMarkdown: combined,
          strategistGuidance: guidanceForStrategist,
          meta: {
            siteLabel: siteDisplayName,
            months,
            entitySapRowCount: sapRowsForRecovery.length,
            contentBlogRowCount: contentRows.length,
            geoLabel: null,
          },
        });
        const trimmed = script.trim();
        setTalkScriptMd(trimmed || null);
        presenterTalkScriptOk = Boolean(trimmed);
      } catch (e) {
        setTalkScriptMd(null);
        const msg = e instanceof Error ? e.message : String(e);
        notify.warning(notifyPresenterTalkScriptFailedX(msg));
      }
      setReportMicroLabel(null);

      setPhase("idle");
      setProposalSubphase(null);
      setCompetitorPipelineStep(0);
      setCompetitorPipelineLabel(null);
      setLocalPipelineStep(0);
      setLocalPipelineLabel(null);

      notify.success(
        presenterTalkScriptOk ? "Proposal ready (client meeting script for specialist included)." : "Proposal ready",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase("idle");
      setProposalSubphase(null);
      setCompetitorPipelineStep(0);
      setCompetitorPipelineLabel(null);
      setLocalPipelineStep(0);
      setLocalPipelineLabel(null);
      setReportMicroLabel(null);
      setLocalStrategySectionDrafts({});
      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        return;
      }
      const hasSap = sapRowsForRecovery.length > 0;
      const hasPosts = contentRows.length > 0;
      if (hasSap) {
        setLastSapScheduleRows(sapRowsForRecovery);
      }
      if (hasPosts) {
        setLastPostsBulkRows(contentRows);
      }
      if (hasSap && hasPosts) {
        notify.warning(NOTIFY_PROPOSAL_INCOMPLETE_SAP_AND_BLOG_ROWS_SA);
      } else if (hasSap) {
        notify.warning(NOTIFY_PROPOSAL_INCOMPLETE_SAP_ROWS_SAVED);
      } else if (hasPosts) {
        notify.warning(NOTIFY_PROPOSAL_INCOMPLETE_BLOG_ROWS_SAVED);
      }
    }
  }, [
    workspaceMode,
    semrushData,
    tiers,
    selectedCompetitorKeys,
    workspaceKey,
    effectiveSeedUrl,
    effectivePortfolioHosts,
    neutralResearchWire,
    site,
    businessNameQuery,
    gmbDfsRaw,
    gmbOauth,
    gscQueries,
    gscDateRange,
    onReportMicroStep,
    onCompetitorMicroStep,
    onCompetitorMicroStepParallel,
    onReportMicroStepParallel,
    onLocalStrategySectionReady,
    reportDownloadSlug,
    scheduleMonths,
    contentBlogsPerMonth,
    gridSapSummaryMarkdown,
    gridSapPlaceHints,
    gridSapKeywordWeights,
    gridSapParsedRows,
    strategistGuidance,
  ]);

  const proposalPackageDisabled =
    !combinedMd?.trim() && !lastPostsBulkRows?.length && !lastSapScheduleRows?.length;

  const copyProposalPackage = useCallback(async () => {
    if (proposalPackageDisabled) {
      notify.error(NOTIFY_GENERATE_A_PROPOSAL_FIRST);
      return;
    }
    try {
      const md = buildProposalReportMarkdown(combinedMd ?? "");
      await navigator.clipboard.writeText(md);
      notify.success(NOTIFY_PROPOSAL_COPIED);
    } catch {
      notify.error(NOTIFY_COULD_NOT_COPY);
    }
  }, [combinedMd, proposalPackageDisabled]);

  const downloadEntitySapCsv = useCallback(() => {
    if (!lastSapScheduleRows?.length) {
      notify.error(NOTIFY_ENTITY_SAP_CSV_IS_NOT_READY_YET);
      return;
    }
    downloadLocalAnalysisBulkCsv(lastSapScheduleRows, `proposal-sap-${reportDownloadSlug}`, { skipNotify: false });
  }, [lastSapScheduleRows, reportDownloadSlug]);

  const downloadStrategyMarkdownOnly = useCallback(() => {
    const md = buildProposalReportMarkdown(combinedMd ?? "").trim();
    if (!md) {
      notify.error(NOTIFY_STRATEGY_MARKDOWN_IS_NOT_READY_YET);
      return;
    }
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proposal-strategy-${reportDownloadSlug}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    notify.success(NOTIFY_DOWNLOADED_STRATEGY_MD);
  }, [combinedMd, reportDownloadSlug]);

  const downloadPostsCsvOnly = useCallback(() => {
    if (!lastPostsBulkRows?.length) {
      notify.error(NOTIFY_POSTS_CSV_IS_NOT_READY_YET);
      return;
    }
    downloadLocalAnalysisBulkCsv(lastPostsBulkRows, `proposal-posts-${reportDownloadSlug}`, { skipNotify: false });
  }, [lastPostsBulkRows, reportDownloadSlug]);

  const downloadClientMeetingScriptOnly = useCallback(() => {
    const md = talkScriptMd?.trim();
    if (!md) {
      notify.error(NOTIFY_CLIENT_MEETING_SCRIPT_IS_NOT_READY_YET);
      return;
    }
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proposal-client-meeting-script-${reportDownloadSlug}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    notify.success(NOTIFY_DOWNLOADED_CLIENT_MEETING_SCRIPT_MD);
  }, [talkScriptMd, reportDownloadSlug]);

  const downloadProposalPackage = useCallback(() => {
    if (proposalPackageDisabled) {
      notify.error(NOTIFY_GENERATE_A_PROPOSAL_FIRST);
      return;
    }
    const md = buildProposalReportMarkdown(combinedMd ?? "");
    if (md.trim()) {
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proposal-strategy-${reportDownloadSlug}-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }

    const slug = reportDownloadSlug;
    // Same synchronous user gesture as the .md click - avoids browsers blocking delayed downloads.
    if (lastSapScheduleRows?.length) {
      downloadLocalAnalysisBulkCsv(lastSapScheduleRows, `proposal-sap-${slug}`, { skipNotify: true });
    }
    if (lastPostsBulkRows?.length) {
      downloadLocalAnalysisBulkCsv(lastPostsBulkRows, `proposal-posts-${slug}`, { skipNotify: true });
    }

    if (talkScriptMd?.trim()) {
      const blobTalk = new Blob([talkScriptMd], { type: "text/markdown;charset=utf-8" });
      const urlTalk = URL.createObjectURL(blobTalk);
      const aTalk = document.createElement("a");
      aTalk.href = urlTalk;
      aTalk.download = `proposal-client-meeting-script-${slug}-${Date.now()}.md`;
      aTalk.click();
      URL.revokeObjectURL(urlTalk);
    }

    const hadStrategyMd = md.trim().length > 0;
    const hadTalk = Boolean(talkScriptMd?.trim());
    notify.success(
      hadStrategyMd
        ? hadTalk
          ? "Downloaded strategy .md, CSVs when present, then client meeting script."
          : "Downloaded strategy .md; then SAP CSV and content posts CSV when generated."
        : "Downloaded CSV(s) (strategy .md will be included after the blueprint finishes).",
    );
  }, [combinedMd, lastPostsBulkRows, lastSapScheduleRows, proposalPackageDisabled, reportDownloadSlug, talkScriptMd]);

  const downloadLocalStrategySectionMarkdown = useCallback(
    (section: LocalStrategyReportSectionIndex) => {
      const md = localStrategySectionDrafts[section]?.markdown?.trim();
      if (!md) return;
      const slug = safeDomainForFilename(reportDownloadSlug || "report");
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `local-strategy-blueprint-section-${section}-${slug}-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [localStrategySectionDrafts, reportDownloadSlug],
  );

  const downloadLocalStrategySectionPostJson = useCallback(
    (section: LocalStrategyReportSectionIndex) => {
      const raw = localStrategySectionDrafts[section]?.requestBodyJson;
      if (!raw) return;
      const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `openrouter-local-strategy-section-${section}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [localStrategySectionDrafts],
  );

  const downloadGridCsv = useCallback(() => {
    if (!semrushData?.rows?.length) {
      notify.error(NOTIFY_RUN_ANALYZE_FIRST_OR_IMPORT_A_GRID_CSV);
      return;
    }
    const csv = buildLocalStrategyGridExportCsv({ semrush: semrushData, tiers });
    triggerDownloadCsv(`local-strategy-grid-${reportDownloadSlug}-${Date.now()}.csv`, csv);
    notify.success(NOTIFY_GRID_CSV_DOWNLOADED);
  }, [semrushData, tiers, reportDownloadSlug]);

  const importDominatorGridCsv = useCallback(
    async (file: File) => {
      if (workspaceMode === "connected") {
        if (!site?.siteUrl?.trim()) {
          notify.error(NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL);
          return;
        }
      } else if (!effectiveSeedUrl) {
        notify.error(NOTIFY_ENTER_A_SEED_SITE_URL_FIRST);
        return;
      }
      if (file.size > MAX_LOCAL_CSV_FILE_BYTES) {
        notify.error(notifyFileTooLargeMaxXMb(Math.round(MAX_LOCAL_CSV_FILE_BYTES / 1024 / 1024)));
        return;
      }
      const runKeySnapshot = workspaceKey;
      const seedForApi = effectiveSeedUrl;
      const tierSiteId = neutralResearchWire ? undefined : site?.id;
      const tierSiteName = neutralResearchWire ? undefined : site?.name;
      setError(null);
      setGridCsvBusy(true);
      setGridCsvProgress("Parsing CSV…");
      try {
        const csvText = await file.text();
        setGridCsvProgress("Parsing grid for SAP (rank evidence)…");
        const useWorker = file.size >= LOCAL_CSV_WORKER_FILE_BYTES_THRESHOLD;
        const gridSapRes = await processLocalDominatorCsvText(csvText, useWorker);
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          return;
        }
        if (gridSapRes.ok) {
          setGridSapSummaryMarkdown(gridSapRes.gridSummaryMarkdown);
          setGridSapPlaceHints(gridSapRes.placeHints);
          setGridSapKeywordWeights(gridSapRes.gridKeywordWeights);
          setGridSapParsedRows(gridSapRes.gridRowsForDirectSap);
        } else {
          setGridSapSummaryMarkdown("");
          setGridSapPlaceHints([]);
          setGridSapKeywordWeights([]);
          setGridSapParsedRows([]);
          notify.warning(notifyGridCsvSapScanX(gridSapRes.error));
        }

        const parsed = parseCompetitorGridTopPlaces(csvText);
        if (parsed.error) {
          throw new Error(parsed.error);
        }

        let baseSemrush: CompetitorResearchSemrushResponse;
        if (semrushData) {
          baseSemrush = semrushData;
        } else {
          const srRaw = await fetchCompetitorResearchForTab({
            semrushEnhanced: LOCAL_ORGANIC_SOURCE,
            siteUrl: seedForApi,
            portfolioBlockedHosts: effectivePortfolioHosts,
            displayLimit: 50,
          });
          if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
            return;
          }
          if (srRaw.errors?.length) {
            notify.warning(srRaw.errors.map((e) => e.message).join("; "));
          }
          const sr = filterMainCompetitorResearchResponse(srRaw);
          baseSemrush = {
            ...sr,
            rows: [],
            enrichmentByDomain: {},
            domainOrganicCsvByDomain: {},
          };
          setSemrushData(baseSemrush);
        }
        const seedKey = normalizeCompetitorDomainKey(seedForApi);
        const seen = new Set<string>();
        const toFetch: string[] = [];

        setGridCsvProgress(`Researching ${parsed.places.length} place(s) from the grid…`);
        const dfsResults = await fetchGridCompetitorHostnamesParallel(parsed.places);
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          return;
        }
        for (const { place, host, error } of dfsResults) {
          if (error) {
            notify.error(notifyGridXXX(place.businessName, place.idLabel, error));
            continue;
          }
          if (!host) {
            notify.error(notifyGridXXNoWebsite(place.businessName, place.idLabel));
            continue;
          }
          if (isNonMainCompetitorDomain(host)) {
            notify.warning(notifyGridSkipX(host));
            continue;
          }
          const dk = normalizeCompetitorDomainKey(host);
          if (!dk || dk === seedKey) {
            continue;
          }
          if (isPortfolioBlockedHost(dk, effectivePortfolioHosts)) {
            continue;
          }
          if (seen.has(dk)) {
            continue;
          }
          seen.add(dk);
          toFetch.push(host);
        }

        if (toFetch.length === 0) {
          notify.warning(NOTIFY_NO_NEW_COMPETITORS_FROM_GRID);
          return;
        }

        let merged: CompetitorResearchSemrushResponse = {
          ...baseSemrush,
          rows: [...baseSemrush.rows],
          enrichmentByDomain: { ...(baseSemrush.enrichmentByDomain ?? {}) },
          domainOrganicCsvByDomain: { ...(baseSemrush.domainOrganicCsvByDomain ?? {}) },
        };
        const gridImportedDomainKeys: string[] = [];
        let semrushNewRows = 0;
        let semrushRefreshedRows = 0;

        type GridRowResult =
          | {
              ok: true;
              domainForApi: string;
              row: Awaited<ReturnType<typeof fetchManualCompetitorDomainForTab>>["row"];
              enrichment: Awaited<ReturnType<typeof fetchManualCompetitorDomainForTab>>["enrichment"];
              domainOrganicCsv: string;
              manualErrors?: Awaited<ReturnType<typeof fetchManualCompetitorDomainForTab>>["errors"];
            }
          | { ok: false; domainForApi: string; message: string };

        const rowResults: GridRowResult[] = [];
        for (let i = 0; i < toFetch.length; i++) {
          const domainForApi = toFetch[i]!;
          setGridCsvProgress(`Research ${i + 1}/${toFetch.length} (${domainForApi})…`);
          try {
            const { row, enrichment, domainOrganicCsv, errors: manualErrors } = await fetchManualCompetitorDomainForTab({
              semrushEnhanced: LOCAL_ORGANIC_SOURCE,
              domain: domainForApi,
              siteUrl: seedForApi,
            });
            rowResults.push({ ok: true, domainForApi, row, enrichment, domainOrganicCsv, manualErrors });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            rowResults.push({ ok: false, domainForApi, message: msg });
          }
        }
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          return;
        }
        let mergedRows = [...merged.rows];
        let enrichmentByDomain = { ...(merged.enrichmentByDomain ?? {}) };
        let domainOrganicCsvByDomain = { ...(merged.domainOrganicCsvByDomain ?? {}) };
        for (const r of rowResults) {
          if (r.ok === false) {
            notify.error(notifyResearchXX(r.domainForApi, r.message));
            continue;
          }
          if (r.manualErrors?.length) {
            notify.warning(r.manualErrors.map((e) => e.message).join("; "));
          }
          const dk = normalizeCompetitorDomainKey(r.row.domain);
          gridImportedDomainKeys.push(dk);
          const csvRow =
            r.domainOrganicCsv.trim() ||
            buildDomainOrganicCsvFromKeywordRows(r.enrichment.topKeywords, DOMAIN_ORGANIC_CSV_TOP_ROWS);
          const existingIdx = mergedRows.findIndex((row) => normalizeCompetitorDomainKey(row.domain) === dk);
          if (existingIdx >= 0) {
            mergedRows = mergedRows.map((row, i) => (i === existingIdx ? r.row : row));
            semrushRefreshedRows++;
          } else {
            mergedRows = [...mergedRows, r.row];
            semrushNewRows++;
          }
          enrichmentByDomain = { ...enrichmentByDomain, [dk]: r.enrichment };
          domainOrganicCsvByDomain = { ...domainOrganicCsvByDomain, [dk]: csvRow };
        }
        merged = {
          ...merged,
          rows: mergedRows,
          enrichmentByDomain,
          domainOrganicCsvByDomain,
        };
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          return;
        }
        setSemrushData(merged);
        const tieredRaw = await runCompetitorTierAgent(merged, {
          siteId: tierSiteId,
          siteName: tierSiteName,
          seedSiteUrl: seedForApi,
          semrushDatabase: merged.database,
          gscSiteQueries: gscQueries.length > 0 ? gscQueries : undefined,
          gscDateRange: gscDateRange ?? null,
        });
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          return;
        }
        const tiered = mergeGridCompetitorsAsDirectTier(tieredRaw, gridImportedDomainKeys, merged.rows);
        setTiers(tiered);
        if (semrushNewRows > 0 && semrushRefreshedRows > 0) {
          notify.success(
            `Added ${semrushNewRows} competitor(s) from grid CSV; updated ${semrushRefreshedRows} already listed.`,
          );
        } else if (semrushNewRows > 0) {
          notify.success(notifyAddedXCompetitorSFromGridCsv(semrushNewRows));
        } else if (semrushRefreshedRows > 0) {
          notify.success(notifyUpdatedXCompetitorSFromGridCsvWer(semrushRefreshedRows));
        } else {
          notify.success(NOTIFY_GRID_IMPORT_DONE);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setGridCsvBusy(false);
        setGridCsvProgress(null);
        if (gridCsvFileRef.current) gridCsvFileRef.current.value = "";
      }
    },
    [
      semrushData,
      site,
      effectivePortfolioHosts,
      gscQueries,
      gscDateRange,
      workspaceMode,
      effectiveSeedUrl,
      neutralResearchWire,
      workspaceKey,
      site,
    ],
  );

  const onGridCsvFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      void importDominatorGridCsv(f);
    },
    [importDominatorGridCsv],
  );

  const busy = phase !== "idle" || gridCsvBusy;

  const reportProgressPct = useMemo(() => {
    if (phase !== "report") return 0;
    if (proposalSubphase === "parallel") {
      const c =
        REPORT_PIPELINE_MICRO_TOTAL > 0 ? competitorPipelineStep / REPORT_PIPELINE_MICRO_TOTAL : 0;
      const l =
        LOCAL_STRATEGY_REPORT_MICRO_TOTAL > 0
          ? localPipelineStep / LOCAL_STRATEGY_REPORT_MICRO_TOTAL
          : 0;
      return Math.min(100, ((c + l) / 2) * 100);
    }
    if (proposalSubphase === "competitor" && REPORT_PIPELINE_MICRO_TOTAL > 0) {
      return Math.min(100, (competitorPipelineStep / REPORT_PIPELINE_MICRO_TOTAL) * 100);
    }
    if (proposalSubphase === "local" && LOCAL_STRATEGY_REPORT_MICRO_TOTAL > 0) {
      return Math.min(100, (localPipelineStep / LOCAL_STRATEGY_REPORT_MICRO_TOTAL) * 100);
    }
    return 0;
  }, [phase, proposalSubphase, competitorPipelineStep, localPipelineStep]);

  const blueprintArtifacts = useMemo(() => {
    if (!combinedMd?.trim() && !lastPostsBulkRows?.length && !lastSapScheduleRows?.length) return [];
    return [{ id: "proposal", label: "Proposal", kind: "md" as const }];
  }, [combinedMd, lastPostsBulkRows, lastSapScheduleRows]);

  /** During local OpenRouter passes, or after a successful run so S1–S11 + Script stay visible. */
  const showBlueprintSectionsPanel = useMemo(() => {
    const duringLocalBlueprint =
      (phase === "report" && proposalSubphase === "parallel" && localPipelineStep >= 2) ||
      (phase === "report" && proposalSubphase === "local" && localPipelineStep >= 2);
    const afterRunWithMarkdown =
      phase === "idle" && Boolean(combinedMd?.trim() || talkScriptMd?.trim());
    return duringLocalBlueprint || afterRunWithMarkdown;
  }, [phase, proposalSubphase, localPipelineStep, combinedMd, talkScriptMd]);

  const [blueprintOutputTab, setBlueprintOutputTab] = useState("0");

  useEffect(() => {
    setBlueprintOutputTab("0");
  }, [blueprintArtifacts.length, combinedMd, lastPostsBulkRows, lastSapScheduleRows]);

  const canOpenDetails = useMemo(
    () =>
      busy ||
      Boolean(combinedMd?.trim()) ||
      Boolean(error) ||
      Boolean(gscError) ||
      Boolean(gridSapSummaryMarkdown.trim()),
    [busy, combinedMd, error, gscError, gridSapSummaryMarkdown],
  );

  return (
    <div
      className={cn(
        studioEmbedded
          ? "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950"
          : SEO_WORKSPACE_SHELL_CLASS,
        SEO_WORKSPACE_TYPO_CLASS,
      )}
    >
      {studioEmbedded && band2Target
        ? createPortal(
            <ProposalToolbar
              busy={busy}
              phase={phase}
              gridCsvBusy={gridCsvBusy}
              hasSemrushRows={Boolean(semrushData?.rows?.length)}
              proposalPackageDisabled={proposalPackageDisabled}
              hasCombinedMd={Boolean(combinedMd?.trim())}
              gridCsvFileRef={gridCsvFileRef}
              onGridCsvFileChange={onGridCsvFileChange}
              onDownloadGridCsv={downloadGridCsv}
              onAnalyze={() => void analyze()}
              onGenerateProposal={() => void generateProposal()}
              onCopyProposal={() => void copyProposalPackage()}
              onDownloadProposalPackage={downloadProposalPackage}
            />,
            band2Target,
          )
        : null}

      {workspaceMode === "connected" && (!site || !site.siteUrl?.trim()) ? (
        <div className="neo-pulse-zone-tile--data px-2 py-3 text-base leading-normal text-muted-foreground">
          {!site
            ? "Connect a WordPress site and select it in the header, or switch to Temp seed."
            : "This site has no URL saved."}
        </div>
      ) : (
        <>
          {!studioEmbedded ? (
            <div className={SEO_WORKSPACE_HEADER_CLASS}>
              <ProposalWorkspaceHeader
                {...generatorChrome}
                onDetailsOpenChange={setDetailsDrawerOpen}
                busy={busy}
                phase={phase}
                proposalSubphase={proposalSubphase}
                competitorPipelineStep={competitorPipelineStep}
                competitorPipelineLabel={competitorPipelineLabel}
                localPipelineStep={localPipelineStep}
                localPipelineLabel={localPipelineLabel}
                reportMicroLabel={reportMicroLabel}
                reportProgressPct={reportProgressPct}
                canOpenDetails={canOpenDetails}
                toolbarProps={{
                  busy,
                  phase,
                  gridCsvBusy,
                  hasSemrushRows: Boolean(semrushData?.rows?.length),
                  proposalPackageDisabled,
                  hasCombinedMd: Boolean(combinedMd?.trim()),
                  gridCsvFileRef,
                  onGridCsvFileChange,
                  onDownloadGridCsv: downloadGridCsv,
                  onAnalyze: () => void analyze(),
                  onGenerateProposal: () => void generateProposal(),
                  onCopyProposal: () => void copyProposalPackage(),
                  onDownloadProposalPackage: downloadProposalPackage,
                }}
                detailsProps={{
                  workspaceMode,
                  phase,
                  proposalSubphase,
                  competitorPipelineStep,
                  competitorPipelineLabel,
                  localPipelineStep,
                  localPipelineLabel,
                  reportMicroLabel,
                  gscError,
                  gridSapSummaryMarkdown,
                  gridCsvBusy,
                  gridCsvProgress,
                  error,
                  hasSapScheduleRows: Boolean(lastSapScheduleRows?.length),
                  onDownloadEntitySapCsv: downloadEntitySapCsv,
                }}
              />
            </div>
          ) : null}

          <div
            className={cn(
              studioEmbedded
                ? "flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto bg-zinc-950 px-4 py-6 sm:px-8"
                : cn(SEO_WORKSPACE_BODY_SCROLL_CLASS, "relative space-y-4"),
            )}
          >
            {detailsDrawerOpen ? (
              <div className={WORKSPACE_DETAILS_DIM_OVERLAY_CLASS} aria-hidden />
            ) : null}
            {studioEmbedded ? (
              <div className="mx-auto w-full max-w-4xl">
                <section className="flex flex-col gap-4 border border-white/10 bg-zinc-900/60 px-6 py-7 sm:px-10 sm:py-8">
                  {/* Slot 1: Header */}
                  <div className="flex w-full items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-base font-semibold text-white">
                      <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <span>Content & Keyword Strategy</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      Research Blueprint & Sizing
                    </span>
                  </div>

                  {/* Slot 2: Primary Textarea */}
                  <Textarea
                    id="proposal-strategist-guidance"
                    value={strategistGuidance}
                    onChange={(e) => setStrategistGuidance(e.target.value)}
                    disabled={busy}
                    rows={3}
                    aria-label="Strategy guidance"
                    placeholder="Angles, tone, priorities, or constraints…"
                    className={cn(
                      MY_SITES_FIELD,
                      "min-h-[7.5rem] h-[7.5rem] w-full resize-y bg-zinc-900 p-3.5 text-sm",
                    )}
                  />

                  {/* Slot 3: Secondary Parameters Grid */}
                  <div className="grid w-full grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex h-10 items-center justify-between rounded-none border border-white/10 bg-zinc-900 px-3">
                      <span className="text-xs text-muted-foreground">Months:</span>
                      <input
                        type="number"
                        min={1}
                        max={6}
                        value={scheduleMonths}
                        onChange={(e) => setScheduleMonths(Number(e.target.value))}
                        disabled={busy}
                        className="h-8 w-16 border-0 bg-transparent text-right font-mono text-sm text-white tabular-nums focus:outline-none"
                      />
                    </div>
                    <div className="flex h-10 items-center justify-between rounded-none border border-white/10 bg-zinc-900 px-3">
                      <span className="text-xs text-muted-foreground">Entity/Month:</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={entitySapPerMonth}
                        onChange={(e) => setEntitySapPerMonth(Number(e.target.value))}
                        disabled={busy}
                        title="Planning only"
                        className="h-8 w-16 border-0 bg-transparent text-right font-mono text-sm text-white tabular-nums focus:outline-none"
                      />
                    </div>
                    <div className="flex h-10 items-center justify-between rounded-none border border-white/10 bg-zinc-900 px-3">
                      <span className="text-xs text-muted-foreground">Content/Month:</span>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={contentBlogsPerMonth}
                        onChange={(e) => setContentBlogsPerMonth(Number(e.target.value))}
                        disabled={busy}
                        className="h-8 w-16 border-0 bg-transparent text-right font-mono text-sm text-white tabular-nums focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Slot 4: Action Footer */}
                  <div className="flex items-center justify-start gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => void generateProposal()}
                      className={cn(BULK_HEADER_RUN_BTN, "h-10 min-w-[8.5rem] px-4")}
                    >
                      <Sparkles className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
                      Proposal
                    </Button>
                  </div>
                </section>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <WorkspaceNestedTextarea
                  id="proposal-strategist-guidance"
                  label="Strategy"
                  placeholder="Angles, tone, priorities, or constraints…"
                  value={strategistGuidance}
                  onChange={(e) => setStrategistGuidance(e.target.value)}
                  disabled={busy}
                  rows={3}
                />

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  <WorkspaceNestedInput
                    type="number"
                    min={1}
                    max={6}
                    layout="inline"
                    label="Months"
                    value={scheduleMonths}
                    onChange={(e) => setScheduleMonths(Number(e.target.value))}
                    disabled={busy}
                  />
                  <WorkspaceNestedInput
                    type="number"
                    min={1}
                    max={50}
                    layout="inline"
                    label="Entity/Month"
                    value={entitySapPerMonth}
                    onChange={(e) => setEntitySapPerMonth(Number(e.target.value))}
                    disabled={busy}
                    title="Planning only"
                  />
                  <WorkspaceNestedInput
                    type="number"
                    min={0}
                    max={50}
                    layout="inline"
                    label="Content/Month"
                    value={contentBlogsPerMonth}
                    onChange={(e) => setContentBlogsPerMonth(Number(e.target.value))}
                    disabled={busy}
                  />
                </div>
              </div>
            )}

            {showBlueprintSectionsPanel ? (
              <div
                className="mt-2 rounded-md border border-border/50 bg-muted/25 px-2 py-1.5 text-left text-base leading-snug text-muted-foreground"
                aria-label="Local blueprint section drafts from OpenRouter, then client meeting Script"
              >
                <div className="font-semibold text-foreground/90">Blueprint sections</div>
                <ul className="mt-1.5 list-none space-y-1.5 pl-0">
                  {LOCAL_STRATEGY_SECTION_INDICES.map((section) => {
                    const draft = localStrategySectionDrafts[section];
                    const hasMd = Boolean(draft?.markdown?.trim());
                    const hasJson = Boolean(draft?.requestBodyJson);
                    return (
                      <li
                        key={section}
                        className="flex flex-col gap-1 border-b border-border/40 pb-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
                      >
                        <span className="min-w-0 shrink text-base text-foreground/85">
                          <span className="text-muted-foreground">S{section}</span> {localStrategySectionLabel(section)}
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 min-h-7 px-2 text-base font-semibold"
                            disabled={!hasMd}
                            title={hasMd ? "Download this section as Markdown" : "Waiting for this section…"}
                            onClick={() => downloadLocalStrategySectionMarkdown(section)}
                          >
                            <Download className="mr-1 h-3.5 w-3.5 shrink-0" />
                            .md
                          </Button>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto min-h-0 p-0 text-base font-semibold leading-snug text-[hsl(var(--semantic-data))] underline underline-offset-2"
                            disabled={!hasJson}
                            title={hasJson ? "Download exact OpenRouter POST JSON for this section" : "Payload not ready yet"}
                            onClick={() => downloadLocalStrategySectionPostJson(section)}
                          >
                            POST .json
                          </Button>
                        </span>
                      </li>
                    );
                  })}
                  <li className="flex flex-col gap-1 border-b-0 pb-0 pt-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                    <span className="min-w-0 shrink text-base font-semibold text-foreground/90">Script</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 min-h-7 px-2 text-base font-semibold"
                        disabled={!talkScriptMd?.trim()}
                        title={
                          talkScriptMd?.trim()
                            ? "Download client meeting script (Markdown)"
                            : "Generated after blueprint sections finish"
                        }
                        onClick={() => void downloadClientMeetingScriptOnly()}
                      >
                        <Download className="mr-1 h-3.5 w-3.5 shrink-0" />
                        .md
                      </Button>
                      <span
                        className="inline-flex min-h-7 min-w-[5.5rem] items-center text-base font-semibold text-foreground"
                        title="No POST JSON for this artifact"
                      >
                        -
                      </span>
                    </span>
                  </li>
                </ul>
              </div>
            ) : null}

          <CompetitorSiteGrid
            tiers={tiers}
            semrush={semrushData}
            selectedKeys={selectedCompetitorKeys}
            onToggleDomain={(domainKey, selected) => {
              setSelectedCompetitorKeys((prev) => {
                const next = new Set(prev);
                if (selected) next.add(domainKey);
                else next.delete(domainKey);
                return next;
              });
            }}
            onToggleAll={(selected) => {
              const rows = semrushData?.rows ?? [];
              if (selected) {
                setSelectedCompetitorKeys(new Set(rows.map((r) => normalizeCompetitorDomainKey(r.domain))));
              } else {
                setSelectedCompetitorKeys(new Set());
              }
            }}
          />

          {combinedMd?.trim() || lastPostsBulkRows?.length || lastSapScheduleRows?.length ? (
            <div className="neo-pulse-zone-tile--analysis mt-2 space-y-2 px-2 py-2 sm:px-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="min-h-[1rem] text-base font-semibold uppercase leading-normal tracking-wide text-muted-foreground">
                    Outputs
                  </div>
                  <p className="mt-1 max-w-prose text-base leading-snug text-muted-foreground">
                    Strategy package plus a separate client meeting script (glossary, talking points, and key bullets per
                    section) for the specialist.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 px-3 text-base font-semibold"
                  title="Download strategy .md, CSVs when present, and client meeting script when generated"
                  disabled={proposalPackageDisabled}
                  onClick={downloadProposalPackage}
                >
                  <FileText className="mr-1 h-3 w-3 shrink-0" />
                  Full package
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border border-border/50 bg-muted/25">
                <table className="w-full min-w-[420px] border-collapse text-left text-base">
                  <thead>
                    <tr className="border-b border-border/50 bg-black/20">
                      <th className="px-2 py-1.5 font-semibold text-foreground">Section ID</th>
                      <th className="px-2 py-1.5 font-semibold text-foreground">Contents</th>
                      <th className="px-2 py-1.5 font-semibold text-foreground">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/40">
                      <td className="max-w-[140px] truncate px-2 py-1.5 text-foreground" title="proposal-strategy">
                        proposal-strategy
                      </td>
                      <td className="max-w-[min(40vw,320px)] px-2 py-1.5 text-foreground">Written strategy (.md)</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 min-h-8 px-2 text-base font-semibold"
                          title="Strategy Markdown only"
                          disabled={!combinedMd?.trim()}
                          onClick={downloadStrategyMarkdownOnly}
                        >
                          <Download className="mr-1 h-3 w-3 shrink-0" />
                          .md
                        </Button>
                      </td>
                    </tr>
                    <tr className="border-b border-border/40">
                      <td className="max-w-[140px] truncate px-2 py-1.5 text-foreground" title="proposal-posts">
                        proposal-posts
                      </td>
                      <td className="max-w-[min(40vw,320px)] px-2 py-1.5 text-foreground">Content posts (CSV)</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 min-h-8 px-2 text-base font-semibold"
                          disabled={!lastPostsBulkRows?.length}
                          onClick={downloadPostsCsvOnly}
                        >
                          <Download className="mr-1 h-3 w-3 shrink-0" />
                          CSV
                        </Button>
                      </td>
                    </tr>
                    <tr
                      className={
                        talkScriptMd?.trim()
                          ? "border-b border-border/40"
                          : "border-b border-border/40 last:border-b-0"
                      }
                    >
                      <td className="max-w-[140px] truncate px-2 py-1.5 text-foreground" title="proposal-sap">
                        proposal-sap
                      </td>
                      <td className="max-w-[min(40vw,320px)] px-2 py-1.5 text-foreground">Entity SAP schedule (CSV)</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 min-h-8 px-2 text-base font-semibold"
                          disabled={!lastSapScheduleRows?.length}
                          onClick={downloadEntitySapCsv}
                        >
                          <Download className="mr-1 h-3 w-3 shrink-0" />
                          CSV
                        </Button>
                      </td>
                    </tr>
                    {talkScriptMd?.trim() ? (
                      <tr className="border-b border-border/40 last:border-b-0">
                        <td
                          className="max-w-[140px] truncate px-2 py-1.5 text-foreground"
                          title="proposal-client-meeting-script"
                        >
                          proposal-client-meeting-script
                        </td>
                        <td className="max-w-[min(40vw,320px)] px-2 py-1.5 text-foreground">
                          Client meeting script for specialist (.md)
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 min-h-8 px-2 text-base font-semibold"
                            title="Plain language, glossary, talking points, key bullets per section"
                            onClick={downloadClientMeetingScriptOnly}
                          >
                            <Download className="mr-1 h-3 w-3 shrink-0" />
                            .md
                          </Button>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {blueprintArtifacts.length > 0 ? (
            <div className="neo-pulse-zone-tile--analysis mt-2 space-y-3 px-2 py-2 sm:px-3">
              <div className="min-h-[1rem] text-base font-semibold uppercase leading-normal tracking-wide text-muted-foreground">
                Outputs
              </div>
              <Tabs value={blueprintOutputTab} onValueChange={setBlueprintOutputTab} className="flex min-h-0 flex-col gap-2">
                <TabsList className="inline-flex h-auto min-h-9 w-full flex-wrap justify-start gap-1 rounded-md border border-[hsl(var(--semantic-analysis)/0.48)] bg-black/30 p-0.5">
                  {blueprintArtifacts.map((a, i) => (
                    <TabsTrigger
                      key={a.id}
                      value={String(i)}
                      className="inline-flex max-w-[min(100%,18rem)] shrink-0 items-center gap-1.5 px-2 py-1.5 text-left text-base font-semibold normal-case leading-snug tracking-normal data-[state=active]:rounded-sm data-[state=active]:bg-[hsl(var(--semantic-analysis)/0.18)] data-[state=active]:text-primary"
                    >
                      <span className="min-w-0 truncate" title={a.label}>
                        {a.label}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="inline-flex shrink-0 cursor-pointer rounded-sm p-0.5 text-muted-foreground hover:bg-black/40 hover:text-primary"
                            role="button"
                            tabIndex={0}
                            aria-label={`Proposal: ${a.label}`}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              downloadProposalPackage();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                downloadProposalPackage();
                              }
                            }}
                          >
                            <FileText className="h-3.5 w-3.5" aria-hidden />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-base">
                          Download package
                        </TooltipContent>
                      </Tooltip>
                    </TabsTrigger>
                  ))}
                </TabsList>
                {blueprintArtifacts.map((a, i) => (
                  <TabsContent key={a.id} value={String(i)} className="mt-0 min-h-0 data-[state=inactive]:hidden" />
                ))}
              </Tabs>
            </div>
          ) : null}

          {combinedMd?.trim() ? (
            <div className="neo-pulse-zone-tile--analysis mt-2 space-y-2 px-2 py-2 sm:px-3">
              <div className="min-h-[1rem] text-base font-semibold uppercase leading-normal tracking-wide text-muted-foreground">
                Proposal preview
              </div>
              <div className="h-[min(50vh,28rem)] min-h-0 min-w-0 overflow-y-auto overflow-x-auto rounded-md border border-border/50 bg-black/20">
                <pre className="whitespace-pre-wrap break-words p-3 text-base leading-relaxed text-foreground">
                  {combinedMd}
                </pre>
              </div>
            </div>
          ) : null}
          </div>
        </>
      )}
    </div>
  );
}
