import React from "react";
import { SelectField } from "@/ui";
import { cn } from "@/lib/utils";
import {
  TASK_FORM_BAND_CLASS,
  TASK_FORM_BAND_FIELDS_CLASS,
  TASK_FORM_CELL_CLASS,
  TASK_FORM_COMPACT_CELL_CLASS,
  TASK_FORM_COMPACT_INFIELD_LABEL_CLASS,
  TASK_FORM_INFIELD_CONTROL_CLASS,
  TASK_FORM_INFIELD_SHELL_CLASS,
  TASK_FORM_PANEL_CLASS,
  fromSelectValue,
  toSelectValue,
  type TaskFormInfieldSelectOption,
} from "@/components/manager/tasks/task-form-layout-styles";
import { TaskFormPlaceholderCell } from "@/components/manager/tasks/TaskFormPickers";

export { TaskFormPlaceholderCell };
export {
  TaskFormDatePicker,
  TaskFormMultiSelect,
  TaskFormTimePicker,
} from "@/components/manager/tasks/TaskFormPickers";

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
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
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

export function TaskFormInfieldSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
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
    <SelectField
      placeholder={label}
      width="full"
      value={toSelectValue(value)}
      onValueChange={(next) => onChange(fromSelectValue(next))}
      disabled={disabled}
      options={options.map((opt) => ({ value: toSelectValue(opt.value), label: opt.label }))}
    />
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
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
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
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
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
    <SelectField
      placeholder={label}
      width="full"
      value={toSelectValue(value)}
      onValueChange={(next) => onChange(fromSelectValue(next))}
      disabled={disabled}
      options={options.map((opt) => ({ value: toSelectValue(opt.value), label: opt.label }))}
    />
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
        <span className="text-base font-semibold text-foreground">{title}</span>
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
      <SelectField
        placeholder={placeholder}
        width="full"
        value={toSelectValue(value)}
        onValueChange={(next) => onChange(fromSelectValue(next))}
        disabled={disabled}
        options={options.map((opt) => ({ value: toSelectValue(opt.value), label: opt.label }))}
      />
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
