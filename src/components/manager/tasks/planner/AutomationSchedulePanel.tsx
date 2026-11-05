import React, { useMemo } from "react";
import { TaskFormDatePicker, TaskFormInlineRow, TaskFormTimePicker } from "@/components/manager/tasks/TaskFormLayout";
import type { AutomationScheduleBlock, ScheduleFrequency } from "@/lib/automation-planner-types";
import { SelectField } from "@/ui";

const FREQUENCY_OPTIONS: { value: ScheduleFrequency; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function weekdayLabel(dateKey: string): string {
  const date = dateKey.slice(0, 10);
  if (!date) return "";
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

function monthDayLabel(dateKey: string): string {
  const date = dateKey.slice(0, 10);
  if (!date) return "";
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export type AutomationSchedulePanelProps = {
  block: AutomationScheduleBlock;
  disabled?: boolean;
  onChange: (patch: Partial<AutomationScheduleBlock>) => void;
};

export function AutomationSchedulePanel({
  block,
  disabled = false,
  onChange,
}: AutomationSchedulePanelProps): React.ReactElement {
  const helper = useMemo(() => {
    const date = block.startDate.slice(0, 10);
    if (block.frequency === "weekly" && date) {
      return `Runs every ${weekdayLabel(date)}`;
    }
    if (block.frequency === "monthly" && date) {
      return `Runs on day ${date.slice(8, 10)} each month`;
    }
    if (block.frequency === "yearly" && date) {
      return `Runs every ${monthDayLabel(date)}`;
    }
    if (block.frequency === "daily" && date) {
      return `Runs daily on or after ${date}`;
    }
    return " ";
  }, [block.frequency, block.startDate]);

  const dateLabel = block.frequency === "once" ? "Run date" : "Start date";

  return (
    <div className="flex flex-col gap-2">
      <TaskFormInlineRow label="Frequency">
        <SelectField
          placeholder="Frequency"
          value={block.frequency}
          onValueChange={(v) =>
            onChange({
              frequency: v as ScheduleFrequency,
              keyword: `schedule-${v}`,
            })
          }
          options={FREQUENCY_OPTIONS}
          width="full"
          disabled={disabled}
        />
      </TaskFormInlineRow>
      <TaskFormInlineRow label={dateLabel}>
        <TaskFormDatePicker
          placeholder={dateLabel}
          value={block.startDate}
          onChange={(startDate) => onChange({ startDate })}
          disabled={disabled}
          className="min-h-9 bg-transparent p-0"
        />
      </TaskFormInlineRow>
      <TaskFormInlineRow label="Time (Edmonton)">
        <TaskFormTimePicker
          placeholder="Time (Edmonton)"
          value={block.time}
          onChange={(time) => onChange({ time })}
          disabled={disabled}
          className="min-h-9 bg-transparent p-0"
        />
      </TaskFormInlineRow>
      <p className="min-h-[1.25rem] pl-[calc(8rem+0.75rem)] text-base text-muted-foreground">{helper}</p>
    </div>
  );
}
