import Papa from "papaparse";
import { notify } from "@/lib/app-notifications";
import { BULK_AUTO_GENERATE_TEMPLATE_COLUMNS } from "@/lib/bulk/bulk-auto-generate-template-columns";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { buildSapSlugFromKeywordEntity } from "@/lib/sap-slug-from-keyword-entity";
import { assertSapRowsHaveLinkedWikipedia } from "@/lib/wikipedia/enrich-sap-rows-with-wikipedia";
import { sanitizeSapEntityForExport } from "@/lib/local-seo-strategy-from-grid";
import { NOTIFY_NO_KEYWORD_TARGETS_TO_DOWNLOAD, NOTIFY_NO_ROWS_TO_DOWNLOAD, notifyDownloadedXRowS2, notifyDownloadedXTargetRowS } from "@/lib/notify-messages";

export type KeywordTargetCsvRow = {
  keyword: string;
  entityHint: string;
  sapPages: number;
  clusterId?: string;
  clusterRole?: "seed" | "member";
};

const escCsv = (s: string | undefined) => {
  const t = s ?? "";
  return `"${String(t).replace(/"/g, '""')}"`;
};

/** RFC-style CSV for Local analysis keyword target rows (before or after Generate SAP rows). */
export function buildKeywordTargetsCsvContent(rows: KeywordTargetCsvRow[]): string {
  const headers = ["keyword", "entity_hint", "sap_pages", "cluster_id", "cluster_role"] as const;
  return [
    headers.join(","),
    ...rows
      .filter((r) => r.keyword.trim().length > 0)
      .map((r) =>
        [
          escCsv(r.keyword.trim()),
          escCsv(r.entityHint?.trim() ?? ""),
          String(Math.floor(r.sapPages) || 0),
          escCsv(r.clusterId?.trim() ?? ""),
          escCsv(r.clusterRole ?? ""),
        ].join(","),
      ),
  ].join("\n");
}

export function downloadKeywordTargetsCsv(rows: KeywordTargetCsvRow[], filenameBase: string): void {
  const filtered = rows.filter((r) => r.keyword.trim().length > 0);
  if (filtered.length === 0) {
    notify.error(NOTIFY_NO_KEYWORD_TARGETS_TO_DOWNLOAD);
    return;
  }
  const csvContent = buildKeywordTargetsCsvContent(filtered);
  const safeBase = filenameBase.replace(/[^\w\-]+/g, "-").slice(0, 80) || "keyword-targets";
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeBase}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  notify.success(notifyDownloadedXTargetRowS(filtered.length));
}

export type BulkTemplateCsvExportOptions = {
  marketHint?: string | null;
  /** Entity SAP export: require every entity row to be linked (Wikipedia URL present). */
  requireLinkedWikipedia?: boolean;
  /** Default sitemap_type when a row does not set one (Entity Bulk CSV uses `"entity"`). */
  defaultSitemapType?: "post" | "entity";
};

function resolveExportTargetSlug(row: CSVRow, entityAfter: string): string {
  const existing = row.target_slug?.trim();
  if (!existing) return "";
  const fromKeyword = buildSapSlugFromKeywordEntity(
    row.keyword ?? "",
    entityAfter || (row.entity ?? ""),
  );
  if (fromKeyword.length >= 2 && existing === fromKeyword) return "";
  return existing;
}

/** Matches `public/bulk-auto-generate-template.csv` column order. */
export function buildBulkAutoGenerateTemplateCsvFromRows(
  rows: CSVRow[],
  options?: BulkTemplateCsvExportOptions,
): string {
  const marketHint = options?.marketHint ?? null;
  const defaultSitemapType = options?.defaultSitemapType;
  const objects = rows.map((row) => {
    const entityBefore = row.entity ?? "";
    const entityAfter = sanitizeSapEntityForExport(entityBefore, marketHint);
    const sitemapType =
      row.sitemap_type === "post" || row.sitemap_type === "entity"
        ? row.sitemap_type
        : (defaultSitemapType ?? "");
    return {
      keyword: row.keyword,
      entity: entityAfter,
      title: (row.title ?? "").trim(),
      modifier: row.modifier ?? "",
      featuredImage: row.featuredImage ?? "google-maps",
      publish_date_gmt: (row.publish_date_gmt ?? "").trim(),
      sitemap_type: sitemapType,
      meta_description: (row.meta_description ?? "").trim(),
      target_slug: resolveExportTargetSlug(row, entityAfter),
      wikipedia_url: row.wikipedia_url?.trim() ?? "",
      wikipedia_title: row.wikipedia_title?.trim() ?? "",
    };
  });
  return Papa.unparse(objects, { columns: [...BULK_AUTO_GENERATE_TEMPLATE_COLUMNS] });
}

