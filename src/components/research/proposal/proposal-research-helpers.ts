import type { Dispatch, SetStateAction } from "react";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import { runCompetitorReportAgent } from "@/lib/competitor-research/competitor-report-agent";
import { runLocalStrategyReportAgent, type LocalStrategyStrategistSectionReadyPayload } from "@/lib/local-strategy-research/local-strategy-report-agent";
import { runLocalAnalysisEntitySapPipeline } from "@/lib/local-strategy-research/local-analysis-entity-sap-pipeline";
import { LOCAL_STRATEGY_REQUIRED_H2, LOCAL_STRATEGY_SECTION_COUNT, type LocalStrategyReportSectionIndex } from "@/lib/local-strategy-research/local-strategy-report-system-prompt";
import type { CompetitorReportMicroStepPayload } from "@/lib/competitor-research/competitor-report-openrouter-limits";
import type { LocalStrategyReportMicroStepPayload } from "@/lib/local-strategy-research/local-strategy-report-openrouter-limits";
import type { CompetitorResearchSemrushResponse, GscCompetitorDateRange, GscSiteQueryRow, TieredCompetitorsResult } from "@/lib/competitor-research/types";
import type { LocalStrategyGmbOauthWire } from "@/lib/local-strategy-research/local-strategy-report-wire";
import type { ProposalSiteAuditResult } from "@/lib/research/proposal-site-audit-types";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { buildProposalReportMarkdown, downloadLocalAnalysisBulkCsv } from "@/lib/local-analysis-csv-export";
import { buildLocalStrategyGridExportCsv } from "@/lib/local-strategy-research/local-strategy-grid-export-csv";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ANALYZE_DONE, NOTIFY_CLIENT_MEETING_SCRIPT_IS_NOT_READY_YET, NOTIFY_COULD_NOT_COPY, NOTIFY_DOWNLOADED_CLIENT_MEETING_SCRIPT_MD, NOTIFY_DOWNLOADED_STRATEGY_MD, NOTIFY_ENTER_A_SEED_SITE_URL_FIRST, NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM, NOTIFY_ENTITY_SAP_CSV_IS_NOT_READY_YET, NOTIFY_GENERATE_A_PROPOSAL_FIRST, NOTIFY_GRID_CSV_DOWNLOADED, NOTIFY_GRID_IMPORT_DONE, NOTIFY_LOCAL_ANALYSIS_DID_NOT_RETURN_COMPETITOR, NOTIFY_NO_NEW_COMPETITORS_FROM_GRID, NOTIFY_POSTS_CSV_IS_NOT_READY_YET, NOTIFY_PROPOSAL_COPIED, NOTIFY_PROPOSAL_INCOMPLETE_BLOG_ROWS_SAVED, NOTIFY_PROPOSAL_INCOMPLETE_SAP_AND_BLOG_ROWS_SA, NOTIFY_PROPOSAL_INCOMPLETE_SAP_ROWS_SAVED, NOTIFY_RUN_ANALYZE_FIRST_OR_IMPORT_A_GRID_CSV, NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR, NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL, NOTIFY_STRATEGY_MARKDOWN_IS_NOT_READY_YET, notifyAddedXCompetitorSFromGridCsv, notifyFileTooLargeMaxXMb, notifyGridCsvSapScanX, notifyGridSkipX, notifyGridXXNoWebsite, notifyGridXXX, notifyGscX2, notifyPresenterTalkScriptFailedX, notifyResearchXX, notifySiteAuditSkippedX, notifySiteAuditSkippedX2, notifyUpdatedXCompetitorSFromGridCsvWer } from "@/lib/notify-messages";

export const LOCAL_ORGANIC_SOURCE = false;

/**
 * Proposal report wave runs entity SAP, competitor strategist, and local blueprint in parallel (three concurrent
 * OpenRouter-heavy workloads). If you see HTTP 429 rate limits, set `VITE_MAX_PROPOSAL_PARALLEL_PIPELINES=1`
 * in `.env` to fall back to sequential SAP → competitor → local (slower, lower burst).
 */
