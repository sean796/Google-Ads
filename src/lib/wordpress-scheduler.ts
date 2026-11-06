/**
 * WordPress Post Scheduler Utilities
 * Calculates scheduled dates for bulk WordPress posts based on frequency and start date
 */

import type { ScheduleOccupancy } from '@/lib/bulk-schedule-gap';
import { calculateGapScheduledDate } from '@/lib/bulk-schedule-gap';
import { normalizePublishDays } from '@/lib/schedule-publish-days';

export type ScheduleFrequency = 'immediately' | 'daily' | 'weekly' | 'monthly' | 'custom' | 'everyNDays';

/** Stagger window for "optimized" custom (times/month) scheduling: minutes added from Start Time across slots. */
export const OPTIMIZED_STAGGER_WINDOW_MINUTES = 480;

/** Do not schedule calculated posts in the last N calendar days of the month (UTC). */
export const MONTH_END_SCHEDULING_BUFFER_DAYS = 5;

const TIMES_PER_MONTH_MAX = 31;
const EVERY_N_DAYS_MAX = 365;

export function clampTimesPerMonth(n: number): number {
  return Math.max(1, Math.min(TIMES_PER_MONTH_MAX, Math.floor(Number.isFinite(n) ? n : 1) || 1));
}

/** For `everyNDays` frequency: interval between posts (1–365 calendar days). */
export function clampEveryNDays(n: number): number {
  return Math.max(1, Math.min(EVERY_N_DAYS_MAX, Math.floor(Number.isFinite(n) ? n : 1) || 1));
}

export interface ScheduleOptions {
  frequency: ScheduleFrequency;
  /** For `custom`: posts per calendar month (1–31). For `everyNDays`: days between posts (1–365). */
  customInterval?: number;
  /** For `custom` + times-per-month: spread publish times across {@link OPTIMIZED_STAGGER_WINDOW_MINUTES} from Start Time. */
  customStaggerOptimized?: boolean;
  dayOfWeek?: number; // 0-6, where 0 is Sunday (only used for weekly frequency)
  startDate: Date;
  startTime: string; // HH:MM format
  totalRows: number;
  /** Post inventory occupancy for Next available slot gap scheduling. */
  scheduleOccupancy?: ScheduleOccupancy;
  /** When true with scheduleOccupancy, skip occupied day/week/month periods. */
  useGapScheduling?: boolean;
  /** Prior slot dates in the same bulk run (gap scheduling in-batch dedupe). */
  priorInBatchDates?: Date[];
  /** Explicit day-of-month slots for times-per-month (unique, 1..lastAllowed). */
  publishDays?: number[];
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** If UTC calendar day is in the excluded month tail, move to the latest allowed day; preserves time. */
export function clampUtcDateAgainstMonthEndBuffer(d: Date): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const dim = daysInUtcMonth(y, m);
  const lastAllowed = Math.max(1, dim - MONTH_END_SCHEDULING_BUFFER_DAYS);
  if (d.getUTCDate() <= lastAllowed) {
    return d;
  }
  const out = new Date(d);
  out.setUTCDate(lastAllowed);
  return out;
}

