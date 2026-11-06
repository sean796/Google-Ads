import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import { overviewTitleOptimizationExcluded } from "@/lib/overview/overview-page-bucket";
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
