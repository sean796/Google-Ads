import React, { useMemo } from "react";
import { Calendar as CalendarIcon, ChevronDown, Clock } from "lucide-react";
import { format, parse } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const TASK_WIDE_DIALOG_CLASS =
  "max-h-[85vh] max-w-[1280px] w-[min(1280px,98vw)] gap-3 overflow-y-auto rounded-none sm:rounded-none border-0 bg-zinc-950 p-5 text-white [&>button]:rounded-none";

export const TASK_PROJECT_DIALOG_CLASS =
  "flex max-h-[85vh] max-w-[1280px] w-[min(1280px,98vw)] flex-col gap-1 overflow-hidden rounded-none sm:rounded-none border-0 bg-[#09090B] p-3 text-white [&>button]:rounded-none";

export const TASK_FORM_BAND_CLASS = "flex flex-col gap-0.5 rounded-none bg-[#09090B] p-1";

export const TASK_FORM_BAND_FIELDS_CLASS =
  "flex w-full min-w-0 flex-col gap-0.5 rounded-none bg-[#09090B] p-1";

export const TASK_FORM_COMPACT_CELL_CLASS =
  "flex min-h-10 min-w-0 flex-col justify-center rounded-none bg-[#000] px-2 py-1";

export const TASK_FORM_COMPACT_INFIELD_LABEL_CLASS = "text-base leading-tight text-muted-foreground";

export const TASK_FORM_CELL_CLASS =
  "flex min-h-12 min-w-0 flex-col justify-center rounded-none bg-[#000] px-2 py-1.5";

export const TASK_FORM_DIALOG_BUTTON_CLASS = "rounded-none";

export const TASK_FORM_FLAT_CONTROL_CLASS =
  "h-9 min-h-9 w-full min-w-0 rounded-none border-0 bg-transparent p-0 text-base text-white shadow-none outline-none ring-0 focus-visible:ring-0";

export const TASK_FORM_PANEL_CLASS = "flex flex-col gap-3 rounded-none bg-zinc-900/50 p-4";
export const TASK_FORM_PANEL_INNER_CLASS = "flex flex-col gap-3 rounded-none bg-black p-3";

export const TASK_FORM_INFIELD_SHELL_CLASS = "flex min-w-0 flex-col gap-0.5 rounded-none bg-black px-3 py-2";

export const TASK_FORM_INFIELD_CONTROL_CLASS =
  "min-w-0 [&_input]:h-9 [&_input]:w-full [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0 [&_input]:text-base [&_input]:text-white [&_input]:shadow-none [&_input]:outline-none [&_input]:ring-0 [&_input]:focus-visible:ring-0 [&_textarea]:min-h-[2.5rem] [&_textarea]:w-full [&_textarea]:resize-none [&_textarea]:border-0 [&_textarea]:bg-transparent [&_textarea]:p-0 [&_textarea]:text-base [&_textarea]:text-white [&_textarea]:shadow-none [&_textarea]:outline-none [&_textarea]:ring-0 [&_textarea]:focus-visible:ring-0";

export const TASK_FORM_SELECT_CONTENT_CLASS =
  "border-0 bg-[#000] text-white shadow-lg";

export const TASK_FORM_SELECT_ITEM_CLASS =
  "text-base text-white focus:bg-[#09090B] focus:text-white";

export const TASK_FORM_SELECT_TRIGGER_CLASS =
  "h-9 min-h-9 rounded-none border-0 bg-transparent p-0 text-base text-white shadow-none focus:ring-0 focus:ring-offset-0";

export const TASK_FORM_SELECT_TRIGGER_NOWRAP_CLASS =
  "whitespace-nowrap [&>span]:line-clamp-none";

const EMPTY_SELECT_VALUE = "__empty__";

function toSelectValue(value: string): string {
  return value === "" ? EMPTY_SELECT_VALUE : value;
}

function fromSelectValue(value: string): string {
  return value === EMPTY_SELECT_VALUE ? "" : value;
}

