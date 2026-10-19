import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { DownloadedSeoFields } from "@/hooks/overview/use-overview-download";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import { downloadFieldsFromInventoryRow, postBodyHtmlFromInventoryRow } from "@/lib/overview/overview-inventory-seo-fields";
import { extractH2TextsFromHtml } from "@/lib/overview/overview-blog-headers-extract";
import { extractInternalLinksFromHtml } from "@/lib/overview/overview-blog-links-extract";
import { parseFaqEntries, serializeFaqEntriesPlain } from "@/lib/faq-entries";
import {
  enforceExactFocusKeyword,
} from "@/hooks/overview/use-overview-ai-optimize";
import { overviewTitlePrimarySegment } from "@/lib/overview/overview-tab-display";
import { overviewBindingForRow } from "@/lib/overview/overview-bulk-seo-payload";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";

/** Prefetch hit for a URL (posts vs pages) used to hydrate Overview rows without /resolve-urls. */
export type OverviewInventoryUrlMatch = {
  row: SitePostInventoryRow;
  subtype: "post" | "page" | string;
};

export type ScrapeMetaForUrlFn = (url: string) => Promise<{
  title: string;
  metaDescription: string;
} | null>;

export type DownloadRowFn = (
  site: WordPressSite | null,
  url: string,
  binding?: OverviewBinding,
) => Promise<DownloadedSeoFields | null>;

export type ResolveBindingsFn = (
  urls: string[],
  site: WordPressSite | null,
  onProgress?: (delta: number, total: number) => void,
  options?: { inventoryOnly?: boolean },
) => Promise<Record<string, OverviewBinding>>;

/** Shared merge: WP excerpt/ACF download fields → row patch (meta is excerpt-only when downloaded). */
export function mergeOverviewRowScrapeFields(
  row: OverviewRow,
  result: { title: string; metaDescription: string } | null,
  downloaded: DownloadedSeoFields | null,
): Partial<OverviewRow> {
  let nextTitle = (result?.title ?? "") || row.title;
  let nextPageHeading = row.pageHeading;
  let nextMeta = row.metaDescription;
  let nextSchema = row.schemaJson;
  let nextFocus = row.focusKeyword;
  let nextFaq = row.faq;
  let nextDateModifier = row.dateModifier;
  let nextSeoResearch = row.seoResearch;

  if (downloaded) {
    nextTitle = downloaded.title ?? nextTitle;
    nextPageHeading = downloaded.pageHeading ?? nextPageHeading;
    nextMeta = downloaded.metaDescription ?? "";
    nextSchema = downloaded.schemaJson ?? nextSchema;
    if (downloaded.focusKeyword?.trim()) {
      nextFocus = downloaded.focusKeyword.trim();
    }
    nextFaq = downloaded.faq !== undefined ? downloaded.faq : nextFaq;
    nextDateModifier = downloaded.dateModifier ?? nextDateModifier;
    nextSeoResearch = downloaded.seoResearch ?? nextSeoResearch;
  } else if (result?.metaDescription) {
    nextMeta = result.metaDescription;
  }

  const focusForCase = (nextFocus ?? "").trim();
  if (focusForCase) {
    nextMeta = nextMeta ? enforceExactFocusKeyword(nextMeta, focusForCase) : nextMeta;
  }
  nextTitle = overviewTitlePrimarySegment(nextTitle ?? "");

  const patch: Partial<OverviewRow> = {
    metaDescription: nextMeta,
    schemaJson: nextSchema,
    focusKeyword: nextFocus,
    faq: nextFaq,
    dateModifier: nextDateModifier,
    seoResearch: nextSeoResearch,
    status: "idle",
  };
  if (nextTitle?.trim()) {
    patch.title = nextTitle;
  }
  if (nextPageHeading?.trim()) {
    patch.pageHeading = overviewTitlePrimarySegment(nextPageHeading);
  }

  return patch;
}

