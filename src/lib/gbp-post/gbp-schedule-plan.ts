import {
  calculateScheduledDate,
  clampTimesPerMonth,
  formatSchedulePreview,
  formatWordPressDate,
  getFirstOfThisMonthDate,
  getNextAvailableStartDate,
  getNextFirstOfMonthDate,
  type ScheduleFrequency,
} from "@/lib/wordpress-scheduler";

export type GbpScheduleUiState = {
  numberOfPosts: number;
  scheduleFrequency: ScheduleFrequency;
  customInterval: number;
  startDateOption: "immediate" | "custom";
  customStartDate: Date;
  startTime: string;
};

/** UI scheduler state (includes fields not used by date math). */
export type GbpSchedulerSectionState = {
  numberOfPosts: number;
  scheduleFrequency: ScheduleFrequency;
  customInterval: number;
  dayOfWeek: number;
  startDateOption: "immediate" | "custom";
  customStartDate: Date;
  startTime: string;
  rowOrder: number[];
};

export const defaultGbpSchedulerState = (): GbpSchedulerSectionState => ({
  numberOfPosts: 1,
  scheduleFrequency: "custom",
  customInterval: 4,
  dayOfWeek: 1,
  startDateOption: "custom",
  customStartDate: getFirstOfThisMonthDate("09:00"),
  startTime: "09:00",
  rowOrder: [0],
});

export function gbpSchedulerToPlanState(s: GbpSchedulerSectionState): GbpScheduleUiState {
  return {
    numberOfPosts: s.numberOfPosts,
    scheduleFrequency: s.scheduleFrequency,
    customInterval: s.customInterval,
    startDateOption: s.startDateOption,
    customStartDate: s.customStartDate,
    startTime: s.startTime,
  };
}

export function clampNumberOfGbpPosts(n: number): number {
  return Math.max(1, Math.min(50, Math.floor(Number.isFinite(n) ? n : 1) || 1));
}

export function resolveGbpScheduleStartDate(state: GbpScheduleUiState): Date {
  return state.startDateOption === "immediate"
    ? getNextAvailableStartDate(state.startTime)
    : state.customStartDate;
}

export function buildGbpScheduleOptions(state: GbpScheduleUiState) {
  const totalRows = clampNumberOfGbpPosts(state.numberOfPosts);
  const startDate = resolveGbpScheduleStartDate(state);
  return {
    frequency: state.scheduleFrequency,
    customInterval:
      state.scheduleFrequency === "custom" || state.scheduleFrequency === "everyNDays"
        ? state.customInterval
        : undefined,
    customStaggerOptimized: state.scheduleFrequency === "custom" ? true : undefined,
    dayOfWeek: state.scheduleFrequency === "weekly" ? 0 : undefined,
    startDate,
    startTime: state.startTime,
    totalRows,
  };
}

/** ISO-8601 UTC for server queue (must include Z so Date.parse is not local-time). */
export function gbpScheduledIsoForSlot(state: GbpScheduleUiState, slotIndex: number): string {
  const schedule = buildGbpScheduleOptions(state);
  const date = calculateScheduledDate(slotIndex, schedule);
  return date.toISOString();
}

export function gbpSchedulePreviewText(state: GbpScheduleUiState): string {
  return formatSchedulePreview(buildGbpScheduleOptions(state));
}

export function applyGbpQuarterPostCount(
  timesPerMonth: number,
  setNumberOfPosts: (n: number) => void,
): void {
  setNumberOfPosts(clampNumberOfGbpPosts(clampTimesPerMonth(timesPerMonth) * 3));
}

export { getFirstOfThisMonthDate, getNextFirstOfMonthDate };