export function TaskFormPanel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <section className={cn(TASK_FORM_PANEL_CLASS, className)}>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {children}
    </section>
  );
}

/** Panel title + one black well; no duplicate infield label. */
export function TaskFormPanelWell({
  title,
  children,
  className,
  wellClassName,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  wellClassName?: string;
}): React.ReactElement {
  return (
    <TaskFormPanel title={title} className={className}>
      <div className={cn(TASK_FORM_INFIELD_SHELL_CLASS, wellClassName)}>{children}</div>
    </TaskFormPanel>
  );
}

export function TaskFormInfield({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn(TASK_FORM_INFIELD_SHELL_CLASS, className)}>
      <label htmlFor={htmlFor} className="text-base text-muted-foreground">
        {label}
      </label>
      <div className={TASK_FORM_INFIELD_CONTROL_CLASS}>{children}</div>
    </div>
  );
}

export function TaskFormFieldGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", className)}>{children}</div>;
}

export function TaskFormPanelGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return <div className={cn("grid grid-cols-1 gap-3 lg:grid-cols-2", className)}>{children}</div>;
}

export type TaskFormInfieldSelectOption = { value: string; label: string };

export function TaskFormInfieldSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
  className,
}: {
  label: string;
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: TaskFormInfieldSelectOption[];
  disabled?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    <TaskFormInfield label={label} className={className}>
      <Select
        value={toSelectValue(value)}
        onValueChange={(next) => onChange(fromSelectValue(next))}
        disabled={disabled}
      >
        <SelectTrigger className={TASK_FORM_SELECT_TRIGGER_CLASS}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={TASK_FORM_SELECT_CONTENT_CLASS}>
          {options.map((opt) => (
            <SelectItem
              key={opt.value || EMPTY_SELECT_VALUE}
              value={toSelectValue(opt.value)}
              className={TASK_FORM_SELECT_ITEM_CLASS}
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </TaskFormInfield>
  );
}

export function TaskFormSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

export function TaskFormInlineRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn("grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-x-3", className)}>
      <span className="text-base text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TaskFormFlatSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <section className={cn(TASK_FORM_BAND_CLASS, className)}>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {children}
    </section>
  );
}

export function TaskFormFlatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div
      className={cn(
        "grid w-full items-stretch gap-1",
        className ?? "grid-cols-2 md:grid-cols-4 xl:grid-cols-6",
      )}
    >
      {children}
    </div>
  );
}