function decodeHtmlEntitiesPlain(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#8217;|&#039;|&apos;/gi, "'")
    .replace(/&#8220;|&#8221;|&quot;|&#34;/gi, '"')
    .replace(/&amp;|&#038;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFaqEntriesFromFloFaqTableHtml(html: string): string | undefined {
  const low = html.toLowerCase();
  let faqStart = low.indexOf('class="flo-faq"');
  if (faqStart === -1) faqStart = low.indexOf("class='flo-faq'");
  if (faqStart === -1) faqStart = low.indexOf('id="faq"');
  if (faqStart === -1) faqStart = low.indexOf("id='faq'");
  if (faqStart === -1) {
    const h2FaqMatch = /<h2[^>]*>\s*(?:faq|frequently asked questions)\s*<\/h2>/i.exec(html);
    if (h2FaqMatch?.index != null) faqStart = h2FaqMatch.index;
  }
  if (faqStart === -1) return undefined;

  const slice = html.slice(faqStart);
  const tableStart = slice.toLowerCase().indexOf("<table");
  if (tableStart === -1) return undefined;
  const tableEnd = slice.toLowerCase().indexOf("</table>", tableStart);
  const tableHtml = tableEnd === -1 ? slice.slice(tableStart) : slice.slice(tableStart, tableEnd);

  const entries: Array<{ question: string; answer: string }> = [];
  let rowCursor = 0;
  const tableLow = tableHtml.toLowerCase();
  while (rowCursor < tableHtml.length) {
    const trOpen = tableLow.indexOf("<tr", rowCursor);
    if (trOpen === -1) break;
    const trClose = tableLow.indexOf("</tr>", trOpen);
    if (trClose === -1) break;
    const trInner = tableHtml.slice(trOpen, trClose);
    const cells: string[] = [];
    let cellCursor = 0;
    const trLow = trInner.toLowerCase();
    while (cellCursor < trInner.length) {
      const tdOpen = trLow.indexOf("<td", cellCursor);
      if (tdOpen === -1) break;
      const tdGt = trInner.indexOf(">", tdOpen);
      if (tdGt === -1) break;
      const tdClose = trLow.indexOf("</td>", tdGt + 1);
      if (tdClose === -1) break;
      cells.push(decodeHtmlEntitiesPlain(trInner.slice(tdGt + 1, tdClose)));
      cellCursor = tdClose + 5;
    }
    if (cells.length >= 2) {
      const q = cells[0]!;
      const a = cells[1]!;
      if (q && !(q.toLowerCase() === "question" && a.toLowerCase() === "answer")) {
        entries.push({ question: q, answer: a });
      }
    }
    rowCursor = trClose + 5;
  }

  return entries.length > 0 ? serializeFaqEntriesPlain(entries) : undefined;
}

/** FAQ JSON-LD or `.flo-faq` / `#faq` table embedded in post HTML (when ACF `faq` is empty). */
export function extractFaqFromPostHtml(html: string): string | undefined {
  const trimmed = (html ?? "").trim();
  if (!trimmed) return undefined;
  let cursor = 0;
  while (cursor < trimmed.length) {
    const open = trimmed.toLowerCase().indexOf("<script", cursor);
    if (open === -1) break;
    const close = trimmed.toLowerCase().indexOf("</script>", open);
    if (close === -1) break;
    const block = trimmed.slice(open, close);
    const ldJson = block.toLowerCase().includes("application/ld+json");
    if (ldJson) {
      const innerStart = trimmed.indexOf(">", open);
      if (innerStart !== -1 && innerStart < close) {
        const inner = trimmed.slice(innerStart + 1, close).trim();
        const entries = parseFaqEntries(inner);
        if (entries.length) return serializeFaqEntriesPlain(entries);
      }
    }
    cursor = close + "</script>".length;
  }
  return extractFaqEntriesFromFloFaqTableHtml(trimmed);
}

function faqFromSeoResearch(seoResearch: string | undefined): string | undefined {
  const raw = (seoResearch ?? "").trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const faqSchema = parsed.faq_schema_ld_json;
    if (faqSchema == null) return undefined;
    const faqText = typeof faqSchema === "string" ? faqSchema : JSON.stringify(faqSchema);
    const entries = parseFaqEntries(faqText);
    return entries.length ? serializeFaqEntriesPlain(entries) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeFaqStorage(raw: string | undefined): string | undefined {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return undefined;
  const entries = parseFaqEntries(trimmed);
  if (!entries.length) return trimmed;
  return serializeFaqEntriesPlain(entries);
}

function resolveScrapedFaq(
  downloadedFaq: string | undefined,
  postContent: string | undefined,
  seoResearch?: string,
): string | undefined {
  const acfFaq = normalizeFaqStorage(downloadedFaq);
  if (acfFaq) return acfFaq;
  if (postContent) {
    const fromHtml = extractFaqFromPostHtml(postContent);
    if (fromHtml) return fromHtml;
  }
  const fromResearch = faqFromSeoResearch(seoResearch);
  if (fromResearch) return fromResearch;
  return undefined;
}

/**
 * One-row patch from prefetched REST inventory (no live scrape, no get-post-meta).
 * Uses the inventory row for this URL when present; optional binding only enforces id consistency.
 */
export function buildOverviewRowPatchFromInventory(
  row: OverviewRow,
  invMatch: OverviewInventoryUrlMatch | undefined,
  binding?: OverviewBinding,
  siteUrl?: string,
): Partial<OverviewRow> | null {
  if (!invMatch?.row) return null;
  const inv = invMatch.row;
  if (!inv.id) {
    const title = (inv.fields?.title ?? "").trim();
    if (!title) return null;
    return {
      title,
      status: "idle" as const,
    };
  }
  if (binding?.postId != null && binding.postId !== inv.id) return null;
  const downloaded = downloadFieldsFromInventoryRow(inv);
  const result = {
    title: downloaded.title || "",
    metaDescription: downloaded.metaDescription || "",
  };
  const base = mergeOverviewRowScrapeFields(row, result, downloaded);
  const postContent =
    postBodyHtmlFromInventoryRow(inv, inv.id) || row.postContent?.trim() || undefined;
  const blogH2List = postContent ? extractH2TextsFromHtml(postContent) : undefined;
  const linkBase = (siteUrl ?? "").trim() || row.url;
  const blogLinkList =
    postContent && linkBase
      ? extractInternalLinksFromHtml(postContent, linkBase, row.url).map((l) => ({
          href: l.href,
          anchor: l.anchor,
        }))
      : undefined;
  const faq = resolveScrapedFaq(base.faq, postContent, base.seoResearch);

  return {
    ...base,
    ...(faq ? { faq } : {}),
    postId: inv.id,
    postType: invMatch.subtype,
    wpDateGmt: inv.date_gmt?.trim() || row.wpDateGmt,
    ...(postContent ? { postContent } : {}),
    ...(blogH2List?.length ? { blogH2List } : {}),
    ...(blogLinkList?.length ? { blogLinkList } : {}),
  };
}

function inventorySubtypeFromCollection(collection: string | undefined): string {
  const coll = (collection ?? "").toLowerCase().trim();
  if (coll === "pages" || coll === "page") return "page";
  if (coll === "posts" || coll === "post") return "post";
  return collection ?? coll;
}

function overviewInventoryMatchFromRow(
  row: OverviewInventoryRow,
): OverviewInventoryUrlMatch {
  return {
    row,
    subtype: inventorySubtypeFromCollection(row.collection),
  };
}

/** Apply title, meta, keyword, date (and body-derived fields when cached) from site prefetch inventory. */
export function hydrateOverviewRowsFromPrefetchInventory(
  rows: OverviewRow[],
  site: WordPressSite,
  prefetchRows: OverviewInventoryRow[] | null | undefined,
): OverviewRow[] {
  if (!prefetchRows?.length) return rows;
  const hasMetadata = prefetchRows.some(
    (r) => r.id || (r.fields?.title ?? "").trim() || (r.fields?.excerpt ?? "").trim(),
  );
  if (!hasMetadata) return rows;

  const byUrl = new Map<string, OverviewInventoryRow>();
  for (const inv of prefetchRows) {
    const url = inv.url?.trim();
    if (!url) continue;
    byUrl.set(normalizePageUrlKey(url), inv);
  }
  if (byUrl.size === 0) return rows;

  return rows.map((row) => {
    const url = row.url?.trim();
    if (!url) return row;
    const inv = byUrl.get(normalizePageUrlKey(url));
    if (!inv) return row;
    const patch = buildOverviewRowPatchFromInventory(
      row,
      overviewInventoryMatchFromRow(inv),
      undefined,
      site.siteUrl,
    );
    if (!patch) return row;
    return { ...row, ...patch };
  });
}

/**
 * Merge row display from binding + inventory and/or live HTML fetch.
 * When `allowLiveMetaFetch === false` and a WordPress site is connected, never calls `scrapeMetaForUrl`.
 */
export async function computeOverviewRowScrapePatch(args: {
  row: OverviewRow;
  site: WordPressSite | null;
  bindings: Record<string, OverviewBinding>;
  scrapeMetaForUrl: ScrapeMetaForUrlFn;
  downloadRow: DownloadRowFn;
  resolveBindings: ResolveBindingsFn;
  getInventoryRow?: (url: string) => SitePostInventoryRow | undefined;
  /** Default true. Set false to block per-URL `/api/overview/fetch-page-meta`. */
  allowLiveMetaFetch?: boolean;
  /** When set, missing bindings skip `/api/wordpress/resolve-urls` (inventory match only). */
  resolveBindingsOptions?: { inventoryOnly?: boolean };
}): Promise<{ ok: true; patch: Partial<OverviewRow> } | { ok: false }> {
  const {
    row,
    site,
    bindings,
    scrapeMetaForUrl,
    resolveBindings,
    getInventoryRow,
  } = args;

  let result: Awaited<ReturnType<ScrapeMetaForUrlFn>> = null;
  let downloaded: Awaited<ReturnType<DownloadRowFn>> = null;

  try {
    if (site) {
      const inv = getInventoryRow?.(row.url);
      let binding = overviewBindingForRow(row, bindings);

      if (!binding && inv?.id) {
        binding = { postId: inv.id, subtype: row.postType ?? "page" };
      }

      if (!binding) {
        const m = await resolveBindings(
          [row.url],
          site,
          undefined,
          { inventoryOnly: true },
        );
        binding = m[row.url];
      }

      if (inv) {
        const dl = downloadFieldsFromInventoryRow(inv);
        downloaded = dl;
        result = {
          title: dl.title || row.title || "",
          metaDescription: dl.metaDescription || "",
        };
      } else {
        result = {
          title: row.title || "",
          metaDescription: row.metaDescription || "",
        };
      }
    } else {
      result = await scrapeMetaForUrl(row.url);
    }
  } catch {
    // keep partial state
  }

  if (!result) {
    return { ok: false };
  }

  return {
    ok: true,
    patch: mergeOverviewRowScrapeFields(row, result, downloaded),
  };
}

/** Hydrate row display from prefetched bulk inventory only (no resolve-urls, no per-row REST). */
export function hydrateOverviewRowsFromInventory(args: {
  rows: OverviewRow[];
  bindings: Record<string, OverviewBinding>;
  getInventoryMatchForUrl: (url: string) => OverviewInventoryUrlMatch | undefined;
  siteUrl?: string;
  onProgress?: (completed: number, total: number) => void;
}): Map<string, Partial<OverviewRow>> {
  const patches = new Map<string, Partial<OverviewRow>>();
  const total = args.rows.length;
  args.rows.forEach((row, index) => {
    const invMatch = args.getInventoryMatchForUrl(row.url);
    const binding = overviewBindingForRow(row, args.bindings);
    const patch = buildOverviewRowPatchFromInventory(row, invMatch, binding, args.siteUrl);
    if (patch) patches.set(normalizePageUrlKey(row.url), patch);
    args.onProgress?.(index + 1, total);
  });
  return patches;
}

const OVERVIEW_SCRAPE_CONCURRENCY = 8;

/** Scrape/hydrate many overview rows in parallel (WordPress inventory + optional live meta). */
export async function scrapeOverviewRowsBatch(args: {
  rows: OverviewRow[];
  site: WordPressSite | null;
  bindings: Record<string, OverviewBinding>;
  scrapeMetaForUrl: ScrapeMetaForUrlFn;
  downloadRow: DownloadRowFn;
  resolveBindings: ResolveBindingsFn;
  getInventoryRow?: (url: string) => SitePostInventoryRow | undefined;
  resolveBindingsOptions?: { inventoryOnly?: boolean };
  onProgress?: (completed: number, total: number) => void;
}): Promise<Map<string, Partial<OverviewRow>>> {
  const patches = new Map<string, Partial<OverviewRow>>();
  const total = args.rows.length;
  let completed = 0;

  for (let start = 0; start < args.rows.length; start += OVERVIEW_SCRAPE_CONCURRENCY) {
    const batch = args.rows.slice(start, start + OVERVIEW_SCRAPE_CONCURRENCY);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      batch.map(async (row) => {
        try {
          const res = await computeOverviewRowScrapePatch({
            row,
            site: args.site,
            bindings: args.bindings,
            scrapeMetaForUrl: args.scrapeMetaForUrl,
            downloadRow: args.downloadRow,
            resolveBindings: args.resolveBindings,
            getInventoryRow: args.getInventoryRow,
            allowLiveMetaFetch: !args.site,
            resolveBindingsOptions: { inventoryOnly: true },
          });
          if (res.ok) patches.set(row.url, res.patch);
        } finally {
          completed += 1;
          args.onProgress?.(completed, total);
        }
      }),
    );
  }

  return patches;
}
