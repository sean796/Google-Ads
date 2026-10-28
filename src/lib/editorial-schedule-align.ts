import type { EditorialContentQuotas } from "@/lib/editorial-content-package";
import {
  formatLocalCalendarMonthKey,
  getLocalCalendarMonthAfterBeforeForMonthKey,
  parseLocalCalendarMonthKey,
  staggerPublishDatesAcrossRange,
} from "@/lib/quarter-bounds";

export type FutureEditorialPost = {
  id: number;
  date_gmt: string;
  title: string;
  postTypeEndpoint: string;
  kind: "blog" | "sap";
};

export type EditorialAlignMove = {
  post: FutureEditorialPost;
  oldDateGmt: string;
  newDateGmt: string;
};

const DEFAULT_SLOT_WINDOW_DAYS = 14;
const DEFAULT_PUBLISH_TIME = "02:00";

function parseMonthKey(monthKey: string): { year: number; monthIndex: number } {
  const d = parseLocalCalendarMonthKey(monthKey);
  return { year: d.getFullYear(), monthIndex: d.getMonth() };
}

function addCalendarMonths(monthKey: string, delta: number): string {
  const { year, monthIndex } = parseMonthKey(monthKey);
  const d = new Date(year, monthIndex + delta, 1);
  return formatLocalCalendarMonthKey(d);
}

/** Local wall-clock `YYYY-MM-DD` + `HH:MM` to WordPress `date_gmt` (UTC ISO). */
export function localPublishSlotToDateGmt(dayKey: string, publishTimeLocal: string): string {
  const [y, m, d] = dayKey.split("-").map((x) => Number(x));
  const [hh, mm] = publishTimeLocal.split(":").map((x) => Number(x));
  const local = new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0);
  return local.toISOString().slice(0, 19);
}

function monthSlotRange(monthKey: string, slotWindowDays: number): { start: Date; endExclusive: Date } {
  const month = getLocalCalendarMonthAfterBeforeForMonthKey(monthKey);
  const start = new Date(month.after);
  const endExclusive = new Date(start);
  endExclusive.setDate(endExclusive.getDate() + Math.max(1, slotWindowDays));
  const monthEnd = new Date(month.before);
  if (endExclusive.getTime() > monthEnd.getTime()) {
    return { start, endExclusive: monthEnd };
  }
  return { start, endExclusive };
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function resolveSlotRangeStart(
  monthKey: string,
  slotWindowDays: number,
  rangeStartOffsetDays: number,
  notBefore: Date,
): { rangeStart: Date; endExclusive: Date } | null {
  const { start, endExclusive } = monthSlotRange(monthKey, slotWindowDays);
  const rangeStart = new Date(start);
  if (rangeStartOffsetDays > 0) {
    rangeStart.setDate(rangeStart.getDate() + rangeStartOffsetDays);
  }
  const floor = startOfLocalDay(notBefore);
  if (rangeStart.getTime() < floor.getTime()) {
    rangeStart.setTime(floor.getTime());
  }
  if (rangeStart.getTime() >= endExclusive.getTime()) {
    return null;
  }
  return { rangeStart, endExclusive };
}

function assignSlotsForMonth(
  posts: FutureEditorialPost[],
  count: number,
  monthKey: string,
  publishTimeLocal: string,
  slotWindowDays: number,
  rangeStartOffsetDays: number,
  notBefore: Date,
): EditorialAlignMove[] {
  if (count <= 0 || posts.length === 0) return [];
  const slotRange = resolveSlotRangeStart(monthKey, slotWindowDays, rangeStartOffsetDays, notBefore);
  if (!slotRange) return [];
  const take = posts.splice(0, Math.min(count, posts.length));
  const dayKeys = staggerPublishDatesAcrossRange({
    rowCount: take.length,
    rangeStart: slotRange.rangeStart,
    rangeEndExclusive: slotRange.endExclusive,
  });
  const moves: EditorialAlignMove[] = [];
  for (let i = 0; i < take.length; i++) {
    const post = take[i]!;
    const dayKey = dayKeys[i] ?? dayKeys[dayKeys.length - 1]!;
    const newDateGmt = localPublishSlotToDateGmt(dayKey, publishTimeLocal);
    moves.push({ post, oldDateGmt: post.date_gmt, newDateGmt });
  }
  return moves;
}

/**
 * Redistribute future blog + SAP posts from startMonthKey forward, up to monthly package quotas.
 */
export function buildEditorialAlignPlan(args: {
  blogs: FutureEditorialPost[];
  saps: FutureEditorialPost[];
  quotas: EditorialContentQuotas;
  startMonthKey: string;
  publishTimeLocal?: string;
  slotWindowDays?: number;
  /** Do not assign publish slots before this instant (local calendar). Default: start of tomorrow. */
  notBefore?: Date;
}): EditorialAlignMove[] {
  const publishTime = args.publishTimeLocal?.trim() || DEFAULT_PUBLISH_TIME;
  const slotWindowDays = args.slotWindowDays ?? DEFAULT_SLOT_WINDOW_DAYS;
  const now = args.notBefore ?? new Date();
  const notBefore = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const blogQueue = [...args.blogs].sort((a, b) => a.date_gmt.localeCompare(b.date_gmt));
  const sapQueue = [...args.saps].sort((a, b) => a.date_gmt.localeCompare(b.date_gmt));
  const moves: EditorialAlignMove[] = [];
  let monthKey = args.startMonthKey.trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error(`Invalid startMonthKey: ${monthKey}`);
  }

  let guard = 0;
  while ((blogQueue.length > 0 || sapQueue.length > 0) && guard < 240) {
    guard += 1;
    const blogMoves = assignSlotsForMonth(
      blogQueue,
      args.quotas.blogsPerMonth,
      monthKey,
      publishTime,
      slotWindowDays,
      0,
      notBefore,
    );
    const sapMoves = assignSlotsForMonth(
      sapQueue,
      args.quotas.sapsPerMonth,
      monthKey,
      publishTime,
      slotWindowDays,
      2,
      notBefore,
    );
    if (blogMoves.length === 0 && sapMoves.length === 0) {
      monthKey = addCalendarMonths(monthKey, 1);
      continue;
    }
    moves.push(...blogMoves, ...sapMoves);
    monthKey = addCalendarMonths(monthKey, 1);
  }

  return moves;
}
