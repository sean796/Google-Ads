import { useCallback } from "react";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { NOTIFY_CONNECT_A_WORDPRESS_SITE_TO_SCRAPE_FROM_, NOTIFY_FINISHED_SCRAPING_ALL_ROWS, NOTIFY_LOAD_THIS_TAB_S_INVENTORY_FIRST_SCRAPE_R, NOTIFY_NO_WORDPRESS_POST_ID_FOR_THIS_URL_REFRES, NOTIFY_POST_SEO_AND_URL_SAVED_TO_WORDPRESS, NOTIFY_POST_SEO_SAVED_TO_WORDPRESS, NOTIFY_POST_URL_SAVED_TO_WORDPRESS, NOTIFY_SUGGESTED_URL_COULD_NOT_BE_PARSED_RUN_AI } from "@/lib/notify-messages";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import {
  overviewDateModifierTodayIso,
  resolveOverviewBindingForRow,
  uploadOverviewRowSeoToWordPress,
} from "@/lib/overview/overview-bulk-seo-payload";
import {
  applyOverviewRowSlugChangeToWordPress,
  overviewRowSlugChangePlan,
} from "@/lib/overview/overview-change-post-url";
import {
  buildOverviewRowPatchFromInventory,
  extractFaqFromPostHtml,
  hydrateOverviewRowsFromInventory,
} from "@/lib/overview/overview-row-scrape";
import { fetchLiveWordPressPostBodyForRow } from "@/lib/overview/overview-aiseo-source-html";
import { extractH2TextsFromHtml } from "@/lib/overview/overview-blog-headers-extract";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { initBulkSliceWithStatus } from "@/lib/overview/overview-bulk-inline-status";
import {
  advanceBulkSliceBatchProgress,
  initBulkSliceBatchHarness,
} from "@/lib/overview/overview-batch-pipeline-progress";
import { ensureOverviewInventoryIncludesContent } from "@/lib/overview/overview-inventory-content-prefetch";
import { overviewRowsInBulkScope } from "@/lib/overview/overview-bulk-row-scope";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

type Args = Pick<
  OverviewTabBase,
  | "rows"
  | "setRows"
  | "bindings"
  | "resolveBindings"
  | "downloadRow"
  | "scrapeMetaForUrl"
  | "updateRow"
  | "getInventoryRow"
  | "setBulkActionProgress"
  | "remapBindingUrl"
  | "mergeInventoryContentForSource"
> & {
  site: WordPressSite | undefined;
  sitemapSource: OverviewSitemapSource;
  bulkScopeUrlKeys: Set<string>;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
  hydrateElementorRowAtIndex?: (index: number) => Promise<boolean>;
};

