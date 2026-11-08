import { buildContentSheetBulkTemplateCsv } from "@/lib/sitemap-optimizer/content-sheet-bulk-export";
import { filterMergeableMerges } from "@/lib/sitemap-optimizer/resolved-cluster-members";
import type {
  SitemapOptimizerPostRow,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";

export function buildSitemapOptimizerMarkdownSummary(result: SitemapOptimizerRunResult): string {
  const lines: string[] = [
    "# Sitemap optimizer merge recommendations",
    "",
    `Analyzed: ${result.rows.length} URLs`,
    `Merge groups: ${result.merges.length}`,
    `GSC page misses: ${result.gscMissCount}`,
    `Range: ${result.dateRange.startDate} to ${result.dateRange.endDate}`,
    "",
  ];

  const merges = filterMergeableMerges(result.merges, result.clusters.clusters, result.rows);

  for (const merge of merges) {
    lines.push(`## ${merge.recommendedTitle || merge.clusterId}`);
    lines.push(`Priority: ${merge.priority} | Confidence: ${merge.confidence}`);
    lines.push(`Keyword: ${merge.recommendedPrimaryKeyword}`);
    lines.push(`Meta: ${merge.recommendedMeta}`);
    lines.push("");
    lines.push(merge.rationale);
    lines.push("");
    if (merge.combinedOutline.length) {
      lines.push("### Outline");
      for (const h of merge.combinedOutline) lines.push(`- ${h}`);
      lines.push("");
    }
    for (const keep of merge.whatToKeepFromEach) {
      lines.push(`### Keep from ${keep.title || keep.url}`);
      for (const b of keep.bullets) lines.push(`- ${b}`);
      lines.push("");
    }
    if (merge.redirectOrCanonicalNote) {
      lines.push(`Redirect note: ${merge.redirectOrCanonicalNote}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function csvEsc(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

export function buildSitemapOptimizerCsv(result: SitemapOptimizerRunResult): string {
  const header = [
    "clusterId",
    "priority",
    "recommendedTitle",
    "recommendedPrimaryKeyword",
    "recommendedMeta",
    "memberUrls",
    "outline",
    "rationale",
  ];
  const rows = result.merges.map((m) => {
    const memberUrls = m.whatToKeepFromEach.map((k) => k.url).filter(Boolean).join(" | ");
    return [
      m.clusterId,
      m.priority,
      m.recommendedTitle,
      m.recommendedPrimaryKeyword,
      m.recommendedMeta,
      memberUrls,
      m.combinedOutline.join(" | "),
      m.rationale,
    ]
      .map((c) => csvEsc(String(c ?? "")))
      .join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

/** Bulk template CSV — matches `bulk-auto-generate-template.csv` / parseCSV import. */
export function buildSitemapOptimizerContentSheetCsv(result: SitemapOptimizerRunResult): string {
  return buildContentSheetBulkTemplateCsv(result);
}

export function rowByPostIdMap(rows: SitemapOptimizerPostRow[]): Map<string, SitemapOptimizerPostRow> {
  return new Map(rows.map((r) => [r.postId, r]));
}

export {
  buildSitemapOptimizerContentSheetRedirectCsvCsv,
  buildSitemapOptimizerContentSheetRedirectCsvWideCsv,
} from "@/lib/sitemap-optimizer/build-content-sheet-pulse-redirects";
