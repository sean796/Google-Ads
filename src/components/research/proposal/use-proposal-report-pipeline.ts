import { type Dispatch, type SetStateAction, useCallback, useMemo, useState } from "react";
import { filterCompetitorResearchBySelection, filterTieredCompetitorsBySelection } from "@/lib/competitor-research/competitor-selection-filter";
import { getDefaultGscCompetitorDateRange } from "@/lib/competitor-research/competitor-gsc-queries";
import { buildDemandQueriesFromSeedKeywords } from "@/lib/competitor-research/competitor-seed-demand-as-gq";
import { REPORT_PIPELINE_MICRO_TOTAL, type CompetitorReportMicroStepPayload } from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { LOCAL_STRATEGY_REPORT_MICRO_TOTAL, type LocalStrategyReportMicroStepPayload } from "@/lib/local-strategy-research/local-strategy-report-openrouter-limits";
import type { LocalStrategyStrategistSectionReadyPayload } from "@/lib/local-strategy-research/local-strategy-report-agent";
import type { CompetitorResearchSemrushResponse, GscCompetitorDateRange, GscSiteQueryRow, TieredCompetitorsResult } from "@/lib/competitor-research/types";
import type { LocalStrategyGmbOauthWire } from "@/lib/local-strategy-research/local-strategy-report-wire";
import type { LocalStrategyReportSectionIndex } from "@/lib/local-strategy-research/local-strategy-report-system-prompt";
import type { ProposalSiteAuditResult } from "@/lib/research/proposal-site-audit-types";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { GridKeywordWeight, } from "@/lib/process-local-dominator-upload";
import type { LocalDominatorRow } from "@/lib/local-dominator-csv";
import { loadApiKey } from "@/lib/api";
import { logger } from "@/lib/logger";
import { DEFAULT_SETTINGS } from "@/lib/optimization-settings-defaults";
import { getOptimizationSettings, getResearchModel } from "@/lib/optimization-settings-storage";
import { getPrimaryCityStateLabel, resolvePrimaryLocationLabel } from "@/lib/primary-location-from-site";
import { runManagerLocalAnalysisAnalyze } from "@/lib/local-strategy-research/manager-local-analysis-analyze";
import { buildProposalMatrixContentCsvRows } from "@/lib/competitor-research/competitor-bulk-content-csv";
import { runProposalTalkScript } from "@/lib/research/proposal-talk-script";
import { pickProposalAuditPages } from "@/lib/research/proposal-audit-page-picker";
import { fetchProposalSiteAudit } from "@/lib/research/proposal-site-audit-fetch";
import { buildProposalReportMarkdown, downloadLocalAnalysisBulkCsv } from "@/lib/local-analysis-csv-export";
import type { WordPressSite } from "@/components/integrations/types";
import type { ManagerSeedWorkspaceContextValue } from "@/contexts/manager-seed-workspace-context";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ANALYZE_DONE, NOTIFY_CLIENT_MEETING_SCRIPT_IS_NOT_READY_YET, NOTIFY_COULD_NOT_COPY, NOTIFY_DOWNLOADED_CLIENT_MEETING_SCRIPT_MD, NOTIFY_DOWNLOADED_STRATEGY_MD, NOTIFY_ENTER_A_SEED_SITE_URL_FIRST, NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM, NOTIFY_ENTITY_SAP_CSV_IS_NOT_READY_YET, NOTIFY_GENERATE_A_PROPOSAL_FIRST, NOTIFY_GRID_CSV_DOWNLOADED, NOTIFY_GRID_IMPORT_DONE, NOTIFY_LOCAL_ANALYSIS_DID_NOT_RETURN_COMPETITOR, NOTIFY_NO_NEW_COMPETITORS_FROM_GRID, NOTIFY_POSTS_CSV_IS_NOT_READY_YET, NOTIFY_PROPOSAL_COPIED, NOTIFY_PROPOSAL_INCOMPLETE_BLOG_ROWS_SAVED, NOTIFY_PROPOSAL_INCOMPLETE_SAP_AND_BLOG_ROWS_SA, NOTIFY_PROPOSAL_INCOMPLETE_SAP_ROWS_SAVED, NOTIFY_RUN_ANALYZE_FIRST_OR_IMPORT_A_GRID_CSV, NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR, NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL, NOTIFY_STRATEGY_MARKDOWN_IS_NOT_READY_YET, notifyAddedXCompetitorSFromGridCsv, notifyFileTooLargeMaxXMb, notifyGridCsvSapScanX, notifyGridSkipX, notifyGridXXNoWebsite, notifyGridXXX, notifyGscX2, notifyPresenterTalkScriptFailedX, notifyResearchXX, notifySiteAuditSkippedX, notifySiteAuditSkippedX2, notifyUpdatedXCompetitorSFromGridCsvWer } from "@/lib/notify-messages";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import { buildCombinedProposalMarkdown, copyProposalPackage, downloadEntitySapCsv, downloadProposalPackage, LOCAL_ORGANIC_SOURCE, readMaxProposalParallelPipelines, runProposalReportBranches } from "@/components/research/proposal/proposal-research-helpers";