export function useOverviewTabScrapeWp({
  site,
  sitemapSource,
  rows,
  setRows,
  bindings,
  resolveBindings,
  downloadRow,
  scrapeMetaForUrl,
  updateRow,
  getInventoryRow,
  getInventoryMatchForUrl,
  setBulkActionProgress,
  remapBindingUrl,
  mergeInventoryContentForSource,
  bulkScopeUrlKeys,
  hydrateElementorRowAtIndex,
}: Args) {
  const handleUpdateWordPressForRow = useCallback(
    async (
      row: OverviewRow,
      options?: { silent?: boolean; binding?: OverviewBinding; rowIndex?: number },
    ): Promise<boolean> => {
      try {
        if (!site) return false;

        const invMatch = getInventoryMatchForUrl(site, row.url);
        let binding =
          options?.binding ?? resolveOverviewBindingForRow(row, bindings, invMatch);
        if (!binding?.postId) {
          if (!options?.silent) {
            notify.error(NOTIFY_NO_WORDPRESS_POST_ID_FOR_THIS_URL_REFRES);
          }
          return false;
        }

        const rowIndex = options?.rowIndex;
        if (rowIndex !== undefined) {
          updateRow(rowIndex, { status: "uploading" });
        }

        const slugPlan = overviewRowSlugChangePlan(row);
        const suggestedPath = row.aiSuggestedPath?.trim() ?? "";
        let uploadOk = false;
        let uploadLink: string | undefined;
        let slugChangeAttempted = false;
        let slugChangeOk = true;
        let newPermalink: string | undefined;

        try {
          const result = await uploadOverviewRowSeoToWordPress(site, row, binding);
          uploadOk = result.ok;
          uploadLink = result.link?.trim() || undefined;
          if (!uploadOk && !options?.silent && !suggestedPath) {
            notify.error(result.error || "WordPress rejected the update.");
          } else if (!uploadOk && !options?.silent && suggestedPath) {
            notify.error(result.error || "WordPress rejected the SEO update.");
          }
        } catch (e) {
          if (!options?.silent && !suggestedPath) {
            notify.error(e instanceof Error ? e.message : "Update WordPress failed.");
          } else if (!options?.silent && suggestedPath) {
            notify.error(e instanceof Error ? e.message : "SEO update failed.");
          }
        }

        if (suggestedPath && !slugPlan.needed && !options?.silent) {
          notify.error(NOTIFY_SUGGESTED_URL_COULD_NOT_BE_PARSED_RUN_AI);
        }

        if (slugPlan.needed && slugPlan.slug) {
          slugChangeAttempted = true;
          try {
            const slugResult = await applyOverviewRowSlugChangeToWordPress(site, row, binding);
            slugChangeOk = slugResult.ok;
            newPermalink = slugResult.permalink;
            if (!slugChangeOk && !options?.silent) {
              notify.error(slugResult.error || "WordPress rejected the new URL slug.");
            }
          } catch (e) {
            slugChangeOk = false;
            if (!options?.silent) {
              notify.error(e instanceof Error ? e.message : "Slug update failed.");
            }
          }
        }

        if (rowIndex !== undefined) {
          updateRow(rowIndex, { status: "idle" });
        }

        const overallOk = (slugChangeAttempted && slugChangeOk) || uploadOk;
        if (!overallOk) {
          return false;
        }

        const oldUrl = row.url?.trim() ?? "";
        const rowPatch: Partial<OverviewRow> = {
          dateModifier: overviewDateModifierTodayIso(),
          postId: binding.postId,
          postType: binding.subtype,
        };
        let syncedUrl: string | undefined;
        if (slugChangeAttempted && slugChangeOk) {
          rowPatch.aiSuggestedPath = "";
          syncedUrl = newPermalink || slugPlan.newUrl || undefined;
          if (syncedUrl) {
            rowPatch.url = syncedUrl;
          }
          if (oldUrl && syncedUrl && oldUrl !== syncedUrl) {
            rowPatch.slugRedirectSourceUrl = oldUrl;
          }
        } else if (uploadOk && uploadLink) {
          // Keep the sheet on the WordPress canonical permalink after content write.
          const canon = uploadLink.trim();
          if (canon && normalizePageUrlKey(canon) !== normalizePageUrlKey(oldUrl)) {
            syncedUrl = canon;
            rowPatch.url = canon;
          }
        }
        if (rowIndex !== undefined) {
          updateRow(rowIndex, rowPatch);
        }
        if (syncedUrl && oldUrl && syncedUrl !== oldUrl) {
          remapBindingUrl(oldUrl, syncedUrl);
        }

        if (!options?.silent) {
          if (slugChangeAttempted && slugChangeOk && uploadOk) {
            notify.success(NOTIFY_POST_SEO_AND_URL_SAVED_TO_WORDPRESS);
          } else if (slugChangeAttempted && slugChangeOk) {
            notify.success(NOTIFY_POST_URL_SAVED_TO_WORDPRESS);
          } else if (uploadOk) {
            notify.success(NOTIFY_POST_SEO_SAVED_TO_WORDPRESS);
          }
        }
        return true;
      } catch (err: unknown) {
        const idx = options?.rowIndex;
        if (idx !== undefined) {
          updateRow(idx, { status: "idle" });
        }
        if (!options?.silent) {
          notifyHeaderError("WordPress update failed", err);
        }
        return false;
      }
    },
    [site, bindings, updateRow, getInventoryMatchForUrl, remapBindingUrl],
  );

  const handleScrapeRow = useCallback(
    async (index: number) => {
      const row = rows[index];
      if (!row) return;
      updateRow(index, { status: "scraping" });
      try {
        if (!site) {
          notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_TO_SCRAPE_FROM_);
          updateRow(index, { status: "idle" });
          return;
        }

        const invMatch = getInventoryMatchForUrl(site, row.url);
        if (!invMatch?.row) {
          notify.error(NOTIFY_LOAD_THIS_TAB_S_INVENTORY_FIRST_SCRAPE_R);
          updateRow(index, { status: "idle" });
          return;
        }

        await ensureOverviewInventoryIncludesContent(
          site,
          [row],
          sitemapSource,
          (s, url) => getInventoryMatchForUrl(s, url),
          mergeInventoryContentForSource,
          bindings,
        );

        const invMatchAfter = getInventoryMatchForUrl(site, row.url) ?? invMatch;
        const binding = resolveOverviewBindingForRow(row, bindings, invMatchAfter);
        const [downloaded, liveBodyHtml] = await Promise.all([
          binding?.postId ? downloadRow(site, row.url, binding).catch(() => null) : Promise.resolve(null),
          fetchLiveWordPressPostBodyForRow(site, row, invMatchAfter).catch(() => undefined),
        ]);
        const patch = buildOverviewRowPatchFromInventory(row, invMatchAfter, binding, site.siteUrl);
        if (!patch) {
          updateRow(index, { status: "error" });
          return;
        }
        if (liveBodyHtml?.trim()) {
          patch.postContent = liveBodyHtml.trim();
          patch.postContentOptimized = liveBodyHtml.trim();
          const h2s = extractH2TextsFromHtml(liveBodyHtml);
          if (h2s.length) patch.blogH2List = h2s;
          if (invMatchAfter?.row?.id) {
            mergeInventoryContentForSource(site, sitemapSource, [
              {
                ...invMatchAfter.row,
                fields: {
                  ...(invMatchAfter.row.fields ?? {}),
                  content: liveBodyHtml.trim(),
                } as typeof invMatchAfter.row.fields,
              },
            ]);
          }
        }
        // Inventory list often omits large seo_research; merge get-post-meta when present.
        if (downloaded?.seoResearch?.trim() && !(patch.seoResearch ?? "").trim()) {
          patch.seoResearch = downloaded.seoResearch.trim();
        }
        if (downloaded?.focusKeyword?.trim()) {
          patch.focusKeyword = downloaded.focusKeyword.trim();
        }
        if (downloaded?.faq?.trim() && !(patch.faq ?? "").trim()) {
          patch.faq = downloaded.faq.trim();
        }
        if (!(patch.faq ?? "").trim() && (patch.postContent ?? "").trim()) {
          const faqFromHtml = extractFaqFromPostHtml(patch.postContent!);
          if (faqFromHtml) patch.faq = faqFromHtml;
        }
        updateRow(index, { ...patch, status: "idle" });
      } catch {
        updateRow(index, { status: "error" });
      }
    },
    [rows, site, sitemapSource, bindings, updateRow, getInventoryMatchForUrl, mergeInventoryContentForSource, downloadRow, hydrateElementorRowAtIndex],
  );

  const handleScrapeAll = useCallback(async () => {
    const scopedRows = overviewRowsInBulkScope(rows, bulkScopeUrlKeys);
    if (!scopedRows.length) return;
    if (!site) {
      notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_TO_SCRAPE_FROM_);
      return;
    }

    const total = scopedRows.length;
    setBulkActionProgress((p) => ({
      ...p,
      scrape: initBulkSliceBatchHarness(
        initBulkSliceWithStatus("scrape", total, 0),
        total,
        "Scrape",
      ),
    }));

    try {
      await ensureOverviewInventoryIncludesContent(
        site,
        scopedRows,
        sitemapSource,
        (s, url) => getInventoryMatchForUrl(s, url),
        mergeInventoryContentForSource,
        bindings,
        (page, pageCount) => {
          setBulkActionProgress((p) => {
            const cur = p.scrape;
            if (!cur) return p;
            const completed = Math.min(total, Math.round((page / Math.max(pageCount, 1)) * total));
            return {
              ...p,
              scrape: {
                ...advanceBulkSliceBatchProgress(cur, completed, total),
                statusMessage: `Scrape page ${page}/${pageCount}`,
              },
            };
          });
        },
      );

      const patches = hydrateOverviewRowsFromInventory({
        rows: scopedRows,
        bindings,
        getInventoryMatchForUrl: (url) => getInventoryMatchForUrl(site, url),
        siteUrl: site.siteUrl,
        onProgress: (completed) => {
          setBulkActionProgress((p) => {
            const cur = p.scrape;
            if (!cur) return p;
            return {
              ...p,
              scrape: advanceBulkSliceBatchProgress(cur, completed, total),
            };
          });
        },
      });

      setRows((prev) =>
        prev.map((row) => {
          const patch = patches.get(normalizePageUrlKey(row.url));
          return patch ? { ...row, ...patch, status: "idle" as const } : row;
        }),
      );

      notify.success(NOTIFY_FINISHED_SCRAPING_ALL_ROWS);
    } finally {
      setBulkActionProgress((p) => {
        const next = { ...p };
        delete next.scrape;
        return next;
      });
    }
  }, [rows, bulkScopeUrlKeys, site, sitemapSource, bindings, getInventoryMatchForUrl, mergeInventoryContentForSource, setRows, setBulkActionProgress]);

  return { handleUpdateWordPressForRow, handleScrapeRow, handleScrapeAll };
}
