import { useCallback, useRef, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import { getWordPressPostMeta } from "@/lib/wordpress-api";
import type { OverviewBinding } from "./use-overview-wordpress-binding";
import { uploadOverviewRowSeoToWordPress } from "@/lib/overview/overview-bulk-seo-payload";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { overviewTitleOptimizationExcluded } from "@/lib/overview/overview-page-bucket";

/** WP REST v2 collection path: `page` / `post` subtypes must be `pages` / `posts`. */
function restCollectionEndpointForSubtype(subtype: string | undefined): string {
  const s = (subtype ?? "post").toLowerCase();
  if (s === "post" || s === "posts") return "posts";
  if (s === "page" || s === "pages") return "pages";
  return subtype ?? "posts";
}

function plainRenderedText(raw: string | undefined): string {
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

export interface UseOverviewUploadResult {
  loading: boolean;
  error: string | null;
  uploadRow: (
    site: WordPressSite | null,
    url: string,
    binding: OverviewBinding | undefined,
    title: string,
    metaDescription: string,
    aiTitle: string,
    aiMeta: string,
    focusKeyword?: string,
    faq?: string,
    dateModifier?: string,
    seoResearch?: string,
  ) => Promise<boolean>;
}

/** Uploads AI / edited SEO fields from the Overview grid back to WordPress. */
export function useOverviewUploadToSite(): UseOverviewUploadResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadInflightRef = useRef(0);

  const uploadRow = useCallback(
    async (
      site: WordPressSite | null,
      url: string,
      binding: OverviewBinding | undefined,
      title: string,
      metaDescription: string,
      aiTitle: string,
      aiMeta: string,
      focusKeyword?: string,
      faq?: string,
      dateModifier?: string,
      seoResearch?: string,
    ) => {
      if (!site || !binding?.postId) {
        setError("No connected site or post binding available for this URL.");
        return false;
      }

      const restEndpoint = restCollectionEndpointForSubtype(binding.subtype);
      const titleExcluded =
        overviewTitleOptimizationExcluded({
          url,
          title,
          metaDescription,
          aiTitle,
          aiMeta,
          status: "idle",
          postType: binding.subtype,
        });

      let srcTitle = title;
      let srcMeta = metaDescription;
      let srcAiTitle = aiTitle;
      let srcAiMeta = aiMeta;

      const computeEffective = () => {
        const et = titleExcluded ? "" : (srcAiTitle || srcTitle || "").trim();
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

      if (wouldBailEmptyGrid) {
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
            const m = (cur.meta && typeof cur.meta === "object" ? cur.meta : {}) as Record<string, unknown>;
            const rmTitle = typeof m.neo_pulse_seo_title === "string" ? m.neo_pulse_seo_title.trim() : "";
            const rmDesc = typeof m.neo_pulse_seo_description === "string" ? m.neo_pulse_seo_description.trim() : "";
            const wpTitle = plainRenderedText(cur.title);
            const excerptPlain = plainRenderedText(cur.excerpt);
            if (!(srcTitle ?? "").trim() && !(srcAiTitle ?? "").trim()) {
              srcTitle = rmTitle || wpTitle;
              srcAiTitle = srcTitle;
            }
            if (!(srcMeta ?? "").trim() && !(srcAiMeta ?? "").trim()) {
              srcMeta = rmDesc || excerptPlain;
              srcAiMeta = srcMeta;
            }
          }
        } catch {
          /* keep bail below */
        }
        ({ effectiveTitle, effectiveMeta } = computeEffective());
      }

      // If absolutely nothing has been provided (even after WP hydrate), bail out.
      if (
        !effectiveTitle &&
        !effectiveMeta &&
        !focusKeyword &&
        !faq &&
        !dateModifier &&
        !seoTrimmed
      ) {
        setError(
          "Nothing to upload for this row (title, meta, focus keyword, FAQ, date modifier, and SEO research brief are all empty).",
        );
        return false;
      }

      uploadInflightRef.current += 1;
      if (uploadInflightRef.current === 1) setLoading(true);
      setError(null);

      try {
        const gridRow: OverviewRow = {
          url,
          title: srcTitle,
          metaDescription: srcMeta,
          aiTitle: srcAiTitle,
          aiMeta: srcAiMeta,
          focusKeyword,
          faq,
          dateModifier,
          seoResearch,
          status: "idle",
          postType: binding.subtype,
        };
        const result = await uploadOverviewRowSeoToWordPress(site, gridRow, binding);
        if (!result.ok) {
          throw new Error(result.error || "WordPress rejected the update.");
        }
        return true;
      } catch (err) {
        const msg =
          (err instanceof Error ? err.message : "") ||
          `Failed to upload SEO fields for ${url}. Check WordPress permissions and SEO field setup.`;
        setError(msg);
        return false;
      } finally {
        uploadInflightRef.current -= 1;
        if (uploadInflightRef.current === 0) setLoading(false);
      }
    },
    [],
  );

  return {
    loading,
    error,
    uploadRow,
  };
}

