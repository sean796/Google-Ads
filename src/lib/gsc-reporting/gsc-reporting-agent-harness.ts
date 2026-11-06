import type { WordPressSite } from "@/components/integrations/types";
import { resolveGa4PropertyIdForReportingAsync } from "@/lib/ga4-reporting-property";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { getReportModel } from "@/lib/optimization-settings-storage";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { findConnectedWordPressSite } from "@/lib/agent-runs/resolve-agent-run-site";
import {
  bundleHasValidGaOrganicTrafficData,
  ensureGaOrganicTrafficInReportingBundle,
  fetchGscQueriesRawForReporting,
} from "@/lib/gsc-reporting/gsc-reporting-fetch";
import {
  computeCompareRangesForPreset,
  countCalendarMonthsInRange,
  formatGscComparePeriodLabel,
  formatGscReportFullDateRange,
  parseGscYmd,
  validateGscCompareFetchRanges,
  validateGscPrimaryFetchRange,
  type GscCompareRanges,
  type GscReportingComparePresetId,
} from "@/lib/gsc-reporting/gsc-fetch-date-presets";
import { formatReportingDocumentTitlePeriod } from "@/lib/reporting/reporting-document-title";
import type { GscReportStructure } from "@/lib/gsc-reporting/gsc-reporting-monthly-totals";
import {
  ensureCompareSignalsFile,
  type GscCompareKind,
} from "@/lib/gsc-reporting/gsc-reporting-compare-signals";
import { runGscReportingPipeline } from "@/lib/gsc-reporting/gsc-reporting-pipeline";
import {
  appendEntitySitemapUrlsBundleFile,
  buildSapEntityGrounding,
  resolveReportingSapAllowlist,
} from "@/lib/gsc-reporting/gsc-reporting-sap-entity-context";
import { resolveGscClientSeasonContext } from "@/lib/gsc-reporting/gsc-reporting-client-season";
import { pickClusterMarkdownForPipeline } from "@/lib/gsc-reporting/gsc-query-cluster-ai";
import type { AgentRunResumePoint } from "@/lib/agent-runs-types";
import {
  GSC_REPORTING_PROGRESS_LABELS,
  type GscReportingOutlineResult,
  type GscReportingPipelineProgress,
  type GscReportingPipelineResult,
  type GscReportingSectionResult,
} from "@/lib/gsc-reporting/gsc-reporting-types";
import {
  formatGscBundleApiLabel,
  formatGscBundleReadyLabel,
} from "@/lib/gsc-reporting/gsc-reporting-progress-log";
import {
  buildGscReportingSemrushMarkdownSection,
  spliceSemPositionTrackingAfterSearchPerformance,
} from "@/lib/gsc-reporting/gsc-reporting-semrush-append";
import { buildGscReportingLocalInsightsMarkdownSection } from "@/lib/gsc-reporting/gsc-reporting-local-insights";
import type { GscReportingSupplementFiles } from "@/lib/gsc-reporting/gsc-reporting-supplements-types";

export type GscReportingAutomationComparePreset = "mom" | "yoy";

export type RunGscReportingAgentHarnessArgs = {
  site: WordPressSite;
  comparePreset?: GscReportingAutomationComparePreset;
  compareRanges?: GscCompareRanges;
  gscReportStructure?: GscReportStructure;
  cachedFiles?: { name: string; content: string }[];
  resumePoint?: AgentRunResumePoint | null;
  signal?: AbortSignal;
  isCancelled?: () => Promise<boolean>;
  onProgress?: (p: GscReportingPipelineProgress, resumePayload?: Record<string, unknown>) => void | Promise<void>;
  onOutlineReady?: (payload: {
    outline: GscReportingOutlineResult;
    outlineRequestBodyJson: string;
  }) => void;
  onSectionStart?: (index: number) => void;
  onSectionReady?: (row: GscReportingSectionResult) => void;
  supplements?: GscReportingSupplementFiles;
};

