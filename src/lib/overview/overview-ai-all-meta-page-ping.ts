import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { stripHtmlForKeywordContext } from "@/lib/overview/overview-row-helpers";
import { getWordPressPostContent, getWordPressPostMeta } from "@/lib/wordpress-api";

export type MetaPageApiPingResult = {
  ok: boolean;
  url: string;
  postId: number | null;
  endpoint: string;
  title: string;
  /** Full page body as plain text (HTML stripped). */
  plainTextContent: string;
  charCount: number;
  /** ACF `seo_research` from WordPress (`context=edit` meta fetch). */
  postFieldsSeoResearch?: string;
  error?: string;
};

function acfStringField(acf: Record<string, unknown> | undefined, key: string): string {
  if (!acf || typeof acf !== "object") return "";
  const value = acf[key];
  return typeof value === "string" ? value.trim() : "";
}

function extractSlugFromTargetUrl(siteUrl: string, targetUrl: string): string {
  try {
    const base = siteUrl?.startsWith("http") ? siteUrl : `https://${siteUrl}`;
    const absolute = targetUrl.startsWith("http")
      ? targetUrl
      : `${base.replace(/\/$/, "")}/${targetUrl.replace(/^\//, "")}`;
    const slug = new URL(absolute).pathname.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(slug).trim();
  } catch {
    const raw =
      String(targetUrl || "")
        .split("/")
        .filter(Boolean)
        .pop() || "";
    return decodeURIComponent(raw).trim();
  }
}

/** Build row snapshot from Overview grid (CSV/inventory/scrape). No WordPress API calls. */
export function buildMetaPagePingFromOverviewRow(row: OverviewRow): MetaPageApiPingResult {
  const url = row.url?.trim() ?? "";
  const postId = typeof row.postId === "number" && row.postId > 0 ? row.postId : null;
  const title = (row.title || "").trim();
  const rawContent = (row.postContent || "").trim();
  const plain = stripHtmlForKeywordContext(rawContent);
  const postFieldsSeoResearch = (row.seoResearch || "").trim() || undefined;

  return {
    ok: true,
    url,
    postId,
    endpoint: "Session inventory / grid row (no API)",
    title,
    plainTextContent: plain,
    charCount: plain.length,
    ...(postFieldsSeoResearch ? { postFieldsSeoResearch } : {}),
  };
}

export function formatPageApiPingArtifact(result: MetaPageApiPingResult): string {
  const doc = {
    ok: result.ok,
    url: result.url,
    postId: result.postId,
    endpoint: result.endpoint,
    title: result.title || "(none)",
    plainTextCharCount: result.charCount,
    plainTextContent: result.plainTextContent || "(empty)",
    postFieldsSeoResearch: result.postFieldsSeoResearch?.trim() || "(none on row ACF)",
    ...(result.error ? { error: result.error } : {}),
  };
  return "```json\n" + JSON.stringify(doc, null, 2) + "\n```";
}

export async function pingOverviewPageForMeta(
  site: WordPressSite,
  row: OverviewRow,
): Promise<MetaPageApiPingResult> {
  const url = row.url?.trim() ?? "";
  const postId = typeof row.postId === "number" && row.postId > 0 ? row.postId : null;
  const slug = extractSlugFromTargetUrl(site.siteUrl, url);

  if (!site.username?.trim() || !site.appPassword?.trim()) {
    return {
      ok: false,
      url,
      postId,
      endpoint: "POST /api/wordpress/get-post-content",
      title: "",
      plainTextContent: "",
      charCount: 0,
      error: "WordPress credentials missing on site.",
    };
  }

  if (!postId && !slug) {
    return {
      ok: false,
      url,
      postId,
      endpoint: "POST /api/wordpress/get-post-content",
      title: "",
      plainTextContent: "",
      charCount: 0,
      error: "No postId on row and could not derive slug from URL.",
    };
  }

  const wpOpts = {
    entitySitemapUrl: site.entitySitemapUrl,
    ...(site.manualEndpoint ? { restEndpointHints: [site.manualEndpoint] } : {}),
  };

  try {
    const result = await getWordPressPostContent(
      site.siteUrl,
      site.username,
      site.appPassword,
      postId ? [postId] : undefined,
      postId ? undefined : slug ? [slug] : undefined,
      undefined,
      wpOpts,
    );

    if (result.error?.trim()) {
      return {
        ok: false,
        url,
        postId,
        endpoint: "POST /api/wordpress/get-post-content",
        title: "",
        plainTextContent: "",
        charCount: 0,
        error: result.error.trim(),
      };
    }

    const post = result.posts?.[0];
    const apiError = result.errors?.[0]?.error?.trim();
    if (!post) {
      return {
        ok: false,
        url,
        postId,
        endpoint: "POST /api/wordpress/get-post-content",
        title: "",
        plainTextContent: "",
        charCount: 0,
        error: apiError || "No post returned from WordPress API.",
      };
    }

    const resolvedPostId = post.id ?? postId;
    const endpoint =
      post.postTypeEndpoint && post.id
        ? `wp/v2/${post.postTypeEndpoint}/${post.id}`
        : "POST /api/wordpress/get-post-content";
    const title = (post.title || "").trim();
    const rawContent = (post.content || post.fullData?.content?.raw || "").trim();
    const plain = stripHtmlForKeywordContext(rawContent);

    let postFieldsSeoResearch = acfStringField(
      post.fullData?.acf && typeof post.fullData.acf === "object"
        ? (post.fullData.acf as Record<string, unknown>)
        : post.fullData?.neo_pulse_fields && typeof post.fullData.neo_pulse_fields === "object"
          ? (post.fullData.neo_pulse_fields as Record<string, unknown>)
          : undefined,
      "seo_research",
    );

    if (!postFieldsSeoResearch && resolvedPostId) {
      try {
        const metaResult = await getWordPressPostMeta(
          site.siteUrl,
          site.username,
          site.appPassword,
          resolvedPostId,
          post.postTypeSubtype || "post",
          post.postTypeEndpoint,
        );
        if (metaResult.success) {
          postFieldsSeoResearch = acfStringField(
            metaResult.acf && typeof metaResult.acf === "object"
              ? (metaResult.acf as Record<string, unknown>)
              : undefined,
            "seo_research",
          );
        }
      } catch {
        // Meta fetch is best-effort; page content ping still succeeds.
      }
    }

    return {
      ok: true,
      url,
      postId: resolvedPostId,
      endpoint,
      title,
      plainTextContent: plain,
      charCount: plain.length,
      ...(postFieldsSeoResearch ? { postFieldsSeoResearch } : {}),
    };
  } catch (err) {
    return {
      ok: false,
      url,
      postId,
      endpoint: "POST /api/wordpress/get-post-content",
      title: "",
      plainTextContent: "",
      charCount: 0,
      error: err instanceof Error ? err.message : "Page API ping failed.",
    };
  }
}