function calculateCustomTimesPerMonthDate(rowIndex: number, options: ScheduleOptions): Date {
  const timesPerMonth = clampTimesPerMonth(options.customInterval ?? 1);
  const customStaggerOptimized = options.customStaggerOptimized ?? false;
  const { startDate, startTime } = options;
  const [hours, minutes] = startTime.split(':').map(Number);
  const h = hours || 0;
  const mi = minutes || 0;

  const monthIndex = Math.floor(rowIndex / timesPerMonth);
  const slotIndex = rowIndex % timesPerMonth;

  const y0 = startDate.getUTCFullYear();
  const m0 = startDate.getUTCMonth();
  const d0 = startDate.getUTCDate();

  const targetMonthStart = new Date(Date.UTC(y0, m0 + monthIndex, 1));
  const y = targetMonthStart.getUTCFullYear();
  const month = targetMonthStart.getUTCMonth();
  const dim = daysInUtcMonth(y, month);

  const lastDay = Math.max(1, dim - MONTH_END_SCHEDULING_BUFFER_DAYS);
  const rawStart = monthIndex === 0 ? d0 : 1;
  const startDay = Math.min(rawStart, lastDay);
  const span = Math.max(1, lastDay - startDay + 1);

  let dayOfMonth: number;
  if (options.publishDays && options.publishDays.length > 0) {
    const normalized = normalizePublishDays(options.publishDays, timesPerMonth, 31);
    if (!normalized) {
      throw new Error("Publish days do not match times per month.");
    }
    const slotDay = normalized[slotIndex];
    if (slotDay == null) {
      throw new Error("Publish days do not match times per month.");
    }
    dayOfMonth = Math.min(lastDay, slotDay);
  } else if (timesPerMonth <= 1) {
    dayOfMonth = Math.min(lastDay, startDay);
  } else if (span <= 1) {
    dayOfMonth = startDay;
  } else {
    dayOfMonth = startDay + Math.floor((slotIndex / (timesPerMonth - 1)) * (span - 1));
    dayOfMonth = Math.min(lastDay, Math.max(startDay, dayOfMonth));
  }

  const stagger =
    customStaggerOptimized && timesPerMonth > 1
      ? Math.floor((slotIndex / (timesPerMonth - 1)) * OPTIMIZED_STAGGER_WINDOW_MINUTES)
      : 0;

  const scheduled = new Date(Date.UTC(y, month, dayOfMonth, h, mi, 0, 0));
  scheduled.setUTCMinutes(scheduled.getUTCMinutes() + stagger);
  return clampUtcDateAgainstMonthEndBuffer(scheduled);
}

/**
 * Calculate the scheduled date for a specific row index
 *
 * @param rowIndex - Zero-based index of the row (0 = first post)
 * @param options - Scheduling options
 * @returns Date object in UTC for the scheduled post
 */
export function calculateScheduledDate(rowIndex: number, options: ScheduleOptions): Date {
  const { frequency, customInterval, dayOfWeek, startDate, startTime } = options;

  if (frequency === 'immediately') {
    return new Date();
  }

  if (frequency === 'custom') {
    return calculateCustomTimesPerMonthDate(rowIndex, options);
  }

  // Parse start time (HH:MM)
  const [hours, minutes] = startTime.split(':').map(Number);

  // Create base date from start date with specified time
  const baseDate = new Date(startDate);
  baseDate.setUTCHours(hours || 0, minutes || 0, 0, 0);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startDayOnly = new Date(startDate);
  startDayOnly.setHours(0, 0, 0, 0);
  /** User picked a calendar day before today - allow anchoring the series in the past (no "next week" bump). */
  const startCalendarDayIsPast = startDayOnly.getTime() < startOfToday.getTime();

  // Calculate offset based on frequency
  let daysOffset = 0;

  switch (frequency) {
    case 'daily':
      daysOffset = rowIndex;
      break;

    case 'weekly':
      if (dayOfWeek !== undefined) {
        // For weekly with specific day of week, find the next occurrence of that day
        if (rowIndex === 0) {
          // First post: find the next occurrence of the selected day of week from start date
          const currentDayOfWeek = baseDate.getUTCDay();
          let daysToAdd = (dayOfWeek - currentDayOfWeek + 7) % 7;
          // If the start date is already the selected day, check if time has passed
          if (daysToAdd === 0 && !startCalendarDayIsPast) {
            const now = new Date();
            if (baseDate.getTime() <= now.getTime()) {
              // Time has passed, use next week
              daysToAdd = 7;
            }
          }
          daysOffset = daysToAdd;
        } else {
          // Subsequent posts: every 7 days from the first post
          // Calculate first post date
          const firstPostCurrentDay = baseDate.getUTCDay();
          const firstPostDaysToAdd = (dayOfWeek - firstPostCurrentDay + 7) % 7;
          const firstPostDate = new Date(baseDate);
          firstPostDate.setUTCDate(
            baseDate.getUTCDate() + (firstPostDaysToAdd === 0 && baseDate.getTime() <= new Date().getTime() ? 7 : firstPostDaysToAdd)
          );
          // Calculate this post's date (7 days * rowIndex from first post)
          daysOffset = firstPostDaysToAdd + rowIndex * 7;
          // Adjust if first post needed to skip to next week
          if (!startCalendarDayIsPast && firstPostDaysToAdd === 0 && baseDate.getTime() <= new Date().getTime()) {
            daysOffset = 7 + rowIndex * 7;
          }
        }
      } else {
        // Fallback to simple weekly calculation if no day specified
        daysOffset = rowIndex * 7;
      }
      break;

    case 'monthly':
      // Approximate months as 30 days (WordPress will handle actual month boundaries)
      daysOffset = rowIndex * 30;
      break;

    case 'everyNDays': {
      const n = clampEveryNDays(customInterval ?? 1);
      daysOffset = rowIndex * n;
      break;
    }

    default:
      daysOffset = rowIndex * (customInterval || 1);
      break;
  }

  // Add offset to base date
  const scheduledDate = new Date(baseDate);
  scheduledDate.setUTCDate(baseDate.getUTCDate() + daysOffset);

  if (frequency === 'monthly') {
    return clampUtcDateAgainstMonthEndBuffer(scheduledDate);
  }
  return scheduledDate;
}

