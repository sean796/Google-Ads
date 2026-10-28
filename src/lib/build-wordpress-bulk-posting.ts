/**
 * Build WordPress bulk posting options only from explicit UI state - no default site pickers.
 */

import { getStoredSites } from '@/components/integrations/storage';
import type { CSVRow, WordPressPostingOptions, WordPressPostDestination } from '@/lib/bulk-auto-generate';
import type { ScheduleOccupancy } from '@/lib/bulk-schedule-gap';
import { gapScheduleStartDate } from '@/lib/bulk-schedule-gap';
import { resolveBulkWordPressPublishDate, resolveTimesPerMonthAnchorStart, type ScheduleFrequency } from '@/lib/wordpress-scheduler';

import type { BulkSitemapMode } from '@/lib/bulk/bulk-sitemap-mode';
import { defaultBulkSitemapMode, postingSitemapPlaceholder } from '@/lib/bulk/bulk-sitemap-mode';

type SiteCfg = {
  sitemapType: BulkSitemapMode;
  wordpressRestEndpoint?: 'posts' | 'pages';
};

/** When UI selection is empty, use the enabled / connected stored site (workspace chrome path). */
export function resolveDefaultWordPressSiteSelection(): {
  selectedSiteIds: Set<string>;
  siteConfigs: Record<string, SiteCfg>;
} | null {
  const all = getStoredSites();
  if (all.length === 0) return null;

  const enabled =
    all.find((s) => s.connectionStatus === 'success' && s.enabled !== false) ??
    all.find((s) => s.enabled !== false) ??
    all.sort((a, b) => (b.connectedAt || 0) - (a.connectedAt || 0))[0];

  if (!enabled) return null;

  return {
    selectedSiteIds: new Set([enabled.id]),
    siteConfigs: {
      [enabled.id]: { sitemapType: defaultBulkSitemapMode() },
    },
  };
}

export function buildWordPressPostingFromSelection(params: {
  selectedSiteIds: Set<string>;
  siteConfigs: Record<string, SiteCfg>;
  scheduleFrequency: ScheduleFrequency;
  customInterval: number;
  dayOfWeek: number;
  startDateOption: 'immediate' | 'custom';
  customStartDate: Date;
  startTime: string;
  totalRows: number;
  /** When false, CSV `publish_date_gmt` is ignored for scheduling (default true). */
  useCsvPublishDates?: boolean;
  postDestination?: WordPressPostDestination;
  scheduleOccupancy?: ScheduleOccupancy | null;
  useGapScheduling?: boolean;
  draftOnly?: boolean;
  publishDays?: number[];
}): WordPressPostingOptions | undefined {
  const {
    selectedSiteIds,
    siteConfigs,
    scheduleFrequency,
    customInterval,
    dayOfWeek,
    startDateOption,
    customStartDate,
    startTime,
    totalRows,
    useCsvPublishDates = false,
    postDestination = 'wordpress',
    scheduleOccupancy = null,
    useGapScheduling = false,
    draftOnly = false,
    publishDays,
  } = params;

  if (postDestination === 'local') return undefined;

  if (selectedSiteIds.size === 0) return undefined;
  for (const id of selectedSiteIds) {
    if (!siteConfigs[id]) return undefined;
  }

  const all = getStoredSites();
  const selected = all.filter((s) => selectedSiteIds.has(s.id));
  if (selected.length === 0) return undefined;

  const startDate =
    scheduleFrequency === 'custom'
      ? resolveTimesPerMonthAnchorStart(startDateOption, customStartDate, startTime)
      : startDateOption === 'immediate'
        ? gapScheduleStartDate(startTime)
        : customStartDate || new Date();

  const gapActive =
    scheduleFrequency !== 'custom' && useGapScheduling && scheduleOccupancy != null;

  const sitesArray = selected.map((site) => {
    const siteConfig = siteConfigs[site.id]!;
    const rowType = postingSitemapPlaceholder(siteConfig.sitemapType);
    return { site, sitemapType: rowType };
  });

  const first = selected[0]!;
  const firstCfg = siteConfigs[first.id]!;
  const firstRowType = postingSitemapPlaceholder(firstCfg.sitemapType);

  return {
    enabled: true,
    site: first,
    sitemapType: firstRowType,
    frequency: scheduleFrequency,
    customInterval:
      scheduleFrequency === 'custom' || scheduleFrequency === 'everyNDays' ? customInterval : undefined,
    customStaggerOptimized: scheduleFrequency === 'custom' ? true : undefined,
    dayOfWeek: scheduleFrequency === 'weekly' ? dayOfWeek : undefined,
    startDate,
    startTime,
    totalRows,
    sites: sitesArray,
    useCsvPublishDates,
    postDestination,
    scheduleOccupancy: gapActive ? scheduleOccupancy : undefined,
    useGapScheduling: gapActive,
    draftOnly: draftOnly || undefined,
    publishDays: scheduleFrequency === 'custom' ? publishDays : undefined,
    wordpressRestEndpoint:
      firstCfg.wordpressRestEndpoint === 'pages' ? 'pages' : 'posts',
  };
}

/** Precompute gap slot dates for a bulk run (respects CSV overrides when enabled). */
export function precomputeGapDatesBySlot(
  rows: CSVRow[],
  posting: WordPressPostingOptions,
): Date[] | undefined {
  if (!posting.useGapScheduling || !posting.scheduleOccupancy) return undefined;

  const priorDates: Date[] = [];
  const dates: Date[] = [];
  const useCsvPublishDates = posting.useCsvPublishDates !== false;

  for (let i = 0; i < rows.length; i++) {
    const schedule = {
      frequency: posting.frequency,
      customInterval: posting.customInterval,
      customStaggerOptimized: posting.customStaggerOptimized,
      dayOfWeek: posting.dayOfWeek,
      startDate: posting.startDate,
      startTime: posting.startTime,
      totalRows: rows.length,
      useGapScheduling: true,
      scheduleOccupancy: posting.scheduleOccupancy,
      priorInBatchDates: [...priorDates],
      publishDays: posting.publishDays,
    };
    const { date } = resolveBulkWordPressPublishDate({
      rowPublishDateGmt: rows[i]?.publish_date_gmt,
      rowIndex: i,
      schedule,
      useCsvPublishDates,
    });
    dates.push(date);
    priorDates.push(date);
  }

  return dates;
}