export function TaskFormFlatField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn(TASK_FORM_CELL_CLASS, className)}>
      <span className="text-base text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TaskFormFlatSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: TaskFormInfieldSelectOption[];
  disabled?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    <TaskFormFlatField label={label} className={className}>
      <Select
        value={toSelectValue(value)}
        onValueChange={(next) => onChange(fromSelectValue(next))}
        disabled={disabled}
      >
        <SelectTrigger className={TASK_FORM_SELECT_TRIGGER_CLASS}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={TASK_FORM_SELECT_CONTENT_CLASS}>
          {options.map((opt) => (
            <SelectItem
              key={opt.value || EMPTY_SELECT_VALUE}
              value={toSelectValue(opt.value)}
              className={TASK_FORM_SELECT_ITEM_CLASS}
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </TaskFormFlatField>
  );
}

export function TaskFormSideSection({
  title,
  titleExtra,
  children,
  className,
}: {
  title: string;
  titleExtra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <section
      className={cn(
        "grid w-full grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-2",
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 pt-1.5">
        <span className="text-base font-semibold text-white">{title}</span>
        {titleExtra}
      </div>
      <div className={TASK_FORM_BAND_FIELDS_CLASS}>{children}</div>
    </section>
  );
}

export function TaskFormCompactCell({
  label,
  children,
  className,
  hidden = false,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
  hidden?: boolean;
}): React.ReactElement {
  return (
    <div
      className={cn(
        TASK_FORM_COMPACT_CELL_CLASS,
        hidden && "pointer-events-none invisible",
        className,
      )}
    >
      {label ? <span className={TASK_FORM_COMPACT_INFIELD_LABEL_CLASS}>{label}</span> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TaskFormPlaceholderCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return <div className={cn(TASK_FORM_CELL_CLASS, className)}>{children}</div>;
}

export function TaskFormFlatSelectPlaceholder({
  placeholder,
  value,
  onChange,
  options,
  disabled = false,
  className,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: TaskFormInfieldSelectOption[];
  disabled?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    <TaskFormPlaceholderCell className={className}>
      <Select
        value={toSelectValue(value)}
        onValueChange={(next) => onChange(fromSelectValue(next))}
        disabled={disabled}
      >
        <SelectTrigger className={TASK_FORM_SELECT_TRIGGER_CLASS} aria-label={placeholder}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className={TASK_FORM_SELECT_CONTENT_CLASS}>
          {options.map((opt) => (
            <SelectItem
              key={opt.value || EMPTY_SELECT_VALUE}
              value={toSelectValue(opt.value)}
              className={TASK_FORM_SELECT_ITEM_CLASS}
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </TaskFormPlaceholderCell>
  );
}

export type TaskFormMultiSelectOption = { value: string; label: string };

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
          <button
            type="button"
            className={cn(
              "flex h-9 w-full min-w-0 items-center justify-between gap-2 bg-transparent text-left text-base outline-none",
              selectedValues.length === 0 ? "text-muted-foreground" : "text-white",
            )}
            aria-label={placeholder}
          >
            <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] rounded-none border-0 bg-[#000] p-1 text-white shadow-lg"
        >
          <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {options.map((opt) => {
              const checked = selectedValues.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 rounded-none px-2 py-1.5 hover:bg-[#09090B]"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(opt.value)}
                    className="rounded-none border-zinc-600 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate text-base text-white">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </TaskFormPlaceholderCell>
  );
}

const SCHEDULE_TICK_MINUTES = 5;

const TASK_TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += SCHEDULE_TICK_MINUTES) {
      slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return slots;
})();

function parseTaskIsoDate(value: string): Date | undefined {
  if (!value.trim()) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function toTaskIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTaskTimeLabel(value: string): string {
  if (!value.trim()) return "";
  const normalized = value.trim().slice(0, 5);
  return format(parse(normalized, "HH:mm", new Date()), "h:mm a");
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
          <button
            type="button"
            className={cn(
              "flex h-9 w-full min-w-0 items-center gap-2 bg-transparent text-left text-base outline-none",
              selected ? "text-white" : "text-muted-foreground",
            )}
            aria-label={placeholder}
          >
            <CalendarIcon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto rounded-none border-0 bg-[#000] p-0 text-white shadow-lg"
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              if (!date) return;
              onChange(toTaskIsoDate(date));
            }}
            initialFocus
            className="rounded-none bg-[#000] text-base text-white"
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
          <button
            type="button"
            className={cn(
              "flex h-9 w-full min-w-0 items-center gap-2 bg-transparent text-left text-base outline-none",
              normalized ? "text-white" : "text-muted-foreground",
            )}
            aria-label={placeholder}
          >
            <Clock className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-36 rounded-none border-0 bg-[#000] p-1 text-white shadow-lg"
        >
          <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {TASK_TIME_SLOTS.map((slot) => {
              const active = normalized === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  className={cn(
                    "rounded-none px-2 py-1.5 text-left text-base text-white hover:bg-[#09090B]",
                    active && "bg-[#09090B]",
                  )}
                  onClick={() => onChange(slot)}
                >
                  {formatTaskTimeLabel(slot)}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </TaskFormPlaceholderCell>
  );
}

export function TaskFormTwoCol({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn("grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2", className)}>{children}</div>
  );
}

export function TaskFormSplitRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", className)}>{children}</div>;
}