export type UseProposalReportPipelineArgs = {
  workspaceMode: ManagerSeedWorkspaceContextValue["mode"]; site: WordPressSite | null;
  effectiveSeedUrl: string; workspaceKey: string; neutralResearchWire: boolean;
  effectivePortfolioHosts: string[]; businessNameQuery: string;
  semrushData: CompetitorResearchSemrushResponse | null; tiers: TieredCompetitorsResult | null;
  selectedCompetitorKeys: Set<string>; gscQueries: GscSiteQueryRow[];
  gscDateRange: GscCompetitorDateRange | null; scheduleMonths: number; contentBlogsPerMonth: number;
  strategistGuidance: string; gridSapSummaryMarkdown: string; gridSapPlaceHints: string[];
  gridSapKeywordWeights: GridKeywordWeight[]; gridSapParsedRows: LocalDominatorRow[];
  reportDownloadSlug: string; activeWorkspaceKeyRef: { current: string };
  error: string | null; gscError: string | null; gridCsvBusy: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
  setSemrushData: Dispatch<SetStateAction<CompetitorResearchSemrushResponse | null>>;
  setTiers: Dispatch<SetStateAction<TieredCompetitorsResult | null>>;
  setSelectedCompetitorKeys: Dispatch<SetStateAction<Set<string>>>;
  setGscQueries: Dispatch<SetStateAction<GscSiteQueryRow[]>>;
  setGscDateRange: Dispatch<SetStateAction<GscCompetitorDateRange | null>>;
  setGscError: Dispatch<SetStateAction<string | null>>;
};

