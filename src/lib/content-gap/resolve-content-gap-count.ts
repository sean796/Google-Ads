import type { WordPressSite } from "@/components/integrations/types";
import { isEntitySitemapDisabled } from "@/lib/entity-endpoint-extractor";
import { OVERVIEW_SITEMAP_SOURCE_LABELS } from "@/lib/overview/overview-sitemap-source";
import { fetchOverviewInventoryForSource } from "@/lib/overview/overview-parallel-inventory-fetch";
import {
  defaultLocalCalendarMonthKey,
  getLocalCalendarMonthAfterBeforeForMonthKey,
} from "@/lib/quarter-bounds";
import type {
  ContentGapCountMode,
  ContentGapSitemapSource,
  TaskExecutionPayload,
} from "@/lib/tasks-types";
import { fetchQuarterEditorialCounts } from "@/lib/wordpress-api/post-quarter-counts";
import type { QuarterEditorialCountsResult } from "@/lib/wordpress-api/types";
import { contentGapMeasureLabel } from "@/lib/content-gap/content-gap-labels";

export type ContentGapCountResult = {
  currentCount: number;
  targetCount: number;
  gapCount: number;
  goalMet: boolean;
  label: string;
  contextText: string;
  monthLabel: string;
  contentLabel: string;
  measureLabel: string;
  statusText: string;
  scheduledCount?: number;
  publishedCount?: number;
};

function resolvePayloadConfig(payload: TaskExecutionPayload): {
  source: ContentGapSitemapSource;
  mode: ContentGapCountMode;
  target: number;
  monthKey: string;
  monthLabel: string;
} {
  const source = payload.contentGapSitemapSource ?? "posts";
  const mode = payload.contentGapCountMode ?? "editorial_month";
  const target = payload.contentGapTargetCount;
  const monthKey = payload.contentGapCountMonth?.trim() || defaultLocalCalendarMonthKey();
  const monthRange = getLocalCalendarMonthAfterBeforeForMonthKey(monthKey);
  if (typeof target !== "number" || !Number.isFinite(target) || target <= 0) {
    throw new Error("Content gap check requires a target count greater than 0.");
  }
  return {
    source,
    mode,
    target: Math.floor(target),
    monthKey,
    monthLabel: monthRange.label,
  };
}

function siteHasCredentials(site: WordPressSite): boolean {
  return Boolean(site.siteUrl?.trim() && site.username?.trim() && site.appPassword?.trim());
}

export function resolveMonthlyCountFromPair(
  mode: ContentGapCountMode,
  scheduled: number | null | undefined,
  published: number | null | undefined,
  unavailableMessage = "Counts are unavailable for this site.",
): number {
  if (mode === "scheduled_month") {
    if (typeof scheduled !== "number") {
      throw new Error(unavailableMessage);
    }
    return scheduled;
  }
  if (mode === "posted_month") {
    if (typeof published !== "number") {
      throw new Error(unavailableMessage);
    }
    return published;
  }
  if (typeof scheduled !== "number" || typeof published !== "number") {
    throw new Error(unavailableMessage);
  }
  return scheduled + published;
}

function resolveEditorialCountFromResult(
  counts: QuarterEditorialCountsResult,
  source: ContentGapSitemapSource,
  mode: ContentGapCountMode,
): { currentCount: number; scheduledCount?: number; publishedCount?: number } {
  if (source === "posts") {
    const scheduled = counts.postsScheduled;
    const published = counts.postsPublished;
    const currentCount = resolveMonthlyCountFromPair(
      mode,
      scheduled,
      published,
      "Post counts are unavailable for this site.",
    );
    return mode === "editorial_month"
      ? { currentCount, scheduledCount: scheduled ?? undefined, publishedCount: published ?? undefined }
      : { currentCount };
  }

  if (!counts.entityConfigured) {
    throw new Error("SAP sitemap is not configured for this site.");
  }
  if (!counts.entityCountsAvailable) {
    throw new Error("SAP counts are unavailable for this site.");
  }
  const scheduled = counts.entityScheduled;
  const published = counts.entityPublished;
  const currentCount = resolveMonthlyCountFromPair(
    mode,
    scheduled,
    published,
    "SAP counts are unavailable for this site.",
  );
  return mode === "editorial_month"
    ? { currentCount, scheduledCount: scheduled ?? undefined, publishedCount: published ?? undefined }
    : { currentCount };
}

