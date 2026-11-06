import { useMemo } from "react";
import { formatOwnerReportHeading } from "@/lib/organic-dashboard/organic-client-report-copy";
import type { OrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import type { ReportOutlineItem } from "@/components/organic-dashboard/organic-reporting-studio-shell-helpers";

export function useOrganicReportingOutlineItems(reportContent: OrganicClientReportContent | null) {
  const outlineItems = useMemo((): ReportOutlineItem[] => {
    if (!reportContent) return [];
    const items: ReportOutlineItem[] = [];

    const hasInsights =
      Boolean(reportContent.highlights.executiveSummary.trim()) ||
      reportContent.highlights.keyTakeaways.length > 0;
    const hasCover =
      Boolean(reportContent.siteName.trim()) && Boolean(reportContent.periodLine.trim());
    items.push({
      id: "outline-cover",
      title: "Executive cover & insights",
      subtitle: "/cover",
      anchorId: "report-cover",
      isReady: hasCover,
      downloadFile: hasInsights
        ? {
            name: "insights-summary.json",
            content: JSON.stringify(
              {
                executiveSummary: reportContent.highlights.executiveSummary,
                keyTakeaways: reportContent.highlights.keyTakeaways,
              },
              null,
              2,
            ),
            mimeType: "application/json;charset=utf-8",
          }
        : null,
    });



    if (reportContent.showPerformanceSection) {
      items.push({
        id: "outline-performance",
        title: formatOwnerReportHeading("Performance summary"),
        subtitle: "/ga4",
        anchorId: "export-section-performance-summary",
        isReady: reportContent.traffic.length > 0 || reportContent.search.length > 0,
        downloadFile: {
          name: "performance-summary.json",
          content: JSON.stringify(
            {
              narrative: reportContent.performanceNarrative,
              ga4Traffic: reportContent.traffic,
              gscSearch: reportContent.search,
            },
            null,
            2,
          ),
          mimeType: "application/json;charset=utf-8",
        },
      });
    }

    if (reportContent.showSemrushSection) {
      items.push({
        id: "outline-semrush",
        title: formatOwnerReportHeading("Semrush estimates"),
        subtitle: "/semrush",
        anchorId: "export-section-semrush-estimates",
        isReady:
          reportContent.semrushDeckRows.length > 0 ||
          reportContent.topSemrushKeywords.length > 0,
        downloadFile: {
          name: "semrush-estimates.json",
          content: JSON.stringify(
            {
              summary: reportContent.semrushDeckRows,
              topKeywords: reportContent.topSemrushKeywords,
            },
            null,
            2,
          ),
          mimeType: "application/json;charset=utf-8",
        },
      });
    }

    if (reportContent.showKeywordSection) {
      items.push({
        id: "outline-keywords",
        title: formatOwnerReportHeading("Keyword performance"),
        subtitle: "/keyword-performance",
        anchorId: "export-section-keyword-performance",
        isReady: reportContent.topQueries.length > 0,
        downloadFile: {
          name: "keyword-performance.json",
          content: JSON.stringify(
            {
              narrative: reportContent.keywordNarrative,
              topQueries: reportContent.topQueries,
            },
            null,
            2,
          ),
          mimeType: "application/json;charset=utf-8",
        },
      });
    }

    if (reportContent.showHighlightsSection) {
      items.push({
        id: "outline-highlights",
        title: formatOwnerReportHeading("Highlights"),
        subtitle: "/highlights",
        anchorId: "export-section-highlights",
        isReady:
          reportContent.highlightStats.length > 0 || reportContent.opportunities.length > 0,
        downloadFile: {
          name: "opportunities.json",
          content: JSON.stringify(
            {
              stats: reportContent.highlightStats,
              opportunities: reportContent.opportunities,
            },
            null,
            2,
          ),
          mimeType: "application/json;charset=utf-8",
        },
      });
    }

    if (reportContent.showLocalGridSection && (reportContent.localGridSections?.length || reportContent.localGridSection)) {
      const sections = reportContent.localGridSections?.length
        ? reportContent.localGridSections
        : reportContent.localGridSection
          ? [reportContent.localGridSection]
          : [];
      items.push({
        id: "outline-local-grid",
        title: formatOwnerReportHeading("Local map visibility"),
        subtitle: `/local-map (${sections.length})`,
        anchorId: "export-section-local-map-visibility",
        isReady: true,
        downloadFile: {
          name: "local-grid.json",
          content: JSON.stringify(
            {
              locations: sections.map((s) => ({
                meta: s.meta,
                summaryRows: s.summaryRows,
              })),
              narrative: reportContent.localGridNarrative,
            },
            null,
            2,
          ),
          mimeType: "application/json;charset=utf-8",
        },
      });
    }

    if (reportContent.showGoogleAdsSection) {
      items.push({
        id: "outline-google-ads",
        title: formatOwnerReportHeading("Google Ads"),
        subtitle: "/google-ads",
        anchorId: "export-section-google-ads",
        isReady:
          reportContent.googleAdsAccountCard != null ||
          reportContent.googleAdsDeckRows.length > 0,
        downloadFile: {
          name: "google-ads.json",
          content: JSON.stringify(
            {
              narrative: reportContent.googleAdsNarrative,
              summary: reportContent.googleAdsDeckRows,
              opportunities: reportContent.googleAdsOpportunities,
            },
            null,
            2,
          ),
          mimeType: "application/json;charset=utf-8",
        },
      });
    }

    return items;
  }, [reportContent]);
  return outlineItems;
}
