import { useCallback, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import { getWordPressPostMeta } from "@/lib/wordpress-api";
import { getSeoResearchFromPostFields } from "@/lib/content-generation/ai-driven-post-fields-reader";
import { focusKeywordFromWordPressSources } from "@/lib/overview/focus-keyword-from-wp-sources";
import type { OverviewBinding } from "./use-overview-wordpress-binding";

export interface DownloadedSeoFields {
  title?: string;
  /** First H1 from post body when inventory included pageHeading. */
  pageHeading?: string;
  metaDescription?: string;
  schemaJson?: string;
  focusKeyword?: string;
  faq?: string;
  dateModifier?: string;
  /** ACF textarea `seo_research` (cached SEO research brief) */
  seoResearch?: string;
}

export interface UseOverviewDownloadResult {
  loading: boolean;
  error: string | null;
  downloadRow: (site: WordPressSite | null, url: string, binding?: OverviewBinding) => Promise<DownloadedSeoFields | null>;
}

/**
 * Downloads SEO fields for a bound Overview row.
 * Meta description is the WordPress post excerpt only (not plugin meta, not ACF modifiers).
 */
export function useOverviewDownloadFromSite(): UseOverviewDownloadResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadRow = useCallback(
    async (site: WordPressSite | null, url: string, binding?: OverviewBinding) => {
      if (!site || !binding?.postId) {
        setError("No connected site or post binding available for this URL.");
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await getWordPressPostMeta(
          site.siteUrl,
          site.username,
          site.appPassword,
          binding.postId,
          binding.subtype,
        );

        if (!result.success || !result.meta) {
          throw new Error(result.error || "No meta fields returned from WordPress.");
        }

        const meta = result.meta;
        const acf = result.acf || {};
        const postTitle =
          typeof result.title === "string"
            ? result.title.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
            : "";
        const excerptRaw = typeof result.excerpt === "string" ? result.excerpt : "";
        const excerptPlain = excerptRaw
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 300);
        const metaDescription = excerptPlain || undefined;

        let schemaJson = "";
        const schemaField =
          meta["neo_pulse_seo_rich_snippet"] ||
          meta["neo_pulse_seo_schema"] ||
          meta["schema"] ||
          meta["_schema"] ||
          null;
        if (schemaField) {
          try {
            schemaJson =
              typeof schemaField === "string"
                ? schemaField
                : JSON.stringify(schemaField, null, 2);
          } catch {
            schemaJson = "";
          }
        }

        const focusKeyword =
          focusKeywordFromWordPressSources({
            acf,
            meta: meta as Record<string, unknown>,
            title: postTitle,
            collection: binding.subtype === "page" ? "pages" : "posts",
          }) || undefined;

        const acfFaq = typeof acf["faq"] === "string" ? acf["faq"] : "";

        // Date modifier: prefer ACF date_modifier/seo_date_modifier
        const acfDate =
          typeof acf["date_modifier"] === "string"
            ? acf["date_modifier"]
            : typeof acf["seo_date_modifier"] === "string"
            ? acf["seo_date_modifier"]
            : "";

        const postFieldsSeoResearch = getSeoResearchFromPostFields(acf).trim();

        return {
          title: postTitle || undefined,
          metaDescription,
          schemaJson: schemaJson || undefined,
          focusKeyword: focusKeyword || undefined,
          faq: acfFaq,
          dateModifier: acfDate || undefined,
          seoResearch: postFieldsSeoResearch || undefined,
        };
      } catch (err) {
        const msg =
          (err instanceof Error ? err.message : "") ||
          `Failed to download SEO fields for ${url}. Check WordPress REST access for this post and excerpt/meta fields.`;
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return {
    loading,
    error,
    downloadRow,
  };
}

