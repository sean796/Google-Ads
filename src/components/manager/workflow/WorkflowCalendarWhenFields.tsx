import React from "react";

import { Field, SelectField, Calendar } from "@/ui";
import { TaskFormTimePicker } from "@/components/manager/tasks/TaskFormLayout";
import { WorkflowInspectorGroup } from "@/components/manager/workflow/WorkflowInspectorLayout";
import {
  calendarDayOfMonthFromConfig,
  calendarStartMonthChoiceFromConfig,
  clampCalendarDayOfMonth,
  formatWorkflowStartDate,
  parseWorkflowStartDate,
  startDateWithDayOfMonth,
  startDateWithMonthChoice,
} from "@/lib/workflow/workflow-calendar-start";
import type { WorkflowCalendarTriggerConfig } from "@/lib/workflow/workflow-types";
import { cn } from "@/lib/utils";

export type WorkflowCalendarWhenFieldsProps = {
  title: string;
  config: WorkflowCalendarTriggerConfig | Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  error?: string | null;
};

export function WorkflowCalendarWhenFields({
  title,
  config,
  onChange,
  error,
}: WorkflowCalendarWhenFieldsProps): React.ReactElement {
  const calendarConfig = config as { dayOfMonth?: number; startDate?: string; startMonthChoice?: string; time?: string };
  const monthChoice = calendarStartMonthChoiceFromConfig(calendarConfig);
  const day = calendarDayOfMonthFromConfig(calendarConfig);

  const patchMonthly = (patch: Record<string, unknown>) => {
    onChange({
      frequency: "monthly",
      timezone: "America/Edmonton",
      ...patch,
    });
  };

  return (
    <WorkflowInspectorGroup title={title} className="min-h-0 flex-1">
      {error ? <p className="text-base text-ui-danger">{error}</p> : null}
      <div className="grid min-w-0 grid-cols-3 gap-0.5">
        <div className="flex h-8 min-h-8 min-w-0 items-center gap-1.5 rounded-none bg-black px-2">
          <Field
            size="short"
            type="number"
            min={1}
            max={31}
            step={1}
            inputMode="numeric"
            placeholder="Day"
            aria-label="Day of the month"
            value={String(day)}
            onChange={(event) => {
              const nextDay = clampCalendarDayOfMonth(Number.parseInt(event.target.value, 10));
              patchMonthly({
                dayOfMonth: nextDay,
                startMonthChoice: calendarStartMonthChoiceFromConfig(calendarConfig),
                startDate: startDateWithDayOfMonth(String(calendarConfig.startDate ?? ""), nextDay),
              });
            }}
          />
          <span className="min-w-0 whitespace-nowrap text-base text-muted-foreground">
            day of the month
          </span>
        </div>
        <SelectField
          placeholder="Start month"
          width="full"
          value={monthChoice}
          options={[
            { value: "this", label: "This month" },
            { value: "next", label: "Next month" },
            { value: "custom", label: "Custom" },
          ]}
          onValueChange={(value) => {
            if (value === "custom") {
              patchMonthly({
                dayOfMonth: day,
                startMonthChoice: "custom",
                startDate:
                  String(calendarConfig.startDate ?? "").trim().slice(0, 10) ||
                  startDateWithMonthChoice("", day, "this"),
              });
              return;
            }
            const nextChoice = value === "next" ? "next" : "this";
            patchMonthly({
              dayOfMonth: day,
              startMonthChoice: nextChoice,
              startDate: startDateWithMonthChoice(String(calendarConfig.startDate ?? ""), day, nextChoice),
            });
          }}
        />
        <div className="flex h-8 min-h-8 min-w-0 items-center rounded-none bg-black px-2">
          <TaskFormTimePicker
            placeholder="Time"
            value={String(calendarConfig.time ?? "09:00")}
            onChange={(time) =>
              patchMonthly({
                time,
                dayOfMonth: day,
                startMonthChoice: monthChoice,
                startDate:
                  String(calendarConfig.startDate ?? "").trim().slice(0, 10) ||
                  startDateWithMonthChoice("", day, monthChoice === "next" ? "next" : "this"),
              })
            }
            className="h-8 min-h-8 w-full min-w-0 bg-transparent p-0"
          />
        </div>
      </div>
      <div
        className={cn(
          "flex min-h-[22rem] w-full min-w-0 flex-1",
          monthChoice !== "custom" && "pointer-events-none invisible",
        )}
      >
        <Calendar
          mode="single"
          selected={parseWorkflowStartDate(String(calendarConfig.startDate ?? ""))}
          onSelect={(date) => {
            if (!date) return;
            const startDate = formatWorkflowStartDate(date);
            patchMonthly({
              startMonthChoice: "custom",
              dayOfMonth: clampCalendarDayOfMonth(date.getDate()),
              startDate,
            });
          }}
          className="h-fit w-full min-w-0 rounded-none bg-black p-3 text-base text-foreground"
          classNames={{
            months: "flex w-full flex-col",
            month: "w-full space-y-4",
            table: "w-full border-collapse",
            caption_label: "text-base font-medium",
            head_row: "flex w-full",
            head_cell: "flex-1 font-normal text-base text-muted-foreground",
            row: "mt-2 flex w-full",
            cell: "relative h-9 flex-1 p-0 text-center text-base",
            day: "inline-flex h-9 w-full items-center justify-center p-0 text-base font-normal aria-selected:opacity-100",
          }}
        />
      </div>
    </WorkflowInspectorGroup>
  );
}
