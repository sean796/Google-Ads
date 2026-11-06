import React, { useMemo } from "react";
import { Calendar as CalendarIcon, ChevronDown, Clock } from "lucide-react";
import { format } from "date-fns";
import { CheckField, Button, Calendar, Popover, PopoverContent, PopoverTrigger, RowButton } from "@/ui";
import { cn } from "@/lib/utils";
import {
  TASK_FORM_PLACEHOLDER_CELL_CLASS,
  type TaskFormMultiSelectOption,
} from "@/components/manager/tasks/task-form-layout-styles";
import {
  TASK_TIME_SLOTS,
  formatTaskTimeLabel,
  parseTaskIsoDate,
  toTaskIsoDate,
} from "@/components/manager/tasks/task-form-date-time-helpers";

export function TaskFormPlaceholderCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return <div className={cn(TASK_FORM_PLACEHOLDER_CELL_CLASS, className)}>{children}</div>;
}

export function TaskFormMultiSelect({
  placeholder,
  options,
  selectedValues,
  onChange,
  disabled = false,
  className,
}: {
  placeholder: string;
  options: TaskFormMultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  className?: string;
}): React.ReactElement {
  const triggerLabel = useMemo(() => {
    if (selectedValues.length === 0) return placeholder;
    const labels = selectedValues
      .map((value) => options.find((opt) => opt.value === value)?.label ?? value)
      .filter(Boolean);
    return labels.join(", ");
  }, [options, placeholder, selectedValues]);

  const toggle = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  return (
    <TaskFormPlaceholderCell className={className}>
      <Popover>
        <PopoverTrigger asChild disabled={disabled}>
          <RowButton
            type="button"
            aria-label={placeholder}
          >
            <span className="min-w-0 flex-1 whitespace-nowrap">{triggerLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </RowButton>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] rounded-none border-0 bg-black p-1 text-foreground shadow-lg"
        >
          <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {options.map((opt) => {
              const checked = selectedValues.includes(opt.value);
              return (
                <CheckField key={opt.value} label={opt.label} checked={checked} onCheckedChange={() => toggle(opt.value)} />
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </TaskFormPlaceholderCell>
  );
}

export function TaskFormDatePicker({
  placeholder,
  value,
  onChange,
  disabled = false,
  className,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}): React.ReactElement {
  const selected = useMemo(() => parseTaskIsoDate(value), [value]);
  const label = selected ? format(selected, "MM/dd/yyyy") : placeholder;

  return (
    <TaskFormPlaceholderCell className={className}>
      <Popover>
        <PopoverTrigger asChild disabled={disabled}>
          <RowButton
            selected={Boolean(selected)}
            type="button"
            aria-label={placeholder}
          >
            <CalendarIcon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 whitespace-nowrap">{label}</span>
          </RowButton>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto rounded-none border-0 bg-black p-0 text-foreground shadow-lg"
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              if (!date) return;
              onChange(toTaskIsoDate(date));
            }}
            initialFocus
            className="rounded-none bg-black text-base text-foreground"
          />
        </PopoverContent>
      </Popover>
    </TaskFormPlaceholderCell>
  );
}

export function TaskFormTimePicker({
  placeholder,
  value,
  onChange,
  disabled = false,
  className,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}): React.ReactElement {
  const normalized = value.trim().slice(0, 5);
  const label = normalized ? formatTaskTimeLabel(normalized) : placeholder;

  return (
    <TaskFormPlaceholderCell className={className}>
      <Popover>
        <PopoverTrigger asChild disabled={disabled}>
          <RowButton
            selected={Boolean(normalized)}
            type="button"
            aria-label={placeholder}
          >
            <Clock className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 whitespace-nowrap">{label}</span>
          </RowButton>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-36 rounded-none border-0 bg-black p-1 text-foreground shadow-lg"
        >
          <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {TASK_TIME_SLOTS.map((slot) => {
              const active = normalized === slot;
              return (
                <Button
                  pressed={Boolean(active)}
                  variant="quiet"
                  key={slot}
                  onClick={() => onChange(slot)}
                >
                  {formatTaskTimeLabel(slot)}
                </Button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </TaskFormPlaceholderCell>
  );
}

