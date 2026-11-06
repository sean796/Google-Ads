import type { WordPressSite } from "@/components/integrations/types";

import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";

import { readGbpApiError } from "@/lib/gbp-post/gbp-api-error";

import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

import { resolveGbpSitemapUrlForSite } from "@/lib/gbp-post/gbp-sitemap-source";

import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";

import type { GbpInventoryRow } from "@/lib/gbp-post/gbp-posts-inventory";



export const GBP_POST_PIPELINE_TITLES = ["Topic", "Site page", "Post card"] as const;

const HARNESS_TOTAL = GBP_POST_PIPELINE_TITLES.length;



export type GbpLinkedBlog = {

  blogPostUrl: string;

  blogPostTitle: string;

  blogPostExcerpt?: string;

  reason?: string;

};



function emitHarnessStep(

  onHarnessSection: ((payload: BulkHarnessSectionPayload) => void) | undefined,

  sectionIndex: number,

  title: string,

  phase: "start" | "done",

  markdownSlice = "",

) {

  onHarnessSection?.({

    rowIndex: 0,

    sectionIndex,

    totalSections: HARNESS_TOTAL,

    title,

    phase,

    ...(phase === "done" && markdownSlice ? { markdownSlice } : {}),

  });

}



/**

 * GBP harness: topic, pick one sitemap page (CTA target), then server writes the post card on publish.

 */

export async function runGbpPostCardPipeline(options: {
  site: WordPressSite;
  keyword?: string;
  landingPageUrl?: string;
  openRouterApiKey: string;
  sitemapSource: OverviewSitemapSource;
  excludeBlogUrls?: string[];
  excludeGbpCtaUrls?: string[];
  existingGbpPosts?: GbpInventoryRow[];
  onHarnessSection?: (payload: BulkHarnessSectionPayload) => void;
  onStatus?: (line: string) => void;
}): Promise<{ topic: string; blogPost: GbpLinkedBlog }> {

  const { site, openRouterApiKey, sitemapSource } = options;

  const sitemapUrl = resolveGbpSitemapUrlForSite(site, sitemapSource);

  if (!sitemapUrl) {

    throw new Error(

      `Configure sitemap in Integrations for ${site.name} (${sitemapSource} source).`,

    );

  }



  emitHarnessStep(options.onHarnessSection, 0, GBP_POST_PIPELINE_TITLES[0], "start");

  const topic = (options.keyword ?? "").trim() || site.name?.trim() || "local business";

  options.onStatus?.(`Topic: ${topic}`);

  emitHarnessStep(

    options.onHarnessSection,

    0,

    GBP_POST_PIPELINE_TITLES[0],

    "done",

    `Topic: ${topic}`,

  );



  emitHarnessStep(options.onHarnessSection, 1, GBP_POST_PIPELINE_TITLES[1], "start");

  options.onStatus?.("Picking page…");

  const preferredUrl = (options.landingPageUrl ?? "").trim();
  const pickBody: Record<string, unknown> = {
    siteUrl: site.siteUrl,
    username: site.username,
    appPassword: site.appPassword,
    sitemapUrl,
    keyword: topic,
    openRouterApiKey,
    excludeUrls: options.excludeBlogUrls ?? [],
    excludeGbpCtaUrls: options.excludeGbpCtaUrls ?? [],
  };
  if (preferredUrl) {
    pickBody.preferredUrl = preferredUrl;
  }

  const pickRes = await fetch(`${BACKEND_API_BASE}/api/gmb/pick-blog-post`, {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(pickBody),
  });

  const pickData = (await pickRes.json().catch(() => ({}))) as Record<string, unknown>;

  if (!pickRes.ok || pickData.success !== true) {

    throw new Error(

      readGbpApiError(pickData, pickRes, `Failed to pick blog post (HTTP ${pickRes.status})`),

    );

  }

  const blogPostRaw = pickData.blogPost;

  if (!blogPostRaw || typeof blogPostRaw !== "object") {

    throw new Error(

      readGbpApiError(pickData, pickRes, "Pick blog post returned no linked page."),

    );

  }

  const picked = blogPostRaw as Record<string, unknown>;

  const blogPost: GbpLinkedBlog = {

    blogPostUrl: String(picked.blogPostUrl ?? ""),

    blogPostTitle: String(picked.blogPostTitle ?? ""),

    blogPostExcerpt:

      typeof picked.blogPostExcerpt === "string"

        ? picked.blogPostExcerpt

        : "",

    reason: typeof picked.reason === "string" ? picked.reason : "",

  };

  options.onStatus?.(`Linked: ${blogPost.blogPostTitle}`);

  emitHarnessStep(

    options.onHarnessSection,

    1,

    GBP_POST_PIPELINE_TITLES[1],

    "done",

    `Linked page:\n${blogPost.blogPostTitle}\n${blogPost.blogPostUrl}`,

  );



  emitHarnessStep(options.onHarnessSection, 2, GBP_POST_PIPELINE_TITLES[2], "start");



  return { topic, blogPost };

}



export function completeGbpPostCardHarnessStep(

  onHarnessSection: ((payload: BulkHarnessSectionPayload) => void) | undefined,

  summary: string,

) {

  emitHarnessStep(

    onHarnessSection,

    2,

    GBP_POST_PIPELINE_TITLES[2],

    "done",

    summary.trim() ? `Post card:\n${summary.trim()}` : "Post card published.",

  );

}

