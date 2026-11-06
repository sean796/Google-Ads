import { BarChart3, Copy, Download, Sparkles, Table2, Upload, X } from "lucide-react";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import {
  REPORT_PIPELINE_MICRO_TOTAL,
  type CompetitorReportMicroStepPayload,
  type CompetitorReportRequestStats,
} from "@/lib/competitor-research/competitor-report-openrouter-limits";
import {
  buildDomainOrganicCsvFromKeywordRows,
  DOMAIN_ORGANIC_CSV_TOP_ROWS,
} from "@/lib/competitor-research/competitor-domain-organic-csv";
import { cn } from "@/lib/utils";
import { Button, Field, FileInput, TextButton, TextareaField } from "@/ui";
import {
  fmtSeedMoney,
  fmtSeedNum,
  formatCompetitorReportTabProgressLine,
  formatOpenRouterPayloadBytes,  isPortfolioBlockedHost,
  REPORT_SUMMARIZE_WAIT_HINTS,
  REPORT_WRITE_WAIT_HINTS,
  safeDomainForFilename,  splitCompetitorInputLines,
  STRATEGIST_SECTION_LABELS,
  triggerDownloadCsv,
} from "@/components/research/competitor/competitor-research-tab-helpers";
import {
  GscStatusLabel,
  SeedMetricsStrip,
  SeedOverviewStrip,
} from "@/components/research/competitor/competitor-research-tab-components";
import type { CompetitorResearchState } from "@/components/research/competitor/use-competitor-research-state";
import type { useCompetitorAnalyze } from "@/components/research/competitor/use-competitor-analyze";
import type { useCompetitorManualAdds } from "@/components/research/competitor/use-competitor-manual-adds";
import type { useCompetitorReportRun } from "@/components/research/competitor/use-competitor-report-run";

type CompetitorResearchActions = ReturnType<typeof useCompetitorAnalyze> &
  ReturnType<typeof useCompetitorManualAdds> &
  ReturnType<typeof useCompetitorReportRun>;

