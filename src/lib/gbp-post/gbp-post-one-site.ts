import type { WordPressSite } from "@/components/integrations/types";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import {
  runGbpPostCardPipeline,
  completeGbpPostCardHarnessStep,
} from "@/lib/gbp-post/gbp-post-card-pipeline";
import {
  gbpScheduledIsoForSlot,
  gbpSchedulerToPlanState,
  type GbpScheduleUiState,
} from "@/lib/gbp-post/gbp-schedule-plan";
import { GBP_RECENT_MEDIA_CAP } from "@/lib/gbp-post/gbp-posts-inventory";
import {
  createGbpPostsInventoryHostedLink,
  fetchGbpPostsInventory,
  type GbpPostsInventoryHostedLink,
  type GbpInventoryRow,
} from "@/lib/gbp-post/gbp-posts-inventory";
import { readGbpApiError } from "@/lib/gbp-post/gbp-api-error";
import { notifyHeaderError } from "@/lib/app-notifications";
import { NOTIFY_GBP_POST_FAILED } from "@/lib/notify-messages";
import type { GbpPublishPreview } from "@/components/gbp-post/GbpPostPublishPreview";
import type { GbpSchedulerSectionState } from "@/lib/gbp-post/gbp-schedule-plan";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";

export function formatGbpScheduledLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export type GbpSitePostBatchResult = {
  published: number;
  queued: number;
  failed: number;
  lastError?: string;
  lastPreview: GbpPublishPreview | null;
  resolvedTopic: string;
  inventoryHosted: GbpPostsInventoryHostedLink | null;
};

function previewFromApi(
  data: Record<string, unknown>,
  blogPost: { blogPostUrl: string; blogPostTitle: string; blogPostExcerpt?: string; reason?: string },
): GbpPublishPreview {
  const preview = data.preview as Record<string, unknown> | undefined;
  const media = preview?.media as Record<string, unknown> | undefined;
  const linked = preview?.linkedBlog as Record<string, unknown> | undefined;
  return {
    summary: String(preview?.summary ?? ""),
    moneyPageUrl: String(preview?.moneyPageUrl ?? blogPost.blogPostUrl),
    moneyPageReason:
      typeof preview?.moneyPageReason === "string" ? preview.moneyPageReason : undefined,
    imageSearchTerms: Array.isArray(preview?.imageSearchTerms)
      ? preview.imageSearchTerms.map(String)
      : undefined,
    media:
      media && typeof media === "object"
        ? {
            sourceUrl: typeof media.sourceUrl === "string" ? media.sourceUrl : undefined,
            title: typeof media.title === "string" ? media.title : undefined,
            reason: typeof media.reason === "string" ? media.reason : undefined,
          }
        : undefined,
    linkedBlog: {
      blogPostUrl: String(linked?.blogPostUrl ?? blogPost.blogPostUrl),
      blogPostTitle: String(linked?.blogPostTitle ?? blogPost.blogPostTitle),
      blogPostExcerpt:
        typeof linked?.blogPostExcerpt === "string"
          ? linked.blogPostExcerpt
          : blogPost.blogPostExcerpt,
      reason: typeof linked?.reason === "string" ? linked.reason : blogPost.reason,
    },
  };
}

export type RunGbpSitePostBatchParams = {
  site: WordPressSite;
  keyword: string;
  landingPageUrl?: string;
  scheduler: GbpSchedulerSectionState;
  openRouterApiKey: string;
  totalPosts: number;
  sitemapSource: OverviewSitemapSource;
  onStatus?: (line: string) => void;
  onHarnessSection?: (payload: BulkHarnessSectionPayload) => void;
  onResolvedTopic?: (topic: string) => void;
  onPreview?: (preview: GbpPublishPreview) => void;
  onSlotIndex?: (slot: number) => void;
  /** When false, publish failures return in result without throwing. Default true. */
  notifyOnSlotFailure?: boolean;
};

/**
 * Post one or more GBP slots for a single property (inventory + pipeline + publish per slot).
 */