async function resolveCurrentCount(
  site: WordPressSite,
  source: ContentGapSitemapSource,
  mode: ContentGapCountMode,
  monthKey: string,
): Promise<{ currentCount: number; scheduledCount?: number; publishedCount?: number }> {
  if (mode === "sitemap") {
    const inventory = await fetchOverviewInventoryForSource(site, source);
    if (inventory.error?.trim()) {
      throw new Error(inventory.error.trim());
    }
    return { currentCount: inventory.rows.length };
  }

  if (!siteHasCredentials(site)) {
    throw new Error("WordPress credentials are required for monthly counts.");
  }

  const monthRange = getLocalCalendarMonthAfterBeforeForMonthKey(monthKey);
  const entitySitemapUrlForFetch = isEntitySitemapDisabled(site) ? undefined : site.entitySitemapUrl;
  const counts = await fetchQuarterEditorialCounts({
    siteUrl: site.siteUrl,
    username: site.username,
    appPassword: site.appPassword,
    after: monthRange.after,
    before: monthRange.before,
    entitySitemapUrl: entitySitemapUrlForFetch,
    manualEndpoint: site.manualEndpoint,
  });

  if (!counts.ok) {
    throw new Error(counts.error?.trim() || "Could not load editorial counts.");
  }

  return resolveEditorialCountFromResult(counts, source, mode);
}

export function buildGapResult(args: {
  source: ContentGapSitemapSource;
  mode: ContentGapCountMode;
  currentCount: number;
  targetCount: number;
  monthLabel: string;
  scheduledCount?: number;
  publishedCount?: number;
}): ContentGapCountResult {
  const { source, mode, currentCount, targetCount, monthLabel, scheduledCount, publishedCount } = args;
  const gapCount = Math.max(0, targetCount - currentCount);
  const goalMet = gapCount === 0;
  const sitemapLabel = OVERVIEW_SITEMAP_SOURCE_LABELS[source];
  const measureLabel = contentGapMeasureLabel(mode, source, monthLabel);
  const kindLabel = source === "sap" ? "SAP page(s)" : "post(s)";

  const summary = goalMet
    ? `Target met (${currentCount}/${targetCount}). No ${kindLabel} needed.`
    : `Create ${gapCount} ${kindLabel} to reach the target.`;

  const label = goalMet
    ? `${measureLabel}: target met (${currentCount}/${targetCount})`
    : `${measureLabel}: ${currentCount}/${targetCount} (gap ${gapCount})`;

  const contextLines = [
    `Content: ${sitemapLabel}`,
    `Measure: ${measureLabel}`,
  ];
  if (mode === "editorial_month" && typeof scheduledCount === "number" && typeof publishedCount === "number") {
    contextLines.push(`Scheduled in month: ${scheduledCount}`);
    contextLines.push(`Posted in month: ${publishedCount}`);
  }
  contextLines.push(
    `Current: ${currentCount}`,
    `Target: ${targetCount}`,
    `Gap: ${gapCount}`,
    summary,
  );

  const contextBody = contextLines.filter(Boolean).join("\n");

  return {
    currentCount,
    targetCount,
    gapCount,
    goalMet,
    label,
    monthLabel,
    contentLabel: sitemapLabel,
    measureLabel,
    statusText: summary,
    contextText: contextBody,
    ...(mode === "editorial_month" ? { scheduledCount, publishedCount } : {}),
  };
}

export function formatContentGapRunMessage(result: ContentGapCountResult): string {
  const prefix = `gap=${result.gapCount}`;
  return `${prefix} | ${result.label}`;
}

/** Agent-run step / card hint when the gap check finishes. */
export function contentGapOutcomeStepLabel(result: ContentGapCountResult): string {
  if (result.goalMet) return "Target met";
  const unit = result.contentLabel === OVERVIEW_SITEMAP_SOURCE_LABELS.sap ? "SAP page" : "post";
  const noun = result.gapCount === 1 ? unit : `${unit}s`;
  return `Gap found: ${result.gapCount} ${noun}`;
}

export function ensureContentGapCheckPayload(payload?: TaskExecutionPayload | null): TaskExecutionPayload {
  const base = payload ?? {};
  const dayRaw = base.contentGapDayOfMonth;
  const dayOfMonth =
    typeof dayRaw === "number" && Number.isFinite(dayRaw)
      ? Math.min(31, Math.max(1, Math.floor(dayRaw)))
      : 1;
  return {
    ...base,
    contentGapSitemapSource: base.contentGapSitemapSource ?? "posts",
    contentGapCountMode: base.contentGapCountMode ?? "editorial_month",
    // Counts always use the current calendar month; day-of-month is the every-month rule.
    contentGapCountMonth: defaultLocalCalendarMonthKey(),
    contentGapDayOfMonth: dayOfMonth,
    contentGapTargetCount:
      base.contentGapUseEditorialPackage === true
        ? typeof base.contentGapTargetCount === "number" && base.contentGapTargetCount > 0
          ? base.contentGapTargetCount
          : undefined
        : typeof base.contentGapTargetCount === "number" && base.contentGapTargetCount > 0
          ? base.contentGapTargetCount
          : 4,
  };
}

export async function resolveContentGapCount(
  site: WordPressSite,
  payload: TaskExecutionPayload,
): Promise<ContentGapCountResult> {
  const { source, mode, target, monthKey, monthLabel } = resolvePayloadConfig(payload);
  const { currentCount, scheduledCount, publishedCount } = await resolveCurrentCount(site, source, mode, monthKey);
  return buildGapResult({
    source,
    mode,
    currentCount,
    targetCount: target,
    monthLabel,
    scheduledCount,
    publishedCount,
  });
}
