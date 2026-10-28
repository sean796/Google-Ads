import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { reclaimBloatedLocalStorageQuota } from "@/lib/local-analysis/site-prefetch-persist";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { clearOverviewSitemapLoadFingerprints } from "@/lib/overview/overview-sitemap-load-cache";
import { saveOverviewStudioSnapshotToServer } from "@/lib/overview/overview-studio-snapshot-api";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

const ACTIVE_STUDIO_URL_PREFIX = "neo-pulse-overview-studio-active-url-v1:";
const LOCAL_OVERVIEW_ROWS_PREFIX = "neo-pulse-overview-rows-local:v4:";
const LOCAL_ACTIVE_ROW_BODY_PREFIX = "neo-pulse-overview-active-row-body:v1:";

function cacheKey(siteId: string, source: OverviewSitemapSource): string {
  return `neo-pulse-overview-rows-v4:${siteId}:${source}`;
}

function localOverviewRowsKey(siteId: string, source: OverviewSitemapSource): string {
  return `${LOCAL_OVERVIEW_ROWS_PREFIX}${siteId}:${source}`;
}

function localActiveRowBodyKey(siteId: string, source: OverviewSitemapSource): string {
  return `${LOCAL_ACTIVE_ROW_BODY_PREFIX}${siteId}:${source}`;
}

const memoryByKey = new Map<string, OverviewRow[]>();

function normalizeStoredRow(row: OverviewRow): OverviewRow {
  return {
    ...row,
    status: "idle",
    aiTitle: row.aiTitle ?? "",
    aiMeta: row.aiMeta ?? "",
    metaDescription: row.metaDescription ?? "",
    title: row.title ?? "",
    pageHeading: row.pageHeading ?? "",
  };
}

/** Strip multi-MB HTML / Elementor JSON / SEO research from non-active list rows so localStorage never hits 5MB quota. */
function slimRowForLocalStorageList(row: OverviewRow): OverviewRow {
  const {
    postContent: _pc,
    postContentOptimized: _pco,
    elementorDataJson: _edj,
    blogH2OptimizedHtml: _h2h,
    blogFaqAppendedHtml: _faqh,
    blogLinksWeavedHtml: _lwh,
    blogWikipediaLinkedHtml: _wiki,
    seoResearch: _sr,
    contentAnalyzeBulletsMarkdown: _cab,
    blogH2PlanJson: _h2p,
    ...slim
  } = normalizeStoredRow(row);
  return slim;
}

function readStoredActiveUrl(siteId: string): string | null {
  try {
    return localStorage.getItem(`${ACTIVE_STUDIO_URL_PREFIX}${siteId}`)?.trim() || null;
  } catch {
    return null;
  }
}

function readLocalActiveRowBody(siteId: string, source: OverviewSitemapSource): OverviewRow | null {
  try {
    const raw = localStorage.getItem(localActiveRowBodyKey(siteId, source));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OverviewRow;
    if (!parsed?.url?.trim()) return null;
    return normalizeStoredRow(parsed);
  } catch {
    return null;
  }
}

export function writeLocalActiveRowBody(
  siteId: string,
  source: OverviewSitemapSource,
  row: OverviewRow | null | undefined,
): void {
  if (!row?.url?.trim()) return;
  const payload = JSON.stringify(normalizeStoredRow(row));
  try {
    localStorage.setItem(localActiveRowBodyKey(siteId, source), payload);
  } catch {
    reclaimBloatedLocalStorageQuota();
    try {
      localStorage.setItem(localActiveRowBodyKey(siteId, source), payload);
    } catch {
      // quota
    }
  }
}

