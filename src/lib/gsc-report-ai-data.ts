import { deriveGscCompareSignals } from "@/lib/gsc-reporting/gsc-reporting-compare-signals";
import { formatMonthYearFromAPI } from "./gsc-date-helpers";
import type { GSCReportDiscoveryInput, RawReportData } from "./gsc-report-ai-types";

/**
 * Serialize discovery data to raw JSON. No tables, no formatting, no row limits.
 */
export function serializeRawData(discoveryData: GSCReportDiscoveryInput): RawReportData {
  const { stats, entityPagesData, wordPressContext, gmbData } = discoveryData;
  const siteName = wordPressContext.siteName;

  // Label current period as a single month OR a month-to-month range
  const currentStartLabel = formatMonthYearFromAPI(stats.currentPeriod.startDate);
  const currentEndLabel = formatMonthYearFromAPI(stats.currentPeriod.endDate);
  const currentPeriodLabel =
    currentStartLabel === currentEndLabel
      ? currentStartLabel
      : `${currentStartLabel} to ${currentEndLabel}`;

  // Label comparison period similarly (usually a single month baseline)
  const comparisonStartLabel = formatMonthYearFromAPI(stats.comparisonPeriod.startDate);
  const comparisonEndLabel = formatMonthYearFromAPI(stats.comparisonPeriod.endDate);
  const comparisonPeriodLabel =
    comparisonStartLabel === comparisonEndLabel
      ? comparisonStartLabel
      : `${comparisonStartLabel} to ${comparisonEndLabel}`;

  const periodContext = `${currentPeriodLabel} compared to ${comparisonPeriodLabel}`;

  const keywords = (stats.topKeywords || []).map((kw) => ({
    query: kw.query || "",
    currentImpressions: kw.currentImpressions ?? 0,
    previousImpressions: kw.previousImpressions ?? 0,
    currentClicks: kw.currentClicks ?? 0,
    previousClicks: kw.previousClicks ?? 0,
    currentRanking: kw.currentRanking ?? 0,
    previousRanking: kw.previousRanking ?? 0,
    impressionsChange: kw.impressionsChange ?? 0,
    isNew: (kw.previousImpressions ?? 0) === 0 && (kw.currentImpressions ?? 0) > 0,
    isLost: (kw.currentImpressions ?? 0) === 0 && (kw.previousImpressions ?? 0) > 0,
  }));

  const entityPages = (entityPagesData?.pages || [])
    .map((p) => ({
      pagePath: p.pagePath || "",
      url: p.url,
      impressions: p.impressions ?? 0,
      position: p.position ?? 0,
      isNew: p.isNew ?? false,
      impressionsChange: p.impressionsChange ?? 0,
      queries: p.queries || [],
    }))
    .sort((a, b) => (a.position || 999) - (b.position || 999)); // Best position first (ascending)

  let gmb: RawReportData["gmb"] = null;
  if (gmbData?.currentPeriod && gmbData?.comparisonPeriod) {
    gmb = {
      currentPeriod: gmbData.currentPeriod,
      comparisonPeriod: gmbData.comparisonPeriod,
    };
  }

  const priorSearchTermsCount = stats.comparisonPeriod.searchTermsCount;

  const primaryQueries = keywords
    .filter((k) => k.currentImpressions > 0)
    .map((k) => ({
      query: k.query,
      clicks: k.currentClicks,
      impressions: k.currentImpressions,
      ctr: k.currentImpressions > 0 ? k.currentClicks / k.currentImpressions : 0,
      position: k.currentRanking,
    }));
  const compareQueries = keywords
    .filter((k) => k.previousImpressions > 0)
    .map((k) => ({
      query: k.query,
      clicks: k.previousClicks,
      impressions: k.previousImpressions,
      ctr: k.previousImpressions > 0 ? k.previousClicks / k.previousImpressions : 0,
      position: k.previousRanking,
    }));

  const compareSignals = deriveGscCompareSignals({
    compareKind: "mom",
    compareLabel: `${currentPeriodLabel} vs ${comparisonPeriodLabel}`,
    aggregatePrimary: {
      label: currentPeriodLabel,
      startDate: stats.currentPeriod.startDate,
      endDate: stats.currentPeriod.endDate,
      clicks: stats.currentPeriod.clicks,
      impressions: stats.currentPeriod.impressions,
      ctr: stats.currentPeriod.ctr,
      position: stats.currentPeriod.avgPosition,
    },
    aggregateCompare: {
      label: comparisonPeriodLabel,
      startDate: stats.comparisonPeriod.startDate,
      endDate: stats.comparisonPeriod.endDate,
      clicks: stats.comparisonPeriod.clicks,
      impressions: stats.comparisonPeriod.impressions,
      ctr: stats.comparisonPeriod.ctr,
      position: stats.comparisonPeriod.avgPosition,
    },
    queryCountPrimary: stats.currentPeriod.searchTermsCount,
    queryCountCompare: priorSearchTermsCount,
    primaryQueries,
    compareQueries,
  });

  return {
    siteName,
    periodContext,
    currentPeriodLabel,
    comparisonPeriodLabel,
    growth: {
      impressions: stats.currentPeriod.impressions,
      clicks: stats.currentPeriod.clicks,
      pagesCount: stats.currentPeriod.pagesCount,
      searchTermsCount: stats.currentPeriod.searchTermsCount,
      avgPosition: stats.currentPeriod.avgPosition,
      comparisons: {
        impressionsChange: stats.comparisons.impressionsChange,
        impressionsChangePercent: stats.comparisons.impressionsChangePercent,
        clicksChange: stats.comparisons.clicksChange,
        clicksChangePercent: stats.comparisons.clicksChangePercent,
        pagesChange: stats.comparisons.pagesChange,
        searchTermsChange: stats.comparisons.searchTermsChange,
        avgPositionChange: stats.comparisons.avgPositionChange,
      },
    },
    keywords,
    entityPages,
    gmb,
    napInfo: wordPressContext.napInfo,
    sampleTitles: wordPressContext.sampleTitles,
    monthlyStats: (() => {
      const all = discoveryData.historicalData?.monthlyStats ?? [];
      if (!all.length) return undefined;
      const startMonth = stats.currentPeriod.startDate.slice(0, 7);
      const endMonth = stats.currentPeriod.endDate.slice(0, 7);
      const filtered = all.filter(m => m.month >= startMonth && m.month <= endMonth);
      return (filtered.length ? filtered : all);
    })(),
    compareSignals,
  };
}