/** Extended bulk CSV (wiki + questions columns when present). */
export function buildLocalAnalysisBulkCsvContent(rows: CSVRow[]): string {
  const hasWiki = rows.some((r) => r.wikipedia_url?.trim());
  const hasKeywordQuestions = rows.some((r) => r.keyword_questions_json?.trim());
  const headers = [
    "keyword",
    "entity",
    "title",
    "modifier",
    "featuredImage",
    ...(hasWiki ? (["wikipedia_url", "wikipedia_title"] as const) : []),
    ...(hasKeywordQuestions ? (["keyword_questions_json"] as const) : []),
  ];
  const esc = (s: string | undefined) => {
    const t = s ?? "";
    return `"${String(t).replace(/"/g, '""')}"`;
  };

  return [
    headers.join(","),
    ...rows.map((row) => {
      const base = [
        esc(row.keyword),
        esc(row.entity ?? ""),
        esc(row.title),
        esc(row.modifier ?? ""),
        esc(row.featuredImage ?? "google-maps"),
      ];
      if (hasWiki) {
        base.push(esc(row.wikipedia_url ?? ""), esc(row.wikipedia_title ?? ""));
      }
      if (hasKeywordQuestions) {
        base.push(esc(row.keyword_questions_json ?? ""));
      }
      return base.join(",");
    }),
  ].join("\n");
}

/**
 * Proposal strategy Markdown only: competitor + local strategy. **No embedded CSV** (posts and SAP are separate downloads).
 */
export function buildProposalReportMarkdown(strategyMarkdown: string): string {
  return strategyMarkdown.trim();
}

/**
 * Legacy: one Markdown file with embedded bulk CSV. Prefer {@link buildProposalReportMarkdown} + separate CSV downloads for Proposal.
 */
export function buildProposalPackageMarkdown(args: {
  strategyMarkdown: string;
  bulkRows: CSVRow[] | null | undefined;
}): string {
  const strategy = args.strategyMarkdown.trim();
  const rows = args.bulkRows?.length ? args.bulkRows : null;
  const parts: string[] = [];
  if (strategy) parts.push(strategy);
  if (rows) {
    const csv = buildLocalAnalysisBulkCsvContent(rows);
    parts.push(
      `\n\n## Bulk CSV (entity SAP + content posts)\n\n` +
        `Entity / location rows first, then content blog rows. Columns match the standard bulk template.\n\n` +
        `\`\`\`csv\n${csv}\n\`\`\``,
    );
  }
  return parts.join("").trim();
}

/** Download bulk SAP rows as CSV (titles must already be set during Generate). */
export function downloadLocalAnalysisBulkCsv(
  rows: CSVRow[],
  filenameBase: string,
  options?: { skipNotify?: boolean; marketHint?: string | null; requireLinkedWikipedia?: boolean },
): void {
  if (rows.length === 0) {
    notify.error(NOTIFY_NO_ROWS_TO_DOWNLOAD);
    return;
  }

  if (options?.requireLinkedWikipedia) {
    try {
      assertSapRowsHaveLinkedWikipedia(rows);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : String(e));
      return;
    }
  }

  const csvContent = buildBulkAutoGenerateTemplateCsvFromRows(rows, {
    marketHint: options?.marketHint,
    requireLinkedWikipedia: options?.requireLinkedWikipedia,
    defaultSitemapType: options?.requireLinkedWikipedia ? "entity" : undefined,
  });

  const safeBase = filenameBase.replace(/[^\w\-]+/g, "-").slice(0, 80) || "local-analysis";
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeBase}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (!options?.skipNotify) {
    notify.success(notifyDownloadedXRowS2(rows.length));
  }
}
