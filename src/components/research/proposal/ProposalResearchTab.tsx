import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceNestedInput, WorkspaceNestedTextarea } from "@/components/seo/WorkspaceNestedField";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { buildPortfolioBlockedHosts } from "@/lib/portfolio-link-blocklist";
import { useManagerSeedWorkspace } from "@/contexts/manager-seed-workspace-context";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import type { CompetitorResearchSemrushResponse, GscCompetitorDateRange, GscSiteQueryRow, TieredCompetitorsResult } from "@/lib/competitor-research/types";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ANALYZE_DONE, NOTIFY_CLIENT_MEETING_SCRIPT_IS_NOT_READY_YET, NOTIFY_COULD_NOT_COPY, NOTIFY_DOWNLOADED_CLIENT_MEETING_SCRIPT_MD, NOTIFY_DOWNLOADED_STRATEGY_MD, NOTIFY_ENTER_A_SEED_SITE_URL_FIRST, NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM, NOTIFY_ENTITY_SAP_CSV_IS_NOT_READY_YET, NOTIFY_GENERATE_A_PROPOSAL_FIRST, NOTIFY_GRID_CSV_DOWNLOADED, NOTIFY_GRID_IMPORT_DONE, NOTIFY_LOCAL_ANALYSIS_DID_NOT_RETURN_COMPETITOR, NOTIFY_NO_NEW_COMPETITORS_FROM_GRID, NOTIFY_POSTS_CSV_IS_NOT_READY_YET, NOTIFY_PROPOSAL_COPIED, NOTIFY_PROPOSAL_INCOMPLETE_BLOG_ROWS_SAVED, NOTIFY_PROPOSAL_INCOMPLETE_SAP_AND_BLOG_ROWS_SA, NOTIFY_PROPOSAL_INCOMPLETE_SAP_ROWS_SAVED, NOTIFY_RUN_ANALYZE_FIRST_OR_IMPORT_A_GRID_CSV, NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR, NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL, NOTIFY_STRATEGY_MARKDOWN_IS_NOT_READY_YET, notifyAddedXCompetitorSFromGridCsv, notifyFileTooLargeMaxXMb, notifyGridCsvSapScanX, notifyGridSkipX, notifyGridXXNoWebsite, notifyGridXXX, notifyGscX2, notifyPresenterTalkScriptFailedX, notifyResearchXX, notifySiteAuditSkippedX, notifySiteAuditSkippedX2, notifyUpdatedXCompetitorSFromGridCsvWer } from "@/lib/notify-messages";
import { CompetitorSiteGrid } from "@/components/research/competitor/CompetitorSiteGrid";
import { ProposalWorkspaceHeader } from "@/components/research/proposal/ProposalWorkspaceHeader";
import type { GeneratorWorkspaceChromeBindings } from "@/components/blog-generator/generator-workspace-chrome-bindings";
import { SEO_WORKSPACE_BODY_SCROLL_CLASS, SEO_WORKSPACE_HEADER_CLASS, SEO_WORKSPACE_SHELL_CLASS, SEO_WORKSPACE_TYPO_CLASS } from "@/components/seo/seo-workspace-layout";
import { runManagerLocalAnalysisAnalyze } from "@/lib/local-strategy-research/manager-local-analysis-analyze";
import { cn } from "@/lib/utils";
import { LOCAL_ORGANIC_SOURCE, safeDomainForFilename } from "@/components/research/proposal/proposal-research-helpers";
import { useProposalGridCsvImport } from "@/components/research/proposal/use-proposal-grid-csv-import";
import { useProposalReportPipeline } from "@/components/research/proposal/use-proposal-report-pipeline";
import { ProposalBlueprintSectionsPanel, ProposalOutputsSection } from "@/components/research/proposal/ProposalOutputsSection";

type ProposalResearchTabProps = {
  generatorChrome: GeneratorWorkspaceChromeBindings;
};

