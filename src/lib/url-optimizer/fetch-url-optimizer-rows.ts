import type { WordPressSite } from "@/components/integrations/types";
import { stripHtmlToPlainText, truncatePlainText } from "@/lib/sitemap-optimizer/build-cluster-catalog-payload";
import {
  URL_OPTIMIZER_BODY_EXCERPT_MAX,
  URL_OPTIMIZER_CONTENT_CHUNK_SIZE,
  URL_OPTIMIZER_RESOLVE_CHUNK_SIZE,
} from "@/lib/url-optimizer/constants";
import type { UrlOptimizerContentRow, UrlOptimizerInputRow } from "@/lib/url-optimizer/types";
import { normalizeFocusKeywordPhrase } from "@/lib/pulse-redirect-redirect-csv";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { getWordPressPostContent, resolveWordPressUrls } from "@/lib/wordpress-api/posts";
import type { ResolvedUrl, WordPressPostContent } from "@/lib/wordpress-api/types";

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function focusKeywordFromPost(post: WordPressPostContent): string | undefined {
  const full = post.fullData;
  if (!full || typeof full !== "object") return undefined;
  const meta = (full as { meta?: Record<string, unknown> }).meta;
  if (meta && typeof meta === "object") {
    const rm = meta.neo_pulse_seo_focus_keyword ?? meta._neo_pulse_seo_focus_keyword;
    if (typeof rm === "string" && rm.trim()) {
      return normalizeFocusKeywordPhrase(rm) || undefined;
    }
  }
  const acf = (full as { acf?: Record<string, unknown> }).acf;
  if (acf && typeof acf === "object") {
    const kw = acf.keyword_focus ?? acf.focus_keyword;
    if (typeof kw === "string" && kw.trim()) {
      return normalizeFocusKeywordPhrase(kw) || undefined;
    }
  }
  return undefined;
}

function metaFromPost(post: WordPressPostContent): string {
  const full = post.fullData;
  if (full && typeof full === "object") {
    const acf = (full as { acf?: Record<string, unknown> }).acf;
    if (acf && typeof acf === "object") {
      for (const key of ["meta_description", "seo_meta_description"]) {
        const v = acf[key];
        if (typeof v === "string" && v.trim()) return v.trim();
      }
    }
    const meta = (full as { meta?: Record<string, unknown> }).meta;
    if (meta && typeof meta === "object") {
      const rm = meta.neo_pulse_seo_description ?? meta._neo_pulse_seo_description;
      if (typeof rm === "string" && rm.trim()) return rm.trim();
    }
  }
  const excerpt = stripHtmlToPlainText(post.excerpt || "");
  if (excerpt) return truncatePlainText(excerpt, 300);
  const body = stripHtmlToPlainText(post.content || "");
  if (body.length >= 24) return truncatePlainText(body, 300);
  return "";
}

function bodyExcerptFromPost(post: WordPressPostContent): string {
  const plain = stripHtmlToPlainText(post.content || post.excerpt || "");
  return truncatePlainText(plain, URL_OPTIMIZER_BODY_EXCERPT_MAX);
}

function unresolvedRow(row: UrlOptimizerInputRow): UrlOptimizerContentRow {
  return {
    ...row,
    title: "",
    meta: "",
    bodyExcerpt: "",
    contentStatus: "unresolved",
  };
}

export function urlBelongsToSite(pageUrl: string, site: WordPressSite): boolean {
  try {
    const pageHost = new URL(pageUrl.trim()).hostname.replace(/^www\./i, "").toLowerCase();
    const siteHost = new URL(getPublicSiteUrl(site)).hostname.replace(/^www\./i, "").toLowerCase();
    return pageHost === siteHost;
  } catch {
    return false;
  }
}

export async function fetchUrlOptimizerContentRows(args: {
  site: WordPressSite;
  inputRows: UrlOptimizerInputRow[];
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number, phase: "resolve" | "fetch") => void;
}): Promise<UrlOptimizerContentRow[]> {
  const { site, inputRows, signal, onProgress } = args;
  const siteUrl = site.siteUrl.trim();
  const username = site.username.trim();
  const appPassword = site.appPassword.trim();
  const entitySitemapUrl = site.entitySitemapUrl?.trim();

  const resolvedByUrl = new Map<string, ResolvedUrl>();
  const urls = inputRows.map((r) => r.page.trim()).filter(Boolean);
  const resolveChunks = chunk(urls, URL_OPTIMIZER_RESOLVE_CHUNK_SIZE);

  let resolveDone = 0;
  for (const batch of resolveChunks) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const result = await resolveWordPressUrls(
      siteUrl,
      username,
      appPassword,
      batch,
      entitySitemapUrl,
    );
    for (const item of result.resolved ?? []) {
      resolvedByUrl.set(item.url.trim().toLowerCase(), item);
    }
    resolveDone += batch.length;
    onProgress?.(resolveDone, urls.length, "resolve");
  }

  const toFetch: Array<{ input: UrlOptimizerInputRow; resolved: ResolvedUrl }> = [];
  const seenFetchKeys = new Set<string>();

  for (const row of inputRows) {
    const key = row.page.trim().toLowerCase();
    const resolved = resolvedByUrl.get(key);
    if (!resolved || seenFetchKeys.has(key)) continue;
    seenFetchKeys.add(key);
    toFetch.push({ input: row, resolved });
  }

  const fetchChunks = chunk(toFetch, URL_OPTIMIZER_CONTENT_CHUNK_SIZE);
  let fetchDone = 0;
  const postById = new Map<number, WordPressPostContent>();

  for (const batch of fetchChunks) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const resolvedObjects = batch.map(({ resolved }) => ({
      id: resolved.id,
      subtype: resolved.subtype,
    }));
    const contentResult = await getWordPressPostContent(
      siteUrl,
      username,
      appPassword,
      undefined,
      undefined,
      resolvedObjects,
      { entitySitemapUrl },
    );
    for (const post of contentResult.posts ?? []) {
      postById.set(post.id, post);
    }
    fetchDone += batch.length;
    onProgress?.(fetchDone, toFetch.length, "fetch");
  }

  const resolvedContentByPage = new Map<string, UrlOptimizerContentRow>();

  for (const { input, resolved } of toFetch) {
    const key = input.page.trim().toLowerCase();
    if (resolvedContentByPage.has(key)) continue;

    const post = postById.get(resolved.id);
    if (!post) {
      resolvedContentByPage.set(key, unresolvedRow(input));
      continue;
    }
    resolvedContentByPage.set(key, {
      ...input,
      postId: resolved.id,
      subtype: resolved.subtype,
      title: stripHtmlToPlainText(post.title || ""),
      meta: metaFromPost(post),
      bodyExcerpt: bodyExcerptFromPost(post),
      focusKeyword: focusKeywordFromPost(post),
      contentStatus: "resolved",
    });
  }

  return inputRows.map((input) => {
    const hit = resolvedContentByPage.get(input.page.trim().toLowerCase());
    if (hit) {
      return { ...hit, csvUploadRow: input.csvUploadRow };
    }
    return unresolvedRow(input);
  });
}
