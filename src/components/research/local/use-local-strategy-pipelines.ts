import { type Dispatch, type SetStateAction, useCallback, useState } from "react";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import { filterCompetitorResearchBySelection, filterTieredCompetitorsBySelection } from "@/lib/competitor-research/competitor-selection-filter";
import { getDefaultGscCompetitorDateRange } from "@/lib/competitor-research/competitor-gsc-queries";
import { buildDemandQueriesFromSeedKeywords } from "@/lib/competitor-research/competitor-seed-demand-as-gq";
import { runLocalStrategyReportAgent, type LocalStrategyStrategistSectionReadyPayload } from "@/lib/local-strategy-research/local-strategy-report-agent";
import type { LocalStrategyReportMicroStepPayload } from "@/lib/local-strategy-research/local-strategy-report-openrouter-limits";
import type { LocalStrategyReportSectionIndex } from "@/lib/local-strategy-research/local-strategy-report-system-prompt";
import type { CompetitorResearchSemrushResponse, GscCompetitorDateRange, GscSiteQueryRow, TieredCompetitorsResult } from "@/lib/competitor-research/types";
import type { LocalStrategyGmbOauthWire } from "@/lib/local-strategy-research/local-strategy-report-wire";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { GridKeywordWeight } from "@/lib/process-local-dominator-upload";
import type { LocalDominatorRow } from "@/lib/local-dominator-csv";
import { loadApiKey } from "@/lib/api";
import { DEFAULT_SETTINGS } from "@/lib/optimization-settings-defaults";
import { getOptimizationSettings, getResearchModel } from "@/lib/optimization-settings-storage";
import { getPrimaryCityStateLabel, resolvePrimaryLocationLabel } from "@/lib/primary-location-from-site";
import { runManagerLocalAnalysisAnalyze } from "@/lib/local-strategy-research/manager-local-analysis-analyze";
import { runLocalAnalysisEntitySapPipeline } from "@/lib/local-strategy-research/local-analysis-entity-sap-pipeline";
import { downloadLocalAnalysisBulkCsv } from "@/lib/local-analysis-csv-export";
import type { WordPressSite } from "@/components/integrations/types";
import type { ManagerSeedWorkspaceContextValue } from "@/contexts/manager-seed-workspace-context";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ANALYZE_DONE, NOTIFY_COULD_NOT_COPY, NOTIFY_ENTER_A_SEED_SITE_URL_FIRST, NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM, NOTIFY_ENTITY_SAP_CSV_READY, NOTIFY_GENERATE_A_REPORT_FIRST, NOTIFY_GRID_CSV_DOWNLOADED, NOTIFY_GRID_IMPORT_DONE, NOTIFY_LOCAL_BLUEPRINT_READY, NOTIFY_MARKDOWN_COPIED, NOTIFY_NO_NEW_COMPETITORS_FROM_GRID, NOTIFY_NO_SAP_SCHEDULE_CSV_YET, NOTIFY_RUN_ANALYZE_FIRST, NOTIFY_RUN_ANALYZE_FIRST_OR_IMPORT_A_GRID_CSV, NOTIFY_SAP_CSV_SKIPPED, NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR, NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL, notifyAddedXCompetitorSFromGridCsv, notifyAddedXCompetitorSFromGridCsvUpdat, notifyDataforseoXX, notifyDfsSkipX, notifyDfsXXNoWebsite, notifyDfsXXX, notifyDownloadedXSapRowS, notifyFileTooLargeMaxXMb, notifyGridCsvSapScanX, notifyGscX2, notifyUpdatedXCompetitorSFromGridCsvWer } from "@/lib/notify-messages";
import { LOCAL_ORGANIC_SOURCE } from "@/components/research/local/use-local-strategy-grid-csv-import";

export type UseLocalStrategyPipelinesArgs = {
  workspaceMode: ManagerSeedWorkspaceContextValue["mode"]; site: WordPressSite | null;
  effectiveSeedUrl: string; workspaceKey: string; neutralResearchWire: boolean;
  effectivePortfolioHosts: string[]; businessNameQuery: string; geoLabel: string;
  semrushData: CompetitorResearchSemrushResponse | null; tiers: TieredCompetitorsResult | null;
  selectedCompetitorKeys: Set<string>; gscQueries: GscSiteQueryRow[];
  gscDateRange: GscCompetitorDateRange | null; reportDownloadSlug: string;
  gridSapSummaryMarkdown: string; gridSapPlaceHints: string[];
  gridSapKeywordWeights: GridKeywordWeight[]; gridSapParsedRows: LocalDominatorRow[];
  activeWorkspaceKeyRef: { current: string };
  setError: Dispatch<SetStateAction<string | null>>;
  setSemrushData: Dispatch<SetStateAction<CompetitorResearchSemrushResponse | null>>;
  setGscQueries: Dispatch<SetStateAction<GscSiteQueryRow[]>>;
  setGscDateRange: Dispatch<SetStateAction<GscCompetitorDateRange | null>>;
  setGscError: Dispatch<SetStateAction<string | null>>;
  setTiers: Dispatch<SetStateAction<TieredCompetitorsResult | null>>;
  setSelectedCompetitorKeys: Dispatch<SetStateAction<Set<string>>>;
};

export function useLocalStrategyPipelines(args: UseLocalStrategyPipelinesArgs) {
  const { workspaceMode, site, effectiveSeedUrl, workspaceKey, neutralResearchWire, effectivePortfolioHosts, businessNameQuery, geoLabel, semrushData, tiers, selectedCompetitorKeys, gscQueries, gscDateRange, reportDownloadSlug, gridSapSummaryMarkdown, gridSapPlaceHints, gridSapKeywordWeights, gridSapParsedRows, activeWorkspaceKeyRef, setError, setSemrushData, setGscQueries, setGscDateRange, setGscError, setTiers, setSelectedCompetitorKeys } = args;
  const [reportMd, setReportMd] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "semrush" | "report">("idle");
  const [reportPipelineStep, setReportPipelineStep] = useState(0);
  const [reportMicroLabel, setReportMicroLabel] = useState<string | null>(null);
  const [gmbDfsRaw, setGmbDfsRaw] = useState<unknown | null>(null);
  const [gmbOauth, setGmbOauth] = useState<LocalStrategyGmbOauthWire | null>(null);
  const [sapEntitiesBusy, setSapEntitiesBusy] = useState(false);
  const [lastSapScheduleRows, setLastSapScheduleRows] = useState<CSVRow[] | null>(null);
  const [localStrategySectionDrafts, setLocalStrategySectionDrafts] = useState<
    Partial<Record<LocalStrategyReportSectionIndex, { markdown: string; requestBodyJson?: string }>>
  >({});

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
    activeWorkspaceKeyRef, setError, setGscDateRange, setGscError, setGscQueries, setSelectedCompetitorKeys, setSemrushData, setTiers,
    neutralResearchWire,
    effectivePortfolioHosts,
    businessNameQuery,
    geoLabel,
  ]);

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
    activeWorkspaceKeyRef, setError,
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
    activeWorkspaceKeyRef,
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
  return { phase, setPhase, reportMd, setReportMd, reportPipelineStep, reportMicroLabel, setReportMicroLabel, localStrategySectionDrafts, setLocalStrategySectionDrafts, lastSapScheduleRows, setLastSapScheduleRows, sapEntitiesBusy, setGmbDfsRaw, setGmbOauth, analyze, generateReport, generateEntitiesSap, copyReport, downloadReport };
}
