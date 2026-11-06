import { useCallback, useEffect, useMemo, useRef } from "react";
import { useOverviewDownloadFromSite } from "@/hooks/overview/use-overview-download";
import { useOverviewUploadToSite } from "@/hooks/overview/use-overview-upload";
import { getWordPressPostContent } from "@/lib/wordpress-api";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { OVERVIEW_SEO_EXTRA_BULK } from "@/components/overview/overview-tab/overview-tab-content-constants";
import type { OptimizationOptions } from "@/hooks/use-optimization-options";
import { sentimentHtmlFromInventoryRow } from "@/lib/overview/overview-inventory-seo-fields";
import type { WordPressSite } from "@/components/integrations/types";
import type { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import type { OverviewBinding, useOverviewWordPressBinding } from "@/hooks/overview/use-overview-wordpress-binding";

export function useOverviewTabOptimizationSync({
  site,
  opt,
  getInventoryRowForUrl,
}: {
  site: WordPressSite;
  opt: ReturnType<typeof useWordPressOptimization>;
  getInventoryRowForUrl: ReturnType<typeof useOverviewWordPressBinding>["getInventoryRowForUrl"];
}) {
  const getInventoryRow = useCallback(
    (url: string) => getInventoryRowForUrl(site, url),
    [site, getInventoryRowForUrl],
  );
  const { loading: downloadLoading, error: downloadError, downloadRow } = useOverviewDownloadFromSite();
  const { error: uploadError } = useOverviewUploadToSite();

  const wpPostBodyCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    wpPostBodyCacheRef.current.clear();
  }, [site?.id]);

  const resolvePostBodyHtmlForSentiment = useCallback(
    async (row: OverviewRow, binding: OverviewBinding): Promise<string | undefined> => {
      if (!site) return undefined;
      const cacheKey = `${site.id}:${binding.postId}`;
      const cached = wpPostBodyCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const invRow = getInventoryRowForUrl(site, row.url);
      const fromInv = sentimentHtmlFromInventoryRow(invRow, binding.postId);
      if (fromInv) {
        wpPostBodyCacheRef.current.set(cacheKey, fromInv);
        return fromInv;
      }
      // Inventory already bound this URL; skip per-post REST (phantom IDs, rate limits).
      if (invRow?.id != null && invRow.id === binding.postId) {
        return undefined;
      }

      try {
        const contentResult = await getWordPressPostContent(
          site.siteUrl,
          site.username,
          site.appPassword,
          [binding.postId],
          undefined,
          [{ id: binding.postId, subtype: binding.subtype }],
        );
        const post = contentResult.posts?.[0];
        const html = post?.content?.trim();
        if (html) {
          wpPostBodyCacheRef.current.set(cacheKey, html);
          return html;
        }
      } catch {
        // optional sentiment context
      }
      return undefined;
    },
    [site, getInventoryRowForUrl],
  );

  const bulkSeoExtraOptions = useMemo((): OptimizationOptions => {
    const base =
      opt.optimizationOptions[site.id] || {
        optimizeTitle: true,
        optimizeMeta: true,
        optimizeExcerpt: true,
        optimizeContent: true,
        optimizeFeaturedImage: false,
        autoOptimize: true,
        testMode: false,
        stagingSite: false,
      };
    return { ...base, ...OVERVIEW_SEO_EXTRA_BULK } as OptimizationOptions;
  }, [opt.optimizationOptions, site.id]);

  return {
    getInventoryRow,
    downloadLoading,
    downloadError,
    downloadRow,
    uploadError,
    resolvePostBodyHtmlForSentiment,
    bulkSeoExtraOptions,
  };
}
