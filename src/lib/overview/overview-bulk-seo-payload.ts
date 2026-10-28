import type React from "react";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import { getWordPressPostMeta, updateOverviewSeoItem } from "@/lib/wordpress-api/meta";
import type { BulkOverviewSeoResultRow } from "@/lib/wordpress-api/meta";
import { updateWordPressPost } from "@/lib/wordpress-api/crud";
import { overviewTitleOptimizationExcluded } from "@/lib/overview/overview-page-bucket";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { dedupeStackedOverviewSections } from "@/lib/overview/overview-blog-overview-prepend";

export type SemrushUploadScope = "meta" | "title";

/** WP REST v2 collection: `page` / `post` → `pages` / `posts`. */
export function restCollectionEndpointForSubtype(subtype: string | undefined): string {
  const s = (subtype ?? "post").toLowerCase();
  if (s === "post" || s === "posts") return "posts";
  if (s === "page" || s === "pages") return "pages";
  return subtype ?? "posts";
}

/** Normalize inventory / binding subtype to WP REST post type slug. */
export function normalizeOverviewBindingSubtype(subtype: string | undefined, rowPostType?: string): string {
  const fromRow = (rowPostType ?? "").trim().toLowerCase();
  if (fromRow === "page" || fromRow === "pages") return "page";
  if (fromRow === "post" || fromRow === "posts") return "post";
  const s = (subtype ?? "post").trim().toLowerCase();
  if (s === "pages") return "page";
  if (s === "posts") return "post";
  return subtype?.trim() || "post";
}

export type OverviewBulkSeoApiItem = {
  postId: number;
  postType: string;
  postTypeEndpoint: string;
  postTitle?: string;
  postExcerpt?: string;
  /** WordPress post body HTML (Headers AISEO optimized). */
  postContent?: string;
  acf: Record<string, string>;
};

export type BuildOverviewBulkSeoItemOptions = {
  /** When true, always sends today's date in `acf.date_modifier` (WordPress upload only). */
  forWordPressUpload?: boolean;
  semrushScope?: SemrushUploadScope;
  /** Warm inventory body when grid row has no postContentOptimized yet. */
  inventoryContent?: string;
};

/** YYYY-MM-DD for ACF `date_modifier` (matches Overview "Update dates" bulk action). */
export function overviewDateModifierTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Push only ACF `date_modifier` for one bound post (no title/meta/body). */
export async function pushOverviewRowDateModifierToAcf(
  site: WordPressSite,
  binding: OverviewBinding,
  dateIso: string,
): Promise<BulkOverviewSeoResultRow | null> {
  const trimmed = dateIso.trim();
  if (!trimmed || !site.username?.trim() || !site.appPassword?.trim()) return null;
  const item: OverviewBulkSeoApiItem = {
    postId: binding.postId,
    postType: binding.subtype,
    postTypeEndpoint: restCollectionEndpointForSubtype(binding.subtype),
    acf: { date_modifier: trimmed },
  };
  return uploadOverviewSeoApiItemAvoidingBatchV1(site, item);
}

/** Push ACF `date_modifier` for each URL that resolves to a WordPress post. */
export async function pushOverviewDateModifiersToAcfForUrls(
  site: WordPressSite,
  bindings: Record<string, OverviewBinding | undefined>,
  rows: OverviewRow[],
  urls: readonly string[],
  dateIso: string,
): Promise<void> {
  const trimmed = dateIso.trim();
  if (!trimmed || urls.length === 0 || !site.username?.trim() || !site.appPassword?.trim()) {
    return;
  }
  const keys = new Set(urls.map((url) => normalizePageUrlKey(url)));
  const seenPostIds = new Set<number>();
  const uploads: Promise<BulkOverviewSeoResultRow | null>[] = [];
  for (const row of rows) {
    if (!keys.has(normalizePageUrlKey(row.url))) continue;
    const binding = overviewBindingForRow(row, bindings);
    if (!binding?.postId || seenPostIds.has(binding.postId)) continue;
    seenPostIds.add(binding.postId);
    uploads.push(pushOverviewRowDateModifierToAcf(site, binding, trimmed));
  }
  await Promise.all(uploads);
}