export function useProposalReportPipeline(args: UseProposalReportPipelineArgs) {
  const { workspaceMode, site, effectiveSeedUrl, workspaceKey, neutralResearchWire, effectivePortfolioHosts, businessNameQuery, semrushData, tiers, selectedCompetitorKeys, gscQueries, gscDateRange, scheduleMonths, contentBlogsPerMonth, strategistGuidance, gridSapSummaryMarkdown, gridSapPlaceHints, gridSapKeywordWeights, gridSapParsedRows, reportDownloadSlug, activeWorkspaceKeyRef, error, gscError, gridCsvBusy, setError, setSemrushData, setTiers, setSelectedCompetitorKeys, setGscQueries, setGscDateRange, setGscError } = args;
  const [reportMd, setReportMd] = useState<string | null>(null);
  const [combinedMd, setCombinedMd] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "semrush" | "report">("idle");
  const [proposalSubphase, setProposalSubphase] = useState<
    "competitor" | "local" | "sap" | "parallel" | null
  >(null);
  const [competitorPipelineStep, setCompetitorPipelineStep] = useState(0);
  const [competitorPipelineLabel, setCompetitorPipelineLabel] = useState<string | null>(null);
  /** Local blueprint micro-steps (proposal report phase). */
  const [localPipelineStep, setLocalPipelineStep] = useState(0);
  const [localPipelineLabel, setLocalPipelineLabel] = useState<string | null>(null);
  const [reportMicroLabel, setReportMicroLabel] = useState<string | null>(null);
  const [gmbDfsRaw, setGmbDfsRaw] = useState<unknown | null>(null);
  const [gmbOauth, setGmbOauth] = useState<LocalStrategyGmbOauthWire | null>(null);
  const [lastSapScheduleRows, setLastSapScheduleRows] = useState<CSVRow[] | null>(null);
  const [lastPostsBulkRows, setLastPostsBulkRows] = useState<CSVRow[] | null>(null);
  const [talkScriptMd, setTalkScriptMd] = useState<string | null>(null);
  const [localStrategySectionDrafts, setLocalStrategySectionDrafts] = useState<
    Partial<Record<LocalStrategyReportSectionIndex, { markdown: string; requestBodyJson?: string }>>
  >({});

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
    const sapRecovery: { rows: CSVRow[] } = { rows: [] };

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
          if (auditRes.ok === true) {
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
      const branchResult = await runProposalReportBranches({
        maxParallel, sapParams, srFiltered, trFiltered, reportSiteId, reportSiteName, reportSiteUrl, gscForReport, gscDateForReport, neutralResearchWire, months, guidanceForStrategist, bizQ, seedForApi, gmbDfsForPipeline, gmbOauthForPipeline, siteAuditForReport, runKeySnapshot, activeWorkspaceKeyRef, sapRecovery, setSemrushData, setPhase, setProposalSubphase, setCompetitorPipelineStep, setCompetitorPipelineLabel, setLocalPipelineStep, setLocalPipelineLabel, setReportMicroLabel, setLocalStrategySectionDrafts, setLastSapScheduleRows,
      });
      if (!branchResult) return;
      const { competitorMd, keywordsMarkdown, localMd } = branchResult;
      setReportMd(localMd);
      const combined = buildCombinedProposalMarkdown({
        competitorMd,
        keywordsMd: keywordsMarkdown ?? null,
        localMd,
      });
      setCombinedMd(combined);

      if (combined) {
        try {
          const { auditProposalWithDecisionAgent } = await import("@/lib/decision-tree/studio-decision-auditor");
          await auditProposalWithDecisionAgent({
            clientName: reportSiteName || "Client Proposal",
            proposalText: combined,
            siteId: reportSiteId,
          });
        } catch (auditErr) {
          logger.warn("[Decision Agent] Proposal audit warning:", auditErr);
        }
      }

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
            entitySapRowCount: sapRecovery.rows.length,
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
      const hasSap = sapRecovery.rows.length > 0;
      const hasPosts = contentRows.length > 0;
      if (hasSap) {
        setLastSapScheduleRows(sapRecovery.rows);
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
    activeWorkspaceKeyRef, setError, setGscDateRange, setGscError, setGscQueries, setSelectedCompetitorKeys, setSemrushData, setTiers,
    effectiveSeedUrl,
    effectivePortfolioHosts,
    neutralResearchWire,
    site,
    businessNameQuery,
    gmbDfsRaw,
    gmbOauth,
    gscQueries,
    gscDateRange,
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

  const reportProgressPct = useMemo(() => {
    if (phase !== "report") return 0;
    if (proposalSubphase === "parallel") {
      const c = REPORT_PIPELINE_MICRO_TOTAL > 0 ? competitorPipelineStep / REPORT_PIPELINE_MICRO_TOTAL : 0;
      const l = LOCAL_STRATEGY_REPORT_MICRO_TOTAL > 0 ? localPipelineStep / LOCAL_STRATEGY_REPORT_MICRO_TOTAL : 0;
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

  const canOpenDetails = useMemo(
    () =>
      (phase !== "idle" || gridCsvBusy) ||
      Boolean(combinedMd?.trim()) ||
      Boolean(error) ||
      Boolean(gscError) ||
      Boolean(gridSapSummaryMarkdown.trim()),
    [phase, gridCsvBusy, combinedMd, error, gscError, gridSapSummaryMarkdown],
  );

  const copyProposal = useCallback(async () => {
    await copyProposalPackage(combinedMd, proposalPackageDisabled);
  }, [combinedMd, proposalPackageDisabled]);

  const downloadEntitySap = useCallback(() => {
    downloadEntitySapCsv(lastSapScheduleRows, reportDownloadSlug);
  }, [lastSapScheduleRows, reportDownloadSlug]);

  const downloadPackage = useCallback(() => {
    downloadProposalPackage(combinedMd, lastSapScheduleRows, lastPostsBulkRows, talkScriptMd, proposalPackageDisabled, reportDownloadSlug);
  }, [combinedMd, lastSapScheduleRows, lastPostsBulkRows, talkScriptMd, proposalPackageDisabled, reportDownloadSlug]);

  return { phase, setPhase, proposalSubphase, setProposalSubphase, competitorPipelineStep, competitorPipelineLabel, localPipelineStep, localPipelineLabel, reportMicroLabel, setReportMicroLabel, combinedMd, setCombinedMd, setReportMd, setLastSapScheduleRows, setLastPostsBulkRows, setTalkScriptMd, talkScriptMd, lastSapScheduleRows, lastPostsBulkRows, localStrategySectionDrafts, setLocalStrategySectionDrafts, setGmbDfsRaw, setGmbOauth, proposalPackageDisabled, generateProposal, copyProposal, downloadEntitySap, downloadPackage, reportProgressPct, canOpenDetails };
}