/** Resolve heading template with siteName, currentPeriodLabel, comparisonPeriodLabel */
export function resolveHeading(template: string, data: RawReportData): string {
  return template
    .replace(/{siteName}/g, data.siteName)
    .replace(/{currentPeriodLabel}/g, data.currentPeriodLabel)
    .replace(/{comparisonPeriodLabel}/g, data.comparisonPeriodLabel);
}

/** Get scoped data for a section (row caps applied). For sections that need filtered/sliced data. */
export function getScopedDataForSection(
  sectionId: string,
  rawData: RawReportData
): Record<string, unknown> {
  const base = {
    siteName: rawData.siteName,
    currentPeriodLabel: rawData.currentPeriodLabel,
    comparisonPeriodLabel: rawData.comparisonPeriodLabel,
    growth: rawData.growth,
    periodContext: rawData.periodContext,
  };

  switch (sectionId) {
    case "3": {
      return { ...base, entityPages: rawData.entityPages };
    }
    case "5": {
      // All search terms: top 50 by current impressions (includes terms from either month)
      const allTerms = rawData.keywords
        .slice()
        .sort((a, b) => b.currentImpressions - a.currentImpressions)
        .slice(0, 50);
      return { ...base, allTerms };
    }
    // Progress report sections
    case "p4": {
      return { ...base, entityPages: rawData.entityPages };
    }
    case "p6": {
      return { ...base, entityPages: rawData.entityPages };
    }
    case "p8": {
      const pLocal = rawData.keywords
        .filter(
          (k) =>
            (k.currentImpressions > 0 || k.previousImpressions > 0) &&
            (k.query.toLowerCase().includes("near me") || k.query.toLowerCase().includes(" near "))
        )
        .sort((a, b) => (a.currentRanking || 999) - (b.currentRanking || 999))
        .slice(0, 15);
      return { ...base, localKeywords: pLocal };
    }
    case "p9": {
      return { ...base, monthlyStats: rawData.monthlyStats || [] };
    }
    default:
      return base;
  }
}

/**
 * Pre-build markdown tables from raw data so the AI cannot hallucinate columns or omit rows.
 * Returns the table markdown string, or null if the section doesn't have a pre-built table.
 */
