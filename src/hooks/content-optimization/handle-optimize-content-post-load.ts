import { notify } from "@/lib/app-notifications";
import { NOTIFY_FETCHING_POST_BY_URL } from "@/lib/notify-messages";
import { getMuteOptimizationToasts } from "./optimization-toast-mute";
import { getWordPressPostContent } from "@/lib/wordpress-api";
import { getFieldsForPost } from "@/lib/wordpress-api/fields-client";
import {
  subtypeToEndpoint,
  findEndpointFromSitemap,
  updateOptimizationProgress,
} from "./optimization-helpers";
import type { WordPressSite } from "@/components/integrations/types";
import type { HandleOptimizeContentParams } from "./handle-optimize-content-params";
import type { WpExistingPostLike } from "./use-optimization-state";

function wpStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "raw" in v && typeof (v as { raw?: string }).raw === "string")
    return (v as { raw: string }).raw;
  if (
    typeof v === "object" &&
    v !== null &&
    "rendered" in v &&
    typeof (v as { rendered?: string }).rendered === "string"
  )
    return (v as { rendered: string }).rendered;
  return String(v);
}

function endpointForResolvedPost(
  site: WordPressSite,
  url: string,
  resolvedPost: NonNullable<HandleOptimizeContentParams["resolvedPost"]>,
): string {
  return (
    resolvedPost.endpoint ||
    site.manualEndpoint ||
    subtypeToEndpoint(resolvedPost.subtype) ||
    (resolvedPost.subtype === "post"
      ? "posts"
      : resolvedPost.subtype === "page"
        ? "pages"
        : resolvedPost.subtype) ||
    findEndpointFromSitemap(url, site) ||
    "posts"
  );
}

