import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Copy, Download, Sparkles, Table2, Upload, X } from "lucide-react";
import type {
  CompetitorSeedMetrics,
  CompetitorSeedOverview,
  GscCompetitorDateRange,
  GscSiteQueryRow,
} from "@/lib/competitor-research/types";
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
  isGscSiteNotInListFailure,
  type FetchCompetitorGscQueriesResult,
} from "@/lib/competitor-research/competitor-gsc-queries";
import { buildDemandQueriesFromSeedKeywords } from "@/lib/competitor-research/competitor-seed-demand-as-gq";
import { filterMainCompetitorResearchResponse } from "@/lib/competitor-research/filter-main-competitor-rows";
import { filterCompetitorsByGscRelevance } from "@/lib/competitor-research/filter-competitors-by-gsc-relevance";
import { runCompetitorTierAgent } from "@/lib/competitor-research/competitor-tier-agent";
import {
  runCompetitorReportAgent,
  type StrategistSectionReadyPayload,
} from "@/lib/competitor-research/competitor-report-agent";
import {
  REPORT_PIPELINE_MICRO_TOTAL,
  type CompetitorReportMicroStepPayload,
  type CompetitorReportRequestStats,
} from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { parseCompetitorGridTopPlaces } from "@/lib/competitor-research/local-dominator-grid-parse";
import { fetchGridCompetitorHostnamesParallel } from "@/lib/competitor-research/competitor-grid-dfs-client";
import { mergeGridCompetitorsAsDirectTier } from "@/lib/competitor-research/competitor-grid-tier-merge";
import { isNonMainCompetitorDomain } from "@/lib/competitor-research/filter-main-competitor-rows";
import type { CompetitorResearchSemrushResponse, TieredCompetitorsResult } from "@/lib/competitor-research/types";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ADD_COMPETITORS, NOTIFY_ALL_LINES_WERE_ALREADY_IN_THE_LIST, NOTIFY_COULD_NOT_COPY, NOTIFY_ENTER_AT_LEAST_ONE_DOMAIN_OR_URL_ONE_PER, NOTIFY_ENTER_A_SEED_SITE_URL, NOTIFY_ENTER_A_SEED_SITE_URL_FIRST, NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM, NOTIFY_EVERY_OVERLAPPING_DOMAIN_WAS_A_MEGA_PLAT, NOTIFY_GENERATE_A_REPORT_FIRST, NOTIFY_GENERATE_REPORT_FIRST, NOTIFY_GRID_IMPORT_DONE, NOTIFY_NO_COMPETITORS_RETURNED, NOTIFY_NO_COMPETITOR_ROWS_RETURNED_FOR_THIS_DOM, NOTIFY_NO_NEW_COMPETITORS_FROM_GRID, NOTIFY_NO_NEW_COMPETITORS_WERE_ADDED, NOTIFY_REPORT_GENERATED, NOTIFY_RUN_ANALYZE_AGAIN, NOTIFY_RUN_ANALYZE_FIRST, NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR, NOTIFY_SELECT_A_CONNECTED_SITE, NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL, notifyAddedXFromGrid, notifyDfsSkipX, notifyDfsXXNoWebsite, notifyDfsXXX, notifyExcludedXNonCompetitorDomainSEGY, notifyFileTooLargeMaxXMb, notifyGridImportXUpdatedX, notifyGscRelevanceFilterRemovedXCompetito, notifyGscX, notifySeedMetricsReadyX, notifySkippedInvalidLineXx, notifyUpdatedXFromGrid, notifyXDuplicateLineSSkippedAlreadyQueue, notifyXLineSCouldNotBeParsedAsADomain, notifyXLineSSkippedAlreadyInTheTable, notifyXLineSSkippedPortfolioBlocklist, notifyXLineSSkippedSameAsYourSeedSite, notifyCompetitorDataSourceWarning, notifyXX2, notifyXXX2 } from "@/lib/notify-messages";
import { MAX_LOCAL_CSV_FILE_BYTES } from "@/lib/local-dominator-csv";
import { CompetitorSiteGrid } from "@/components/research/competitor/CompetitorSiteGrid";
import { downloadCompetitorBulkContentCsv } from "@/lib/competitor-research/competitor-bulk-content-csv";
import {
  buildDomainOrganicCsvFromKeywordRows,
  DOMAIN_ORGANIC_CSV_TOP_ROWS,
} from "@/lib/competitor-research/competitor-domain-organic-csv";
import { formatCompetitorMetricCell } from "@/lib/competitor-research/competitor-report-number-format";
import type { CompetitorReportSectionIndex } from "@/lib/competitor-research/competitor-report-system-prompt";
import { cn } from "@/lib/utils";
import { Button, Field, FileInput, TextButton, TextareaField } from "@/ui";

function formatOpenRouterPayloadBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function safeDomainForFilename(d: string): string {
  const k = normalizeCompetitorDomainKey(d);
  return (k || "domain").replace(/[^a-z0-9.-]+/gi, "_").slice(0, 80);
}

/** Non-empty trimmed lines - supports paste of multiple URLs, one per line. */
function splitCompetitorInputLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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

/** Rotating hints while step 2 runs - summarize research JSON. */
const REPORT_SUMMARIZE_WAIT_HINTS = [
  "Summarizing shrinks text fields so the writer step fits in context.",
  "OpenRouter may queue briefly before the summarizer starts.",
  "Keep this tab in the foreground to avoid browser throttling.",
  "Only your API key, compact research JSON, and instructions are sent to OpenRouter.",
] as const;

/** Short labels for the strategist sections (writer step). */
const STRATEGIST_SECTION_LABELS: Record<CompetitorReportSectionIndex, string> = {
  1: "The Foundational Pillars",
  2: "Pain Points",
  3: "Traffic & Intent Gaps",
};

/** Rotating hints while step 6 runs (strategist sections). */
const REPORT_WRITE_WAIT_HINTS = [
  "Writing the strategist report. Large keyword tables can push this past 5 minutes; three sections run in parallel.",
  "OpenRouter may queue briefly before the model starts writing.",
  "Keep this tab in the foreground to avoid browser throttling.",
  "Only your API key, summarized research JSON, and instructions are sent to OpenRouter.",
] as const;

