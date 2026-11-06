import { parseFaqEntries } from "@/lib/faq-entries";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { overviewTitleOptimizationExcluded } from "@/lib/overview/overview-page-bucket";
import {
  OVERVIEW_AI_ALL_META_BRIEF_MAX,
  OVERVIEW_AI_ALL_META_FAQ_MAX,
} from "@/lib/overview/overview-ai-all-meta-batch-constants";

export type AiAllMetaFaqMode = "none" | "seed" | "refine";

export type AiAllMetaCatalogRow = {
  index: number;
  url: string;
  focusKeyword: string;
  existingMeta: string;
  existingTitle: string;
  seoResearchBrief: string;
  faqMode: AiAllMetaFaqMode;
  faqPairCount: number;
  seedCount: number;
  includeTitle: boolean;
  faqExcerpt?: string;
};

export type BuildAiAllMetaCatalogResult = {
  catalog: AiAllMetaCatalogRow[];
  skippedNoBrief: number[];
  skippedNoKeyword: number[];
};

function trimField(value: string | undefined, max: number): string {
  const t = (value ?? "").trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) : t;
}

export function buildAiAllMetaCatalog(
  rows: OverviewRow[],
  sitemapSource: OverviewSitemapSource | undefined,
  bulkAiFaqSeedCount: number,
): BuildAiAllMetaCatalogResult {
  const catalog: AiAllMetaCatalogRow[] = [];
  const skippedNoBrief: number[] = [];
  const skippedNoKeyword: number[] = [];

  rows.forEach((row, index) => {
    if (!row.focusKeyword?.trim()) {
      skippedNoKeyword.push(index);
      return;
    }

    const entries = parseFaqEntries(row.faq);
    let faqMode: AiAllMetaFaqMode = "none";
    let faqPairCount = 0;
    if (entries.length > 0) {
      faqMode = "refine";
      faqPairCount = entries.length;
    } else {
      faqMode = "seed";
      faqPairCount = bulkAiFaqSeedCount;
    }

    const catalogRow: AiAllMetaCatalogRow = {
      index,
      url: row.url.trim(),
      focusKeyword: row.focusKeyword.trim(),
      existingMeta: (row.metaDescription || row.aiMeta || "").trim() || "(none)",
      existingTitle: (row.title || row.aiTitle || "").trim() || "(none)",
      seoResearchBrief: trimField(row.seoResearch, OVERVIEW_AI_ALL_META_BRIEF_MAX),
      faqMode,
      faqPairCount,
      seedCount: bulkAiFaqSeedCount,
      includeTitle: !overviewTitleOptimizationExcluded(row, sitemapSource),
    };

    const faqRaw = (row.faq ?? "").trim();
    catalogRow.faqExcerpt =
      faqMode === "refine" && faqRaw
        ? trimField(faqRaw, OVERVIEW_AI_ALL_META_FAQ_MAX)
        : undefined;

    catalog.push(catalogRow);
  });

  return { catalog, skippedNoBrief, skippedNoKeyword };
}

/** UI-only catalog row before research prep finishes (opens harness editor immediately). */
export function buildProvisionalAiAllMetaCatalogRow(
  row: OverviewRow,
  index: number,
  sitemapSource: OverviewSitemapSource | undefined,
  bulkAiFaqSeedCount: number,
): AiAllMetaCatalogRow | null {
  if (!row.url?.trim()) return null;

  const entries = parseFaqEntries(row.faq);
  let faqMode: AiAllMetaFaqMode = "none";
  let faqPairCount = 0;
  if (entries.length > 0) {
    faqMode = "refine";
    faqPairCount = entries.length;
  } else {
    faqMode = "seed";
    faqPairCount = bulkAiFaqSeedCount;
  }

  const catalogRow: AiAllMetaCatalogRow = {
    index,
    url: row.url.trim(),
    focusKeyword: row.focusKeyword?.trim() || "(pending)",
    existingMeta: (row.metaDescription || row.aiMeta || "").trim() || "(none)",
    existingTitle: (row.title || row.aiTitle || "").trim() || "(none)",
    seoResearchBrief: row.seoResearch?.trim()
      ? trimField(row.seoResearch, OVERVIEW_AI_ALL_META_BRIEF_MAX)
      : "(pending)",
    faqMode,
    faqPairCount,
    seedCount: bulkAiFaqSeedCount,
    includeTitle: !overviewTitleOptimizationExcluded(row, sitemapSource),
  };

  const faqRaw = (row.faq ?? "").trim();
  catalogRow.faqExcerpt =
    faqMode === "refine" && faqRaw
      ? trimField(faqRaw, OVERVIEW_AI_ALL_META_FAQ_MAX)
      : undefined;

  return catalogRow;
}

export function catalogRowToPayload(row: AiAllMetaCatalogRow): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {
    url: row.url,
    focusKeyword: row.focusKeyword,
    existingMeta: row.existingMeta,
    existingTitle: row.existingTitle,
    seoResearchBrief: row.seoResearchBrief,
    faqMode: row.faqMode,
    faqPairCount: row.faqPairCount,
    seedCount: row.seedCount,
    includeTitle: row.includeTitle,
  };
  if (row.faqExcerpt) out.faqExcerpt = row.faqExcerpt;
  return out;
}