export async function loadHandleOptimizePostAndIntent(params: {
  site: WordPressSite;
  url: string;
  resolvedPost: HandleOptimizeContentParams["resolvedPost"];
  optimizationOptions: HandleOptimizeContentParams["optimizationOptions"];
  setOptimizationProgress: HandleOptimizeContentParams["setOptimizationProgress"];
  researchModel: string;
  openRouterApiKey: string;
}): Promise<{
  resolved:
    | { id: number; subtype: string; url: string; link: string; slug?: string; endpoint?: string }
    | undefined;
  existingPost: WpExistingPostLike | null;
  existingTitle: string;
  existingContent: string;
  existingExcerpt: string;
  urlDerivedIntent: string | null;
  acfPrefetch?: { fields: Record<string, unknown> };
}> {
  const { site, url, resolvedPost, optimizationOptions, setOptimizationProgress, researchModel, openRouterApiKey } =
    params;

  let resolved:
    | { id: number; subtype: string; url: string; link: string; slug?: string; endpoint?: string }
    | undefined;
  let existingPost: WpExistingPostLike | null = null;
  let existingTitle = "";
  let existingContent = "";
  let existingExcerpt = "";

  const sheetContent = (resolvedPost?.content ?? "").trim();
  const hasSheetBody = sheetContent.length > 0;
  const hasPostId = Boolean(resolvedPost?.id);

  if (hasPostId && resolvedPost) {
    const endpoint = endpointForResolvedPost(site, url, resolvedPost);
    resolved = {
      id: resolvedPost.id,
      subtype: resolvedPost.subtype,
      url,
      link: resolvedPost.link || url,
      slug: resolvedPost.slug,
      endpoint,
    };
    if (hasSheetBody) {
      existingTitle = (resolvedPost.title ?? "").trim();
      existingContent = sheetContent;
      existingExcerpt = (resolvedPost.excerpt ?? "").trim();
      existingPost = {
        id: resolvedPost.id,
        slug: resolvedPost.slug || "",
        title: existingTitle,
        content: existingContent,
        excerpt: existingExcerpt,
        date_gmt: "",
        link: resolvedPost.link || url,
        postTypeEndpoint: endpoint,
        postTypeSubtype: resolvedPost.subtype,
      };
      updateOptimizationProgress(
        setOptimizationProgress,
        site.id,
        "load",
        0.2,
        "Sheet inventory",
      );
    }
  }

  if (!resolved && optimizationOptions?.stagingSite) {
    if (!getMuteOptimizationToasts()) notify.info(NOTIFY_FETCHING_POST_BY_URL);
    updateOptimizationProgress(setOptimizationProgress, site.id, "load", 0.15, "Using URL");
    const urlObj = new URL(url.startsWith("http") ? url : `${site.siteUrl}${url.startsWith("/") ? url : "/" + url}`);
    const pathSegments = urlObj.pathname.split("/").filter((s: string) => s.length > 0);
    const slug = pathSegments[pathSegments.length - 1] || "page";
    const slugResult = await getWordPressPostContent(
      site.siteUrl,
      site.username,
      site.appPassword,
      undefined,
      [slug],
      undefined,
      {
        entitySitemapUrl: site.entitySitemapUrl,
        ...(site.manualEndpoint ? { restEndpointHints: [site.manualEndpoint] } : {}),
      }
    );
    if (slugResult.posts && slugResult.posts.length > 0) {
      const post = slugResult.posts[0];
      const endpoint = post.postTypeEndpoint || "posts";
      const subtype = endpoint === "pages" ? "page" : endpoint === "posts" ? "post" : endpoint;
      resolved = {
        id: post.id,
        subtype,
        url,
        link: post.link || url,
        slug: post.slug || slug,
      };
      existingPost = { ...post };
      existingTitle = wpStr(post.title) || "";
      existingContent = wpStr(post.content) || "";
      existingExcerpt = wpStr(post.excerpt) || "";
    }
  }

  if (!resolved) {
    throw new Error(
      "No WordPress post id on this row. Load sitemap inventory in Content Opt, then retry. URL resolve is disabled.",
    );
  }

  let acfPrefetch: { fields: Record<string, unknown> } | undefined;

  if (resolved && !existingPost) {
    const postTypeEndpoint =
      resolved.endpoint ||
      site.manualEndpoint ||
      subtypeToEndpoint(resolved.subtype) ||
      (resolved.subtype === "post" ? "posts" : resolved.subtype === "page" ? "pages" : resolved.subtype) ||
      findEndpointFromSitemap(url, site) ||
      "posts";

    const acfResult = await getFieldsForPost(
      site,
      resolved.id,
      resolved.subtype || "post",
      postTypeEndpoint
    );

    if (acfResult.success && acfResult.fullPost && typeof acfResult.fullPost === "object") {
      const fp = acfResult.fullPost as Record<string, unknown>;
      existingPost = {
        id: fp.id as number,
        slug: typeof fp.slug === "string" ? fp.slug : String(fp.slug ?? ""),
        title: wpStr(fp.title),
        content: wpStr(fp.content),
        excerpt: wpStr(fp.excerpt),
        date_gmt: String(fp.date_gmt ?? fp.date ?? ""),
        link: String(fp.link ?? resolved.link ?? ""),
        postTypeEndpoint,
        postTypeSubtype: resolved.subtype,
        fullData: fp,
      };
      existingTitle = wpStr(existingPost.title) || "";
      existingContent = wpStr(existingPost.content) || "";
      existingExcerpt = wpStr(existingPost.excerpt) || "";
      acfPrefetch = { fields: acfResult.fields && typeof acfResult.fields === "object" ? acfResult.fields : {} };
    } else {
      const postContentResult = await getWordPressPostContent(
        site.siteUrl,
        site.username,
        site.appPassword,
        undefined,
        undefined,
        [{ id: resolved.id, subtype: resolved.subtype }],
        {
          entitySitemapUrl: site.entitySitemapUrl,
          ...(site.manualEndpoint ? { restEndpointHints: [site.manualEndpoint] } : {}),
        }
      );
      if (postContentResult.error) {
        throw new Error(postContentResult.error);
      }
      if (postContentResult.errors && postContentResult.errors.length > 0) {
        const errorDetails = postContentResult.errors
          .map((e) => {
            const withResolved = e as typeof e & {
              resolvedObject?: { subtype?: string; id?: number | string };
            };
            const obj: { subtype?: string; id?: number | string } =
              withResolved.resolvedObject ?? e;
            return `Failed to fetch ${obj.subtype || "post"}/${obj.id}: ${e.error || "Unknown error"}`;
          })
          .join("; ");
        throw new Error(`Failed to fetch post content: ${errorDetails}`);
      }
      if (!postContentResult.posts || postContentResult.posts.length === 0) {
        throw new Error(
          `Failed to fetch post content for ID: ${resolved.id}, Type: ${resolved.subtype}. Please verify the post exists and you have permission to access it.`
        );
      }
      existingPost = { ...postContentResult.posts[0] };
      existingTitle = wpStr(existingPost.title) || "";
      existingContent = wpStr(existingPost.content) || "";
      existingExcerpt = wpStr(existingPost.excerpt) || "";
    }
  }

  const manualKeyword = (optimizationOptions?.manualKeyword ?? "").trim();

  const urlDerivedIntent: string | null = null;

  return {
    resolved,
    existingPost,
    existingTitle,
    existingContent,
    existingExcerpt,
    urlDerivedIntent,
    ...(acfPrefetch ? { acfPrefetch } : {}),
  };
}
