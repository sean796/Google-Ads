import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, MapPin, Sparkles, Upload } from "lucide-react";
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
import {
  fetchCompetitorGscQueries,
  getDefaultGscCompetitorDateRange,
  type FetchCompetitorGscQueriesResult,
} from "@/lib/competitor-research/competitor-gsc-queries";
import { buildDemandQueriesFromSeedKeywords } from "@/lib/competitor-research/competitor-seed-demand-as-gq";
import {
  filterMainCompetitorResearchResponse,
  isNonMainCompetitorDomain,
} from "@/lib/competitor-research/filter-main-competitor-rows";
import { runCompetitorTierAgent } from "@/lib/competitor-research/competitor-tier-agent";
import { parseCompetitorGridTopPlaces } from "@/lib/competitor-research/local-dominator-grid-parse";
import { fetchGridCompetitorHostnamesParallel } from "@/lib/competitor-research/competitor-grid-dfs-client";
import { mergeGridCompetitorsAsDirectTier } from "@/lib/competitor-research/competitor-grid-tier-merge";
import {
  buildDomainOrganicCsvFromKeywordRows,
  DOMAIN_ORGANIC_CSV_TOP_ROWS,
} from "@/lib/competitor-research/competitor-domain-organic-csv";
import { MAX_LOCAL_CSV_FILE_BYTES, type LocalDominatorRow } from "@/lib/local-dominator-csv";
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
import { NOTIFY_ANALYZE_DONE, NOTIFY_COULD_NOT_COPY, NOTIFY_ENTER_A_SEED_SITE_URL_FIRST, NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM, NOTIFY_ENTITY_SAP_CSV_READY, NOTIFY_GENERATE_A_REPORT_FIRST, NOTIFY_GRID_CSV_DOWNLOADED, NOTIFY_GRID_IMPORT_DONE, NOTIFY_LOCAL_BLUEPRINT_READY, NOTIFY_MARKDOWN_COPIED, NOTIFY_NO_NEW_COMPETITORS_FROM_GRID, NOTIFY_NO_SAP_SCHEDULE_CSV_YET, NOTIFY_RUN_ANALYZE_FIRST, NOTIFY_RUN_ANALYZE_FIRST_OR_IMPORT_A_GRID_CSV, NOTIFY_SAP_CSV_SKIPPED, NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR, NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL, notifyAddedXCompetitorSFromGridCsv, notifyAddedXCompetitorSFromGridCsvUpdat, notifyDataforseoXX, notifyDfsSkipX, notifyDfsXXNoWebsite, notifyDfsXXX, notifyDownloadedXSapRowS, notifyFileTooLargeMaxXMb, notifyGridCsvSapScanX, notifyGscX2, notifyUpdatedXCompetitorSFromGridCsvWer } from "@/lib/notify-messages";
import { CompetitorSiteGrid } from "@/components/research/competitor/CompetitorSiteGrid";
import { downloadLocalAnalysisBulkCsv } from "@/lib/local-analysis-csv-export";
import { getOptimizationSettings, getResearchModel } from "@/lib/optimization-settings-storage";
import { getPrimaryCityStateLabel, resolvePrimaryLocationLabel } from "@/lib/primary-location-from-site";
import { buildLocalStrategyGridExportCsv } from "@/lib/local-strategy-research/local-strategy-grid-export-csv";
import { runManagerLocalAnalysisAnalyze } from "@/lib/local-strategy-research/manager-local-analysis-analyze";
import { runLocalAnalysisEntitySapPipeline } from "@/lib/local-strategy-research/local-analysis-entity-sap-pipeline";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import {
  REPORTING_TOOLBAR_BTN,
  REPORTING_TOOLBAR_BTN_DATA,
  REPORTING_TOOLBAR_BTN_PUBLISH,
} from "@/components/research/reporting/reporting-toolbar-styles";
import { cn } from "@/lib/utils";
import { Button, Field, FileInput, TextButton } from "@/ui";

/** Local strategy uses DataForSEO Labs only - Semrush API is never required. */
const LOCAL_ORGANIC_SOURCE = false;

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
  if (section === 1) return "Ascend & Expand - opening (H1)";
  return LOCAL_STRATEGY_REQUIRED_H2[section - 2] ?? `Section ${section}`;
}

