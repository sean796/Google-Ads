import type { PostCreatorExecutionPayload, TaskExecutionPayload } from "@/lib/tasks-types";
import { postCreatorRunStartDate } from "@/lib/post-creator/post-creator-run-start-date";
import { resolvePostCreatorPostCount } from "@/lib/post-creator/post-creator-post-count";
import {
  clampEveryNDays,
  clampTimesPerMonth,
  type ScheduleFrequency,
} from "@/lib/wordpress-scheduler";

export type PostCreatorScheduleUiState = {
  scheduleFrequency: ScheduleFrequency;
  customInterval: number;
  dayOfWeek: number;
  startDateOption: "immediate" | "custom";
  customStartDate: Date;
  startTime: string;
  wordpressDraftOnly: boolean;
  localArchive: boolean;
  automationEmailDelivery: boolean;
  googleDriveDelivery: boolean;
};

function toIsoDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDateLocal(value: string | undefined, fallback: Date): Date {
  if (!value?.trim()) return fallback;
  const [y, mo, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !mo || !d) return fallback;
  const parsed = new Date(y, mo - 1, d);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function ensureScheduleDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") return parseIsoDateLocal(value, fallback);
  return fallback;
}

const EXECUTION_SCHEDULE_DEFAULTS: Pick<
  TaskExecutionPayload,
  | "scheduleFrequency"
  | "scheduleCustomInterval"
  | "scheduleDayOfWeek"
  | "scheduleStartDateOption"
  | "scheduleTimesPerMonth"
  | "scheduleStartDay"
  | "scheduleStartTime"
> = {
  scheduleFrequency: "custom",
  scheduleCustomInterval: 1,
  scheduleDayOfWeek: 0,
  scheduleStartDateOption: "custom",
  scheduleTimesPerMonth: 1,
  scheduleStartDay: 1,
  scheduleStartTime: "09:00",
};

export function ensureExecutionSchedulePayload(
  payload?: TaskExecutionPayload | null,
): TaskExecutionPayload {
  return {
    ...EXECUTION_SCHEDULE_DEFAULTS,
    ...(payload ?? {}),
  };
}

export function postCreatorPayloadToScheduleState(
  payload: TaskExecutionPayload | PostCreatorExecutionPayload,
): PostCreatorScheduleUiState {
  const postCount = resolvePostCreatorPostCount(payload);
  const startTime = payload.scheduleStartTime?.trim() || "09:00";
  const startDay = Math.max(1, Math.min(28, Math.floor(Number(payload.scheduleStartDay ?? 1) || 1)));
  const anchor = postCreatorRunStartDate(startDay, startTime);

  const localArchive =
    payload.saveLocalArchive === true ||
    payload.sendAutomationEmail === true ||
    payload.saveToGoogleDrive === true;
  const automationEmailDelivery =
    payload.sendAutomationEmail === true || Boolean(String(payload.automationEmailTo ?? "").trim());
  const googleDriveDelivery = payload.saveToGoogleDrive === true;
  const draftOnly =
    !localArchive &&
    !automationEmailDelivery &&
    !googleDriveDelivery &&
    (payload.scheduleDraftOnly === true ||
      (payload.postDestination != null && payload.postDestination === "draft"));

  if (payload.scheduleFrequency) {
    const freq = payload.scheduleFrequency;
    return {
      scheduleFrequency: freq,
      customInterval:
        freq === "custom"
          ? clampTimesPerMonth(payload.scheduleCustomInterval ?? payload.scheduleTimesPerMonth ?? postCount)
          : freq === "everyNDays"
            ? clampEveryNDays(payload.scheduleCustomInterval ?? 1)
            : payload.scheduleCustomInterval ?? 1,
      dayOfWeek: payload.scheduleDayOfWeek ?? 0,
      startDateOption: payload.scheduleStartDateOption ?? "custom",
      customStartDate: parseIsoDateLocal(payload.scheduleCustomStartDate, anchor),
      startTime,
      wordpressDraftOnly: draftOnly,
      localArchive,
      automationEmailDelivery,
      googleDriveDelivery,
    };
  }

  const timesPerMonth = clampTimesPerMonth(payload.scheduleTimesPerMonth ?? postCount);
  return {
    scheduleFrequency: "custom",
    customInterval: timesPerMonth,
    dayOfWeek: 0,
    startDateOption: "custom",
    customStartDate: anchor,
    startTime,
    wordpressDraftOnly: draftOnly,
    localArchive,
    automationEmailDelivery,
    googleDriveDelivery,
  };
}

