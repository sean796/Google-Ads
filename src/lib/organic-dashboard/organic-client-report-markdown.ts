import type { OrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import { organicClientReportPdfFileName } from "@/lib/organic-dashboard/organic-client-report-pdf-filename";
import {
  clientReportHighlightMetricLabel,
  layoutOpportunityComparisonRows,
  type DeckSummaryRow,
} from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import type { OrganicDeckOpportunity } from "@/lib/organic-dashboard/organic-reporting-highlights";
import {
  CLIENT_REPORT_DELTA_EMPTY,
  formatClientReportSemrushKeywordMeta,
  formatClientReportTopQueryMeta,
  normalizeClientReportText,
} from "@/lib/organic-dashboard/organic-client-report-copy";
import { AGENCY_NAME } from "@/lib/report-planner";
import type { OrganicPeriodProgressTable } from "@/lib/organic-dashboard/organic-dashboard-period-progress";
import { deckOpportunityShowCompare } from "@/lib/organic-dashboard/organic-opportunity-export-tables";

function escapeMdCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function metricRowsMarkdown(
  rows: DeckSummaryRow[],
  showCompare: boolean,
  compareLabel: string,
  primaryLabel: string,
): string {
  if (rows.length === 0) return "";
  if (!showCompare) {
    return rows.map((r) => `- **${r.label}:** ${r.later}`).join("\n");
  }
  const lines = [
    "| Metric | " + escapeMdCell(compareLabel) + " | Change | " + escapeMdCell(primaryLabel) + " |",
    "| --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    const change =
      row.delta.deltaPercent == null
        ? CLIENT_REPORT_DELTA_EMPTY
        : `${row.delta.deltaPositive ? "+" : ""}${row.delta.deltaPercent.toFixed(1)}%`;
    lines.push(
      `| ${escapeMdCell(row.label)} | ${escapeMdCell(row.earlier)} | ${change} | ${escapeMdCell(row.later)} |`,
    );
  }
  return lines.join("\n");
}

function periodProgressTableMarkdown(
  table: OrganicPeriodProgressTable,
  options?: { showTotalRow?: boolean },
): string {
  const showTotalRow = options?.showTotalRow !== false;
  const headers = ["Month", ...table.rows.map((r) => escapeMdCell(r.label))];
  const lines = [
    `### ${table.title}`,
    "",
    "| " + headers.join(" | ") + " |",
    "| " + headers.map(() => "---").join(" | ") + " |",
  ];
  for (let monthIdx = 0; monthIdx < table.monthLabels.length; monthIdx++) {
    const monthLabel = table.monthLabels[monthIdx]!;
    lines.push(
      "| " +
        [
          escapeMdCell(monthLabel),
          ...table.rows.map((row) => escapeMdCell(row.values[monthIdx] ?? "—")),
        ].join(" | ") +
        " |",
    );
  }
  if (showTotalRow && table.monthLabels.length > 1) {
    lines.push(
      "| " +
        [escapeMdCell("Total"), ...table.rows.map((r) => escapeMdCell(r.periodTotal))].join(
          " | ",
        ) +
        " |",
    );
  }
  return lines.join("\n");
}

function opportunityMarkdown(
  item: OrganicDeckOpportunity,
  showCompare: boolean,
  compareLabel: string,
  primaryLabel: string,
): string {
  const parts = [`### ${item.label}`, "", "**Why it matters**", "", item.why, ""];
  if (item.comparisonRows.length > 0) {
    const compare = deckOpportunityShowCompare(showCompare, item.comparisonRows);
    parts.push(compare ? "**Period comparison**" : "**Period totals**", "");
    const layout = layoutOpportunityComparisonRows(item.comparisonRows);
    if (layout.kind === "query-grid") {
      if (compare) {
        parts.push(
          "| Query | Metric | " + escapeMdCell(compareLabel) + " | " + escapeMdCell(primaryLabel) + " |",
          "| --- | --- | --- | --- |",
        );
        for (const q of layout.queryRows) {
          const lines = [
            { metric: "Clicks", compare: q.clicks.compare, primary: q.clicks.primary },
            { metric: "Impressions", compare: q.impressions.compare, primary: q.impressions.primary },
            { metric: "Avg. position", compare: q.avgPosition.compare, primary: q.avgPosition.primary },
          ];
          lines.forEach((line, i) => {
            const queryCell = i === 0 ? escapeMdCell(q.query) : "";
            parts.push(
              `| ${queryCell} | ${escapeMdCell(line.metric)} | ${escapeMdCell(line.compare)} | ${escapeMdCell(line.primary)} |`,
            );
          });
        }
      } else {
        parts.push(
          "| Query | Clicks | Impressions | Avg. position |",
          "| --- | --- | --- | --- |",
        );
        for (const q of layout.queryRows) {
          parts.push(
            `| ${escapeMdCell(q.query)} | ${escapeMdCell(q.clicks.primary)} | ${escapeMdCell(q.impressions.primary)} | ${escapeMdCell(q.avgPosition.primary)} |`,
          );
        }
      }
      if (layout.siteRows.length > 0) {
        parts.push("");
        if (compare) {
          parts.push(
            "| Metric | " + escapeMdCell(compareLabel) + " | " + escapeMdCell(primaryLabel) + " |",
            "| --- | --- | --- |",
          );
          for (const row of layout.siteRows) {
            parts.push(
              `| ${escapeMdCell(row.metric)} | ${escapeMdCell(row.comparePeriodValue)} | ${escapeMdCell(row.primaryPeriodValue)} |`,
            );
          }
        } else {
          parts.push("| Metric | Value |", "| --- | --- |");
          for (const row of layout.siteRows) {
            parts.push(
              `| ${escapeMdCell(clientReportHighlightMetricLabel(row.metric))} | ${escapeMdCell(row.primaryPeriodValue)} |`,
            );
          }
        }
      }
    } else if (compare) {
      parts.push(
        "| Metric | " + escapeMdCell(compareLabel) + " | " + escapeMdCell(primaryLabel) + " |",
        "| --- | --- | --- |",
      );
      for (const row of layout.rows) {
        parts.push(
          `| ${escapeMdCell(row.metric)} | ${escapeMdCell(row.comparePeriodValue)} | ${escapeMdCell(row.primaryPeriodValue)} |`,
        );
      }
    } else {
      parts.push("| Metric | Value |", "| --- | --- |");
      for (const row of layout.rows) {
        parts.push(
          `| ${escapeMdCell(clientReportHighlightMetricLabel(row.metric))} | ${escapeMdCell(row.primaryPeriodValue)} |`,
        );
      }
    }
    parts.push("");
  } else if (item.metrics.trim()) {
    parts.push(item.metrics, "");
  }
  return parts.join("\n");
}

export function serializeOrganicClientReportMarkdown(content: OrganicClientReportContent): string {
  const {
    siteName,
    siteUrl,
    showCompare,
    preparedOn,
    periodLine,
    highlights,
    comparePeriodLabel,
    primaryPeriodLabel,
    traffic,
    search,
    topQueries,
    semrushDeckRows,
    topSemrushKeywords,
    highlightStats,
    opportunities,
    googleAdsOpportunities,
    semrushDatabase,
    semrushOverviewUrl,
    semrushDomain,
    performanceNarrative,
    keywordNarrative,
    googleAdsNarrative,
    googleAdsDeckRows,
    googleAdsLoadError,
    showGoogleAdsSection,
    showPerformanceSection,
    showSemrushSection,
    showKeywordSection,
    showHighlightsSection,
    periodProgressTables,
  } = content;

  const agencyLogo = content.agencyLogoUrl.trim();
  const clientLogo = content.clientLogoUrl.trim();

  const blocks: string[] = [
    `# ${siteName} Organic Performance`,
    "",
    `- **Agency:** ${AGENCY_NAME}${agencyLogo ? ` (${agencyLogo})` : ""}`,
    ...(clientLogo
      ? [`- **Client logo:** ${clientLogo}`]
      : [`- **Client:** ${siteName}`]),
    `- **Site:** ${siteUrl}`,
    `- **Periods:** ${periodLine}`,
    `- **Prepared:** ${preparedOn}`,
    "",
    "## Insights",
    "",
    normalizeClientReportText(highlights.executiveSummary),
    "",
  ];

  if (highlights.keyTakeaways.length > 0) {
    blocks.push("### Key takeaways", "");
    for (const line of highlights.keyTakeaways) {
      blocks.push(`- ${line}`);
    }
    blocks.push("");
  }

  if (content.showLeadsSection && content.leadsSummary) {
    const s = content.leadsSummary;
    blocks.push(
      "## Lead Generation & Revenue Outcomes (Organic vs. Paid)",
      "",
      `> **Google Ads ROI:** ${s.roiHeadline}`,
      `> **Organic SEO Impact:** ${s.organicHeadline}`,
      "",
      "### Lead Acquisition Funnel",
      "",
      "| Funnel Stage | Organic (SEO) | Paid (Google Ads) | Total / Blended |",
      "| --- | ---: | ---: | ---: |",
    );
    for (const r of content.leadsFunnelTable) {
      blocks.push(`| ${r.stage} | ${r.organic} | ${r.paid} | ${r.total} |`);
    }
    blocks.push("");
  }

  if (showPerformanceSection) {
    blocks.push("## Performance summary", "");
    if (performanceNarrative.length > 0) {
      blocks.push("### Overview", "");
      for (const p of performanceNarrative) {
        blocks.push(p, "");
      }
    }
    if (periodProgressTables?.ga4) {
      blocks.push(periodProgressTableMarkdown(periodProgressTables.ga4), "");
    }
    if (periodProgressTables?.gsc) {
      blocks.push(periodProgressTableMarkdown(periodProgressTables.gsc), "");
    }
    blocks.push("### Website traffic (GA4)", "");
    blocks.push(metricRowsMarkdown(traffic, showCompare, comparePeriodLabel, primaryPeriodLabel), "");
    blocks.push("### Search visibility (GSC)", "");
    blocks.push(metricRowsMarkdown(search, showCompare, comparePeriodLabel, primaryPeriodLabel), "");
  }

  if (showSemrushSection) {
    blocks.push("## Semrush estimates", "");
    blocks.push("### Organic visibility (Semrush)", "");
    if (periodProgressTables?.semrush) {
      blocks.push(periodProgressTableMarkdown(periodProgressTables.semrush, { showTotalRow: false }), "");
    } else {
      blocks.push(metricRowsMarkdown(semrushDeckRows, showCompare, comparePeriodLabel, primaryPeriodLabel), "");
    }
    if (topSemrushKeywords.length > 0) {
      blocks.push("### Sample Semrush keywords", "");
      for (const k of topSemrushKeywords) {
        blocks.push(
          `- **${k.phrase}:** ${formatClientReportSemrushKeywordMeta(k.traffic, k.volume)}`,
        );
      }
      blocks.push("");
    }
  }

  if (showKeywordSection) {
    blocks.push("## Keyword performance", "");
    if (keywordNarrative.length > 0) {
      blocks.push("### Overview", "");
      for (const p of keywordNarrative) {
        blocks.push(p, "");
      }
    }
    blocks.push("### Top queries", "");
    for (const q of topQueries) {
      blocks.push(`- **${q.query}:** ${formatClientReportTopQueryMeta(q.clicks)}`);
    }
    blocks.push("");
  }

  if (showHighlightsSection) {
    blocks.push("## Highlights", "");
    if (highlightStats.length > 0) {
      for (const stat of highlightStats) {
        const change =
          stat.delta.deltaPercent == null
            ? ""
            : ` (${stat.delta.deltaPositive ? "+" : ""}${stat.delta.deltaPercent.toFixed(1)}%)`;
        blocks.push(`- **${stat.label}:** ${stat.value}${change}`);
      }
      blocks.push("");
    }
    for (const item of opportunities) {
      blocks.push(opportunityMarkdown(item, showCompare, comparePeriodLabel, primaryPeriodLabel));
    }
  }

  if (content.showLocalGridSection && content.localGridSection) {
    const grid = content.localGridSection;
    blocks.push("## Local Map Visibility", "");
    const gridExplainer = content.localGridNarrative[0];
    if (gridExplainer) {
      blocks.push(gridExplainer, "");
    }
    blocks.push("### Map Pack Metrics", "");
    blocks.push(metricRowsMarkdown(grid.summaryRows, false, comparePeriodLabel, primaryPeriodLabel), "");
  }

  if (showGoogleAdsSection) {
    blocks.push("## Google Ads", "");
    if (googleAdsLoadError) {
      blocks.push(googleAdsLoadError, "");
    } else {
      if (googleAdsNarrative.length > 0) {
        blocks.push("### Overview", "");
        for (const p of googleAdsNarrative) {
          blocks.push(p, "");
        }
      }
      if (googleAdsDeckRows.length > 0) {
        blocks.push(metricRowsMarkdown(googleAdsDeckRows, showCompare, comparePeriodLabel, primaryPeriodLabel), "");
      }
      for (const item of googleAdsOpportunities) {
        blocks.push(opportunityMarkdown(item, showCompare, comparePeriodLabel, primaryPeriodLabel));
      }
    }
  }

  blocks.push("---", "", `*${AGENCY_NAME} | Prepared ${preparedOn}*`);

  return blocks.join("\n").trim() + "\n";
}

export function organicClientReportMarkdownFileName(siteName: string): string {
  return organicClientReportPdfFileName(siteName).replace(/\.pdf$/i, ".md");
}

export function downloadOrganicClientReportMarkdown(content: OrganicClientReportContent): void {
  const markdown = serializeOrganicClientReportMarkdown(content);
  const fileName = organicClientReportMarkdownFileName(content.siteName);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