/** Sync Overview grid date column after a successful content optimization upload. */
export function patchOverviewRowsDateModifierForUrls(
  setRows: React.Dispatch<React.SetStateAction<OverviewRow[]>>,
  urls: readonly string[],
  iso = overviewDateModifierTodayIso(),
): void {
  if (urls.length === 0) return;
  const keys = new Set(urls.map((url) => normalizePageUrlKey(url)));
  setRows((prev) =>
    prev.map((row) =>
      keys.has(normalizePageUrlKey(row.url)) ? { ...row, dateModifier: iso } : row,
    ),
  );
}

/** Body HTML for AISEO upload: cache or grid, no transforms. */
export function resolveOverviewAiseoBodyForUpload(
  row: OverviewRow,
  inventoryContent?: string,
): string {
  return (row.postContentOptimized ?? row.postContent ?? inventoryContent ?? "").trim();
}

/** Upload body HTML from row or warm inventory cache. */
export function resolveOverviewPostContentForUpload(
  row: OverviewRow,
  inventoryContent?: string,
): string {
  const html = (row.postContentOptimized ?? row.postContent ?? inventoryContent ?? "").trim();
  if (!html) return "";
  const lower = html.toLowerCase();
  if (
    (lower.includes("attention required") && lower.includes("cloudflare")) ||
    (lower.includes("just a moment") && lower.includes("cloudflare")) ||
    (lower.startsWith("<!doctype html") && lower.includes("cloudflare"))
  ) {
    return "";
  }
  return dedupeStackedOverviewSections(html);
}

/** @deprecated Use resolveOverviewPostContentForUpload */
export function resolveOverviewHeadersPostContentForUpload(row: OverviewRow): string {
  return resolveOverviewPostContentForUpload(row);
}

/** Map cached WordPress inventory row → bulk SEO PUT item (no grid, no resolve). */
export function buildOverviewBulkSeoItemFromInventory(
  inv: OverviewInventoryRow,
): OverviewBulkSeoApiItem | null {
  const postId = inv.id;
  if (typeof postId !== "number" || !Number.isFinite(postId) || postId <= 0) {
    return null;
  }

  const coll = (inv.collection ?? "posts").trim();
  const subtype =
    coll.toLowerCase() === "posts" || coll.toLowerCase() === "post"
      ? "post"
      : coll.toLowerCase() === "pages" || coll.toLowerCase() === "page"
        ? "page"
        : coll;

  const acfRaw =
    inv.acf && typeof inv.acf === "object" ? (inv.acf as Record<string, unknown>) : {};
  const acfString = (key: string) => {
    const v = acfRaw[key];
    return v != null ? String(v).trim() : "";
  };

  const postTitle = (inv.fields?.title ?? "").trim();
  const postExcerpt = (inv.fields?.meta ?? inv.fields?.excerpt ?? "").trim();

  const acf: Record<string, string> = {
    date_modifier: overviewDateModifierTodayIso(),
  };
  const kw = (inv.fields?.keyword ?? acfString("keyword_focus")).trim();
  if (kw) acf.keyword_focus = kw;
  const faq = acfString("faq");
  if (faq) acf.faq = faq;
  const seo = acfString("seo_research");
  if (seo) acf.seo_research = seo;

  return {
    postId,
    postType: subtype,
    postTypeEndpoint: restCollectionEndpointForSubtype(subtype),
    ...(postTitle ? { postTitle } : {}),
    ...(postExcerpt ? { postExcerpt } : {}),
    acf,
  };
}

