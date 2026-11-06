import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, MapPin, Sparkles, Upload } from "lucide-react";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { buildPortfolioBlockedHosts } from "@/lib/portfolio-link-blocklist";
import { useManagerSeedWorkspace } from "@/contexts/manager-seed-workspace-context";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import { LOCAL_STRATEGY_REPORT_MICRO_TOTAL } from "@/lib/local-strategy-research/local-strategy-report-openrouter-limits";
import type { CompetitorResearchSemrushResponse, GscCompetitorDateRange, GscSiteQueryRow, TieredCompetitorsResult } from "@/lib/competitor-research/types";
import { CompetitorSiteGrid } from "@/components/research/competitor/CompetitorSiteGrid";
import { cn } from "@/lib/utils";
import { Button, Field, FileInput } from "@/ui";
import { safeDomainForFilename, useLocalStrategyGridCsvImport } from "@/components/research/local/use-local-strategy-grid-csv-import";
import { useLocalStrategyPipelines } from "@/components/research/local/use-local-strategy-pipelines";
import { LocalStrategyBlueprintSectionsPanel, LocalStrategyOutputsSection } from "@/components/research/local/LocalStrategyOutputsSection";

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
  }, [workspaceMode, tempSeedUrl, site]);

  const activeWorkspaceKeyRef = useRef<string>("");
  activeWorkspaceKeyRef.current = workspaceKey;

  const effectiveSeedUrl = useMemo(() => {
    if (workspaceMode === "temp") return tempSeedUrl.trim();
    return site ? getPublicSiteUrl(site) : "";
  }, [workspaceMode, tempSeedUrl, site]);

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
  const [geoLabel, setGeoLabel] = useState("");
  const [businessNameQuery, setBusinessNameQuery] = useState("");

  const reportDownloadSlug = useMemo(() => {
    if (neutralResearchWire && semrushData?.seedDomain) {
      return safeDomainForFilename(semrushData.seedDomain);
    }
    return (site?.name || "site").replace(/\s+/g, "-");
  }, [neutralResearchWire, semrushData?.seedDomain, site?.name]);

  const { gridCsvBusy, gridCsvProgress, gridSapSummaryMarkdown, setGridSapSummaryMarkdown, gridSapPlaceHints, setGridSapPlaceHints, gridSapKeywordWeights, setGridSapKeywordWeights, gridSapParsedRows, setGridSapParsedRows, gridCsvFileRef, onGridCsvFileChange, downloadGridCsv } = useLocalStrategyGridCsvImport({
    workspaceMode, site, effectiveSeedUrl, workspaceKey, neutralResearchWire, effectivePortfolioHosts, semrushData, tiers, gscQueries, gscDateRange, reportDownloadSlug, activeWorkspaceKeyRef, setError, setSemrushData, setTiers,
  });

  const { phase, setPhase, reportMd, setReportMd, reportPipelineStep, reportMicroLabel, localStrategySectionDrafts, lastSapScheduleRows, setLastSapScheduleRows, sapEntitiesBusy, setGmbDfsRaw, setGmbOauth, analyze, generateReport, generateEntitiesSap, copyReport, downloadReport } = useLocalStrategyPipelines({
    workspaceMode, site, effectiveSeedUrl, workspaceKey, neutralResearchWire, effectivePortfolioHosts, businessNameQuery, geoLabel, semrushData, tiers, selectedCompetitorKeys, gscQueries, gscDateRange, reportDownloadSlug, gridSapSummaryMarkdown, gridSapPlaceHints, gridSapKeywordWeights, gridSapParsedRows, activeWorkspaceKeyRef, setError, setSemrushData, setGscQueries, setGscDateRange, setGscError, setTiers, setSelectedCompetitorKeys,
  });

  useEffect(() => {
    if (site?.name?.trim()) {
      setBusinessNameQuery((prev) => (prev.trim() ? prev : site.name.trim()));
    }
  }, [site?.id, site?.name]);

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
  }, [workspaceMode, debouncedTempSeed, site?.id, sitePublicUrl, setGmbDfsRaw, setGmbOauth, setGridSapKeywordWeights, setGridSapParsedRows, setGridSapPlaceHints, setGridSapSummaryMarkdown, setLastSapScheduleRows, setPhase, setReportMd]);

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

  const busy = phase !== "idle" || gridCsvBusy || sapEntitiesBusy;

  const reportProgressPct =
    phase === "report" && LOCAL_STRATEGY_REPORT_MICRO_TOTAL > 0
      ? Math.min(100, (reportPipelineStep / LOCAL_STRATEGY_REPORT_MICRO_TOTAL) * 100)
      : 0;

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
            <LocalStrategyBlueprintSectionsPanel phase={phase} reportPipelineStep={reportPipelineStep} localStrategySectionDrafts={localStrategySectionDrafts} reportDownloadSlug={reportDownloadSlug} />
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

          <LocalStrategyOutputsSection reportMd={reportMd} lastSapScheduleRows={lastSapScheduleRows} onDownloadReport={downloadReport} />
        </>
      )}
    </div>
  );
}
