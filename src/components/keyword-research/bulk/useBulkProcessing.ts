import { useCallback } from 'react';
import type { WordPressPostingOptions, WordPressPostDestination } from '@/lib/bulk-auto-generate';
import type { CSVRow } from '@/lib/bulk-auto-generate';
import { applyRowOrder, buildBulkBaseRows } from '@/lib/bulk-processing-order';
import type { BuildBulkBaseRowsFailureReason } from '@/lib/bulk-processing-order';
import { notify, notifyHeaderError } from '@/lib/app-notifications';
import { NOTIFY_LOCAL_EXPORT_GENERATING_FILES_ONLY_NO_WO, NOTIFY_SELECT_A_WORDPRESS_SITE_AND_SITEMAP_IN_T, notifyPostingToXWordpressSiteSNames } from "@/lib/notify-messages";
import type { ScheduleOccupancy } from '@/lib/bulk-schedule-gap';
import { buildWordPressPostingFromSelection, precomputeGapDatesBySlot, resolveDefaultWordPressSiteSelection } from '@/lib/build-wordpress-bulk-posting';
import {
  batchNeedsWordPressUpload,
} from '@/lib/bulk-post-destination-normalize';
import type { ScheduleFrequency } from '@/lib/wordpress-scheduler';
import type { BulkSitemapMode } from '@/lib/bulk/bulk-sitemap-mode';

interface SiteConfig {
  sitemapType: BulkSitemapMode;
}

interface UseBulkProcessingProps {
  inputMode: 'csv' | 'prompt';
  rows: CSVRow[];
  generatedRows: CSVRow[];
  selectedBlogIndices: Set<number>;
  /** Permutation: slot i processes baseRows[rowOrder[i]]. Length must match base row count. */
  rowOrder: number[];
  selectedWordPressSites: Set<string>;
  siteConfigs: Record<string, SiteConfig>;
  scheduleFrequency: ScheduleFrequency;
  customInterval: number;
  dayOfWeek: number;
  startDateOption: 'immediate' | 'custom';
  customStartDate: Date;
  startTime: string;
  useCsvPublishDates: boolean;
  wordpressDraftOnly?: boolean;
  apiKey?: string;
  openRouterApiKey?: string;
  selectedModel?: string;
  bulkPostDestination: WordPressPostDestination;
  scheduleOccupancy?: ScheduleOccupancy | null;
  useGapScheduling?: boolean;
  refreshScheduleOccupancy?: () => Promise<ScheduleOccupancy | null>;
  processAllRows: (
    rows: CSVRow[],
    wordPressPosting?: WordPressPostingOptions,
    rowDisplayIndices?: number[]
  ) => Promise<void>;
  setIsProcessing: (value: boolean) => void;
  setCurrentRow: (value: number) => void;
}

const FAILURE_MESSAGES: Record<BuildBulkBaseRowsFailureReason, string> = {
  csv_empty: 'Please load a CSV file first',
  prompt_empty: 'Please generate blog ideas from your prompt first',
  selection_empty: 'No valid rows selected',
};

export function useBulkProcessing({
  inputMode,
  rows,
  generatedRows,
  selectedBlogIndices,
  rowOrder,
  selectedWordPressSites,
  siteConfigs,
  scheduleFrequency,
  customInterval,
  dayOfWeek,
  startDateOption,
  customStartDate,
  startTime,
  useCsvPublishDates,
  wordpressDraftOnly = false,
  bulkPostDestination,
  scheduleOccupancy = null,
  useGapScheduling = false,
  refreshScheduleOccupancy,
  processAllRows,
  setIsProcessing,
  setCurrentRow,
}: UseBulkProcessingProps) {
  const handleStartProcessing = useCallback(async (promptRowsOverride?: CSVRow[]) => {
    const effectiveGeneratedRows = promptRowsOverride ?? generatedRows;
    const built = buildBulkBaseRows(inputMode, rows, effectiveGeneratedRows, selectedBlogIndices);
    if (built.ok === false) {
      notifyHeaderError("Play failed", FAILURE_MESSAGES[built.reason]);
      notify.error(FAILURE_MESSAGES[built.reason]);
      return;
    }
    if (built.infoMessage) {
      notify.info(built.infoMessage);
    }

    const { orderedRows, orderedDisplayIndices } = applyRowOrder(
      built.baseRows,
      built.baseDisplayIndices,
      rowOrder
    );

    const needsWordPress = batchNeedsWordPressUpload(orderedRows, bulkPostDestination);

    // Wave 0: no client key gate. The server call runs keyless and fails
    // visibly there if the server key is not configured.
    // isProcessing is set inside runBulkBatchRows (avoid stuck UI if the run no-ops).
    let occupancyForRun = scheduleOccupancy;
    if (useGapScheduling && refreshScheduleOccupancy) {
      occupancyForRun = (await refreshScheduleOccupancy()) ?? occupancyForRun;
    }

    const defaultSelection =
      selectedWordPressSites.size === 0 ? resolveDefaultWordPressSiteSelection() : null;
    const effectiveSiteIds = defaultSelection?.selectedSiteIds ?? selectedWordPressSites;
    const effectiveSiteConfigs = defaultSelection?.siteConfigs ?? siteConfigs;

    const postingDest = needsWordPress
      ? bulkPostDestination === "local"
        ? "wordpress"
        : bulkPostDestination
      : "local";

    const wordPressPosting = buildWordPressPostingFromSelection({
      selectedSiteIds: effectiveSiteIds,
      siteConfigs: effectiveSiteConfigs,
      scheduleFrequency,
      customInterval,
      dayOfWeek,
      startDateOption,
      customStartDate,
      startTime,
      totalRows: orderedRows.length,
      useCsvPublishDates: false,
      postDestination: postingDest,
      scheduleOccupancy: occupancyForRun,
      useGapScheduling: useGapScheduling && Boolean(occupancyForRun),
      draftOnly: wordpressDraftOnly,
    });

    let postingForRun = wordPressPosting;
    if (postingForRun?.useGapScheduling && postingForRun.scheduleOccupancy) {
      const gapDates = precomputeGapDatesBySlot(orderedRows, postingForRun);
      if (gapDates) {
        postingForRun = { ...postingForRun, gapDatesBySlot: gapDates };
      }
    }

    if (!needsWordPress) {
      notify.info(NOTIFY_LOCAL_EXPORT_GENERATING_FILES_ONLY_NO_WO);
      await processAllRows(orderedRows, undefined, orderedDisplayIndices);
      return;
    }

    if (!wordPressPosting?.enabled) {
      setIsProcessing(false);
      notifyHeaderError("Play failed", NOTIFY_SELECT_A_WORDPRESS_SITE_AND_SITEMAP_IN_T);
      notify.error(NOTIFY_SELECT_A_WORDPRESS_SITE_AND_SITEMAP_IN_T);
      return;
    }

    const names = (postingForRun?.sites ?? []).map((x) => x.site.name).join(", ");
    if (needsWordPress) {
      notify.info(
        notifyPostingToXWordpressSiteSNames(postingForRun?.sites?.length ?? 0, names || undefined)
      );
    }

    await processAllRows(orderedRows, postingForRun, orderedDisplayIndices);
  }, [inputMode, rows, generatedRows, selectedBlogIndices, rowOrder, selectedWordPressSites, siteConfigs, scheduleFrequency, customInterval, dayOfWeek, startDateOption, customStartDate, startTime, wordpressDraftOnly, bulkPostDestination, scheduleOccupancy, useGapScheduling, refreshScheduleOccupancy, processAllRows, setIsProcessing]);

  return {
    handleStartProcessing,
  };
}