/** Map grid row to WordPress REST PUT fields (title, excerpt, ACF). No SEO plugin meta keys. */
export function buildOverviewBulkSeoItem(
  row: OverviewRow,
  binding: OverviewBinding,
  options?: BuildOverviewBulkSeoItemOptions,
): OverviewBulkSeoApiItem | null {
  const restEndpoint = restCollectionEndpointForSubtype(binding.subtype);

  if (options?.semrushScope === "meta") {
    const em = (row.aiMeta || row.metaDescription || "").trim();
    if (!em) return null;
    return {
      postId: binding.postId,
      postType: binding.subtype,
      postTypeEndpoint: restEndpoint,
      postExcerpt: em,
      acf: options?.forWordPressUpload
        ? { date_modifier: overviewDateModifierTodayIso() }
        : {},
    };
  }

  if (options?.semrushScope === "title") {
    const titleExcluded = overviewTitleOptimizationExcluded(row);
    const et = titleExcluded ? "" : (row.aiTitle || row.title || "").trim();
    if (!et) return null;
    return {
      postId: binding.postId,
      postType: binding.subtype,
      postTypeEndpoint: restEndpoint,
      postTitle: et,
      acf: options?.forWordPressUpload
        ? { date_modifier: overviewDateModifierTodayIso() }
        : {},
    };
  }

  const titleExcluded = overviewTitleOptimizationExcluded(row);
  const et = titleExcluded ? "" : (row.aiTitle || row.title || "").trim();
  const em = (row.aiMeta || row.metaDescription || "").trim();
  const focusTrimmed = (row.focusKeyword ?? "").trim();
  const seoTrimmed = (row.seoResearch ?? "").trim();
  const faqRaw = (row.faq ?? "").trim();
  const dateRaw = (row.dateModifier ?? "").trim();
  const postContentForUpload = resolveOverviewPostContentForUpload(
    row,
    options?.inventoryContent,
  );

  const hasGridFields =
    Boolean(et || em || focusTrimmed || faqRaw || dateRaw || seoTrimmed || postContentForUpload);
  if (!hasGridFields && !options?.forWordPressUpload) {
    return null;
  }

  const acf: Record<string, string> = {};
  if (focusTrimmed) acf.keyword_focus = focusTrimmed;
  if (faqRaw) acf.faq = faqRaw;
  const dateForPayload = options?.forWordPressUpload ? overviewDateModifierTodayIso() : dateRaw;
  if (dateForPayload) {
    acf.date_modifier = dateForPayload;
  }
  if (seoTrimmed) acf.seo_research = seoTrimmed;

  return {
    postId: binding.postId,
    postType: binding.subtype,
    postTypeEndpoint: restEndpoint,
    ...(et ? { postTitle: et } : {}),
    ...(em ? { postExcerpt: em } : {}),
    ...(postContentForUpload ? { postContent: postContentForUpload } : {}),
    acf,
  };
}

export type OverviewUploadPayloadBundle = {
  item: OverviewBulkSeoApiItem;
  /** Premade JSON for REST upload (post fields + acf + ids). */
  payloadJson: string;
  payloadDoc: Record<string, unknown>;
};

/** Map grid row + binding to premade upload JSON (sync; no live WP hydrate). */
export function buildOverviewUploadPayloadBundle(
  row: OverviewRow,
  binding: OverviewBinding,
  options?: BuildOverviewBulkSeoItemOptions,
): OverviewUploadPayloadBundle | null {
  const item = buildOverviewBulkSeoItem(row, binding, options);
  if (!item) return null;
  const pageUrl = row.url?.trim() ?? "";
  const payloadDoc: Record<string, unknown> = {
    pageUrl,
    postId: item.postId,
    postType: item.postType,
    postTypeEndpoint: item.postTypeEndpoint,
    postTitle: item.postTitle ?? null,
    postExcerpt: item.postExcerpt ?? null,
    postContent: item.postContent ?? null,
    acf: item.acf,
  };
  const payloadJson = JSON.stringify(payloadDoc, null, 2);
  return { item, payloadJson, payloadDoc };
}

