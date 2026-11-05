import React, { useState } from "react";
import { Shuffle } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button, Field, SelectField } from "@/ui";
import { TaskFormPanel } from "@/components/manager/tasks/TaskFormLayout";
import {
  evenSpreadPublishDays,
  lastAllowedPublishDay,
  normalizePublishDays,
  shufflePublishDays,
} from "@/lib/schedule-publish-days";
import type { TaskExecutionPayload } from "@/lib/tasks-types";
import { cn } from "@/lib/utils";
import {
  clampTimesPerMonth,
  getFirstOfThisMonthDate,
  getNextFirstOfMonthDate,
  isSameLocalCalendarDay,
} from "@/lib/wordpress-scheduler";

type WhatCadence = "immediately" | "draft" | "times_per_month";
type WhatTimeframe = "this" | "next" | "custom";

const CADENCE_OPTIONS = [
  { value: "immediately", label: "Immediately" },
  { value: "draft", label: "Draft" },
  { value: "times_per_month", label: "Times per month" },
];
const TIMEFRAME_OPTIONS = [
  { value: "this", label: "This month" },
  { value: "next", label: "Next month" },
  { value: "custom", label: "Custom" },
];

const FULL_CALENDAR_CLASSNAMES = {
  months: "flex w-full flex-col",
  month: "w-full space-y-4",
  table: "w-full border-collapse",
  caption_label: "text-base font-medium",
  head_row: "flex w-full",
  head_cell: "flex-1 font-normal text-base text-muted-foreground",
  row: "mt-2 flex w-full",
  cell: "relative h-9 flex-1 p-0 text-center text-base",
  day: "inline-flex h-9 w-full items-center justify-center p-0 text-base font-normal aria-selected:opacity-100",
};

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYmd(value: string | undefined, fallback: Date): Date {
  if (!value?.trim()) return fallback;
  const [y, mo, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !mo || !d) return fallback;
  const parsed = new Date(y, mo - 1, d);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function cadenceFromPayload(payload: TaskExecutionPayload): WhatCadence {
  if (payload.scheduleDraftOnly === true || payload.postDestination === "draft") return "draft";
  if (payload.scheduleFrequency === "immediately") return "immediately";
  return "times_per_month";
}

function timeframeFromStart(startDate: Date, startTime: string): WhatTimeframe {
  if (isSameLocalCalendarDay(startDate, getFirstOfThisMonthDate(startTime))) return "this";
  if (isSameLocalCalendarDay(startDate, getNextFirstOfMonthDate(startTime))) return "next";
  return "custom";
}

function daysForDate(count: number, date: Date, existing: number[] | undefined, previous: Date): number[] {
  const last = lastAllowedPublishDay(date.getFullYear(), date.getMonth());
  const n = Math.min(clampTimesPerMonth(count), last);
  const sameMonth = date.getFullYear() === previous.getFullYear() && date.getMonth() === previous.getMonth();
  if (sameMonth && existing) {
    return normalizePublishDays(existing, n, last) ?? evenSpreadPublishDays(n, last);
  }
  return evenSpreadPublishDays(n, last);
}

export type ForgeWhatPublishScheduleFieldsProps = {
  payload: TaskExecutionPayload;
  disabled?: boolean;
  onChange: (payload: TaskExecutionPayload) => void;
};

export function ForgeWhatPublishScheduleFields({
  payload,
  disabled = false,
  onChange,
}: ForgeWhatPublishScheduleFieldsProps): React.ReactElement {
  const startTime = payload.scheduleStartTime?.trim() || "09:00";
  const thisMonth = getFirstOfThisMonthDate(startTime);
  const startDate = parseYmd(payload.scheduleCustomStartDate, thisMonth);
  const lastAllowed = lastAllowedPublishDay(startDate.getFullYear(), startDate.getMonth());
  const times = Math.min(
    clampTimesPerMonth(payload.scheduleTimesPerMonth ?? payload.scheduleCustomInterval ?? 1),
    lastAllowed,
  );
  const cadence = cadenceFromPayload(payload);
  const timesMode = cadence === "times_per_month";
  const [forceCustom, setForceCustom] = useState(false);
  const timeframe = forceCustom ? "custom" : timeframeFromStart(startDate, startTime);

  const patch = (partial: Partial<TaskExecutionPayload>) => onChange({ ...payload, ...partial });

  const timesPatch = (count: number, days: number[], date = startDate): Partial<TaskExecutionPayload> => {
    const n = Math.min(clampTimesPerMonth(count), lastAllowedPublishDay(date.getFullYear(), date.getMonth()));
    return {
      scheduleFrequency: "custom",
      scheduleStartDateOption: "custom",
      scheduleCustomStartDate: formatYmd(date),
      scheduleStartDay: date.getDate(),
      scheduleStartTime: startTime,
      scheduleTimesPerMonth: n,
      scheduleCustomInterval: n,
      scheduleStaggerOptimized: true,
      schedulePublishDays: days,
      postDestination: "wordpress",
      scheduleDraftOnly: false,
    };
  };

  const handleCadence = (value: WhatCadence) => {
    setForceCustom(false);
    if (value === "immediately") {
      patch({ scheduleFrequency: "immediately", postDestination: "wordpress", scheduleDraftOnly: false });
      return;
    }
    if (value === "draft") {
      patch({ postDestination: "draft", scheduleDraftOnly: true });
      return;
    }
    patch(timesPatch(times, evenSpreadPublishDays(times, lastAllowed)));
  };

  const handleTimeframe = (value: WhatTimeframe) => {
    if (value === "custom") {
      setForceCustom(true);
      patch({ scheduleStartDateOption: "custom", scheduleCustomStartDate: formatYmd(startDate) });
      return;
    }
    setForceCustom(false);
    const nextDate = value === "this" ? getFirstOfThisMonthDate(startTime) : getNextFirstOfMonthDate(startTime);
    patch(timesPatch(times, daysForDate(times, nextDate, payload.schedulePublishDays, startDate), nextDate));
  };

  return (
    <TaskFormPanel title="Publish">
      <div className="flex flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-0.5">
          <SelectField
            placeholder="Publish"
            width="full"
            value={cadence}
            disabled={disabled}
            options={CADENCE_OPTIONS}
            onValueChange={(v) => handleCadence(v as WhatCadence)}
          />
          {timesMode ? (
            <>
              <Field
                size="count"
                type="number"
                min={1}
                max={lastAllowed}
                placeholder="Count"
                aria-label="Times per month"
                value={times}
                disabled={disabled}
                onChange={(e) => {
                  const last = lastAllowedPublishDay(startDate.getFullYear(), startDate.getMonth());
                  const n = Math.min(clampTimesPerMonth(Number(e.target.value) || 1), last);
                  patch(timesPatch(n, evenSpreadPublishDays(n, last)));
                }}
              />
              <Button
                size="icon"
                icon={Shuffle}
                aria-label="Shuffle days"
                disabled={disabled}
                onClick={() => patch(timesPatch(times, shufflePublishDays(times, lastAllowed)))}
              />
            </>
          ) : null}
        </div>

        {timesMode ? (
          <>
            <SelectField
              placeholder="Timeframe"
              width="full"
              value={timeframe}
              disabled={disabled}
              options={TIMEFRAME_OPTIONS}
              onValueChange={(v) => handleTimeframe(v as WhatTimeframe)}
            />
            <div
              className={cn(
                "flex min-h-[22rem] w-full min-w-0",
                timeframe !== "custom" && "pointer-events-none invisible",
              )}
            >
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => {
                  if (!date) return;
                  patch(timesPatch(times, daysForDate(times, date, payload.schedulePublishDays, startDate), date));
                }}
                className="h-fit !w-full min-w-0 rounded-none bg-black p-3 text-base text-foreground"
                classNames={FULL_CALENDAR_CLASSNAMES}
              />
            </div>
          </>
        ) : null}
      </div>
    </TaskFormPanel>
  );
}