export function readMaxProposalParallelPipelines(): number {
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

export function isPortfolioBlockedHost(dk: string, blocked: string[]): boolean {
  if (!dk || blocked.length === 0) return false;
  for (const b of blocked) {
    if (!b) continue;
    if (dk === b) return true;
    if (dk.endsWith(`.${b}`)) return true;
  }
  return false;
}

export function triggerDownloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function safeDomainForFilename(d: string): string {
  const k = normalizeCompetitorDomainKey(d);
  return (k || "domain").replace(/[^a-z0-9.-]+/gi, "_").slice(0, 80);
}

export const LOCAL_STRATEGY_SECTION_INDICES: LocalStrategyReportSectionIndex[] = Array.from(
  { length: LOCAL_STRATEGY_SECTION_COUNT },
  (_, i) => (i + 1) as LocalStrategyReportSectionIndex,
);

export function localStrategySectionLabel(section: LocalStrategyReportSectionIndex): string {
  if (section === 1) return "Ascend & Expand opening (H1)";
  return LOCAL_STRATEGY_REQUIRED_H2[section - 2] ?? `Section ${section}`;
}

export function buildCombinedProposalMarkdown(args: {
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


export async function copyProposalPackage(combinedMd: string | null, proposalPackageDisabled: boolean) {
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
}

export function downloadEntitySapCsv(lastSapScheduleRows: CSVRow[] | null, reportDownloadSlug: string) {
  if (!lastSapScheduleRows?.length) {
    notify.error(NOTIFY_ENTITY_SAP_CSV_IS_NOT_READY_YET);
    return;
  }
  downloadLocalAnalysisBulkCsv(lastSapScheduleRows, `proposal-sap-${reportDownloadSlug}`, { skipNotify: false });
}

export function downloadProposalPackage(combinedMd: string | null, lastSapScheduleRows: CSVRow[] | null, lastPostsBulkRows: CSVRow[] | null, talkScriptMd: string | null, proposalPackageDisabled: boolean, reportDownloadSlug: string) {
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
}

export function downloadProposalGridCsv(semrushData: CompetitorResearchSemrushResponse | null, tiers: TieredCompetitorsResult | null, reportDownloadSlug: string) {
  if (!semrushData?.rows?.length) {
    notify.error(NOTIFY_RUN_ANALYZE_FIRST_OR_IMPORT_A_GRID_CSV);
    return;
  }
  const csv = buildLocalStrategyGridExportCsv({ semrush: semrushData, tiers });
  triggerDownloadCsv(`local-strategy-grid-${reportDownloadSlug}-${Date.now()}.csv`, csv);
  notify.success(NOTIFY_GRID_CSV_DOWNLOADED);
}

export type ProposalReportBranchesArgs = {
  maxParallel: number; sapParams: Parameters<typeof runLocalAnalysisEntitySapPipeline>[0];
  srFiltered: CompetitorResearchSemrushResponse; trFiltered: TieredCompetitorsResult;
  reportSiteId: string | undefined; reportSiteName: string | undefined; reportSiteUrl: string;
  gscForReport: GscSiteQueryRow[]; gscDateForReport: GscCompetitorDateRange | null;
  neutralResearchWire: boolean; months: number; guidanceForStrategist: string | undefined;
  bizQ: string; seedForApi: string; gmbDfsForPipeline: unknown;
  gmbOauthForPipeline: LocalStrategyGmbOauthWire | null; siteAuditForReport: ProposalSiteAuditResult | null;
  runKeySnapshot: string; activeWorkspaceKeyRef: { current: string }; sapRecovery: { rows: CSVRow[] };
  setSemrushData: Dispatch<SetStateAction<CompetitorResearchSemrushResponse | null>>;
  setPhase: Dispatch<SetStateAction<"idle" | "semrush" | "report">>;
  setProposalSubphase: Dispatch<SetStateAction<"competitor" | "local" | "sap" | "parallel" | null>>;
  setCompetitorPipelineStep: Dispatch<SetStateAction<number>>; setCompetitorPipelineLabel: Dispatch<SetStateAction<string | null>>;
  setLocalPipelineStep: Dispatch<SetStateAction<number>>; setLocalPipelineLabel: Dispatch<SetStateAction<string | null>>;
  setReportMicroLabel: Dispatch<SetStateAction<string | null>>;
  setLocalStrategySectionDrafts: Dispatch<SetStateAction<Partial<Record<LocalStrategyReportSectionIndex, { markdown: string; requestBodyJson?: string }>>>>;
  setLastSapScheduleRows: Dispatch<SetStateAction<CSVRow[] | null>>;
};

export async function runProposalReportBranches(args: ProposalReportBranchesArgs): Promise<{ competitorMd: string; keywordsMarkdown: string | null | undefined; localMd: string } | null> {
  const { maxParallel, sapParams, srFiltered, trFiltered, reportSiteId, reportSiteName, reportSiteUrl, gscForReport, gscDateForReport, neutralResearchWire, months, guidanceForStrategist, bizQ, seedForApi, gmbDfsForPipeline, gmbOauthForPipeline, siteAuditForReport, runKeySnapshot, activeWorkspaceKeyRef, sapRecovery, setSemrushData, setPhase, setProposalSubphase, setCompetitorPipelineStep, setCompetitorPipelineLabel, setLocalPipelineStep, setLocalPipelineLabel, setReportMicroLabel, setLocalStrategySectionDrafts, setLastSapScheduleRows } = args;
  const onReportMicroStep = (info: LocalStrategyReportMicroStepPayload) => {
    setProposalSubphase("local");
    setLocalPipelineStep(info.step);
    setLocalPipelineLabel(info.label);
  };

  const onLocalStrategySectionReady = (payload: LocalStrategyStrategistSectionReadyPayload) => {
    setLocalStrategySectionDrafts((prev) => ({
      ...prev,
      [payload.section]: {
        markdown: payload.markdown,
        requestBodyJson: payload.requestStats?.requestBodyJson,
      },
    }));
  };

  const onCompetitorMicroStep = (info: CompetitorReportMicroStepPayload) => {
    setProposalSubphase("competitor");
    setCompetitorPipelineStep(info.step);
    setCompetitorPipelineLabel(info.label);
  };

  const onCompetitorMicroStepParallel = (info: CompetitorReportMicroStepPayload) => {
    setProposalSubphase("parallel");
    setCompetitorPipelineStep(info.step);
    setCompetitorPipelineLabel(info.label);
  };

  const onReportMicroStepParallel = (info: LocalStrategyReportMicroStepPayload) => {
    setProposalSubphase("parallel");
    setLocalPipelineStep(info.step);
    setLocalPipelineLabel(info.label);
  };

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
    sapRecovery.rows = sapRows;

    if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
      setPhase("idle");
      setProposalSubphase(null);
      setCompetitorPipelineStep(0);
      setCompetitorPipelineLabel(null);
      setLocalPipelineStep(0);
      setLocalPipelineLabel(null);
      setReportMicroLabel(null);
      return null;
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
      return null;
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
      return null;
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
      sapRecovery.rows = r.sapRows;
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
        return null;
      }

      sapRecovery.rows = sapResult.sapRows;
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
        return null;
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
        return null;
      }

      sapRecovery.rows = sapResult.sapRows;
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

  return { competitorMd, keywordsMarkdown, localMd };
}