export function CompetitorResearchControls({
  s,
  a,
  busy,
}: {
  s: CompetitorResearchState;
  a: CompetitorResearchActions;
  busy: boolean;
}) {
  const {
    competitorWorkspaceMode,
    tempSeedUrl,
    setTempSeedUrl,
    site,
    strategicBrief,
    setStrategicBrief,
    semrushData,
    gscQueries,
    tiers,
    reportMd,
    keywordsMd,
    phase,
    error,
    selectedCompetitorKeys,
    analyzeMode,
    setAnalyzeMode,
    semrushEnhanced,
    setSemrushEnhanced,
    gridCsvBusy,
    gridCsvProgress,
    reportPipelineStep,
    reportMicroLabel,
    reportOpenRouterStats,
    strategistSectionDrafts,
    reportWaitHintIndex,
    gridCsvFileRef,
    setPendingManualDomains,
    semrushCsvDownloads,
  } = s;
  const {
    analyze,
    onGridCsvFileChange,
    generateReport,
    copyMarkdownBundle,
    downloadMarkdownBundle,
    downloadOpenRouterRequestJson,
    downloadStrategistSectionMarkdown,
    downloadStrategistSectionPostJson,
    downloadBulkContentCsv,
  } = a;
  return (
    <>
          <div className="rounded-lg border border-border/50 bg-black/25 px-2.5 py-2 sm:px-3 sm:py-2.5">
            <div className="flex flex-col gap-2.5">
              <div className="space-y-1">
                <div className="text-base font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Seed domain
                </div>
                {competitorWorkspaceMode === "temp" ? (
                  <Field
                    type="url"
                    placeholder="https://example.com"
                    aria-label="Seed site URL for competitor research"
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

              <div className="space-y-1">
                <div className="text-base font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Strategic brief · Sec. 1 (optional)
                </div>
                <TextareaField
                  placeholder="Angles, niche, constraints, or tone for the title and opening…"
                  aria-label="Optional strategic brief for section 1"
                  value={strategicBrief}
                  onChange={(e) => setStrategicBrief(e.target.value)}
                  disabled={busy}
                  rows={2}
                />
              </div>
            </div>
          </div>

          <div className="neo-pulse-zone-tile--analysis px-2 py-2 sm:px-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div
                className="inline-flex h-9 shrink-0 overflow-hidden rounded-md border border-[hsl(var(--semantic-analysis)/0.48)] bg-black/30 p-0.5 shadow-none"
                role="group"
                aria-label="Analyze: Auto uses Semrush organic competitors; Manual uses seed data only until you add domains"
              >
                <Button
                  pressed={analyzeMode === "auto"}
                  variant="quiet"
                  aria-pressed={analyzeMode === "auto"}
                  disabled={busy}
                  onClick={() => {
                    setAnalyzeMode("auto");
                    setPendingManualDomains([]);
                  }}
                >
                  Auto
                </Button>
                <Button
                  pressed={analyzeMode === "manual"}
                  variant="quiet"
                  aria-pressed={analyzeMode === "manual"}
                  disabled={busy}
                  onClick={() => setAnalyzeMode("manual")}
                >
                  Manual
                </Button>
              </div>
              <div
                className="inline-flex h-9 shrink-0 overflow-hidden rounded-md border border-[hsl(var(--semantic-analysis)/0.48)] bg-black/30 p-0.5 shadow-none"
                role="group"
                aria-label="Semrush enhanced: DFS uses DataForSEO Labs; Semrush uses Semrush API"
              >
                <Button
                  pressed={!semrushEnhanced}
                  variant="quiet"
                  aria-pressed={!semrushEnhanced}
                  disabled={busy}
                  onClick={() => setSemrushEnhanced(false)}
                >
                  DFS
                </Button>
                <Button
                  pressed={Boolean(semrushEnhanced)}
                  variant="quiet"
                  aria-pressed={semrushEnhanced}
                  disabled={busy}
                  onClick={() => setSemrushEnhanced(true)}
                >
                  Semrush
                </Button>
              </div>
              <FileInput
                ref={gridCsvFileRef}
                accept=".csv,text/csv"
                aria-hidden
                onChange={onGridCsvFileChange}
              />
              <Button
                type="button"
                disabled={gridCsvBusy}
                title={
                  semrushEnhanced
                    ? "Upload Local Dominator grid CSV - Place ID / cid → DataForSEO website → Semrush enrichment"
                    : "Upload Local Dominator grid CSV - Place ID / cid → DataForSEO website → DataForSEO keyword enrichment"
                }
                onClick={() => gridCsvFileRef.current?.click()}
              >
                {gridCsvBusy ? null : <Upload className="h-4 w-4 shrink-0" />}
                Grid CSV
              </Button>
              <Button
                variant="run"
                type="button"
                disabled={busy}
                onClick={() => void analyze()}
              >
                {phase === "semrush" || phase === "tiers" || phase === "manual" ? (
                  null
                ) : (
                  <Sparkles className="h-4 w-4 shrink-0" />
                )}
                Analyze
              </Button>
              <Button
                type="button"
                disabled={busy || !tiers}
                title="Summarize research JSON, then write strategist report (Markdown)"
                onClick={() => void generateReport()}
              >
                {phase === "report" ? null : null}
                Summarize → Write report
              </Button>
              <Button
                type="button"
                disabled={!keywordsMd?.trim() && !reportMd?.trim()}
                title="Copy Keywords They Own and strategist report to clipboard (sections separated by ---)"
                onClick={() => void copyMarkdownBundle()}
              >
                <Copy className="h-4 w-4 shrink-0" />
                Copy Markdown
              </Button>
              <Button
                type="button"
                disabled={!keywordsMd?.trim() && !reportMd?.trim()}
                title="Download two separate .md files when both exist: Keywords They Own and strategist report"
                onClick={downloadMarkdownBundle}
              >
                <Download className="h-4 w-4 shrink-0" />
                Download Markdown
              </Button>
              <Button
                type="button"
                disabled={busy || !semrushData || !reportMd?.trim()}
                title="Bulk CSV from the report’s Content Opportunity Matrix (Anchor Demand column); non-branded phrases; falls back to the Semrush non-brand keyword section if the matrix is empty"
                onClick={downloadBulkContentCsv}
              >
                <Table2 className="h-4 w-4 shrink-0" />
                Bulk CSV
              </Button>
            </div>
            {reportOpenRouterStats ? (
              <div
                className="mt-2 max-h-[min(40vh,14rem)] overflow-y-auto rounded-md border border-border/50 bg-muted/25 px-2 py-1.5 text-left font-mono text-base leading-snug text-muted-foreground"
                aria-label="OpenRouter request payload size and row counts"
              >
                <div className="font-semibold text-foreground/90">Request we send to OpenRouter</div>
                <div>
                  Total JSON body ≈{" "}
                  <span className="text-foreground">{formatOpenRouterPayloadBytes(reportOpenRouterStats.approxRequestBodyBytes)}</span>{" "}
                  ({reportOpenRouterStats.approxRequestBodyBytes.toLocaleString()} UTF-8 bytes)
                </div>
                <div>
                  Model <span className="text-foreground">{reportOpenRouterStats.model}</span> · max_tokens{" "}
                  {reportOpenRouterStats.maxTokensRequested.toLocaleString()}
                </div>
                <div>
                  system {reportOpenRouterStats.systemChars.toLocaleString()} chars · user message{" "}
                  {reportOpenRouterStats.userMessageChars.toLocaleString()} chars (compact context JSON{" "}
                  {reportOpenRouterStats.contextJsonChars.toLocaleString()} chars)
                </div>
                <div>
                  Context rows: {reportOpenRouterStats.breakdown.semrushRowCount} Semrush competitors ·{" "}
                  {reportOpenRouterStats.breakdown.gscQueryCount} GSC queries ·{" "}
                  {reportOpenRouterStats.breakdown.enrichmentDomainCount} competitor domains (Semrush keyword CSV) ·{" "}
                  {reportOpenRouterStats.breakdown.enrichmentTopKeywordRowsTotal} Semrush keyword rows in JSON (ekr) ·{" "}
                  {reportOpenRouterStats.breakdown.seedTopKeywordCount} seed keywords ·{" "}
                  {reportOpenRouterStats.breakdown.tierGroupCount} tier groups
                </div>
                <TextButton
                  type="button"
                  onClick={downloadOpenRouterRequestJson}
                >
                  Download exact POST body (.json)
                </TextButton>
              </div>
            ) : null}
            {phase === "report" && reportPipelineStep >= 6 ? (
              <div
                className="mt-2 rounded-md border border-border/50 bg-muted/25 px-2 py-1.5 text-left text-base leading-snug text-muted-foreground"
                aria-label="Strategist section drafts from OpenRouter (1–2 parallel, then 3)"
              >
                <div className="font-mono font-semibold text-foreground/90">Strategist sections</div>
                <p className="mt-0.5 max-w-prose text-base leading-snug text-foreground">
                  Optional strategic brief is set above (Section 1). Sections 1–2 run in parallel, then 3. Each row enables
                  download when that section returns. Drafts stay after the run finishes.
                </p>
                <ul className="mt-1.5 list-none space-y-1.5 pl-0">
                  {([1, 2, 3] as const).map((section) => {
                    const draft = strategistSectionDrafts[section];
                    const hasMd = Boolean(draft?.markdown?.trim());
                    const hasJson = Boolean(draft?.requestBodyJson);
                    return (
                      <li
                        key={section}
                        className="flex flex-col gap-1 border-b border-border/40 pb-1.5 last:border-b-0 last:pb-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
                      >
                        <span className="min-w-0 shrink font-mono text-base text-foreground/85">
                          <span className="text-muted-foreground">S{section}</span> {STRATEGIST_SECTION_LABELS[section]}
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            disabled={!hasMd}
                            title={hasMd ? "Download this section as Markdown" : "Waiting for this section…"}
                            onClick={() => downloadStrategistSectionMarkdown(section)}
                          >
                            <Download className="mr-1 h-3.5 w-3.5 shrink-0" />
                            .md
                          </Button>
                          <TextButton
                            type="button"
                            disabled={!hasJson}
                            title={hasJson ? "Download exact OpenRouter POST JSON for this section" : "Payload not ready yet"}
                            onClick={() => downloadStrategistSectionPostJson(section)}
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
            {semrushCsvDownloads.seed || semrushCsvDownloads.competitors.length > 0 ? (
              <div
                className="mt-2 max-h-[min(40vh,14rem)] overflow-y-auto rounded-md border border-border/50 bg-muted/25 px-2 py-1.5 text-left font-mono text-base leading-snug text-muted-foreground"
                aria-label="Semrush domain organic keyword CSV downloads"
              >
                <div className="font-semibold text-foreground/90">
                  {semrushData?.database === "dfs" || semrushData?.dataSource === "dfs"
                    ? "Organic keyword CSV (DataForSEO Labs)"
                    : "Semrush domain organic (CSV)"}
                </div>
                <p className="mt-0.5 text-base leading-snug text-foreground">
                  Up to {DOMAIN_ORGANIC_CSV_TOP_ROWS} traffic-sorted keywords per domain from{" "}
                  {semrushData?.database === "dfs" || semrushData?.dataSource === "dfs"
                    ? "DataForSEO Labs ranked keywords."
                    : "Semrush."}{" "}
                  Same CSV text is sent to OpenRouter as <span className="text-foreground/90">ssc</span> (seed) and{" "}
                  <span className="text-foreground/90">scsv</span> (competitors). The first report run clusters them into topic groups;
                  reruns reuse those clusters (no second clustering pass).
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {semrushCsvDownloads.seed ? (
                    <li>
                      <TextButton
                        type="button"
                        onClick={() =>
                          triggerDownloadCsv(
                            `semrush-seed-${safeDomainForFilename(semrushData?.seedDomain ?? "seed")}-domain-organic-top-${DOMAIN_ORGANIC_CSV_TOP_ROWS}.csv`,
                            semrushCsvDownloads.seed!,
                          )
                        }
                      >
                        Seed site ({semrushData?.seedDomain ?? "seed"})
                      </TextButton>
                    </li>
                  ) : null}
                  {semrushCsvDownloads.competitors.map(({ domain, csv }) => (
                    <li key={domain}>
                      <TextButton
                        type="button"
                        onClick={() =>
                          triggerDownloadCsv(
                            `semrush-competitor-${safeDomainForFilename(domain)}-domain-organic-top-${DOMAIN_ORGANIC_CSV_TOP_ROWS}.csv`,
                            csv,
                          )
                        }
                      >
                        {domain}
                      </TextButton>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {busy ? (
              <div
                className="mt-2 space-y-2"
                role="progressbar"
                aria-busy="true"
                aria-valuemin={phase === "report" ? 0 : undefined}
                aria-valuemax={phase === "report" ? REPORT_PIPELINE_MICRO_TOTAL : undefined}
                aria-valuenow={phase === "report" ? reportPipelineStep : undefined}
                aria-valuetext={
                  gridCsvBusy && phase === "idle"
                    ? (gridCsvProgress ?? "Grid CSV: DataForSEO then Semrush")
                    : phase === "semrush"
                      ? "Step 1 of 3: Semrush competitor metrics and Search Console queries"
                      : phase === "tiers" || phase === "manual"
                        ? "Step 2 of 3: AI tiering of competitors"
                        : phase === "report"
                          ? reportMicroLabel
                            ? `Step ${reportPipelineStep} of ${REPORT_PIPELINE_MICRO_TOTAL} (step 3 of 3 overall): ${reportMicroLabel}`
                            : "Step 3 of 3: Summarize, then write report"
                          : undefined
                }
              >
                <div className="neo-pulse-competitor-progress-track">
                  {gridCsvBusy && phase === "idle" ? (
                    <div className="neo-pulse-competitor-progress-indeterminate" aria-hidden />
                  ) : phase === "semrush" ? (
                    <div className="neo-pulse-competitor-progress-indeterminate" aria-hidden />
                  ) : phase === "tiers" || phase === "manual" ? (
                    <div className="flex h-full w-full" aria-hidden>
                      <div className="neo-pulse-competitor-progress-fill w-1/2 shrink-0" />
                      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                        <div className="neo-pulse-competitor-progress-indeterminate" />
                      </div>
                    </div>
                  ) : phase === "report" ? (
                    reportPipelineStep === 4 || reportPipelineStep === 6 ? (
                      <div className="flex h-full w-full" aria-hidden>
                        <div className="neo-pulse-competitor-progress-fill h-full shrink-0" style={{ width: "40%" }} />
                        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                          <div className="neo-pulse-competitor-progress-indeterminate" />
                        </div>
                      </div>
                    ) : (
                      <div
                        className="neo-pulse-competitor-progress-fill h-full transition-[width] duration-300 ease-out"
                        style={{
                          width: `${reportPipelineStep <= 0 ? 0 : (reportPipelineStep / REPORT_PIPELINE_MICRO_TOTAL) * 100}%`,
                        }}
                        aria-hidden
                      />
                    )
                  ) : null}
                </div>
                <div className="min-h-[1rem] text-base leading-normal text-muted-foreground">
                  {gridCsvBusy && phase === "idle"
                    ? (gridCsvProgress ?? "Grid CSV: resolving websites (DataForSEO) then competitor metrics (Semrush)…")
                    : phase === "semrush"
                      ? "Step 1/3: Fetching Semrush data and GSC queries for the seed site…"
                      : phase === "tiers" || phase === "manual"
                        ? "Step 2/3: Grouping competitors into tiers (AI)…"
                        : phase === "report" ? (
                          <div className="space-y-1.5">
                            <p className="min-h-[1rem] text-base leading-normal text-muted-foreground">
                              {reportMicroLabel
                                ? formatCompetitorReportTabProgressLine(
                                    reportPipelineStep,
                                    reportMicroLabel,
                                    REPORT_PIPELINE_MICRO_TOTAL,
                                  )
                                : "Step 3/3 · Starting…"}
                            </p>
                            <div className="flex items-center gap-1.5" aria-hidden>
                              {Array.from({ length: REPORT_PIPELINE_MICRO_TOTAL }, (_, i) => (
                                <span
                                  key={i}
                                  className={cn(
                                    "h-2 w-2 rounded-full transition-colors",
                                    reportPipelineStep > i
                                      ? "bg-[hsl(var(--semantic-data)/0.95)] shadow-[0_0_8px_hsl(var(--semantic-data)/0.45)]"
                                      : "bg-muted-foreground/25",
                                  )}
                                />
                              ))}
                            </div>
                            {reportPipelineStep === 4 || reportPipelineStep === 6 ? (
                              <p className="min-h-[1rem] text-base leading-snug text-foreground">
                                {(reportPipelineStep === 4
                                  ? REPORT_SUMMARIZE_WAIT_HINTS
                                  : REPORT_WRITE_WAIT_HINTS)[
                                  reportWaitHintIndex %
                                    (reportPipelineStep === 4
                                      ? REPORT_SUMMARIZE_WAIT_HINTS.length
                                      : REPORT_WRITE_WAIT_HINTS.length)
                                ]}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          ""
                        )}
                </div>
              </div>
            ) : null}
            {error ? (
              <p className="mt-2 min-h-[1rem] text-base leading-normal text-destructive">{error}</p>
            ) : null}
          </div>
    </>
  );
}