export function LocalStrategyResearchTab() {
  const { sites } = useWordPressSites();
  const {
    mode: workspaceMode,
    tempSeedUrl,
    setTempSeedUrl,
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
  const [phase, setPhase] = useState<"idle" | "semrush" | "report">("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedCompetitorKeys, setSelectedCompetitorKeys] = useState<Set<string>>(() => new Set());
  const [reportPipelineStep, setReportPipelineStep] = useState(0);
  const [reportMicroLabel, setReportMicroLabel] = useState<string | null>(null);
  const [gmbDfsRaw, setGmbDfsRaw] = useState<unknown | null>(null);
  const [gmbOauth, setGmbOauth] = useState<LocalStrategyGmbOauthWire | null>(null);
  const [geoLabel, setGeoLabel] = useState("");
  const [businessNameQuery, setBusinessNameQuery] = useState("");
  const [gridCsvBusy, setGridCsvBusy] = useState(false);
  const [gridCsvProgress, setGridCsvProgress] = useState<string | null>(null);
  /** Local Dominator grid markdown + weights for SAP (same upload as competitor grid CSV). */
  const [gridSapSummaryMarkdown, setGridSapSummaryMarkdown] = useState("");
  const [gridSapPlaceHints, setGridSapPlaceHints] = useState<string[]>([]);
  const [gridSapKeywordWeights, setGridSapKeywordWeights] = useState<GridKeywordWeight[]>([]);
  const [gridSapParsedRows, setGridSapParsedRows] = useState<LocalDominatorRow[]>([]);
  const [sapEntitiesBusy, setSapEntitiesBusy] = useState(false);
  const [lastSapScheduleRows, setLastSapScheduleRows] = useState<CSVRow[] | null>(null);
  const [localStrategySectionDrafts, setLocalStrategySectionDrafts] = useState<
    Partial<Record<LocalStrategyReportSectionIndex, { markdown: string; requestBodyJson?: string }>>
  >({});
  const gridCsvFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (site?.name?.trim()) {
      setBusinessNameQuery((prev) => (prev.trim() ? prev : site.name.trim()));
    }
  }, [site?.id, site?.name]);

  const onReportMicroStep = useCallback((info: LocalStrategyReportMicroStepPayload) => {
    setReportPipelineStep(info.step);
    setReportMicroLabel(info.label);
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
    setLastSapScheduleRows(null);
    setError(null);
    setPhase("idle");
    setSelectedCompetitorKeys(new Set());
    setGmbDfsRaw(null);
    setGmbOauth(null);
    setGeoLabel("");
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
    setLastSapScheduleRows(null);
    setTiers(null);
    setSemrushData(null);
    setGscQueries([]);
    setGscDateRange(null);
    setGscError(null);
    setGmbDfsRaw(null);
    setGmbOauth(null);

    try {
      setPhase("semrush");
      const out = await runManagerLocalAnalysisAnalyze({
        semrushEnhanced: LOCAL_ORGANIC_SOURCE,
        seedSiteUrl: seedForApi,
        portfolioBlockedHosts: effectivePortfolioHosts,
        neutralResearchWire,
        tierSiteId,
        tierSiteName,
        businessNameQuery,
        geoLabel,
        site,
      });

      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
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

      setPhase("idle");
      notify.success(NOTIFY_ANALYZE_DONE);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
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
    geoLabel,
  ]);

  const reportDownloadSlug = useMemo(() => {
    if (neutralResearchWire && semrushData?.seedDomain) {
      return safeDomainForFilename(semrushData.seedDomain);
    }
    return (site?.name || "site").replace(/\s+/g, "-");
  }, [neutralResearchWire, semrushData?.seedDomain, site?.name]);

  const generateReport = useCallback(async () => {
    if (!semrushData || !tiers?.tiers?.length) {
      notify.error(NOTIFY_RUN_ANALYZE_FIRST);
      return;
    }
    if (selectedCompetitorKeys.size === 0) {
      notify.error(NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR);
      return;
    }
    const runKeySnapshot = workspaceKey;
    const seedForApi = effectiveSeedUrl;
    const reportSiteId = neutralResearchWire ? undefined : site?.id;
    const reportSiteName = neutralResearchWire ? undefined : site?.name;
    const reportSiteUrl = seedForApi;

    const srFiltered = filterCompetitorResearchBySelection(semrushData, selectedCompetitorKeys);
    const trFiltered = filterTieredCompetitorsBySelection(tiers, selectedCompetitorKeys);
    if (!srFiltered.rows.length || !trFiltered.tiers.length) {
      notify.error(NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR);
      return;
    }

    const bizQ =
      businessNameQuery.trim() ||
      (neutralResearchWire ? "" : site?.name?.trim()) ||
      normalizeCompetitorDomainKey(seedForApi) ||
      "";

    const gscForReport: GscSiteQueryRow[] = neutralResearchWire
      ? gscQueries.length > 0
        ? gscQueries
        : buildDemandQueriesFromSeedKeywords(semrushData.seedTopKeywords ?? [])
      : gscQueries;
    const gscDateForReport: GscCompetitorDateRange | null =
      gscDateRange ?? (neutralResearchWire ? getDefaultGscCompetitorDateRange() : null);

    setPhase("report");
    setReportPipelineStep(0);
    setReportMicroLabel(null);
    setReportMd(null);
    setLocalStrategySectionDrafts({});

    try {
      const { markdown } = await runLocalStrategyReportAgent(srFiltered, trFiltered, {
        siteId: reportSiteId,
        siteName: reportSiteName ?? null,
        siteUrl: reportSiteUrl,
        businessNameQuery: bizQ || seedForApi,
        geoLabel: geoLabel.trim() || null,
        gmbDfsRaw: gmbDfsRaw ?? null,
        gmbOauth: gmbOauth,
        gscSiteQueries: gscForReport.length > 0 ? gscForReport : undefined,
        gscDateRange: gscDateForReport,
        gqDemandSource: neutralResearchWire ? "dfs_seed" : "gsc",
        onMicroStep: onReportMicroStep,
        onStrategistSectionReady: onLocalStrategySectionReady,
      });

      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        setReportPipelineStep(0);
        setReportMicroLabel(null);
        setLocalStrategySectionDrafts({});
        return;
      }
      setReportMd(markdown);
      setPhase("idle");
      setReportPipelineStep(0);
      setReportMicroLabel(null);

      try {
        const apiKey = loadApiKey();
        if (typeof apiKey !== "string" || !apiKey.trim()) {
          throw new Error("Add an OpenRouter API key in settings to generate the SAP schedule CSV.");
        }
        const opt =
          neutralResearchWire || !site?.id ? DEFAULT_SETTINGS : getOptimizationSettings(site.id);
        const researchModelId = getResearchModel(reportSiteId);
        let entityLocation: string | undefined = geoLabel.trim() || undefined;
        if (!neutralResearchWire && site) {
          const resolved = await resolvePrimaryLocationLabel(site).catch(() => null);
          entityLocation =
            entityLocation || resolved?.trim() || getPrimaryCityStateLabel(site);
        }
        const { sapRows } = await runLocalAnalysisEntitySapPipeline({
          apiKey,
          model: researchModelId,
          temperature: opt.temperature,
          maxTokens: opt.maxTokens,
          topP: opt.topP,
          siteId: reportSiteId,
          siteName: ((reportSiteName ?? bizQ) || reportDownloadSlug).trim() || "Site",
          siteUrl: reportSiteUrl,
          entityLocation: entityLocation ?? null,
          semrush: srFiltered,
          tiers: trFiltered,
          selectedDomainKeys: selectedCompetitorKeys,
          gscQueries: gscForReport.length > 0 ? gscForReport : undefined,
          geoLabel: geoLabel.trim() || null,
          gridSummaryMarkdown: gridSapSummaryMarkdown.trim() || null,
          gridPlaceHints: gridSapPlaceHints,
          gridKeywordWeights: gridSapKeywordWeights,
          gridParsedRows: gridSapParsedRows.length > 0 ? gridSapParsedRows : undefined,
        });
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          return;
        }
        setLastSapScheduleRows(sapRows);
        window.setTimeout(() => {
          downloadLocalAnalysisBulkCsv(sapRows, "local-strategy-sap-schedule-3mo-15pm", { skipNotify: true });
        }, 120);
        notify.success(NOTIFY_LOCAL_BLUEPRINT_READY);
      } catch (sapErr) {
        notify.warning(NOTIFY_SAP_CSV_SKIPPED);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase("idle");
      setReportPipelineStep(0);
      setReportMicroLabel(null);
      setLocalStrategySectionDrafts({});
    }
  }, [
    semrushData,
    tiers,
    selectedCompetitorKeys,
    workspaceKey,
    effectiveSeedUrl,
    neutralResearchWire,
    site,
    businessNameQuery,
    geoLabel,
    gmbDfsRaw,
    gmbOauth,
    gscQueries,
    gscDateRange,
    onReportMicroStep,
    onLocalStrategySectionReady,
    reportDownloadSlug,
    gridSapSummaryMarkdown,
    gridSapPlaceHints,
    gridSapKeywordWeights,
    gridSapParsedRows,
  ]);

  /** First 3 months of entity SAP URL rows (45) as bulk CSV - without running the blueprint agent. */
  const generateEntitiesSap = useCallback(async () => {
    if (!semrushData || !tiers?.tiers?.length) {
      notify.error(NOTIFY_RUN_ANALYZE_FIRST);
      return;
    }
    if (selectedCompetitorKeys.size === 0) {
      notify.error(NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR);
      return;
    }
    const runKeySnapshot = workspaceKey;
    const seedForApi = effectiveSeedUrl;
    const reportSiteId = neutralResearchWire ? undefined : site?.id;
    const reportSiteName = neutralResearchWire ? undefined : site?.name;
    const reportSiteUrl = seedForApi;

    const srFiltered = filterCompetitorResearchBySelection(semrushData, selectedCompetitorKeys);
    const trFiltered = filterTieredCompetitorsBySelection(tiers, selectedCompetitorKeys);
    if (!srFiltered.rows.length || !trFiltered.tiers.length) {
      notify.error(NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR);
      return;
    }

    const bizQ =
      businessNameQuery.trim() ||
      (neutralResearchWire ? "" : site?.name?.trim()) ||
      normalizeCompetitorDomainKey(seedForApi) ||
      "";

    const gscForReport: GscSiteQueryRow[] = neutralResearchWire
      ? gscQueries.length > 0
        ? gscQueries
        : buildDemandQueriesFromSeedKeywords(semrushData.seedTopKeywords ?? [])
      : gscQueries;

    setSapEntitiesBusy(true);
    try {
      const apiKeyRaw = loadApiKey();
      const apiKey = typeof apiKeyRaw === "string" && apiKeyRaw.trim() ? apiKeyRaw : "";
      if (!gridSapParsedRows.length && !apiKey) {
        throw new Error(
          "Add an OpenRouter API key in settings to generate entity SAP pages, or import a grid CSV for grid-direct SAP.",
        );
      }
      const opt =
        neutralResearchWire || !site?.id ? DEFAULT_SETTINGS : getOptimizationSettings(site.id);
      const researchModelId = getResearchModel(reportSiteId);
      let entityLocation: string | undefined = geoLabel.trim() || undefined;
      if (!neutralResearchWire && site) {
        const resolved = await resolvePrimaryLocationLabel(site).catch(() => null);
        entityLocation =
          entityLocation || resolved?.trim() || getPrimaryCityStateLabel(site);
      }
      const { sapRows } = await runLocalAnalysisEntitySapPipeline({
        apiKey,
        model: researchModelId,
        temperature: opt.temperature,
        maxTokens: opt.maxTokens,
        topP: opt.topP,
        siteId: reportSiteId,
        siteName: ((reportSiteName ?? bizQ) || reportDownloadSlug).trim() || "Site",
        siteUrl: reportSiteUrl,
        entityLocation: entityLocation ?? null,
        semrush: srFiltered,
        tiers: trFiltered,
        selectedDomainKeys: selectedCompetitorKeys,
        gscQueries: gscForReport.length > 0 ? gscForReport : undefined,
        geoLabel: geoLabel.trim() || null,
        gridSummaryMarkdown: gridSapSummaryMarkdown.trim() || null,
        gridPlaceHints: gridSapPlaceHints,
        gridKeywordWeights: gridSapKeywordWeights,
        gridParsedRows: gridSapParsedRows.length > 0 ? gridSapParsedRows : undefined,
      });
      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        return;
      }
      setLastSapScheduleRows(sapRows);
      window.setTimeout(() => {
        downloadLocalAnalysisBulkCsv(sapRows, "local-strategy-sap-schedule-3mo-15pm", { skipNotify: true });
      }, 120);
      notify.success(NOTIFY_ENTITY_SAP_CSV_READY);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSapEntitiesBusy(false);
    }
  }, [
    semrushData,
    tiers,
    selectedCompetitorKeys,
    workspaceKey,
    effectiveSeedUrl,
    neutralResearchWire,
    site,
    businessNameQuery,
    geoLabel,
    gscQueries,
    reportDownloadSlug,
    gridSapSummaryMarkdown,
    gridSapPlaceHints,
    gridSapKeywordWeights,
    gridSapParsedRows,
  ]);

  const copyReport = useCallback(async () => {
    if (!reportMd?.trim()) {
      notify.error(NOTIFY_GENERATE_A_REPORT_FIRST);
      return;
    }
    try {
      await navigator.clipboard.writeText(reportMd.trim());
      notify.success(NOTIFY_MARKDOWN_COPIED);
    } catch {
      notify.error(NOTIFY_COULD_NOT_COPY);
    }
  }, [reportMd]);

  const downloadReport = useCallback(() => {
    if (!reportMd?.trim()) {
      notify.error(NOTIFY_GENERATE_A_REPORT_FIRST);
      return;
    }
    const blob = new Blob([reportMd.trim()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `local-seo-blueprint-${reportDownloadSlug}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [reportMd, reportDownloadSlug]);

  const downloadSapScheduleArtifact = useCallback(() => {
    if (!lastSapScheduleRows?.length) {
      notify.error(NOTIFY_NO_SAP_SCHEDULE_CSV_YET);
      return;
    }
    downloadLocalAnalysisBulkCsv(lastSapScheduleRows, "local-strategy-sap-schedule-3mo-15pm", { skipNotify: true });
    notify.success(notifyDownloadedXSapRowS(lastSapScheduleRows.length));
  }, [lastSapScheduleRows]);

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

        setGridCsvProgress(`DataForSEO: resolving ${parsed.places.length} place(s) in parallel…`);
        const dfsResults = await fetchGridCompetitorHostnamesParallel(parsed.places);
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          return;
        }
        for (const { place, host, error } of dfsResults) {
          if (error) {
            notify.error(notifyDfsXXX(place.businessName, place.idLabel, error));
            continue;
          }
          if (!host) {
            notify.error(notifyDfsXXNoWebsite(place.businessName, place.idLabel));
            continue;
          }
          if (isNonMainCompetitorDomain(host)) {
            notify.warning(notifyDfsSkipX(host));
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
          setGridCsvProgress(`DataForSEO Labs: ${i + 1}/${toFetch.length} (${domainForApi})…`);
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
            notify.error(notifyDataforseoXX(r.domainForApi, r.message));
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
      geoLabel,
      neutralResearchWire,
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

  const busy = phase !== "idle" || gridCsvBusy || sapEntitiesBusy;

  const reportProgressPct =
    phase === "report" && LOCAL_STRATEGY_REPORT_MICRO_TOTAL > 0
      ? Math.min(100, (reportPipelineStep / LOCAL_STRATEGY_REPORT_MICRO_TOTAL) * 100)
      : 0;

  const blueprintArtifacts = useMemo(() => {
    const o: { id: string; label: string; kind: "md" | "csv" }[] = [];
    if (reportMd?.trim()) o.push({ id: "blueprint", label: "Local blueprint", kind: "md" });
    if (lastSapScheduleRows?.length) o.push({ id: "sap", label: "SAP schedule (3 mo)", kind: "csv" });
    return o;
  }, [reportMd, lastSapScheduleRows]);

  const [blueprintOutputTab, setBlueprintOutputTab] = useState("0");

  useEffect(() => {
    setBlueprintOutputTab("0");
  }, [blueprintArtifacts.length, reportMd, lastSapScheduleRows]);

  return (
    <div className="local-analysis-panel space-y-2 px-0 py-1 sm:px-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold leading-[1.25] tracking-tight text-foreground">Local strategy</h2>
      </div>

      {workspaceMode === "connected" && (!site || !site.siteUrl?.trim()) ? (
        <div className="neo-pulse-zone-tile--data px-2 py-3 text-base leading-normal text-muted-foreground">
          {!site
            ? "Connect a WordPress site and select it in the header, or switch to Temp seed."
            : "This site has no URL saved."}
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border/50 bg-black/25 px-2.5 py-2 sm:px-3 sm:py-2.5">
            <div className="flex flex-col gap-2.5">
              <div className="space-y-1">
                <div className="text-base font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Seed domain
                </div>
                {workspaceMode === "temp" ? (
                  <Field
                    type="url"
                    placeholder="https://example.com"
                    value={tempSeedUrl}
                    onChange={(e) => setTempSeedUrl(e.target.value)}
                    disabled={busy}
                  />
                ) : (
                  <div className="break-all font-mono text-sm leading-normal text-foreground">
                    {site ? getPublicSiteUrl(site) : ""}
                  </div>
                )}
              </div>

              <div className="h-px bg-border/40" aria-hidden />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-base font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    GBP search (DataForSEO)
                  </div>
                  <Field
                    placeholder="Business name + city"
                    value={businessNameQuery}
                    onChange={(e) => setBusinessNameQuery(e.target.value)}
                    disabled={busy}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-base font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Location (optional)
                  </div>
                  <Field
                    placeholder="e.g. Georgia, United States"
                    value={geoLabel}
                    onChange={(e) => setGeoLabel(e.target.value)}
                    disabled={busy}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="neo-pulse-zone-tile--analysis px-2 py-2 sm:px-3">
            <p className="mb-2 text-base leading-snug text-muted-foreground">
              Organic competitors use <span className="text-foreground/90">DataForSEO Labs</span> only - Semrush API is
              not required. Import a Local Dominator grid CSV (Place ID / cid) for extra competitors; enrichment uses
              Labs, not Semrush.
              {gridSapSummaryMarkdown.trim() ? (
                <span className="mt-1 block text-primary">
                  Grid scan loaded for SAP - weighted keywords and rank evidence will be used when you generate the SAP
                  schedule CSV.
                </span>
              ) : null}
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <FileInput
                ref={gridCsvFileRef}
                accept=".csv,text/csv"
                aria-hidden
                tabIndex={-1}
                onChange={onGridCsvFileChange}
              />
              <Button
                type="button"
                disabled={busy}
                title="Upload Local Dominator grid CSV - Place ID / cid → DataForSEO website → DataForSEO Labs keywords"
                onClick={() => gridCsvFileRef.current?.click()}
              >
                {gridCsvBusy ? null : <Upload className="h-4 w-4 shrink-0" />}
                Grid CSV
              </Button>

              <Button
                type="button"
                disabled={busy || !semrushData?.rows?.length}
                title="Download competitor rows as a grid-style CSV (add Place ID in Local Dominator if re-importing)"
                onClick={downloadGridCsv}
              >
                <Download className="h-4 w-4 shrink-0" />
                Grid CSV export
              </Button>

              <Button
                type="button"
                disabled={busy}
                onClick={() => void analyze()}
              >
                {phase === "semrush" ? null : null}
                Analyze
              </Button>

              <Button
                variant="run"
                type="button"
                disabled={busy || !semrushData}
                onClick={() => void generateReport()}
              >
                {phase === "report" ? null : <Sparkles className="h-4 w-4 shrink-0" />}
                Generate blueprint
              </Button>

              <Button
                type="button"
                disabled={busy || !semrushData || selectedCompetitorKeys.size === 0}
                title="Build the first 3 months of local entity SAP URL rows (15/month × 3 = 45). Downloads bulk CSV (keyword, entity, title, modifier, featuredImage)."
                onClick={() => void generateEntitiesSap()}
              >
                {sapEntitiesBusy ? (
                  null
                ) : (
                  <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                )}
                Generate entities
              </Button>

              <Button
                type="button"
                disabled={!reportMd?.trim()}
                title="Copy full local SEO blueprint Markdown"
                onClick={() => void copyReport()}
              >
                <Copy className="h-4 w-4 shrink-0" />
                Copy Markdown
              </Button>
              <Button
                type="button"
                disabled={!reportMd?.trim()}
                title="Download stitched .md file"
                onClick={downloadReport}
              >
                <Download className="h-4 w-4 shrink-0" />
                Download Markdown
              </Button>
            </div>
            {gscError && workspaceMode === "connected" ? (
              <p className="mt-2 text-base text-muted-foreground">GSC: {gscError}</p>
            ) : null}
            {phase === "report" || sapEntitiesBusy ? (
              <div
                className="mt-2 space-y-2"
                role="progressbar"
                aria-valuemin={phase === "report" ? 0 : undefined}
                aria-valuemax={phase === "report" ? 100 : undefined}
                aria-valuenow={phase === "report" ? Math.round(reportProgressPct) : undefined}
              >
                <div className="neo-pulse-competitor-progress-track">
                  {phase === "report" ? (
                    <div
                      className="neo-pulse-competitor-progress-fill h-full transition-[width] duration-300 ease-out"
                      style={{ width: `${reportProgressPct}%` }}
                      aria-hidden
                    />
                  ) : (
                    <div className="neo-pulse-competitor-progress-indeterminate" aria-hidden />
                  )}
                </div>
                <p className="min-h-[1rem] text-base leading-normal text-muted-foreground">
                  {phase === "report"
                    ? `${reportMicroLabel ?? "…"} · ${reportPipelineStep}/${LOCAL_STRATEGY_REPORT_MICRO_TOTAL}`
                    : "Generating SAP entity schedule…"}
                </p>
              </div>
            ) : null}
            {phase === "report" && reportPipelineStep >= 2 ? (
              <div
                className="mt-2 rounded-md border border-border/50 bg-muted/25 px-2 py-1.5 text-left text-base leading-snug text-muted-foreground"
                aria-label="Local blueprint section drafts from OpenRouter (11 sequential passes)"
              >
                <div className="font-mono font-semibold text-foreground/90">Blueprint sections</div>
                <p className="mt-0.5 max-w-prose text-base leading-snug text-foreground">
                  Eleven sequential writer passes; each row enables .md and POST .json when that section returns.
                </p>
                <ul className="mt-1.5 list-none space-y-1.5 pl-0">
                  {LOCAL_STRATEGY_SECTION_INDICES.map((section) => {
                    const draft = localStrategySectionDrafts[section];
                    const hasMd = Boolean(draft?.markdown?.trim());
                    const hasJson = Boolean(draft?.requestBodyJson);
                    return (
                      <li
                        key={section}
                        className="flex flex-col gap-1 border-b border-border/40 pb-1.5 last:border-b-0 last:pb-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
                      >
                        <span className="min-w-0 shrink font-mono text-base text-foreground/85">
                          <span className="text-muted-foreground">S{section}</span> {localStrategySectionLabel(section)}
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            disabled={!hasMd}
                            title={hasMd ? "Download this section as Markdown" : "Waiting for this section…"}
                            onClick={() => downloadLocalStrategySectionMarkdown(section)}
                          >
                            <Download className="mr-1 h-3.5 w-3.5 shrink-0" />
                            .md
                          </Button>
                          <TextButton
                            type="button"
                            disabled={!hasJson}
                            title={hasJson ? "Download exact OpenRouter POST JSON for this section" : "Payload not ready yet"}
                            onClick={() => downloadLocalStrategySectionPostJson(section)}
                          >
                            POST .json
                          </TextButton>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            {gridCsvBusy && phase === "idle" ? (
              <p className="mt-2 text-base text-muted-foreground">
                {gridCsvProgress ?? "Grid CSV: DataForSEO → Labs enrichment…"}
              </p>
            ) : null}
          </div>

          <div className="neo-pulse-zone-tile--data mt-2 px-2 py-2 sm:px-3">
            <div className="neo-pulse-zone-row neo-pulse-zone-row--data space-y-1 py-2 text-base leading-normal">
              <div className="min-h-[1rem] text-base font-semibold uppercase leading-normal tracking-wide text-muted-foreground">
                Seed domain
              </div>
              <div className="break-all font-mono text-base leading-normal text-foreground">
                {effectiveSeedUrl || " - "}
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-2 text-base text-destructive">
              {error}
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

          {reportMd?.trim() || lastSapScheduleRows?.length ? (
            <div className="neo-pulse-zone-tile--analysis mt-2 space-y-2 px-2 py-2 sm:px-3">
              <div className="min-h-[1rem] text-base font-semibold uppercase leading-normal tracking-wide text-muted-foreground">
                Report sections (inventory)
              </div>
              <div className="overflow-x-auto rounded-md border border-border/50 bg-muted/25">
                <table className="w-full min-w-[420px] border-collapse text-left text-base">
                  <thead>
                    <tr className="border-b border-border/50 bg-black/20">
                      <th className="px-2 py-1.5 font-semibold text-foreground">Section ID</th>
                      <th className="px-2 py-1.5 font-semibold text-foreground">H2 title</th>
                      <th className="px-2 py-1.5 font-semibold text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportMd?.trim() ? (
                      <tr className="border-b border-border/40 last:border-b-0">
                        <td className="max-w-[140px] break-words px-2 py-1.5 font-mono text-foreground" title="local-blueprint">
                          local-blueprint
                        </td>
                        <td className="max-w-[min(40vw,280px)] px-2 py-1.5 text-foreground">Local SEO blueprint</td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <Button
                            type="button"
                            title="Download blueprint Markdown"
                            onClick={downloadReport}
                          >
                            <Download className="mr-1 h-3 w-3 shrink-0" />
                            .md
                          </Button>
                        </td>
                      </tr>
                    ) : null}
                    {lastSapScheduleRows?.length ? (
                      <tr className="border-b border-border/40 last:border-b-0">
                        <td className="max-w-[140px] break-words px-2 py-1.5 font-mono text-foreground" title="sap-schedule">
                          sap-schedule
                        </td>
                        <td className="max-w-[min(40vw,280px)] px-2 py-1.5 text-foreground">
                          SAP entity schedule (3 months, 45 rows)
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <Button
                            type="button"
                            title="Download SAP schedule CSV"
                            onClick={downloadSapScheduleArtifact}
                          >
                            <Download className="mr-1 h-3 w-3 shrink-0" />
                            .csv
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
                Blueprint outputs
              </div>
              <Tabs value={blueprintOutputTab} onValueChange={setBlueprintOutputTab} className="flex min-h-0 flex-col gap-2">
                <TabsList className="inline-flex h-auto min-h-9 w-full flex-wrap justify-start gap-1 rounded-md border border-[hsl(var(--semantic-analysis)/0.48)] bg-black/30 p-0.5">
                  {blueprintArtifacts.map((a, i) => (
                    <TabsTrigger
                      key={a.id}
                      value={String(i)}
                      className="inline-flex max-w-[min(100%,18rem)] shrink-0 items-center gap-1.5 px-2 py-1.5 text-left text-base font-semibold normal-case leading-snug tracking-normal data-[state=active]:rounded-sm data-[state=active]:bg-[hsl(var(--semantic-analysis)/0.18)] data-[state=active]:text-primary"
                    >
                      <span className="min-w-0 break-words" title={a.label}>
                        {a.label}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="inline-flex shrink-0 cursor-pointer rounded-sm p-0.5 text-muted-foreground hover:bg-black/40 hover:text-primary"
                            role="button"
                            tabIndex={0}
                            aria-label={`Download ${a.label}`}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (a.kind === "md") downloadReport();
                              else downloadSapScheduleArtifact();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                if (a.kind === "md") downloadReport();
                                else downloadSapScheduleArtifact();
                              }
                            }}
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-base">
                          Download {a.label}
                        </TooltipContent>
                      </Tooltip>
                    </TabsTrigger>
                  ))}
                </TabsList>
                {blueprintArtifacts.map((a, i) => (
                  <TabsContent key={a.id} value={String(i)} className="mt-0 min-h-0 data-[state=inactive]:hidden">
                    <p className="text-base leading-normal text-muted-foreground">Preview below.</p>
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          ) : null}

          {reportMd?.trim() ? (
            <div className="neo-pulse-zone-tile--analysis mt-2 space-y-2 px-2 py-2 sm:px-3">
              <div className="min-h-[1rem] text-base font-semibold uppercase leading-normal tracking-wide text-muted-foreground">
                Stitched report preview
              </div>
              <div className="h-[min(50vh,28rem)] min-h-0 min-w-0 overflow-y-auto overflow-x-auto rounded-md border border-border/50 bg-black/20">
                <pre className="whitespace-pre-wrap break-words p-3 font-mono text-base leading-relaxed text-foreground">
                  {reportMd}
                </pre>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