export type GscReportingAgentHarnessResult = GscReportingPipelineResult & {
  files: { name: string; content: string }[];
  comparePreset: GscReportingAutomationComparePreset;
  compareLabel: string;
  fetchRange: { startDate: string; endDate: string };
  compareFetchRange: { startDate: string; endDate: string };
};

function resolveCompareRanges(
  comparePreset: GscReportingAutomationComparePreset,
  compareRanges?: GscCompareRanges,
): GscCompareRanges {
  if (compareRanges) return compareRanges;
  const presetId: GscReportingComparePresetId = comparePreset === "yoy" ? "yoy" : "mom";
  return computeCompareRangesForPreset(presetId);
}

function resolveCompareKind(
  comparePreset: GscReportingAutomationComparePreset,
  compareRanges?: GscCompareRanges,
  reportStructure: GscReportStructure = "compare",
): GscCompareKind {
  if (reportStructure === "period_progress") return "period_progress";
  if (comparePreset === "yoy") return "yoy";
  if (compareRanges) return "custom";
  return "mom";
}

export async function runGscReportingAgentHarness(
  args: RunGscReportingAgentHarnessArgs,
): Promise<GscReportingAgentHarnessResult> {
  const comparePreset = args.comparePreset ?? "mom";
  const reportStructure = args.gscReportStructure ?? "compare";
  const periodProgress = reportStructure === "period_progress";
  const apiKey = (await resolveOpenRouterApiKeyForHarness())?.trim();
  if (!apiKey) {
    throw new Error("Add an OpenRouter API key in Settings.");
  }

  let publicSiteUrl = getPublicSiteUrl(args.site).trim();
  if (!publicSiteUrl && args.site.id) {
    const connected = findConnectedWordPressSite(args.site.id);
    if (connected) publicSiteUrl = getPublicSiteUrl(connected).trim();
  }

  const compareRangeDraft = resolveCompareRanges(comparePreset, args.compareRanges);
  const check = periodProgress
    ? validateGscPrimaryFetchRange(compareRangeDraft.primary)
    : validateGscCompareFetchRanges(compareRangeDraft.primary, compareRangeDraft.compare);
  if (check.ok === false) {
    throw new Error(check.error);
  }
  const progressMonthCount = countCalendarMonthsInRange(
    compareRangeDraft.primary.startDate,
    compareRangeDraft.primary.endDate,
  );

  if (await args.isCancelled?.()) {
    throw new Error("Cancelled");
  }

  let pipelineFiles: { name: string; content: string }[];
  let fetchRange = { startDate: compareRangeDraft.primary.startDate, endDate: compareRangeDraft.primary.endDate };
  let compareFetchRange = {
    startDate: compareRangeDraft.compare.startDate,
    endDate: compareRangeDraft.compare.endDate,
  };

  const resolvedCompareKind = resolveCompareKind(comparePreset, args.compareRanges, reportStructure);
  const primaryPeriodLabel = formatGscReportFullDateRange(
    compareRangeDraft.primary.startDate,
    compareRangeDraft.primary.endDate,
  );
  const compareLabelDraft = periodProgress
    ? primaryPeriodLabel
    : `${primaryPeriodLabel} vs ${formatGscComparePeriodLabel(compareRangeDraft.compare.startDate, compareRangeDraft.compare.endDate)}`;

  const resumePayload = args.resumePoint?.payload ?? {};
  const resumeCachedFiles = Array.isArray(resumePayload.cachedFiles)
    ? (resumePayload.cachedFiles as { name: string; content: string }[])
    : args.cachedFiles;
  const priorSectionResults = Array.isArray(resumePayload.sectionResults)
    ? (resumePayload.sectionResults as GscReportingSectionResult[])
    : [];
  const savedOutline = resumePayload.outline as GscReportingOutlineResult | undefined;
  const savedOutlineRequestBodyJson =
    typeof resumePayload.outlineRequestBodyJson === "string" ? resumePayload.outlineRequestBodyJson : undefined;

  let sectionResultsAcc = [...priorSectionResults];
  let outlineRef = savedOutline;
  let outlineRequestRef = savedOutlineRequestBodyJson;
  const ga4PropertyId = await resolveGa4PropertyIdForReportingAsync(args.site);
  if (!ga4PropertyId.trim()) {
    throw new Error(
      "GA4 Property ID is required for SEO reporting. Set it on this site in Integrations. GA4 is website traffic; Search Console is keywords and visibility.",
    );
  }

  const emitProgress = async (
    progress: GscReportingPipelineProgress,
    resumePayload?: Record<string, unknown>,
  ) => {
    await args.onProgress?.(progress, resumePayload);
  };

  if (resumeCachedFiles?.length) {
    pipelineFiles =
      periodProgress
        ? resumeCachedFiles.map((f) => ({ ...f }))
        : ensureCompareSignalsFile(
            resumeCachedFiles.map((f) => ({ ...f })),
            resolvedCompareKind,
            compareLabelDraft,
          );
    if (!bundleHasValidGaOrganicTrafficData(pipelineFiles)) {
      await ensureGaOrganicTrafficInReportingBundle(pipelineFiles, {
        ga4PropertyId,
        periodProgress,
        primary: compareRangeDraft.primary,
        compare: compareRangeDraft.compare,
        compareRanges: compareRangeDraft,
      });
      outlineRef = undefined;
      outlineRequestRef = undefined;
      sectionResultsAcc = [];
    }
    const md = pickClusterMarkdownForPipeline(pipelineFiles, {});
    if (md) pipelineFiles.push({ name: "Queries-AI-clusters.md", content: md });
    const cachedForResume = pipelineFiles.filter((f) => f.name !== "Queries-AI-clusters.md");
    await emitProgress(
      { step: 0, total: 1, label: formatGscBundleReadyLabel(cachedForResume, compareLabelDraft) },
      {
        phase: "gsc_outline",
        comparePreset,
        bundleFileNames: cachedForResume.map((file) => file.name),
        bundleFileCount: cachedForResume.length,
      },
    );
  } else {
    await emitProgress(
      { step: 0, total: 1, label: formatGscBundleApiLabel(compareLabelDraft) },
      { phase: "gsc_fetch", comparePreset },
    );
    const res = await fetchGscQueriesRawForReporting(publicSiteUrl, compareRangeDraft, {
      compareKind: resolvedCompareKind,
      compareLabel: compareLabelDraft,
      ga4PropertyId: ga4PropertyId || undefined,
      reportStructure,
    });
    fetchRange = { startDate: res.startDate, endDate: res.endDate };
    compareFetchRange = periodProgress
      ? {
          startDate: compareRangeDraft.compare.startDate,
          endDate: compareRangeDraft.compare.endDate,
        }
      : { startDate: res.compareStartDate, endDate: res.compareEndDate };
    pipelineFiles = res.files.map((f) => ({ ...f }));
    const md = pickClusterMarkdownForPipeline(res.files, {});
    if (md) pipelineFiles.push({ name: "Queries-AI-clusters.md", content: md });
    const cachedForResume = pipelineFiles.filter((f) => f.name !== "Queries-AI-clusters.md");
    await emitProgress(
      { step: 0, total: 1, label: formatGscBundleReadyLabel(cachedForResume, compareLabelDraft) },
      {
        phase: "gsc_outline",
        comparePreset,
        bundleFileNames: cachedForResume.map((file) => file.name),
        bundleFileCount: cachedForResume.length,
        compareLabel: compareLabelDraft,
      },
    );
  }

  if (await args.isCancelled?.()) {
    throw new Error("Cancelled");
  }

  await emitProgress(
    { step: 0, total: 1, label: GSC_REPORTING_PROGRESS_LABELS.outlineGenerating },
    { phase: "gsc_outline_generating", comparePreset },
  );

  await ensureGaOrganicTrafficInReportingBundle(pipelineFiles, {
    ga4PropertyId,
    periodProgress,
    primary: compareRangeDraft.primary,
    compare: compareRangeDraft.compare,
    compareRanges: compareRangeDraft,
  });

  const { allowlistUrls, sourceLabel } = await resolveReportingSapAllowlist({
    site: args.site,
    publicSiteUrl,
    files: pipelineFiles,
  });
  appendEntitySitemapUrlsBundleFile(pipelineFiles, allowlistUrls, sourceLabel);
  const sapEntityGrounding = buildSapEntityGrounding({
    files: pipelineFiles,
    allowlistUrls,
    sourceLabel,
    publicSiteUrl,
  });

  const documentTitlePeriod = formatReportingDocumentTitlePeriod({
    structure: periodProgress ? "period_progress" : "compare",
    primary: fetchRange,
    compare: periodProgress ? undefined : compareFetchRange,
  });

  const result = await runGscReportingPipeline({
    apiKey,
    model: getReportModel(args.site.id),
    siteName: args.site.name,
    siteUrl: publicSiteUrl,
    files: pipelineFiles,
    sapEntityGrounding,
    compareKind: resolvedCompareKind,
    compareLabel: compareLabelDraft,
    documentTitlePeriod,
    reportStructure,
    progressMonthCount,
    clientSeason: resolveGscClientSeasonContext(
      args.site,
      parseGscYmd(compareRangeDraft.primary.startDate) ?? new Date(),
    ),
    signal: args.signal,
    priorSectionResults: sectionResultsAcc,
    savedOutline: outlineRef,
    savedOutlineRequestBodyJson: outlineRequestRef,
    onProgress: async (p) => {
      await args.onProgress?.(p, {
        phase: "gsc_sections",
        sectionIndex: p.sectionIndex,
        comparePreset,
        outline: outlineRef,
        sectionResults: sectionResultsAcc,
      });
    },
    onOutlineReady: (payload) => {
      outlineRef = payload.outline;
      outlineRequestRef = payload.outlineRequestBodyJson;
      args.onOutlineReady?.(payload);
    },
    onSectionStart: (index) => args.onSectionStart?.(index),
    onSectionReady: (row) => {
      sectionResultsAcc = [
        ...sectionResultsAcc.filter((entry) => entry.index !== row.index),
        row,
      ].sort((a, b) => a.index - b.index);
      args.onSectionReady?.(row);
    },
  });

  const compareLabel = periodProgress
    ? formatGscComparePeriodLabel(fetchRange.startDate, fetchRange.endDate)
    : `${formatGscReportFullDateRange(fetchRange.startDate, fetchRange.endDate)} vs ${formatGscComparePeriodLabel(compareFetchRange.startDate, compareFetchRange.endDate)}`;

  let markdown = result.markdown;
  const reportModel = getReportModel(args.site.id);

  await emitProgress({ step: result.sectionResults.length + 2, total: result.sectionResults.length + 4, label: "Semrush position tracking…" });
  const semrushBlock = await buildGscReportingSemrushMarkdownSection({
    site: args.site,
    fetchRange,
    compareFetchRange,
    trackedSiteUrl: publicSiteUrl,
    periodProgress,
  });
  if (semrushBlock.trim()) {
    markdown = spliceSemPositionTrackingAfterSearchPerformance(
      markdown,
      result.sectionResults,
      semrushBlock,
    );
  }

  await emitProgress({ step: result.sectionResults.length + 3, total: result.sectionResults.length + 4, label: "Local Insights…" });
  const localBlock = await buildGscReportingLocalInsightsMarkdownSection({
    site: args.site,
    compareLabel,
    supplements: args.supplements,
    apiKey,
    model: reportModel,
    signal: args.signal,
  });
  if (localBlock.trim()) {
    markdown = `${markdown.trimEnd()}\n\n${localBlock.trim()}\n`;
  }

  return {
    ...result,
    markdown,
    files: pipelineFiles.filter((f) => f.name !== "Queries-AI-clusters.md"),
    comparePreset,
    compareLabel,
    fetchRange,
    compareFetchRange,
  };
}