export async function runGbpSitePostBatch(
  params: RunGbpSitePostBatchParams,
): Promise<GbpSitePostBatchResult> {
  const {
    site,
    keyword,
    landingPageUrl,
    scheduler,
    openRouterApiKey,
    totalPosts,
    onStatus,
    onHarnessSection,
    onResolvedTopic,
    onPreview,
    onSlotIndex,
    notifyOnSlotFailure = true,
    sitemapSource,
  } = params;

  const emptyResult: GbpSitePostBatchResult = {
    published: 0,
    queued: 0,
    failed: 0,
    lastPreview: null,
    resolvedTopic: "",
    inventoryHosted: null,
  };

  try {
    return await runGbpSitePostBatchInner({
      site,
      keyword,
      landingPageUrl,
      scheduler,
      openRouterApiKey,
      totalPosts,
      onStatus,
      onHarnessSection,
      onResolvedTopic,
      onPreview,
      onSlotIndex,
      notifyOnSlotFailure,
      sitemapSource,
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "GBP post failed";
    onStatus?.(errMsg);
    if (notifyOnSlotFailure) {
      notifyHeaderError(NOTIFY_GBP_POST_FAILED, errMsg);
    }
    return { ...emptyResult, failed: 1, lastError: errMsg };
  }
}

async function runGbpSitePostBatchInner(
  params: RunGbpSitePostBatchParams,
): Promise<GbpSitePostBatchResult> {
  const {
    site,
    keyword,
    landingPageUrl,
    scheduler,
    openRouterApiKey,
    totalPosts,
    onStatus,
    onHarnessSection,
    onResolvedTopic,
    onPreview,
    onSlotIndex,
    notifyOnSlotFailure = true,
    sitemapSource,
  } = params;

  const gbpLocationId = site.gbpLocationId!.trim();
  const plan: GbpScheduleUiState = gbpSchedulerToPlanState(scheduler);
  const isBulk = totalPosts > 1;

  onStatus?.(`Loading GBP posts for ${site.name}…`);
  const inventory = await fetchGbpPostsInventory(gbpLocationId, site.name, site.siteUrl);
  const inventoryHosted = createGbpPostsInventoryHostedLink({
    siteName: site.name,
    gbpLocationId,
    fetchedAt: new Date().toISOString(),
    posts: inventory.posts,
  });
  onStatus?.(`Loaded ${inventory.count} existing GBP posts.`);

  const usedBlogUrls: string[] = [...inventory.excludeCtaUrls];
  const usedMediaUrls: string[] = [...inventory.excludeRecentMediaUrls];
  let published = 0;
  let queued = 0;
  let failed = 0;
  let lastError: string | undefined;
  let lastPreview: GbpPublishPreview | null = null;
  let resolvedTopic = "";

  for (let slot = 0; slot < totalPosts; slot += 1) {
    onSlotIndex?.(slot);
    onStatus?.(
      isBulk ? `GBP post ${slot + 1} of ${totalPosts}…` : `Topic: ${keyword.trim() || site.name}`,
    );

    const { topic, blogPost } = await runGbpPostCardPipeline({
      site,
      keyword: keyword.trim() || undefined,
      landingPageUrl: landingPageUrl?.trim() || undefined,
      openRouterApiKey,
      sitemapSource,
      excludeBlogUrls: usedBlogUrls,
      excludeGbpCtaUrls: inventory.excludeCtaUrls,
      existingGbpPosts: inventory.posts as GbpInventoryRow[],
      onHarnessSection,
      onStatus,
    });
    usedBlogUrls.push(blogPost.blogPostUrl);
    resolvedTopic = topic;
    onResolvedTopic?.(topic);

    const scheduledPublishAt = gbpScheduledIsoForSlot(plan, slot);
    onStatus?.(
      isBulk
        ? `GBP post ${slot + 1} of ${totalPosts}: scheduling…`
        : "Publishing to GBP…",
    );

    const response = await fetch(`${BACKEND_API_BASE}/api/gmb/publish-from-harness`, {
      method: "POST",
      credentials: "include",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl: site.siteUrl,
        username: site.username,
        appPassword: site.appPassword,
        gbpLocationId,
        keyword: topic,
        siteName: site.name,
        blogPostUrl: blogPost.blogPostUrl,
        blogPostTitle: blogPost.blogPostTitle,
        blogPostExcerpt: blogPost.blogPostExcerpt ?? "",
        scheduledPublishAt,
        publish: true,
        existingGbpPosts: inventory.posts,
        excludeMediaUrls: usedMediaUrls.slice(-GBP_RECENT_MEDIA_CAP),
        ...(openRouterApiKey ? { openRouterApiKey } : {}),
      }),
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || !data.success) {
      failed += 1;
      const errMsg = readGbpApiError(
        data,
        response,
        `Failed GBP post ${slot + 1} of ${totalPosts}`,
      );
      lastError = errMsg;
      onStatus?.(errMsg);
      if (notifyOnSlotFailure) {
        notifyHeaderError(NOTIFY_GBP_POST_FAILED, errMsg);
      }
      continue;
    }

    const summary = typeof (data.preview as Record<string, unknown>)?.summary === "string"
      ? String((data.preview as Record<string, unknown>).summary)
      : "";
    if (onHarnessSection) {
      completeGbpPostCardHarnessStep(onHarnessSection, summary);
    }

    if (data.published) {
      published += 1;
      onStatus?.(
        isBulk ? `GBP post ${slot + 1} of ${totalPosts} published.` : "GBP post published.",
      );
    } else if (data.scheduled) {
      queued += 1;
      const schedAt =
        typeof data.scheduledAt === "string" ? data.scheduledAt : scheduledPublishAt;
      onStatus?.(
        isBulk
          ? `GBP post ${slot + 1} of ${totalPosts} queued for ${formatGbpScheduledLabel(schedAt)}`
          : `Queued for ${formatGbpScheduledLabel(schedAt)}`,
      );
    }

    const previewObj = data.preview as Record<string, unknown> | undefined;
    const pickedMediaUrl =
      typeof (previewObj?.media as Record<string, unknown>)?.sourceUrl === "string"
        ? String((previewObj?.media as Record<string, unknown>).sourceUrl).trim()
        : "";
    if (pickedMediaUrl.startsWith("http")) {
      usedMediaUrls.push(pickedMediaUrl);
      while (usedMediaUrls.length > GBP_RECENT_MEDIA_CAP) {
        usedMediaUrls.shift();
      }
    }

    if (previewObj && typeof previewObj === "object") {
      lastPreview = previewFromApi(data, blogPost);
      onPreview?.(lastPreview);
    }
  }

  if (isBulk && queued > 0) {
    try {
      const flushRes = await fetch(`${BACKEND_API_BASE}/api/gmb/process-schedule-queue`, {
        method: "POST",
        credentials: "include",
        headers: neoPulseApiHeaders(),
      });
      const flushData = (await flushRes.json().catch(() => ({}))) as Record<string, unknown>;
      if (flushRes.ok && flushData.success) {
        const flushed = Number(flushData.publishedThisRun) || 0;
        const flushFailed = Number(flushData.failedThisRun) || 0;
        if (flushed > 0) {
          published += flushed;
          queued = Math.max(0, queued - flushed);
        }
        if (flushFailed > 0) failed += flushFailed;
      }
    } catch {
      /* best-effort */
    }
  }

  return {
    published,
    queued,
    failed,
    lastError,
    lastPreview,
    resolvedTopic,
    inventoryHosted,
  };
}