export function ProposalResearchTab({ generatorChrome }: ProposalResearchTabProps) {
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
  }, [workspaceMode, tempSeedUrl, site]);

  const activeWorkspaceKeyRef = useRef<string>("");
  activeWorkspaceKeyRef.current = workspaceKey;

  const effectiveSeedUrl = useMemo(() => {
    if (workspaceMode === "temp") return tempSeedUrl.trim();
    return site ? getPublicSiteUrl(site) : "";
  }, [workspaceMode, tempSeedUrl, site]);

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
  const [error, setError] = useState<string | null>(null);
  const [selectedCompetitorKeys, setSelectedCompetitorKeys] = useState<Set<string>>(() => new Set());
  const [scheduleMonths, setScheduleMonths] = useState(3);
  const [entitySapPerMonth, setEntitySapPerMonth] = useState(15);
  const [contentBlogsPerMonth, setContentBlogsPerMonth] = useState(3);
  const [strategistGuidance, setStrategistGuidance] = useState("");

  const reportDownloadSlug = useMemo(() => {
    if (neutralResearchWire && semrushData?.seedDomain) {
      return safeDomainForFilename(semrushData.seedDomain);
    }
    return (site?.name || "site").replace(/\s+/g, "-");
  }, [neutralResearchWire, semrushData?.seedDomain, site?.name]);

  const { gridCsvBusy, gridCsvProgress, gridSapSummaryMarkdown, setGridSapSummaryMarkdown, gridSapPlaceHints, setGridSapPlaceHints, gridSapKeywordWeights, setGridSapKeywordWeights, gridSapParsedRows, setGridSapParsedRows, gridCsvFileRef, onGridCsvFileChange, downloadGridCsv } = useProposalGridCsvImport({
    workspaceMode, site, effectiveSeedUrl, workspaceKey, neutralResearchWire, effectivePortfolioHosts, semrushData, tiers, gscQueries, gscDateRange, reportDownloadSlug, activeWorkspaceKeyRef, setError, setSemrushData, setTiers,
  });

  const { phase, setPhase, proposalSubphase, setProposalSubphase, competitorPipelineStep, competitorPipelineLabel, localPipelineStep, localPipelineLabel, reportMicroLabel, setReportMicroLabel, combinedMd, setCombinedMd, setReportMd, setLastSapScheduleRows, setLastPostsBulkRows, setTalkScriptMd, talkScriptMd, lastSapScheduleRows, lastPostsBulkRows, localStrategySectionDrafts, setGmbDfsRaw, setGmbOauth, proposalPackageDisabled, generateProposal, copyProposal, downloadEntitySap, downloadPackage, reportProgressPct, canOpenDetails } = useProposalReportPipeline({
    workspaceMode, site, effectiveSeedUrl, workspaceKey, neutralResearchWire, effectivePortfolioHosts, businessNameQuery, semrushData, tiers, selectedCompetitorKeys, gscQueries, gscDateRange, scheduleMonths, contentBlogsPerMonth, strategistGuidance, gridSapSummaryMarkdown, gridSapPlaceHints, gridSapKeywordWeights, gridSapParsedRows, reportDownloadSlug, activeWorkspaceKeyRef, error, gscError, gridCsvBusy, setError, setSemrushData, setTiers, setSelectedCompetitorKeys, setGscQueries, setGscDateRange, setGscError,
  });
  const copyProposalPackage = copyProposal;
  const downloadEntitySapCsv = downloadEntitySap;
  const downloadProposalPackage = downloadPackage;

  const semrushRows = semrushData?.rows;
  const semrushRowsFingerprint = useMemo(() => {
    if (!semrushRows?.length) return "";
    return semrushRows.map((r) => normalizeCompetitorDomainKey(r.domain)).sort().join("|");
  }, [semrushRows]);

  const prevSemrushDomainKeysRef = useRef<Set<string>>(new Set());
  const prevWorkspaceClearKeyRef = useRef<string | null>(null);

  const sitePublicUrl = site ? getPublicSiteUrl(site) : "";
  useEffect(() => {
    const key =
      workspaceMode === "temp"
        ? `temp:${debouncedTempSeed}`
        : site?.id
          ? `connected:${site.id}|${sitePublicUrl}`
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
  }, [workspaceMode, debouncedTempSeed, site?.id, sitePublicUrl, setCombinedMd, setGmbDfsRaw, setGmbOauth, setGridSapKeywordWeights, setGridSapParsedRows, setGridSapPlaceHints, setGridSapSummaryMarkdown, setLastPostsBulkRows, setLastSapScheduleRows, setPhase, setProposalSubphase, setReportMd, setTalkScriptMd]);

  useEffect(() => {
    if (!semrushRowsFingerprint) {
      prevSemrushDomainKeysRef.current = new Set();
      setSelectedCompetitorKeys(new Set());
      return;
    }
    const currentKeys = new Set(semrushRowsFingerprint.split("|"));
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
    setCombinedMd, setGmbDfsRaw, setGmbOauth, setLastPostsBulkRows, setLastSapScheduleRows, setPhase, setReportMd, setReportMicroLabel,
  ]);


  const busy = phase !== "idle" || gridCsvBusy;


  return (
    <div
      className={cn(SEO_WORKSPACE_SHELL_CLASS, SEO_WORKSPACE_TYPO_CLASS)}
    >
      {workspaceMode === "connected" && (!site || !site.siteUrl?.trim()) ? (
        <div className="neo-pulse-zone-tile--data px-2 py-3 text-base leading-normal text-muted-foreground">
          {!site
            ? "Connect a WordPress site and select it in the header, or switch to Temp seed."
            : "This site has no URL saved."}
        </div>
      ) : (
        <>
            <div className={SEO_WORKSPACE_HEADER_CLASS}>
              <ProposalWorkspaceHeader
                {...generatorChrome}
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

          <div
            className={cn(SEO_WORKSPACE_BODY_SCROLL_CLASS, "relative space-y-4")}
          >
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

            <ProposalBlueprintSectionsPanel phase={phase} proposalSubphase={proposalSubphase} localPipelineStep={localPipelineStep} combinedMd={combinedMd} talkScriptMd={talkScriptMd} localStrategySectionDrafts={localStrategySectionDrafts} reportDownloadSlug={reportDownloadSlug} />
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

          <ProposalOutputsSection combinedMd={combinedMd} lastPostsBulkRows={lastPostsBulkRows} lastSapScheduleRows={lastSapScheduleRows} talkScriptMd={talkScriptMd} proposalPackageDisabled={proposalPackageDisabled} reportDownloadSlug={reportDownloadSlug} onDownloadProposalPackage={downloadProposalPackage} onDownloadEntitySapCsv={downloadEntitySapCsv} />
          </div>
        </>
      )}
    </div>
  );
}