/**
 * Prompt-style WordPress write: never POST /wp-json/batch/v1.
 * Body HTML → update-post PUT; meta/ACF → update-overview-seo-item (server direct PUT).
 */
export async function uploadOverviewSeoApiItemAvoidingBatchV1(
  site: WordPressSite,
  item: OverviewBulkSeoApiItem,
): Promise<BulkOverviewSeoResultRow> {
  const content = item.postContent?.trim() ?? "";
  const title = item.postTitle?.trim() || "";
  const excerpt = item.postExcerpt?.trim() || "";

  if (content) {
    const updateRes = await updateWordPressPost(
      site.siteUrl,
      site.username!,
      site.appPassword!,
      item.postId,
      title || " ",
      content,
      excerpt || undefined,
      undefined,
      item.postType || "post",
      undefined,
      undefined,
      undefined,
      undefined,
      item.postTypeEndpoint,
    );
    if (!updateRes.success) {
      return {
        postId: item.postId,
        ok: false,
        error: updateRes.error || "WordPress update-post failed",
        method: "update_post",
        link: updateRes.link,
      };
    }
    if (updateRes.contentSaveWarning) {
      return {
        postId: item.postId,
        ok: false,
        error: updateRes.contentSaveWarning,
        method: "update_post",
        link: updateRes.link,
      };
    }
    const acf: Record<string, string> =
      item.acf && typeof item.acf === "object" ? { ...item.acf } : {};
    if (!String(acf.date_modifier ?? "").trim()) {
      acf.date_modifier = overviewDateModifierTodayIso();
    }
    const hasAcf = Object.keys(acf).some((k) => String(acf[k] ?? "").trim());
    if (!hasAcf) {
      return { postId: item.postId, ok: true, method: "update_post", link: updateRes.link };
    }
    const acfRes = await updateOverviewSeoItem(site.siteUrl, site.username!, site.appPassword!, {
      postId: item.postId,
      postType: item.postType,
      postTypeEndpoint: item.postTypeEndpoint,
      acf,
    });
    if (!acfRes.ok) {
      return {
        postId: item.postId,
        ok: false,
        error: acfRes.error || "ACF save failed after content upload",
        method: "update_post+acf",
        mergeError: acfRes.error,
        link: updateRes.link,
      };
    }
    return { postId: item.postId, ok: true, method: "update_post+acf", link: updateRes.link };
  }

  const row = await updateOverviewSeoItem(
    site.siteUrl,
    site.username!,
    site.appPassword!,
    item,
  );
  return {
    postId: row.postId ?? item.postId,
    ok: Boolean(row.ok),
    error: row.error,
    method: row.method || "direct_put",
    mergeError: row.mergeError,
    httpStatus: row.httpStatus,
  };
}

/** One upload path for title, meta, keyword, date, seo_research, faq, and body HTML. */
export async function uploadOverviewRowSeoToWordPress(
  site: WordPressSite,
  row: OverviewRow,
  binding: OverviewBinding,
  options?: Pick<BuildOverviewBulkSeoItemOptions, "inventoryContent">,
): Promise<{ ok: boolean; error?: string; link?: string }> {
  const item = buildOverviewBulkSeoItem(row, binding, {
    forWordPressUpload: true,
    inventoryContent: options?.inventoryContent,
  });
  if (!item) {
    return { ok: false, error: "Nothing to upload for this row." };
  }
  const rowRes = await uploadOverviewSeoApiItemAvoidingBatchV1(site, item);
  if (!rowRes.ok) {
    return { ok: false, error: rowRes.error || "WordPress rejected the update." };
  }
  return { ok: true, link: rowRes.link };
}

