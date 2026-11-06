import type { WordPressSite } from "@/components/integrations/types";
import type { WordPressPostingOptions } from "@/lib/bulk-auto-generate";
import { buildWordPressPostingFromSelection } from "@/lib/build-wordpress-bulk-posting";
import type {
  PostCreatorExecutionPayload,
  PostCreatorPostDestination,
  PostCreatorSitemapType,
} from "@/lib/tasks-types";
import { clampTimesPerMonth } from "@/lib/wordpress-scheduler";
import { postCreatorRunStartDate } from "@/lib/post-creator/post-creator-run-start-date";
import { resolvePostCreatorPostCount } from "@/lib/post-creator/post-creator-post-count";

export { postCreatorRunStartDate };

export type ResolvedPostCreatorSchedule = {
  postCount: number;
  timesPerMonth: number;
  startDay: number;
  startTime: string;
  staggerOptimized: boolean;
  sitemapType: PostCreatorSitemapType;
  postDestination: PostCreatorPostDestination;
  featuredImage: boolean;
};

export function resolvePostCreatorSchedule(
  payload: PostCreatorExecutionPayload,
): ResolvedPostCreatorSchedule {
  const postCount = resolvePostCreatorPostCount(payload);
  const timesPerMonth = clampTimesPerMonth(payload.scheduleTimesPerMonth ?? postCount);
  // Stored payloads may carry the legacy "bank" destination value.
  const rawDestination: string | undefined = payload.postDestination;
  return {
    postCount,
    timesPerMonth,
    startDay: Math.max(1, Math.min(28, Math.floor(Number(payload.scheduleStartDay ?? 1) || 1))),
    startTime: payload.scheduleStartTime?.trim() || "09:00",
    staggerOptimized: payload.scheduleStaggerOptimized !== false,
    sitemapType: payload.sitemapType === "entity" ? "entity" : "post",
    postDestination:
      rawDestination === "draft"
        ? "draft"
        : rawDestination === "bank"
          ? "wordpress"
          : "wordpress",
    featuredImage: payload.featuredImage !== false,
  };
}

export function buildPostCreatorWordPressPosting(
  site: WordPressSite,
  rowCount: number,
  schedule: ResolvedPostCreatorSchedule,
  payload?: PostCreatorExecutionPayload,
): WordPressPostingOptions | undefined {
  const draftOnly =
    schedule.postDestination === "draft" || payload?.scheduleDraftOnly === true;
  const postDestination = "wordpress" as const;

  const selectedSiteIds = new Set([site.id]);
  const siteConfigs = { [site.id]: { sitemapType: schedule.sitemapType } };

  const scheduleFrequency = payload?.scheduleFrequency ?? "custom";
  const customInterval =
    payload?.scheduleCustomInterval ??
    (scheduleFrequency === "custom" ? schedule.timesPerMonth : 1);
  const dayOfWeek = payload?.scheduleDayOfWeek ?? 0;
  const startDateOption = payload?.scheduleStartDateOption ?? "custom";
  const startTime = schedule.startTime;
  const customStartDate = payload?.scheduleCustomStartDate
    ? new Date(`${payload.scheduleCustomStartDate.slice(0, 10)}T12:00:00`)
    : postCreatorRunStartDate(schedule.startDay, startTime);

  return buildWordPressPostingFromSelection({
    selectedSiteIds,
    siteConfigs,
    scheduleFrequency,
    customInterval,
    dayOfWeek,
    startDateOption,
    customStartDate,
    startTime,
    totalRows: rowCount,
    useCsvPublishDates: false,
    postDestination,
    draftOnly,
    publishDays: payload?.schedulePublishDays,
  });
}