export function mergeExecutionPayloadForSave(
  ...sources: Array<TaskExecutionPayload | null | undefined>
): TaskExecutionPayload {
  const merged: TaskExecutionPayload = {};
  for (const source of sources) {
    if (!source) continue;
    Object.assign(merged, source);
  }

  const emailTo = String(merged.automationEmailTo ?? "").trim();
  const wantsEmail =
    merged.sendAutomationEmail === true ||
    emailTo.length > 0 ||
    sources.some(
      (source) =>
        source?.sendAutomationEmail === true || Boolean(String(source?.automationEmailTo ?? "").trim()),
    );

  if (wantsEmail) {
    merged.sendAutomationEmail = true;
    merged.saveLocalArchive = true;
    if (emailTo) merged.automationEmailTo = emailTo;
  }

  if (merged.saveToGoogleDrive === true) {
    merged.saveLocalArchive = true;
  }

  return merged;
}

export function mergeTaskExecutionPayloadFromServer(
  sent: TaskExecutionPayload | null | undefined,
  server: TaskExecutionPayload | null | undefined,
): TaskExecutionPayload {
  return mergeExecutionPayloadForSave(server, sent);
}

export function scheduleStateToExecutionPayload(
  state: PostCreatorScheduleUiState,
  base: TaskExecutionPayload,
): TaskExecutionPayload {
  const merged = scheduleStateToPostCreatorPayload(
    state,
    ensureExecutionSchedulePayload(base) as PostCreatorExecutionPayload,
  );
  return { ...base, ...merged };
}

export function scheduleStateToPostCreatorPayload(
  state: PostCreatorScheduleUiState,
  base: PostCreatorExecutionPayload,
): PostCreatorExecutionPayload {
  const postCount = resolvePostCreatorPostCount(base);
  const startTime = state.startTime?.trim() || "09:00";
  const startDayFallback = Math.max(
    1,
    Math.min(28, Math.floor(Number(base.scheduleStartDay ?? 1) || 1)),
  );
  const customStartDate = ensureScheduleDate(
    state.customStartDate,
    postCreatorRunStartDate(startDayFallback, startTime),
  );
  const startDay = Math.max(1, Math.min(28, customStartDate.getDate()));

  let scheduleTimesPerMonth = postCount;
  if (state.scheduleFrequency === "custom") {
    scheduleTimesPerMonth = clampTimesPerMonth(state.customInterval);
  }

  // Stored payloads may carry the legacy "bank" destination value.
  const baseDestination: string | undefined = base.postDestination;
  const postDestination =
    baseDestination != null
      ? state.automationEmailDelivery || state.localArchive || state.googleDriveDelivery
        ? base.postDestination
        : state.wordpressDraftOnly
          ? "draft"
          : baseDestination === "bank"
            ? "wordpress"
            : "wordpress"
      : base.postDestination;

  return {
    ...base,
    postDestination,
    saveLocalArchive: state.automationEmailDelivery || state.localArchive || state.googleDriveDelivery,
    saveToGoogleDrive: state.googleDriveDelivery || base.saveToGoogleDrive === true,
    sendAutomationEmail:
      state.automationEmailDelivery ||
      Boolean(String(base.automationEmailTo ?? "").trim()) ||
      base.sendAutomationEmail === true,
    scheduleFrequency: state.scheduleFrequency,
    scheduleCustomInterval: state.customInterval,
    scheduleDayOfWeek: state.dayOfWeek,
    scheduleStartDateOption: state.startDateOption,
    scheduleCustomStartDate: toIsoDateLocal(customStartDate),
    scheduleDraftOnly: state.wordpressDraftOnly,
    scheduleTimesPerMonth,
    scheduleStartDay: startDay,
    scheduleStartTime: startTime,
  };
}