/** Find binding when the grid URL changed but postId is still known. */
export function findOverviewBindingByPostId(
  bindings: Record<string, OverviewBinding | undefined>,
  postId: number,
): OverviewBinding | undefined {
  for (const binding of Object.values(bindings)) {
    if (binding?.postId === postId) return binding;
  }
  return undefined;
}

/** URL-keyed binding lookup (exact, then normalized key). */
export function overviewBindingFromUrlMap(
  url: string,
  bindings: Record<string, OverviewBinding | undefined>,
): OverviewBinding | undefined {
  const direct = bindings[url];
  if (direct?.postId) return direct;
  const target = normalizePageUrlKey(url);
  if (!target) return undefined;
  const byKey = bindings[target];
  if (byKey?.postId) return byKey;
  for (const [key, binding] of Object.entries(bindings)) {
    if (binding?.postId && normalizePageUrlKey(key) === target) return binding;
  }
  return undefined;
}

/** Binding from URL map, or from row fields after inventory hydrate. */
export function overviewBindingForRow(
  row: OverviewRow,
  bindings: Record<string, OverviewBinding | undefined>,
): OverviewBinding | undefined {
  const direct = overviewBindingFromUrlMap(row.url, bindings);
  if (direct?.postId) return direct;
  const postId = row.postId;
  if (postId != null && Number.isFinite(postId) && postId > 0) {
    const fromMap = findOverviewBindingByPostId(bindings, postId);
    const subtype = normalizeOverviewBindingSubtype(fromMap?.subtype, row.postType);
    return {
      postId,
      subtype,
      date_gmt: fromMap?.date_gmt ?? (row.wpDateGmt?.trim() || undefined),
    };
  }
  return undefined;
}

type InventoryBindingHit = {
  row: { id: number; date_gmt?: string | null };
  subtype: string;
};

/** Grid row + optional cached inventory match; no live REST bind step. */
export function resolveOverviewBindingForRow(
  row: OverviewRow,
  bindings: Record<string, OverviewBinding | undefined>,
  invMatch?: InventoryBindingHit | null,
): OverviewBinding | undefined {
  const fromUrlMap = overviewBindingFromUrlMap(row.url, bindings);
  const fromInv =
    invMatch?.row?.id != null && Number.isFinite(invMatch.row.id) && invMatch.row.id > 0
      ? {
          postId: invMatch.row.id,
          subtype: invMatch.subtype,
          date_gmt: invMatch.row.date_gmt?.trim() || undefined,
        }
      : undefined;

  // URL inventory wins over a stale row.postId / mismatched map entry.
  if (fromInv?.postId) {
    if (fromUrlMap?.postId && fromUrlMap.postId !== fromInv.postId) return fromInv;
    if (
      row.postId != null &&
      Number.isFinite(row.postId) &&
      row.postId > 0 &&
      row.postId !== fromInv.postId
    ) {
      return fromInv;
    }
    if (fromUrlMap?.postId) return fromUrlMap;
    return fromInv;
  }

  if (fromUrlMap?.postId) return fromUrlMap;

  const fromRowFields = overviewBindingForRow(row, bindings);
  if (!fromRowFields?.postId) return undefined;

  // Same postId may still be keyed under a prior URL (canonical permalink sync).
  // Reuse that binding; do not drop the known postId.
  const rowKey = normalizePageUrlKey(row.url);
  for (const [key, binding] of Object.entries(bindings)) {
    if (!binding?.postId || binding.postId !== fromRowFields.postId) continue;
    if (normalizePageUrlKey(key) === rowKey) return fromRowFields;
    return {
      postId: binding.postId,
      subtype: binding.subtype || fromRowFields.subtype,
      date_gmt: binding.date_gmt ?? fromRowFields.date_gmt,
    };
  }
  return fromRowFields;
}