export function prebuiltTableForSection(sectionId: string, rawData: RawReportData): string | null {
  switch (sectionId) {
    case "3": {
      const pages = rawData.entityPages;
      if (!pages.length) return null;
      const rows = pages
        .slice()
        .sort((a, b) => (a.position || 999) - (b.position || 999))
        .map((p) => {
          const name = p.pagePath.replace(/^\//, "").replace(/\/$/, "").split("/").pop() || p.pagePath;
          const status = p.isNew ? "NEW" : (p.impressionsChange >= 0 ? `+${p.impressionsChange}` : `${p.impressionsChange}`);
          return `| ${name} | ${p.position} | ${p.impressions.toLocaleString()} | ${status} |`;
        });
      return `| Service Area Page | Position | Times Shown | Status |\n| --- | --- | --- | --- |\n${rows.join("\n")}`;
    }
    case "4": {
      const g = rawData.growth;
      const c = g.comparisons;
      const fmtChange = (v: number) => (v >= 0 ? `+${v.toLocaleString()}` : `${v.toLocaleString()}`);
      const fmtPct = (v: number) => (v >= 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`);
      return [
        `| Metric | ${rawData.currentPeriodLabel} | Growth vs ${rawData.comparisonPeriodLabel} |`,
        `| --- | --- | --- |`,
        `| Times Shown in Google | ${g.impressions.toLocaleString()} | ${fmtChange(c.impressionsChange)} (${fmtPct(c.impressionsChangePercent)}) |`,
        `| Website Visitors from Search | ${g.clicks.toLocaleString()} | ${fmtChange(c.clicksChange)} (${fmtPct(c.clicksChangePercent)}) |`,
        `| Pages Ranking in Google | ${g.pagesCount.toLocaleString()} | ${fmtChange(c.pagesChange)} |`,
        `| Search Terms Found For | ${g.searchTermsCount.toLocaleString()} | ${fmtChange(c.searchTermsChange)} |`,
      ].join("\n");
    }
    case "5": {
      const terms = rawData.keywords
        .slice()
        .sort((a, b) => b.currentImpressions - a.currentImpressions)
        .slice(0, 50);
      if (!terms.length) return null;
      const rows = terms.map((k) => {
        const change = k.currentImpressions - k.previousImpressions;
        const changeStr = change >= 0 ? `+${change}` : `${change}`;
        return `| ${k.query} | ${k.previousImpressions.toLocaleString()} | ${k.currentImpressions.toLocaleString()} | ${changeStr} | ${k.previousRanking || " - "} | ${k.currentRanking || " - "} |`;
      });
      return `| Search Term | ${rawData.comparisonPeriodLabel} Imp. | ${rawData.currentPeriodLabel} Imp. | Change | ${rawData.comparisonPeriodLabel} Pos. | ${rawData.currentPeriodLabel} Pos. |\n| --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}`;
    }
    case "9": {
      const g = rawData.growth;
      const c = g.comparisons;
      const prev = (current: number, change: number) => current - change;
      const fmtChange = (v: number) => (v >= 0 ? `+${v}` : `${v}`);
      return [
        `| Content Metric | ${rawData.comparisonPeriodLabel} | ${rawData.currentPeriodLabel} | Change |`,
        `| --- | --- | --- | --- |`,
        `| Pages Appearing in Google | ${prev(g.pagesCount, c.pagesChange).toLocaleString()} | ${g.pagesCount.toLocaleString()} | ${fmtChange(c.pagesChange)} |`,
        `| Average Position | ${(prev(g.avgPosition, c.avgPositionChange)).toFixed(2)} | ${g.avgPosition.toFixed(2)} | ${fmtChange(Number(c.avgPositionChange.toFixed(2)))} |`,
        `| Total Impressions | ${prev(g.impressions, c.impressionsChange).toLocaleString()} | ${g.impressions.toLocaleString()} | ${fmtChange(c.impressionsChange)} |`,
        `| Total Clicks | ${prev(g.clicks, c.clicksChange).toLocaleString()} | ${g.clicks.toLocaleString()} | ${fmtChange(c.clicksChange)} |`,
      ].join("\n");
    }
    // ─── Progress report prebuilt tables ────────────────────────────────
    case "p2": {
      const g = rawData.growth;
      const c = g.comparisons;
      const prev = (current: number, change: number) => current - change;
      const fmtGrowth = (v: number) => (v >= 0 ? `+${v.toLocaleString()}` : `${v.toLocaleString()}`);
      return [
        `| Metric | Baseline (${rawData.comparisonPeriodLabel}) | Current (${rawData.currentPeriodLabel}) | Growth |`,
        `| --- | --- | --- | --- |`,
        `| Pages Appearing in Google | ${prev(g.pagesCount, c.pagesChange).toLocaleString()} | ${g.pagesCount.toLocaleString()} | ${fmtGrowth(c.pagesChange)} |`,
        `| Search Terms Ranking For | ${prev(g.searchTermsCount, c.searchTermsChange).toLocaleString()} | ${g.searchTermsCount.toLocaleString()} | ${fmtGrowth(c.searchTermsChange)} |`,
        `| Average Position | ${prev(g.avgPosition, c.avgPositionChange).toFixed(2)} | ${g.avgPosition.toFixed(2)} | ${fmtGrowth(Number(c.avgPositionChange.toFixed(2)))} |`,
        `| Total Impressions | ${prev(g.impressions, c.impressionsChange).toLocaleString()} | ${g.impressions.toLocaleString()} | ${fmtGrowth(c.impressionsChange)} |`,
      ].join("\n");
    }
    case "p4": {
      const pages = rawData.entityPages;
      if (!pages.length) return null;
      const rows = pages
        .slice()
        .sort((a, b) => (a.position || 999) - (b.position || 999))
        .map((p) => {
          const url = p.url || p.pagePath;
          const status = p.isNew ? "NEW" : (p.impressionsChange >= 0 ? `+${p.impressionsChange}` : `${p.impressionsChange}`);
          return `| ${url} | ${p.position} | ${p.impressions.toLocaleString()} | ${status} |`;
        });
      return `| Service Area Page | Position | Times Shown | Status |\n| --- | --- | --- | --- |\n${rows.join("\n")}`;
    }
    case "p5": {
      const g = rawData.growth;
      const c = g.comparisons;
      const prev = (current: number, change: number) => current - change;
      const fmtGrowth = (v: number) => (v >= 0 ? `+${v.toLocaleString()}` : `${v.toLocaleString()}`);
      const fmtPct = (v: number) => (v >= 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`);
      return [
        `| Metric | Baseline (${rawData.comparisonPeriodLabel}) | Current (${rawData.currentPeriodLabel}) | Growth |`,
        `| --- | --- | --- | --- |`,
        `| Times Shown in Google | ${prev(g.impressions, c.impressionsChange).toLocaleString()} | ${g.impressions.toLocaleString()} | ${fmtGrowth(c.impressionsChange)} (${fmtPct(c.impressionsChangePercent)}) |`,
        `| Website Visitors from Search | ${prev(g.clicks, c.clicksChange).toLocaleString()} | ${g.clicks.toLocaleString()} | ${fmtGrowth(c.clicksChange)} (${fmtPct(c.clicksChangePercent)}) |`,
        `| Pages Ranking in Google | ${prev(g.pagesCount, c.pagesChange).toLocaleString()} | ${g.pagesCount.toLocaleString()} | ${fmtGrowth(c.pagesChange)} |`,
        `| Search Terms Found For | ${prev(g.searchTermsCount, c.searchTermsChange).toLocaleString()} | ${g.searchTermsCount.toLocaleString()} | ${fmtGrowth(c.searchTermsChange)} |`,
      ].join("\n");
    }
    case "p6": {
      const pages = rawData.entityPages;
      if (!pages.length) return null;
      const rows: string[] = [];
      pages
        .slice()
        .sort((a, b) => (a.position || 999) - (b.position || 999))
        .forEach((p) => {
          const url = p.url || p.pagePath;
          const queries = (p.queries || []) as Array<{ query: string; clicks: number; impressions: number; position: number }>;
          if (!queries.length) {
            rows.push(`| ${url} | - | 0 | 0 | - |`);
            return;
          }
          queries.forEach((q) => {
            rows.push(
              `| ${url} | ${q.query} | ${q.impressions.toLocaleString()} | ${q.clicks} | ${q.position || " - "} |`
            );
          });
        });
      if (!rows.length) return null;
      return `| Service Area Page URL | Search Term | Times Shown | Clicks | Position |\n| --- | --- | --- | --- | --- |\n${rows.join("\n")}`;
    }
    case "p8": {
      const pLocal = rawData.keywords
        .filter(
          (k) =>
            (k.currentImpressions > 0 || k.previousImpressions > 0) &&
            (k.query.toLowerCase().includes("near me") || k.query.toLowerCase().includes(" near "))
        )
        .sort((a, b) => (a.currentRanking || 999) - (b.currentRanking || 999))
        .slice(0, 15);
      if (!pLocal.length) return null;
      const rows = pLocal.map((k) => {
        const status = k.isNew ? "NEW" : (k.impressionsChange >= 0 ? `+${k.impressionsChange}` : `${k.impressionsChange}`);
        return `| ${k.query} | ${k.currentRanking || " - "} | ${k.currentImpressions.toLocaleString()} | ${status} |`;
      });
      return `| Local Search Term | Position | Times Shown | Status |\n| --- | --- | --- | --- |\n${rows.join("\n")}`;
    }
    case "p9": {
      const ms = rawData.monthlyStats;
      if (!ms || !ms.length) return null;
      const rows = ms.map((m) =>
        `| ${m.month} | ${m.impressions.toLocaleString()} | ${m.avgPosition.toFixed(1)} |`
      );
      return `| Month | Impressions | Avg Position |\n| --- | --- | --- |\n${rows.join("\n")}`;
    }
    default:
      return null;
  }
}
