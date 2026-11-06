import type React from "react";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { WordPressSite } from "@/components/integrations/types";
import { getWordPressPostMeta, updateOverviewSeoItem } from "@/lib/wordpress-api/meta";
import type { BulkOverviewSeoResultRow } from "@/lib/wordpress-api/meta";
import { updateWordPressPost } from "@/lib/wordpress-api/crud";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { overviewBindingForRow } from "@/lib/overview/overview-bulk-seo-payload-binding";
import {
  buildOverviewBulkSeoItem,
  overviewDateModifierTodayIso,
  restCollectionEndpointForSubtype,
  type BuildOverviewBulkSeoItemOptions,
  type OverviewBulkSeoApiItem,
} from "@/lib/overview/overview-bulk-seo-payload-item";

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