/** Sync payload from in-app grid + bindings (no WP hydrate, no URL resolve). */
export function collectOverviewBulkSeoItemsFromGrid(
  rows: OverviewRow[],
  bindings: Record<string, OverviewBinding | undefined>,
): { items: OverviewBulkSeoApiItem[]; rowIndices: number[] } {
  const items: OverviewBulkSeoApiItem[] = [];
  const rowIndices: number[] = [];
  rows.forEach((row, index) => {
    const binding = overviewBindingForRow(row, bindings);
    if (!binding?.postId) return;
    const item = buildOverviewBulkSeoItem(row, binding);
    if (!item) return;
    items.push(item);
    rowIndices.push(index);
  });
  return { items, rowIndices };
}

function plainRenderedMetaText(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (!/[<>&]/.test(s)) return s;
  if (typeof document !== "undefined") {
    const el = document.createElement("div");
    el.innerHTML = s;
    return el.textContent?.trim() ?? s;
  }
  return s;
}

/**
 * Like `buildOverviewBulkSeoItem`, but when the grid is empty pulls title / excerpt
 * from WordPress once so Update WP still works on fresh rows.
 */
export async function buildOverviewBulkSeoItemWithOptionalWpHydrate(
  site: WordPressSite,
  row: OverviewRow,
  binding: OverviewBinding,
): Promise<OverviewBulkSeoApiItem | null> {
  const direct = buildOverviewBulkSeoItem(row, binding);
  if (direct) return direct;

  let srcTitle = row.title;
  let srcMeta = row.metaDescription;
  let srcAiTitle = row.aiTitle;
  let srcAiMeta = row.aiMeta;
  const focusKeyword = row.focusKeyword;
  const faq = row.faq;
  const dateModifier = row.dateModifier;
  const seoResearch = row.seoResearch;

  const computeEffective = () => {
    const et = (srcAiTitle || srcTitle || "").trim();
    const em = (srcAiMeta || srcMeta || "").trim();
    return { effectiveTitle: et, effectiveMeta: em };
  };

  let { effectiveTitle, effectiveMeta } = computeEffective();
  const seoTrimmed = (seoResearch ?? "").trim();
  const focusTrimmedEarly = (focusKeyword ?? "").trim();

  const wouldBailEmptyGrid =
    !effectiveTitle &&
    !effectiveMeta &&
    !focusTrimmedEarly &&
    !(faq ?? "").trim() &&
    !(dateModifier ?? "").trim() &&
    !seoTrimmed;

  if (!wouldBailEmptyGrid) {
    return null;
  }

  const restEndpoint = restCollectionEndpointForSubtype(binding.subtype);
  try {
    const cur = await getWordPressPostMeta(
      site.siteUrl,
      site.username,
      site.appPassword,
      binding.postId,
      binding.subtype,
      restEndpoint,
    );
    if (cur.success) {
      const wpTitle = plainRenderedMetaText(cur.title);
      const excerptPlain = plainRenderedMetaText(cur.excerpt);
      if (!(srcTitle ?? "").trim() && !(srcAiTitle ?? "").trim()) {
        srcTitle = wpTitle;
        srcAiTitle = srcTitle;
      }
      if (!(srcMeta ?? "").trim() && !(srcAiMeta ?? "").trim()) {
        srcMeta = excerptPlain;
        srcAiMeta = srcMeta;
      }
    }
  } catch {
    return null;
  }

  ({ effectiveTitle, effectiveMeta } = computeEffective());
  if (
    !effectiveTitle &&
    !effectiveMeta &&
    !focusTrimmedEarly &&
    !(faq ?? "").trim() &&
    !(dateModifier ?? "").trim() &&
    !seoTrimmed
  ) {
    return null;
  }

  const hydrated: OverviewRow = {
    ...row,
    title: srcTitle,
    metaDescription: srcMeta,
    aiTitle: srcAiTitle,
    aiMeta: srcAiMeta,
  };
  return buildOverviewBulkSeoItem(hydrated, binding, { forWordPressUpload: true });
}