/**
 * Format scheduled date as ISO 8601 string for WordPress API (UTC)
 *
 * @param date - Date object
 * @returns ISO 8601 string in UTC format (e.g., "2024-01-15T10:00:00")
 */
export function formatWordPressDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/** `YYYY-MM-DD` with ASCII hyphens; digits only in date positions (no regex). */
function isStrictYyyyMmDd(s: string): boolean {
  if (s.length !== 10) return false;
  if (s.charCodeAt(4) !== 45 || s.charCodeAt(7) !== 45) return false;
  for (let i = 0; i < 10; i++) {
    if (i === 4 || i === 7) continue;
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

/**
 * Calendar day `YYYY-MM-DD` at {@link startTime} (`HH:MM`) on that day in UTC.
 * Full ISO timestamps in the CSV should use {@link Date} parsing instead; see {@link parseBulkCsvPublishDateCell}.
 */
function utcDateFromYyyyMmDdAndStartTime(yyyyMmDd: string, startTime: string): Date | null {
  const y = Number(yyyyMmDd.slice(0, 4));
  const mo = Number(yyyyMmDd.slice(5, 7));
  const d = Number(yyyyMmDd.slice(8, 10));
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const [hours, minutes] = startTime.split(':').map(Number);
  const h = Number.isFinite(hours) ? hours : 0;
  const mi = Number.isFinite(minutes) ? minutes : 0;
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/**
 * Parse optional bulk CSV `publish_date_gmt` cell: ISO 8601 instant, or strict `YYYY-MM-DD` plus bulk Start Time (UTC).
 * Returns null if empty or unparseable (caller falls back to {@link calculateScheduledDate}).
 */
export function parseBulkCsvPublishDateCell(cell: string | undefined, startTime: string): Date | null {
  if (cell == null) return null;
  const raw = cell.trim();
  if (!raw) return null;

  if (isStrictYyyyMmDd(raw)) {
    return utcDateFromYyyyMmDdAndStartTime(raw, startTime);
  }

  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

export type BulkPublishDateSource = 'csv' | 'calculated';

const PUBLISH_NOW_GRACE_MS = 30_000;

/**
 * Posts scheduled at or before now (+ grace) use status `publish` (backdate via date_gmt);
 * otherwise `future`. Callers must still send date_gmt for past dates so WP does not stamp "now".
 */
export function resolveWordPressPostStatusForSchedule(
  scheduledDate: Date,
): 'publish' | 'future' {
  return scheduledDate.getTime() <= Date.now() + PUBLISH_NOW_GRACE_MS ? 'publish' : 'future';
}

/**
 * Effective WordPress publish instant for a bulk row: CSV override when valid, else frequency-based schedule.
 */
export function resolveBulkWordPressPublishDate(input: {
  rowPublishDateGmt?: string;
  rowIndex: number;
  schedule: ScheduleOptions;
  /** When false, ignore CSV cells and use frequency schedule only (default true). */
  useCsvPublishDates?: boolean;
}): { date: Date; source: BulkPublishDateSource } {
  if (input.schedule.frequency === 'immediately') {
    return { date: new Date(), source: 'calculated' };
  }
  const useCsv = input.useCsvPublishDates !== false;
  const startTime = input.schedule.startTime?.trim() || '09:00';
  const parsed = useCsv ? parseBulkCsvPublishDateCell(input.rowPublishDateGmt, startTime) : null;
  if (parsed != null) {
    return { date: parsed, source: 'csv' };
  }
  if (input.schedule.useGapScheduling && input.schedule.scheduleOccupancy) {
    return {
      date: calculateGapScheduledDate(
        input.rowIndex,
        input.schedule,
        input.schedule.scheduleOccupancy,
        input.schedule.priorInBatchDates ?? [],
      ),
      source: 'calculated',
    };
  }
  return {
    date: calculateScheduledDate(input.rowIndex, input.schedule),
    source: 'calculated',
  };
}

/**
 * Generate a human-readable schedule preview
 *
 * @param options - Scheduling options
 * @returns String describing the schedule (e.g., "5 posts scheduled: Jan 1, Jan 2, Jan 3...")
 */
export function formatSchedulePreview(options: ScheduleOptions): string {
  const { frequency, customInterval, customStaggerOptimized, dayOfWeek, startDate, startTime, totalRows } = options;

  if (totalRows === 0) {
    return 'No posts to schedule';
  }

  // Format frequency description
  let frequencyDesc = '';
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const tpm = clampTimesPerMonth(customInterval ?? 1);
  const nDays = clampEveryNDays(customInterval ?? 1);

  switch (frequency) {
    case 'immediately':
      frequencyDesc = 'immediately (publish now)';
      break;
    case 'daily':
      frequencyDesc = 'daily';
      break;
    case 'weekly':
      if (dayOfWeek !== undefined) {
        frequencyDesc = `weekly on ${dayNames[dayOfWeek]}s`;
      } else {
        frequencyDesc = 'weekly';
      }
      break;
    case 'monthly':
      frequencyDesc = 'monthly';
      break;
    case 'custom':
      frequencyDesc = `${tpm} time${tpm !== 1 ? 's' : ''} per month`;
      if (customStaggerOptimized) {
        frequencyDesc += ` (optimized: staggered times over ${OPTIMIZED_STAGGER_WINDOW_MINUTES / 60}h from start)`;
      }
      break;
    case 'everyNDays':
      frequencyDesc = `every ${nDays} day${nDays !== 1 ? 's' : ''}`;
      break;
  }

  // Calculate first few dates for preview
  const previewDates: string[] = [];
  const maxPreview = Math.min(5, totalRows);

  for (let i = 0; i < maxPreview; i++) {
    const date = calculateScheduledDate(i, options);
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== startDate.getFullYear() ? 'numeric' : undefined,
    });
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const piece = frequency === 'custom' && customStaggerOptimized ? `${dateStr} ${timeStr}` : dateStr;
    previewDates.push(piece);
  }

  let preview = previewDates.join(', ');
  if (totalRows > maxPreview) {
    preview += `... (${totalRows} total)`;
  } else {
    preview += ` (${totalRows} post${totalRows !== 1 ? 's' : ''})`;
  }

  return `${totalRows} post${totalRows !== 1 ? 's' : ''} scheduled ${frequencyDesc} starting ${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${startTime}: ${preview}`;
}

export {
  dateForPickDatePreset,
  getFirstOfThisMonthDate,
  getNextAvailableStartDate,
  getNextFirstOfMonthDate,
  isSameLocalCalendarDay,
  isSameUtcYearMonth,
  resolveTimesPerMonthAnchorStart,
} from "./wordpress-scheduler-dates";