function formatCompetitorReportTabProgressLine(step: number, label: string | null, total: number): string {
  const micro = label ?? "…";
  if (step <= 0) {
    return `Step 3/3 · 0/${total} · ${micro}`;
  }
  const phase = step <= 5 ? "Prep" : "Strategist";
  const phaseDetail = step <= 5 ? `${step}/5` : `${step - 5}/4`;
  return `Step 3/3 · ${phase} ${phaseDetail} · ${step}/${total} · ${micro}`;
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

/** One-line GSC or seed-demand status after Analyze - neon frame, no query table. */
function GscStatusLabel({
  dateRange,
  queryCount,
  errorMessage,
  skippedNotInList = false,
  demandSource = "gsc",
}: {
  dateRange: GscCompetitorDateRange | null;
  queryCount: number;
  errorMessage: string | null;
  /** GSC not linked for this site - same one-line label as an error, no long tooltip. */
  skippedNotInList?: boolean;
  /** Temp seed: `gq` rows are Labs/Semrush demand proxies, not Search Console. */
  demandSource?: "gsc" | "dfs_seed";
}) {
  if (!dateRange && !errorMessage && queryCount === 0 && !skippedNotInList) return null;

  const rangeLabel =
    dateRange != null ? `${dateRange.startDate} → ${dateRange.endDate}` : " - ";

  const label =
    demandSource === "dfs_seed"
      ? queryCount === 0
        ? `Organic demand (seed keywords) · 0 rows · ${rangeLabel}`
        : `Organic demand (seed ranked keywords) · ${queryCount.toLocaleString()} rows · ${rangeLabel} · not Search Console`
      : skippedNotInList || errorMessage
        ? "GSC unavailable · Semrush only"
        : queryCount === 0
          ? `GSC · 0 queries · ${rangeLabel}`
          : `GSC · ${queryCount.toLocaleString()} queries stored · ${rangeLabel}`;

  const titleAttr =
    demandSource === "dfs_seed"
      ? `Organic demand proxies from seed ranked keywords (${rangeLabel})`
      : skippedNotInList
        ? undefined
        : errorMessage ?? `Search Console data for this run (${rangeLabel})`;

  return (
    <div className="mt-2 px-2 sm:px-0">
      <span
        className="inline-flex min-h-[1rem] max-w-full items-center rounded-sm px-2.5 py-1 text-base font-semibold uppercase leading-normal tracking-wide neo-pulse-frame-primary bg-black/40 text-primary"
        title={titleAttr}
      >
        {label}
      </span>
    </div>
  );
}

function fmtSeedNum(n: number | null | undefined): string {
  return formatCompetitorMetricCell(n);
}

function fmtSeedMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return " - ";
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function SeedMetricsStrip({ metrics }: { metrics: CompetitorSeedMetrics }) {
  return (
    <div className="neo-pulse-zone-tile--data mt-2 px-2 py-2 sm:px-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border/50 bg-black/25 px-2 py-1.5">
          <div className="min-h-[1rem] text-base font-medium uppercase leading-normal tracking-wide text-muted-foreground">
            Organic keywords
          </div>
          <div className="font-mono text-base leading-normal text-foreground">{fmtSeedNum(metrics.organicKeywords)}</div>
        </div>
        <div className="rounded-md border border-border/50 bg-black/25 px-2 py-1.5">
          <div className="min-h-[1rem] text-base font-medium uppercase leading-normal tracking-wide text-muted-foreground">
            Organic traffic
          </div>
          <div className="font-mono text-base leading-normal text-foreground">{fmtSeedNum(metrics.organicTraffic)}</div>
        </div>
        <div className="rounded-md border border-border/50 bg-black/25 px-2 py-1.5">
          <div className="min-h-[1rem] text-base font-medium uppercase leading-normal tracking-wide text-muted-foreground">
            Traffic value
          </div>
          <div className="font-mono text-base leading-normal text-foreground">{fmtSeedMoney(metrics.trafficCost)}</div>
        </div>
      </div>
    </div>
  );
}

function SeedOverviewStrip({ overview }: { overview: CompetitorSeedOverview }) {
  return (
    <div className="neo-pulse-zone-tile--data mt-2 px-2 py-2 sm:px-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border/50 bg-black/25 px-2 py-1.5">
          <div className="min-h-[1rem] text-base font-medium uppercase leading-normal tracking-wide text-muted-foreground">
            Authority Score
          </div>
          <div className="font-mono text-base leading-normal text-foreground">{fmtSeedNum(overview.authorityScore)}</div>
        </div>
        <div className="rounded-md border border-border/50 bg-black/25 px-2 py-1.5">
          <div className="min-h-[1rem] text-base font-medium uppercase leading-normal tracking-wide text-muted-foreground">
            Backlinks
          </div>
          <div className="font-mono text-base leading-normal text-foreground">{fmtSeedNum(overview.backlinksTotal)}</div>
        </div>
      </div>
    </div>
  );
}

export function CompetitorResearchTab() {
  const { sites } = useWordPressSites();
  const {
    mode: competitorWorkspaceMode,
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

  const [strategicBrief, setStrategicBrief] = useState("");

  const workspaceKey = useMemo(() => {
    if (competitorWorkspaceMode === "temp") {
      const n = normalizeCompetitorDomainKey(tempSeedUrl) || tempSeedUrl.trim() || "empty";
      return `temp:${n}`;
    }
    if (!site?.id) return "none";
    return `connected:${site.id}|${getPublicSiteUrl(site)}`;
  }, [competitorWorkspaceMode, tempSeedUrl, site?.id, site?.siteUrl, site?.productionSiteUrl]);

  const activeWorkspaceKeyRef = useRef<string>("");
  activeWorkspaceKeyRef.current = workspaceKey;

  const effectiveSeedUrl = useMemo(() => {
    if (competitorWorkspaceMode === "temp") return tempSeedUrl.trim();
    return site ? getPublicSiteUrl(site) : "";
  }, [competitorWorkspaceMode, tempSeedUrl, site?.siteUrl, site?.productionSiteUrl]);

  const effectivePortfolioHosts = useMemo(
    () => (competitorWorkspaceMode === "temp" ? [] : portfolioHosts),
    [competitorWorkspaceMode, portfolioHosts],
  );

  const neutralResearchWire = competitorWorkspaceMode === "temp";

  const [semrushData, setSemrushData] = useState<CompetitorResearchSemrushResponse | null>(null);
  const [gscQueries, setGscQueries] = useState<GscSiteQueryRow[]>([]);
  const [gscDateRange, setGscDateRange] = useState<GscCompetitorDateRange | null>(null);
  const [gscError, setGscError] = useState<string | null>(null);
  const [gscSkippedNotInList, setGscSkippedNotInList] = useState(false);
  const [tiers, setTiers] = useState<TieredCompetitorsResult | null>(null);
  const [reportMd, setReportMd] = useState<string | null>(null);
  /** Deterministic Keywords They Own Markdown - generated before summarize/write; separate from strategist report. */
  const [keywordsMd, setKeywordsMd] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "semrush" | "tiers" | "report" | "manual">("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedCompetitorKeys, setSelectedCompetitorKeys] = useState<Set<string>>(() => new Set());
  const [manualDomainInput, setManualDomainInput] = useState("");
  /** Manual mode only: domains queued before Analyze (no API until Analyze or Add row after seed). */
  const [pendingManualDomains, setPendingManualDomains] = useState<string[]>([]);
  /** Auto = Semrush organic competitors + tiering; Manual = seed/GSC only, add competitors yourself. */
  const [analyzeMode, setAnalyzeMode] = useState<"auto" | "manual">("auto");
  /** false = DataForSEO Labs (cheaper); true = Semrush API for competitor + keyword data. */
  const [semrushEnhanced, setSemrushEnhanced] = useState(false);
  const [gridCsvBusy, setGridCsvBusy] = useState(false);
  /** Progress label while importing grid CSV (parse → DataForSEO → Semrush). */
  const [gridCsvProgress, setGridCsvProgress] = useState<string | null>(null);
  /** Staged report pipeline (0 = not started; 1–9 micro-steps from runCompetitorReportAgent). */
  const [reportPipelineStep, setReportPipelineStep] = useState(0);
  const [reportMicroLabel, setReportMicroLabel] = useState<string | null>(null);
  /** Populated at report step 6 - full OpenRouter POST size + context breakdown (section 1 representative). */
  const [reportOpenRouterStats, setReportOpenRouterStats] = useState<CompetitorReportRequestStats | null>(null);
  /** Per-section strategist drafts (1–2 parallel, then 3); cleared on new run or abort, not on success. */
  const [strategistSectionDrafts, setStrategistSectionDrafts] = useState<
    Partial<Record<CompetitorReportSectionIndex, { markdown: string; requestBodyJson?: string }>>
  >({});
  const [reportWaitHintIndex, setReportWaitHintIndex] = useState(0);
  const gridCsvFileRef = useRef<HTMLInputElement>(null);

  const onReportMicroStep = useCallback((info: CompetitorReportMicroStepPayload) => {
    setReportPipelineStep(info.step);
    setReportMicroLabel(info.label);
    if (info.requestStats) setReportOpenRouterStats(info.requestStats);
  }, []);

  const onKeywordsMarkdownReady = useCallback((md: string | null) => {
    setKeywordsMd(md);
  }, []);

  const onStrategistSectionReady = useCallback((payload: StrategistSectionReadyPayload) => {
    setStrategistSectionDrafts((prev) => ({
      ...prev,
      [payload.section]: {
        markdown: payload.markdown,
        requestBodyJson: payload.requestStats?.requestBodyJson,
      },
    }));
  }, []);

  useEffect(() => {
    if (phase !== "report" || (reportPipelineStep !== 4 && reportPipelineStep !== 6)) {
      setReportWaitHintIndex(0);
      return;
    }
    const hintLen =
      reportPipelineStep === 4 ? REPORT_SUMMARIZE_WAIT_HINTS.length : REPORT_WRITE_WAIT_HINTS.length;
    const t = window.setInterval(() => {
      setReportWaitHintIndex((i) => (i + 1) % hintLen);
    }, 16000);
    return () => clearInterval(t);
  }, [phase, reportPipelineStep]);

  const semrushRows = semrushData?.rows;
  const semrushRowsFingerprint = useMemo(() => {
    if (!semrushRows?.length) return "";
    return semrushRows.map((r) => normalizeCompetitorDomainKey(r.domain)).sort().join("|");
  }, [semrushRows]);

  /** Server-built Semrush `domain_organic` CSV per domain; client fallback from parsed keyword rows. */
  const semrushCsvDownloads = useMemo(() => {
    const s = semrushData;
    if (!s) return { seed: null as string | null, competitors: [] as { domain: string; csv: string }[] };
    const seedCsv =
      s.seedDomainOrganicCsv?.trim() ||
      (s.seedTopKeywords?.length
        ? buildDomainOrganicCsvFromKeywordRows(s.seedTopKeywords, DOMAIN_ORGANIC_CSV_TOP_ROWS)
        : null);
    const competitors: { domain: string; csv: string }[] = [];
    for (const r of s.rows ?? []) {
      const dk = normalizeCompetitorDomainKey(r.domain);
      const fromMap =
        (s.domainOrganicCsvByDomain && (s.domainOrganicCsvByDomain[dk] ?? s.domainOrganicCsvByDomain[r.domain])) ||
        "";
      const enr = s.enrichmentByDomain?.[dk] ?? s.enrichmentByDomain?.[r.domain];
      const csv =
        typeof fromMap === "string" && fromMap.trim().length > 0
          ? fromMap
          : enr?.topKeywords?.length
            ? buildDomainOrganicCsvFromKeywordRows(enr.topKeywords, DOMAIN_ORGANIC_CSV_TOP_ROWS)
            : null;
      if (csv?.trim()) competitors.push({ domain: dk, csv });
    }
    return { seed: seedCsv?.trim() ? seedCsv : null, competitors };
  }, [semrushData]);

  const prevSemrushDomainKeysRef = useRef<Set<string>>(new Set());
  const prevWorkspaceClearKeyRef = useRef<string | null>(null);

  /** Clear analysis when workspace (connected site, temp seed, or mode) changes - avoids cross-contamination. */
  useEffect(() => {
    const key =
      competitorWorkspaceMode === "temp"
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
    setGscSkippedNotInList(false);
    setTiers(null);
    setReportMd(null);
    setError(null);
    setManualDomainInput("");
    setPendingManualDomains([]);
    setAnalyzeMode("auto");
    setSemrushEnhanced(false);
    setPhase("idle");
    setStrategicBrief("");
    prevSemrushDomainKeysRef.current = new Set();
    setSelectedCompetitorKeys(new Set());
  }, [competitorWorkspaceMode, debouncedTempSeed, site?.id, site?.siteUrl, site?.productionSiteUrl]);

  /** Keep row selection when semrush object is replaced but domains unchanged; merge in new rows as selected. */
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
    if (competitorWorkspaceMode === "connected") {
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
    const pendingForThisRun = [...pendingManualDomains];
    const tierSiteId = neutralResearchWire ? undefined : site?.id;
    const tierSiteName = neutralResearchWire ? undefined : site?.name;
    setError(null);
    setReportMd(null);
    setTiers(null);
    setSemrushData(null);
    setGscQueries([]);
    setGscDateRange(null);
    setGscError(null);
    setGscSkippedNotInList(false);
    try {
      setPhase("semrush");
      let srRaw: Awaited<ReturnType<typeof fetchCompetitorResearchForTab>>;
      let gscRes: FetchCompetitorGscQueriesResult;

      if (neutralResearchWire) {
        srRaw = await fetchCompetitorResearchForTab({
          semrushEnhanced,
          siteUrl: seedForApi,
          portfolioBlockedHosts: effectivePortfolioHosts,
          displayLimit: 50,
        });
      } else {
        const [srR, gscR] = await Promise.all([
          fetchCompetitorResearchForTab({
            semrushEnhanced,
            siteUrl: seedForApi,
            portfolioBlockedHosts: effectivePortfolioHosts,
            displayLimit: 50,
          }),
          fetchCompetitorGscQueries({ siteUrl: seedForApi }),
        ]);
        srRaw = srR;
        gscRes = gscR;
      }

      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        return;
      }

      if (!neutralResearchWire) {
        setGscDateRange(gscRes.dateRange);
        if (gscRes.ok === false) {
          setGscQueries([]);
          if (isGscSiteNotInListFailure(gscRes)) {
            setGscError(null);
            setGscSkippedNotInList(true);
          } else {
            setGscError(gscRes.error);
            setGscSkippedNotInList(false);
            notify.warning(notifyGscX(gscRes.error));
          }
        } else {
          setGscQueries(gscRes.queries);
          setGscError(null);
          setGscSkippedNotInList(false);
        }
      }

      let sr = filterMainCompetitorResearchResponse(srRaw);

      if (neutralResearchWire) {
        const dr = getDefaultGscCompetitorDateRange();
        const demandGq = buildDemandQueriesFromSeedKeywords(sr.seedTopKeywords ?? []);
        gscRes = { ok: true, queries: demandGq, dateRange: dr };
        setGscDateRange(dr);
        setGscQueries(demandGq);
        setGscError(null);
        setGscSkippedNotInList(false);
      }
      if (sr.errors?.length) {
        const msg = sr.errors.map((e) => e.message).join("; ");
        notify.warning(notifyCompetitorDataSourceWarning(semrushEnhanced ? "Semrush" : "DataForSEO", msg));
      }
      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        return;
      }
      if (analyzeMode === "manual") {
        const seedOnly: typeof sr = {
          ...sr,
          rows: [],
          enrichmentByDomain: {},
          domainOrganicCsvByDomain: {},
        };
        setSemrushData(seedOnly);
        setTiers({
          summary: "Manual mode - add competitor domains below.",
          tiers: [],
        });

        const gscQueriesForTier =
          gscRes.ok && gscRes.queries.length > 0 ? gscRes.queries : undefined;
        const gscDateForTier = gscRes.ok ? gscRes.dateRange : null;

        if (pendingForThisRun.length === 0) {
          setPhase("idle");
          notify.success(NOTIFY_ADD_COMPETITORS);
          return;
        }

        setPhase("manual");
        let merged: CompetitorResearchSemrushResponse = seedOnly;
        for (let i = 0; i < pendingForThisRun.length; i++) {
          const raw = pendingForThisRun[i];
          if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
            setPhase("idle");
            return;
          }
          try {
            const { row, enrichment, domainOrganicCsv, errors: manualErrors } =
              await fetchManualCompetitorDomainForTab({
                semrushEnhanced,
                domain: raw,
                siteUrl: seedForApi,
              });
            if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
              setPhase("idle");
              return;
            }
            if (manualErrors?.length) {
              notify.warning(manualErrors.map((e) => e.message).join("; "));
            }
            const dk = normalizeCompetitorDomainKey(row.domain);
            const csvForRow =
              domainOrganicCsv.trim() ||
              buildDomainOrganicCsvFromKeywordRows(enrichment.topKeywords, DOMAIN_ORGANIC_CSV_TOP_ROWS);
            merged = {
              ...merged,
              rows: [...merged.rows, row],
              enrichmentByDomain: {
                ...(merged.enrichmentByDomain ?? {}),
                [dk]: enrichment,
              },
              domainOrganicCsvByDomain: {
                ...(merged.domainOrganicCsvByDomain ?? {}),
                [dk]: csvForRow,
              },
            };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notify.error(
              `${semrushEnhanced ? "Semrush" : "DataForSEO"} (${normalizeCompetitorDomainKey(raw) || raw}): ${msg}`,
            );
          }
        }

        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          setPhase("idle");
          return;
        }

        setSemrushData(merged);
        setPendingManualDomains([]);
        const tiered = await runCompetitorTierAgent(merged, {
          siteId: tierSiteId,
          siteName: tierSiteName,
          seedSiteUrl: seedForApi,
          semrushDatabase: merged.database,
          gscSiteQueries: gscQueriesForTier,
          gscDateRange: gscDateForTier,
        });
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          setPhase("idle");
          return;
        }
        setTiers(tiered);
        setPhase("idle");
        const added = merged.rows.length;
        if (added > 0) {
          notify.success(notifySeedMetricsReadyX(added));
        } else {
          notify.warning(NOTIFY_NO_COMPETITORS_RETURNED);
        }
        return;
      }
      if (srRaw.rows.length > 0 && sr.rows.length === 0) {
        setSemrushData(sr);
        setPhase("idle");
        notify.warning(
          "Every overlapping domain was a mega-platform (social, search, marketplaces, etc.). No main competitors left after filtering.",
        );
        return;
      }
      if (sr.rows.length < srRaw.rows.length) {
        notify.info(
          `Excluded ${srRaw.rows.length - sr.rows.length} non-competitor domain(s) (e.g. YouTube, Facebook, Reddit).`,
        );
      }
      if (gscRes.ok && gscRes.queries.length > 0) {
        const beforeGsc = sr.rows.length;
        sr = filterCompetitorsByGscRelevance(sr, gscRes.queries);
        if (sr.rows.length < beforeGsc) {
          notify.info(notifyGscRelevanceFilterRemovedXCompetito(beforeGsc - sr.rows.length));
        }
      }
      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        return;
      }
      setSemrushData(sr);
      if (!sr.rows.length) {
        setPhase("idle");
        notify.info(NOTIFY_NO_COMPETITOR_ROWS_RETURNED_FOR_THIS_DOM);
        return;
      }
      setPhase("tiers");
      const tiered = await runCompetitorTierAgent(sr, {
        siteId: tierSiteId,
        siteName: tierSiteName,
        seedSiteUrl: seedForApi,
        semrushDatabase: sr.database,
        gscSiteQueries: gscRes.ok && gscRes.queries.length > 0 ? gscRes.queries : undefined,
        gscDateRange: gscRes.ok ? gscRes.dateRange : null,
      });
      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        return;
      }
      setTiers(tiered);
      setPhase("idle");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase("idle");
    }
  }, [
    competitorWorkspaceMode,
    effectiveSeedUrl,
    effectivePortfolioHosts,
    neutralResearchWire,
    site,
    workspaceKey,
    analyzeMode,
    semrushEnhanced,
    pendingManualDomains,
  ]);

  const toggleCompetitorSelection = useCallback((domainKey: string, selected: boolean) => {
    setSelectedCompetitorKeys((prev) => {
      const next = new Set(prev);
      if (selected) next.add(domainKey);
      else next.delete(domainKey);
      return next;
    });
  }, []);

  const toggleAllCompetitors = useCallback(
    (selected: boolean) => {
      if (!semrushData?.rows?.length) return;
      if (selected) {
        setSelectedCompetitorKeys(new Set(semrushData.rows.map((r) => normalizeCompetitorDomainKey(r.domain))));
      } else {
        setSelectedCompetitorKeys(new Set());
      }
    },
    [semrushData],
  );

  const addManualCompetitor = useCallback(async () => {
    if (competitorWorkspaceMode === "connected") {
      if (!site?.siteUrl?.trim()) {
        notify.error(NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL);
        return;
      }
    } else if (!effectiveSeedUrl) {
      notify.error(NOTIFY_ENTER_A_SEED_SITE_URL_FIRST);
      return;
    }
    const runKeySnapshot = workspaceKey;
    const seedForApi = effectiveSeedUrl;
    const tierSiteId = neutralResearchWire ? undefined : site?.id;
    const tierSiteName = neutralResearchWire ? undefined : site?.name;
    const lines = splitCompetitorInputLines(manualDomainInput);
    if (lines.length === 0) {
      notify.error(NOTIFY_ENTER_AT_LEAST_ONE_DOMAIN_OR_URL_ONE_PER);
      return;
    }

    if (analyzeMode === "manual" && !semrushData) {
      const seedKey = normalizeCompetitorDomainKey(seedForApi);
      const seen = new Set(pendingManualDomains.map((p) => normalizeCompetitorDomainKey(p)));
      const next: string[] = [...pendingManualDomains];
      let added = 0;
      let skippedDup = 0;
      let skippedSeed = 0;
      let skippedPortfolio = 0;
      let skippedInvalid = 0;

      for (const raw of lines) {
        const dk = normalizeCompetitorDomainKey(raw);
        if (!dk) {
          skippedInvalid++;
          continue;
        }
        if (dk === seedKey) {
          skippedSeed++;
          continue;
        }
        if (isPortfolioBlockedHost(dk, effectivePortfolioHosts)) {
          skippedPortfolio++;
          continue;
        }
        if (seen.has(dk)) {
          skippedDup++;
          continue;
        }
        seen.add(dk);
        next.push(raw);
        added++;
      }

      setPendingManualDomains(next);
      setManualDomainInput("");
      if (added > 0) {
        notify.success(
          added === 1
            ? `Queued ${normalizeCompetitorDomainKey(lines[0]) || lines[0]}`
            : `Queued ${added} competitor(s).`,
        );
      }
      if (skippedInvalid > 0) {
        notify.warning(notifyXLineSCouldNotBeParsedAsADomain(skippedInvalid));
      }
      if (skippedSeed > 0) {
        notify.info(notifyXLineSSkippedSameAsYourSeedSite(skippedSeed));
      }
      if (skippedPortfolio > 0) {
        notify.info(notifyXLineSSkippedPortfolioBlocklist(skippedPortfolio));
      }
      if (skippedDup > 0) {
        notify.info(notifyXDuplicateLineSSkippedAlreadyQueue(skippedDup));
      }
      return;
    }

    if (!semrushData) {
      notify.error(NOTIFY_RUN_ANALYZE_FIRST);
      return;
    }

    setError(null);
    try {
      setPhase("manual");
      let merged: CompetitorResearchSemrushResponse = semrushData;
      let fetchOk = 0;
      let skippedInTable = 0;

      for (const raw of lines) {
        const dk = normalizeCompetitorDomainKey(raw);
        if (!dk) {
          notify.warning(notifySkippedInvalidLineXx(raw.slice(0, 64), raw.length > 64 ? "…" : ""));
          continue;
        }
        if (merged.rows.some((r) => normalizeCompetitorDomainKey(r.domain) === dk)) {
          skippedInTable++;
          continue;
        }
        try {
          const { row, enrichment, domainOrganicCsv, errors: manualErrors } = await fetchManualCompetitorDomainForTab({
            semrushEnhanced,
            domain: raw,
            siteUrl: seedForApi,
          });
          if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
            setPhase("idle");
            return;
          }
          if (manualErrors?.length) {
            notify.warning(manualErrors.map((e) => e.message).join("; "));
          }
          const csvForRow =
            domainOrganicCsv.trim() ||
            buildDomainOrganicCsvFromKeywordRows(enrichment.topKeywords, DOMAIN_ORGANIC_CSV_TOP_ROWS);
          merged = {
            ...merged,
            rows: [...merged.rows, row],
            enrichmentByDomain: {
              ...(merged.enrichmentByDomain ?? {}),
              [dk]: enrichment,
            },
            domainOrganicCsvByDomain: {
              ...(merged.domainOrganicCsvByDomain ?? {}),
              [dk]: csvForRow,
            },
          };
          fetchOk++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          notify.error(notifyXX2(dk, msg));
        }
      }

      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        return;
      }

      setSemrushData(merged);
      setManualDomainInput("");

      if (skippedInTable > 0) {
        notify.info(notifyXLineSSkippedAlreadyInTheTable(skippedInTable));
      }

      if (fetchOk > 0) {
        const tiered = await runCompetitorTierAgent(merged, {
          siteId: tierSiteId,
          siteName: tierSiteName,
          seedSiteUrl: seedForApi,
          semrushDatabase: merged.database,
          gscSiteQueries: gscQueries.length > 0 ? gscQueries : undefined,
          gscDateRange: gscDateRange ?? null,
        });
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          setPhase("idle");
          return;
        }
        setTiers(tiered);
        notify.success(fetchOk === 1 ? `Added ${normalizeCompetitorDomainKey(lines[0]) || lines[0]}` : `Added ${fetchOk} competitor(s).`);
      } else if (skippedInTable === lines.length) {
        notify.info(NOTIFY_ALL_LINES_WERE_ALREADY_IN_THE_LIST);
      } else if (lines.length > 0 && fetchOk === 0) {
        notify.warning(NOTIFY_NO_NEW_COMPETITORS_WERE_ADDED);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setPhase("idle");
    }
  }, [
    semrushData,
    site,
    manualDomainInput,
    gscQueries,
    gscDateRange,
    semrushEnhanced,
    analyzeMode,
    pendingManualDomains,
    effectivePortfolioHosts,
    competitorWorkspaceMode,
    effectiveSeedUrl,
    neutralResearchWire,
    workspaceKey,
  ]);

  const importDominatorGridCsv = useCallback(
    async (file: File) => {
      if (competitorWorkspaceMode === "connected") {
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
        const parsed = parseCompetitorGridTopPlaces(csvText);
        if (parsed.error) {
          throw new Error(parsed.error);
        }

        let baseSemrush: CompetitorResearchSemrushResponse;
        if (semrushData) {
          baseSemrush = semrushData;
        } else {
          const srRaw = await fetchCompetitorResearchForTab({
            semrushEnhanced,
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
        setPhase("manual");
        let merged: CompetitorResearchSemrushResponse = {
          ...baseSemrush,
          rows: [...baseSemrush.rows],
          enrichmentByDomain: { ...(baseSemrush.enrichmentByDomain ?? {}) },
          domainOrganicCsvByDomain: { ...(baseSemrush.domainOrganicCsvByDomain ?? {}) },
        };
        const gridImportedDomainKeys: string[] = [];
        let semrushNewRows = 0;
        let semrushRefreshedRows = 0;
        type SemrushGridRowResult =
          | {
              ok: true;
              domainForApi: string;
              row: Awaited<ReturnType<typeof fetchManualCompetitorDomainForTab>>["row"];
              enrichment: Awaited<ReturnType<typeof fetchManualCompetitorDomainForTab>>["enrichment"];
              domainOrganicCsv: string;
              manualErrors?: Awaited<ReturnType<typeof fetchManualCompetitorDomainForTab>>["errors"];
            }
          | { ok: false; domainForApi: string; message: string };
        const semrushResults: SemrushGridRowResult[] = [];
        for (let i = 0; i < toFetch.length; i++) {
          const domainForApi = toFetch[i];
          setGridCsvProgress(
          `${semrushEnhanced ? "Semrush" : "DataForSEO"}: ${i + 1}/${toFetch.length} (${domainForApi})…`,
        );
          try {
            const { row, enrichment, domainOrganicCsv, errors: manualErrors } = await fetchManualCompetitorDomainForTab({
              semrushEnhanced,
              domain: domainForApi,
              siteUrl: seedForApi,
            });
            semrushResults.push({ ok: true, domainForApi, row, enrichment, domainOrganicCsv, manualErrors });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            semrushResults.push({ ok: false, domainForApi, message: msg });
          }
        }
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          setPhase("idle");
          return;
        }
        let mergedRows = [...merged.rows];
        let enrichmentByDomain = { ...(merged.enrichmentByDomain ?? {}) };
        let domainOrganicCsvByDomain = { ...(merged.domainOrganicCsvByDomain ?? {}) };
        for (const r of semrushResults) {
          if (r.ok === false) {
            notify.error(notifyXXX2(semrushEnhanced ? "Semrush" : "DataForSEO", r.domainForApi, r.message));
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
          setPhase("idle");
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
          setPhase("idle");
          return;
        }
        const tiered = mergeGridCompetitorsAsDirectTier(tieredRaw, gridImportedDomainKeys, merged.rows);
        setTiers(tiered);
        if (semrushNewRows > 0 && semrushRefreshedRows > 0) {
          notify.success(notifyGridImportXUpdatedX(semrushNewRows, semrushRefreshedRows));
        } else if (semrushNewRows > 0) {
          notify.success(notifyAddedXFromGrid(semrushNewRows));
        } else if (semrushRefreshedRows > 0) {
          notify.success(notifyUpdatedXFromGrid(semrushRefreshedRows));
        } else {
          notify.success(NOTIFY_GRID_IMPORT_DONE);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setPhase("idle");
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
      semrushEnhanced,
      competitorWorkspaceMode,
      effectiveSeedUrl,
      neutralResearchWire,
      workspaceKey,
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

  const generateReport = useCallback(async () => {
    if (!semrushData || !tiers) {
      notify.error(NOTIFY_RUN_ANALYZE_FIRST);
      return;
    }
    if (selectedCompetitorKeys.size === 0) {
      notify.error(NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR);
      return;
    }
    if (competitorWorkspaceMode === "connected") {
      if (!site?.siteUrl?.trim() || !site?.id) {
        notify.error(NOTIFY_SELECT_A_CONNECTED_SITE);
        return;
      }
    } else if (!effectiveSeedUrl) {
      notify.error(NOTIFY_ENTER_A_SEED_SITE_URL);
      return;
    }

    const runKeySnapshot = workspaceKey;
    const seedForApi = effectiveSeedUrl;
    const reportSiteId = neutralResearchWire ? undefined : site?.id;
    const reportSiteName = neutralResearchWire ? undefined : site?.name;
    const reportSiteUrl = neutralResearchWire ? undefined : site ? getPublicSiteUrl(site) : undefined;
    setError(null);

    try {
      const beforeRefetchSr = semrushData;
      const beforeRefetchTiers = tiers;
      const beforeRefetchKeys = new Set(selectedCompetitorKeys);

      setPhase("report");
      setReportPipelineStep(0);
      setReportMicroLabel(null);
      setReportOpenRouterStats(null);
      setStrategistSectionDrafts({});
      setKeywordsMd(null);

      let srForReport = semrushData;
      let tiersForReport = tiers;
      let gscForReport: GscSiteQueryRow[] = gscQueries;
      let gscDateForReport: GscCompetitorDateRange | null = gscDateRange;
      let mergedKeys = selectedCompetitorKeys;

      if (analyzeMode === "auto") {
        let srRaw: Awaited<ReturnType<typeof fetchCompetitorResearchForTab>>;
        let gscRes: FetchCompetitorGscQueriesResult;

        if (neutralResearchWire) {
          srRaw = await fetchCompetitorResearchForTab({
            semrushEnhanced,
            siteUrl: seedForApi,
            portfolioBlockedHosts: effectivePortfolioHosts,
            displayLimit: 50,
          });
        } else {
          const [srR, gscR] = await Promise.all([
            fetchCompetitorResearchForTab({
              semrushEnhanced,
              siteUrl: seedForApi,
              portfolioBlockedHosts: effectivePortfolioHosts,
              displayLimit: 50,
            }),
            fetchCompetitorGscQueries({ siteUrl: seedForApi }),
          ]);
          srRaw = srR;
          gscRes = gscR;
        }

        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          setPhase("idle");
          setReportPipelineStep(0);
          setReportMicroLabel(null);
          setReportOpenRouterStats(null);
          setStrategistSectionDrafts({});
          return;
        }

        if (!neutralResearchWire) {
          setGscDateRange(gscRes.dateRange);
          if (gscRes.ok === false) {
            setGscQueries([]);
            if (isGscSiteNotInListFailure(gscRes)) {
              setGscError(null);
              setGscSkippedNotInList(true);
            } else {
              setGscError(gscRes.error);
              setGscSkippedNotInList(false);
              notify.warning(notifyGscX(gscRes.error));
            }
          } else {
            setGscQueries(gscRes.queries);
            setGscError(null);
            setGscSkippedNotInList(false);
          }
        }

        let sr = filterMainCompetitorResearchResponse(srRaw);

        if (neutralResearchWire) {
          const dr = getDefaultGscCompetitorDateRange();
          const demandGq = buildDemandQueriesFromSeedKeywords(sr.seedTopKeywords ?? []);
          gscRes = { ok: true, queries: demandGq, dateRange: dr };
          setGscDateRange(dr);
          setGscQueries(demandGq);
          setGscError(null);
          setGscSkippedNotInList(false);
        }
        if (sr.errors?.length) {
          const msg = sr.errors.map((e) => e.message).join("; ");
          notify.warning(notifyCompetitorDataSourceWarning(semrushEnhanced ? "Semrush" : "DataForSEO", msg));
        }

        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          setPhase("idle");
          setReportPipelineStep(0);
          setReportMicroLabel(null);
          setReportOpenRouterStats(null);
          setStrategistSectionDrafts({});
          return;
        }

        if (srRaw.rows.length > 0 && sr.rows.length === 0) {
          setSemrushData(sr);
          setPhase("idle");
          setReportPipelineStep(0);
          setReportMicroLabel(null);
          setReportOpenRouterStats(null);
          setStrategistSectionDrafts({});
          notify.warning(
            "Every overlapping domain was a mega-platform (social, search, marketplaces, etc.). No main competitors left after filtering.",
          );
          return;
        }

        if (gscRes.ok && gscRes.queries.length > 0) {
          const beforeGsc = sr.rows.length;
          sr = filterCompetitorsByGscRelevance(sr, gscRes.queries);
          if (sr.rows.length < beforeGsc) {
            notify.info(notifyGscRelevanceFilterRemovedXCompetito(beforeGsc - sr.rows.length));
          }
        }

        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          setPhase("idle");
          setReportPipelineStep(0);
          setReportMicroLabel(null);
          setReportOpenRouterStats(null);
          setStrategistSectionDrafts({});
          return;
        }

        if (!sr.rows.length) {
          setPhase("idle");
          setReportPipelineStep(0);
          setReportMicroLabel(null);
          setReportOpenRouterStats(null);
          setStrategistSectionDrafts({});
          notify.info(NOTIFY_NO_COMPETITOR_ROWS_RETURNED_FOR_THIS_DOM);
          return;
        }

        const newDomainKeys = new Set(sr.rows.map((r) => normalizeCompetitorDomainKey(r.domain)));
        mergedKeys = new Set<string>();
        for (const k of selectedCompetitorKeys) {
          if (newDomainKeys.has(k)) mergedKeys.add(k);
        }

        if (mergedKeys.size === 0) {
          const tableDomainKeys = new Set(
            beforeRefetchSr.rows.map((r) => normalizeCompetitorDomainKey(r.domain)),
          );
          mergedKeys = new Set([...beforeRefetchKeys].filter((k) => tableDomainKeys.has(k)));
          if (mergedKeys.size === 0) {
            setPhase("idle");
            setReportPipelineStep(0);
            setReportMicroLabel(null);
            setReportOpenRouterStats(null);
            setStrategistSectionDrafts({});
            notify.error(NOTIFY_RUN_ANALYZE_AGAIN);
            return;
          }
          notify.info(
            neutralResearchWire
              ? "Fresh competitor API overlap did not include your current selections (e.g. grid imports vs API overlap). Using your table competitors with updated seed demand."
              : "Fresh competitor API overlap did not include your current selections (e.g. grid imports vs API overlap). Using your table competitors with updated GSC.",
          );
          srForReport = beforeRefetchSr;
          tiersForReport = beforeRefetchTiers;
          gscForReport = gscRes.ok ? gscRes.queries : [];
          gscDateForReport = gscRes.dateRange;
        } else {
          setSemrushData(sr);

          const tiered = await runCompetitorTierAgent(sr, {
            siteId: reportSiteId,
            siteName: reportSiteName,
            seedSiteUrl: seedForApi,
            semrushDatabase: sr.database,
            gscSiteQueries: gscRes.ok && gscRes.queries.length > 0 ? gscRes.queries : undefined,
            gscDateRange: gscRes.ok ? gscRes.dateRange : null,
          });

          if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
            setPhase("idle");
            setReportPipelineStep(0);
            setReportMicroLabel(null);
            setReportOpenRouterStats(null);
            setStrategistSectionDrafts({});
            return;
          }

          setTiers(tiered);
          setSelectedCompetitorKeys(mergedKeys);

          srForReport = sr;
          tiersForReport = tiered;
          gscForReport = gscRes.ok ? gscRes.queries : [];
          gscDateForReport = gscRes.dateRange;
        }
      } else if (neutralResearchWire) {
        const dr = getDefaultGscCompetitorDateRange();
        const demandGq = buildDemandQueriesFromSeedKeywords(semrushData?.seedTopKeywords ?? []);
        setGscDateRange(dr);
        setGscQueries(demandGq);
        setGscError(null);
        gscForReport = demandGq;
        gscDateForReport = dr;
      } else {
        const gscRes = await fetchCompetitorGscQueries({ siteUrl: seedForApi });
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          setPhase("idle");
          setReportPipelineStep(0);
          setReportMicroLabel(null);
          setReportOpenRouterStats(null);
          setStrategistSectionDrafts({});
          return;
        }
        setGscDateRange(gscRes.dateRange);
        if (gscRes.ok === false) {
          setGscQueries([]);
          if (isGscSiteNotInListFailure(gscRes)) {
            setGscError(null);
            setGscSkippedNotInList(true);
          } else {
            setGscError(gscRes.error);
            setGscSkippedNotInList(false);
            notify.warning(notifyGscX(gscRes.error));
          }
        } else {
          setGscQueries(gscRes.queries);
          setGscError(null);
          setGscSkippedNotInList(false);
        }
        gscForReport = gscRes.ok ? gscRes.queries : [];
        gscDateForReport = gscRes.dateRange;
      }

      const srFiltered = filterCompetitorResearchBySelection(srForReport, mergedKeys);
      const trFiltered = filterTieredCompetitorsBySelection(tiersForReport, mergedKeys);
      if (!srFiltered.rows.length || !trFiltered.tiers.length) {
        notify.error(NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR);
        setPhase("idle");
        setReportPipelineStep(0);
        setReportMicroLabel(null);
        setReportOpenRouterStats(null);
        setStrategistSectionDrafts({});
        return;
      }

      const { markdown, keywordsMarkdown, semrushForReport } = await runCompetitorReportAgent(
        srFiltered,
        trFiltered,
        {
          siteId: reportSiteId,
          siteName: reportSiteName,
          siteUrl: reportSiteUrl,
          strategicBrief: strategicBrief.trim() || undefined,
          gscSiteQueries: gscForReport.length > 0 ? gscForReport : undefined,
          gscDateRange: gscDateForReport,
          gqDemandSource: neutralResearchWire ? "dfs_seed" : "gsc",
          onMicroStep: onReportMicroStep,
          onKeywordsMarkdownReady: onKeywordsMarkdownReady,
          onStrategistSectionReady: onStrategistSectionReady,
        },
      );
      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        setReportPipelineStep(0);
        setReportMicroLabel(null);
        setReportOpenRouterStats(null);
        setStrategistSectionDrafts({});
        setKeywordsMd(null);
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
          enrichmentByDomain: { ...prev.enrichmentByDomain, ...semrushForReport.enrichmentByDomain },
        };
      });
      setReportMd(markdown);
      setKeywordsMd(keywordsMarkdown);
      setPhase("idle");
      setReportPipelineStep(0);
      setReportMicroLabel(null);
      notify.success(NOTIFY_REPORT_GENERATED);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase("idle");
      setReportPipelineStep(0);
      setReportMicroLabel(null);
      setReportOpenRouterStats(null);
      setKeywordsMd(null);
    }
  }, [
    semrushData,
    tiers,
    site,
    gscQueries,
    gscDateRange,
    selectedCompetitorKeys,
    onReportMicroStep,
    onKeywordsMarkdownReady,
    onStrategistSectionReady,
    analyzeMode,
    effectivePortfolioHosts,
    semrushEnhanced,
    competitorWorkspaceMode,
    effectiveSeedUrl,
    neutralResearchWire,
    workspaceKey,
    strategicBrief,
  ]);

  const reportDownloadSlug = useMemo(() => {
    if (neutralResearchWire && semrushData?.seedDomain) {
      return safeDomainForFilename(semrushData.seedDomain);
    }
    return (site?.name || "site").replace(/\s+/g, "-");
  }, [neutralResearchWire, semrushData?.seedDomain, site?.name]);

  /** Clipboard: Keywords They Own + strategist report, separated by --- (only sections that exist). */
  const copyMarkdownBundle = useCallback(async () => {
    const parts: string[] = [];
    if (keywordsMd?.trim()) {
      parts.push(`## Keywords They Own (Semrush clusters)\n\n${keywordsMd.trim()}`);
    }
    if (reportMd?.trim()) {
      parts.push(`## Strategist report\n\n${reportMd.trim()}`);
    }
    if (parts.length === 0) {
      notify.error(NOTIFY_GENERATE_A_REPORT_FIRST);
      return;
    }
    try {
      await navigator.clipboard.writeText(parts.join("\n\n---\n\n"));
      notify.success(
        parts.length === 2 ? "Both Markdown documents copied (one clipboard, separated by ---)." : "Markdown copied.",
      );
    } catch {
      notify.error(NOTIFY_COULD_NOT_COPY);
    }
  }, [keywordsMd, reportMd]);

  /** Two separate .md downloads when both exist; one file if only one document is available. */
  const downloadMarkdownBundle = useCallback(() => {
    const slug = reportDownloadSlug;
    const ts = Date.now();
    const downloadFile = (content: string, filename: string) => {
      const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    const hasKw = Boolean(keywordsMd?.trim());
    const hasReport = Boolean(reportMd?.trim());
    if (!hasKw && !hasReport) {
      notify.error(NOTIFY_GENERATE_A_REPORT_FIRST);
      return;
    }
    if (hasKw) {
      downloadFile(keywordsMd!.trim(), `competitor-keywords-they-own-${slug}-${ts}.md`);
    }
    if (hasReport) {
      const run = () => downloadFile(reportMd!.trim(), `competitor-strategist-report-${slug}-${ts}.md`);
      if (hasKw) setTimeout(run, 250);
      else run();
    }
    notify.success(hasKw && hasReport ? "Downloaded 2 Markdown files." : "Downloaded 1 Markdown file.");
  }, [keywordsMd, reportMd, reportDownloadSlug]);

  const downloadOpenRouterRequestJson = useCallback(() => {
    const raw = reportOpenRouterStats?.requestBodyJson;
    if (!raw) return;
    const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openrouter-competitor-report-request-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [reportOpenRouterStats?.requestBodyJson]);

  const downloadStrategistSectionMarkdown = useCallback(
    (section: CompetitorReportSectionIndex) => {
      const md = strategistSectionDrafts[section]?.markdown?.trim();
      if (!md) return;
      const slug = safeDomainForFilename(reportDownloadSlug || "report");
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `competitor-strategist-section-${section}-${slug}-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [strategistSectionDrafts, reportDownloadSlug],
  );

  const downloadStrategistSectionPostJson = useCallback(
    (section: CompetitorReportSectionIndex) => {
      const raw = strategistSectionDrafts[section]?.requestBodyJson;
      if (!raw) return;
      const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `openrouter-competitor-report-section-${section}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [strategistSectionDrafts],
  );

  const downloadBulkContentCsv = useCallback(() => {
    if (!semrushData) {
      notify.error(NOTIFY_RUN_ANALYZE_FIRST);
      return;
    }
    if (!reportMd?.trim()) {
      notify.error(NOTIFY_GENERATE_REPORT_FIRST);
      return;
    }
    if (selectedCompetitorKeys.size === 0) {
      notify.error(NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR);
      return;
    }
    const sr = filterCompetitorResearchBySelection(semrushData, selectedCompetitorKeys);
    if (!sr.rows.length) {
      notify.error(NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR);
      return;
    }
    downloadCompetitorBulkContentCsv({
      siteName:
        neutralResearchWire && semrushData?.seedDomain
          ? semrushData.seedDomain
          : site?.name?.trim() || "Site",
      semrush: sr,
      reportMd,
      keywordsMd,
    });
  }, [semrushData, site?.name, selectedCompetitorKeys, reportMd, keywordsMd, neutralResearchWire]);

  const busy = phase !== "idle" || gridCsvBusy;

  return (
    <div className="local-analysis-panel space-y-2 px-0 py-1 sm:px-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <BarChart3 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold leading-[1.25] tracking-tight text-foreground">
          Competitor research
        </h2>
      </div>

      {competitorWorkspaceMode === "connected" && (!site || !site.siteUrl?.trim()) ? (
        <div className="neo-pulse-zone-tile--data px-2 py-3 text-base leading-normal text-muted-foreground">
          {!site
            ? "Connect a WordPress site and select it in the header, or switch to Temp seed for unconnected research."
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

          {semrushData?.seedMetrics ? <SeedMetricsStrip metrics={semrushData.seedMetrics} /> : null}
          {semrushData?.seedOverview ? <SeedOverviewStrip overview={semrushData.seedOverview} /> : null}

          {gscDateRange || gscError || gscQueries.length > 0 || gscSkippedNotInList ? (
            <GscStatusLabel
              dateRange={gscDateRange}
              queryCount={gscQueries.length}
              errorMessage={gscError}
              skippedNotInList={gscSkippedNotInList}
              demandSource={neutralResearchWire ? "dfs_seed" : "gsc"}
            />
          ) : null}

          <div className="neo-pulse-zone-tile--analysis mt-2 space-y-3 px-2 py-2 sm:px-3">
            {analyzeMode === "manual" && pendingManualDomains.length > 0 ? (
              <div className="rounded-md border border-border/50 bg-black/20 px-2 py-2">
                <p className="mb-2 min-h-[1rem] text-base leading-snug text-muted-foreground">
                  Queued competitors - metrics are fetched when you click Analyze. Paste multiple URLs in the box below, one
                  per line.
                </p>
                <ul className="space-y-1">
                  {pendingManualDomains.map((d, index) => (
                    <li
                      key={`${normalizeCompetitorDomainKey(d)}-${index}`}
                      className="flex items-center justify-between gap-2 font-mono text-base leading-normal text-foreground"
                    >
                      <span className="min-w-0 break-all">{d}</span>
                      <Button
                        size="icon" icon={X}
                        variant="quiet"
                        type="button"
                        disabled={busy}
                        aria-label={`Remove ${d} from queue`}
                        onClick={() => {
                          setPendingManualDomains((prev) => prev.filter((_, i) => i !== index));
                        }}
                      ></Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-[200px] flex-1">
                <TextareaField
                  id="competitor-manual-domain"
                  placeholder={"example.com\nhttps://competitor.com\n(one domain or URL per line)"}
                  aria-label="Competitor domains, one per line"
                  value={manualDomainInput}
                  onChange={(e) => setManualDomainInput(e.target.value)}
                  disabled={busy || (analyzeMode === "auto" && !semrushData)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      void addManualCompetitor();
                    }
                  }}
                  rows={4}
                />
              </div>
              <Button
                type="button"
                title="Add every non-empty line (Ctrl+Enter)"
                disabled={
                  busy ||
                  (analyzeMode === "auto" && !semrushData) ||
                  !manualDomainInput.trim()
                }
                onClick={() => void addManualCompetitor()}
              >
                Add rows
              </Button>
            </div>
            <CompetitorSiteGrid
              tiers={tiers}
              semrush={semrushData}
              selectedKeys={selectedCompetitorKeys}
              onToggleDomain={toggleCompetitorSelection}
              onToggleAll={toggleAllCompetitors}
            />
          </div>
        </>
      )}
    </div>
  );
}