function readLocalOverviewRows(
  siteId: string,
  source: OverviewSitemapSource,
): OverviewRow[] | null {
  try {
    const raw = localStorage.getItem(localOverviewRowsKey(siteId, source));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OverviewRow[];
    if (!Array.isArray(parsed) || !parsed.length) return null;
    if (!parsed.some((r) => Boolean(r?.title?.trim() || r?.pageHeading?.trim()))) {
      localStorage.removeItem(localOverviewRowsKey(siteId, source));
      return null;
    }
    const activeBody = readLocalActiveRowBody(siteId, source);
    const activeKey = activeBody ? normalizePageUrlKey(activeBody.url) : "";
    const rows = parsed
      .filter((r) => r?.url?.trim())
      .map((r) => {
        const norm = normalizeStoredRow(r);
        if (activeBody && activeKey && normalizePageUrlKey(norm.url) === activeKey) {
          return { ...norm, ...activeBody };
        }
        return norm;
      });
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

function writeLocalOverviewRows(
  siteId: string,
  source: OverviewSitemapSource,
  rows: OverviewRow[],
): void {
  const payload = JSON.stringify(rows.map(slimRowForLocalStorageList));
  try {
    localStorage.setItem(localOverviewRowsKey(siteId, source), payload);
  } catch {
    reclaimBloatedLocalStorageQuota();
    try {
      localStorage.setItem(localOverviewRowsKey(siteId, source), payload);
    } catch {
      // quota
    }
  }
  const activeUrl = readStoredActiveUrl(siteId) ?? rows[0]?.url ?? null;
  if (activeUrl) {
    const activeKey = normalizePageUrlKey(activeUrl);
    const activeRow =
      rows.find((r) => normalizePageUrlKey(r.url) === activeKey) ?? rows[0];
    if (activeRow) {
      writeLocalActiveRowBody(siteId, source, activeRow);
    }
  }
}

function cacheHasRealTitles(rows: OverviewRow[] | null | undefined): boolean {
  if (!rows?.length) return false;
  return rows.some((r) => Boolean(r?.title?.trim() || r?.pageHeading?.trim()));
}

export function getOverviewRowsSessionCache(
  siteId: string,
  source: OverviewSitemapSource,
): OverviewRow[] | null {
  const key = cacheKey(siteId, source);
  const mem = memoryByKey.get(key);
  if (cacheHasRealTitles(mem)) return mem!.map(normalizeStoredRow);

  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as OverviewRow[];
      if (Array.isArray(parsed) && parsed.length) {
        const rows = parsed.filter((r) => r?.url?.trim()).map(normalizeStoredRow);
        if (cacheHasRealTitles(rows)) {
          memoryByKey.set(key, rows);
          return rows;
        }
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    /* try local */
  }

  const local = readLocalOverviewRows(siteId, source);
  if (cacheHasRealTitles(local)) {
    memoryByKey.set(key, local!);
    return local;
  }
  return null;
}

export function setOverviewRowsSessionCache(
  siteId: string,
  source: OverviewSitemapSource,
  rows: OverviewRow[],
  options?: { skipServerSync?: boolean },
): void {
  if (!rows.length || !cacheHasRealTitles(rows)) return;
  const key = cacheKey(siteId, source);
  const existing = memoryByKey.get(key) ?? readLocalOverviewRows(siteId, source) ?? [];
  const existingByKey = new Map(
    existing.map((r) => [normalizePageUrlKey(r.url), r] as const),
  );
  const snapshot = rows.map((row) => {
    const norm = normalizeStoredRow(row);
    const prev = existingByKey.get(normalizePageUrlKey(norm.url));
    if (!prev) return norm;
    return {
      ...prev,
      ...norm,
      title: norm.title?.trim() ? norm.title : prev.title,
      pageHeading: norm.pageHeading?.trim() ? norm.pageHeading : prev.pageHeading,
      metaDescription: norm.metaDescription?.trim() ? norm.metaDescription : prev.metaDescription,
      focusKeyword: norm.focusKeyword?.trim() ? norm.focusKeyword : prev.focusKeyword,
      postContent: norm.postContent?.trim() ? norm.postContent : prev.postContent,
      postContentOptimized: norm.postContentOptimized?.trim()
        ? norm.postContentOptimized
        : prev.postContentOptimized,
      elementorDataJson: norm.elementorDataJson?.trim()
        ? norm.elementorDataJson
        : prev.elementorDataJson,
      elementorSectionHeaders: norm.elementorSectionHeaders?.length
        ? norm.elementorSectionHeaders
        : prev.elementorSectionHeaders,
      blogH2List: norm.blogH2List?.length ? norm.blogH2List : prev.blogH2List,
      faq: norm.faq?.trim() ? norm.faq : prev.faq,
      seoResearch: norm.seoResearch?.trim() ? norm.seoResearch : prev.seoResearch,
    };
  });
  memoryByKey.set(key, snapshot);
  try {
    sessionStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // quota or private mode
  }
  writeLocalOverviewRows(siteId, source, snapshot);
  if (!options?.skipServerSync) {
    saveOverviewStudioSnapshotToServer(
      siteId,
      source,
      snapshot,
      readStoredActiveUrl(siteId) ?? snapshot[0]?.url ?? null,
    );
  }
}

export function clearOverviewRowsSessionCache(siteId: string): void {
  clearOverviewSitemapLoadFingerprints(siteId);
  for (const source of ["pages", "posts", "sap"] as const) {
    const key = cacheKey(siteId, source);
    memoryByKey.delete(key);
    try {
      sessionStorage.removeItem(key);
      localStorage.removeItem(localOverviewRowsKey(siteId, source));
      localStorage.removeItem(localActiveRowBodyKey(siteId, source));
    } catch {
      // ignore
    }
  }
}

function rowsByNormalizedUrl(rows: Map<string, OverviewRow>): Map<string, OverviewRow> {
  const map = new Map<string, OverviewRow>();
  for (const [url, row] of rows) {
    const key = normalizePageUrlKey(url) || normalizePageUrlKey(row.url);
    if (key && !map.has(key)) map.set(key, row);
  }
  return map;
}

/** Merge sitemap URL list with cached row data (editor fields preserved on remount). */
export function mergeOverviewRowsForSitemapLoad(
  urls: string[],
  existingByUrl: Map<string, OverviewRow>,
  sessionByUrl: Map<string, OverviewRow>,
  emptyRow: (url: string) => OverviewRow,
): OverviewRow[] {
  const existingNorm = rowsByNormalizedUrl(existingByUrl);
  const sessionNorm = rowsByNormalizedUrl(sessionByUrl);
  return urls.map((url) => {
    const key = normalizePageUrlKey(url);
    const existing = existingByUrl.get(url) ?? (key ? existingNorm.get(key) : undefined);
    const session = sessionByUrl.get(url) ?? (key ? sessionNorm.get(key) : undefined);
    const base = existing || session || emptyRow(url);
    return {
      ...base,
      url,
      postId: base.postId ?? null,
      postType: base.postType ?? null,
      wpStatus: base.wpStatus,
      wpDateGmt: base.wpDateGmt,
      status: "idle",
    };
  });
}
