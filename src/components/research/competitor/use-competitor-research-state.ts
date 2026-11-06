import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useManagerSeedWorkspace } from "@/contexts/manager-seed-workspace-context";
import { buildPortfolioBlockedHosts } from "@/lib/portfolio-link-blocklist";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import {
  buildDomainOrganicCsvFromKeywordRows,
  DOMAIN_ORGANIC_CSV_TOP_ROWS,
} from "@/lib/competitor-research/competitor-domain-organic-csv";
import type { StrategistSectionReadyPayload } from "@/lib/competitor-research/competitor-report-agent";
import type {
  CompetitorReportMicroStepPayload,
  CompetitorReportRequestStats,
} from "@/lib/competitor-research/competitor-report-openrouter-limits";
import type { CompetitorReportSectionIndex } from "@/lib/competitor-research/competitor-report-system-prompt";
import type {
  CompetitorResearchSemrushResponse,
  GscCompetitorDateRange,
  GscSiteQueryRow,
  TieredCompetitorsResult,
} from "@/lib/competitor-research/types";
import { REPORT_SUMMARIZE_WAIT_HINTS, REPORT_WRITE_WAIT_HINTS } from "@/components/research/competitor/competitor-research-tab-helpers";

export function useCompetitorResearchState() {
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
}, [competitorWorkspaceMode, tempSeedUrl, site]);

const activeWorkspaceKeyRef = useRef<string>("");
activeWorkspaceKeyRef.current = workspaceKey;

const effectiveSeedUrl = useMemo(() => {
  if (competitorWorkspaceMode === "temp") return tempSeedUrl.trim();
  return site ? getPublicSiteUrl(site) : "";
}, [competitorWorkspaceMode, tempSeedUrl, site]);

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
}, [competitorWorkspaceMode, debouncedTempSeed, site?.id, site?.siteUrl, site?.productionSiteUrl, site]);

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
}, [semrushRowsFingerprint, semrushRows]);


  return {
    sites,
    competitorWorkspaceMode,
    tempSeedUrl,
    setTempSeedUrl,
    debouncedTempSeed,
    site,
    enabledSites,
    portfolioHosts,
    strategicBrief,
    setStrategicBrief,
    workspaceKey,
    activeWorkspaceKeyRef,
    effectiveSeedUrl,
    effectivePortfolioHosts,
    neutralResearchWire,
    semrushData,
    setSemrushData,
    gscQueries,
    setGscQueries,
    gscDateRange,
    setGscDateRange,
    gscError,
    setGscError,
    gscSkippedNotInList,
    setGscSkippedNotInList,
    tiers,
    setTiers,
    reportMd,
    setReportMd,
    keywordsMd,
    setKeywordsMd,
    phase,
    setPhase,
    error,
    setError,
    selectedCompetitorKeys,
    setSelectedCompetitorKeys,
    manualDomainInput,
    setManualDomainInput,
    pendingManualDomains,
    setPendingManualDomains,
    analyzeMode,
    setAnalyzeMode,
    semrushEnhanced,
    setSemrushEnhanced,
    gridCsvBusy,
    setGridCsvBusy,
    gridCsvProgress,
    setGridCsvProgress,
    reportPipelineStep,
    setReportPipelineStep,
    reportMicroLabel,
    setReportMicroLabel,
    reportOpenRouterStats,
    setReportOpenRouterStats,
    strategistSectionDrafts,
    setStrategistSectionDrafts,
    reportWaitHintIndex,
    gridCsvFileRef,
    onReportMicroStep,
    onKeywordsMarkdownReady,
    onStrategistSectionReady,
    semrushRows,
    semrushRowsFingerprint,
    semrushCsvDownloads,
  };
}

export type CompetitorResearchState = ReturnType<typeof useCompetitorResearchState>;
