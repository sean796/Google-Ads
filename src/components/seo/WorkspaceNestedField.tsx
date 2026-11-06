import * as React from "react";

import { cn } from "@/lib/utils";
import { Field, TextareaField } from "@/ui";

import {
  WORKSPACE_NESTED_FIELD_INPUT_WELL,
  WORKSPACE_NESTED_FIELD_LABEL_BAND,
  WORKSPACE_NESTED_FIELD_LABEL_INLINE,
  WORKSPACE_NESTED_FIELD_SHELL,
  WORKSPACE_NESTED_FIELD_WELL,
} from "@/components/seo/workspace-nested-field-styles";

const WORKSPACE_NESTED_INLINE_ROW = cn(WORKSPACE_NESTED_FIELD_SHELL, "flex min-h-9 flex-row items-stretch");

export type WorkspaceNestedInputProps = Omit<React.ComponentProps<"input">, "size" | "className" | "style" | "placeholder"> & {
  label: string;
  /** Hint inside the field. The label is shown when omitted. */
  placeholder?: string;
  wellClassName?: string;
  labelClassName?: string;
  /** Inline label + control on one row (compact stat fields). */
  layout?: "stacked" | "inline";
};

export function WorkspaceNestedInput({
  label,
  placeholder,
  id,
  wellClassName,
  labelClassName,
  disabled,
  layout = "stacked",
  type,
  ...props
}: WorkspaceNestedInputProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const isStatInline = type === "number";

  if (layout === "inline") {
    return (
      <div className={cn(WORKSPACE_NESTED_INLINE_ROW, disabled && "opacity-50", wellClassName)}>
        <label
          htmlFor={inputId}
          className={cn(
            WORKSPACE_NESTED_FIELD_LABEL_BAND,
            isStatInline ? "min-w-0 flex-1" : cn("shrink-0", labelClassName),
          )}
        >
          {label}
        </label>
        <div className={cn(WORKSPACE_NESTED_FIELD_INPUT_WELL, isStatInline && "w-auto shrink-0")}>
          <Field
            id={inputId}
            type={type}
            placeholder={placeholder ?? label}
            size={isStatInline ? "count" : "grow"}
            disabled={disabled}
            {...props}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        WORKSPACE_NESTED_FIELD_SHELL,
        "flex flex-col",
        disabled && "opacity-50",
        wellClassName,
      )}
    >
      <label htmlFor={inputId} className={WORKSPACE_NESTED_FIELD_LABEL_BAND}>
        {label}
      </label>
      <div className={WORKSPACE_NESTED_FIELD_INPUT_WELL}>
        <Field id={inputId} type={type} placeholder={placeholder ?? label} disabled={disabled} {...props} />
      </div>
    </div>
  );
}

export type WorkspaceNestedTextareaProps = Omit<React.ComponentProps<"textarea">, "className" | "style" | "placeholder"> & {
  label: string;
  /** Hint inside the field. The label is shown when omitted. */
  placeholder?: string;
  wellClassName?: string;
  /** Label band left, textarea well right on one row. */
  layout?: "stacked" | "inline";
  labelClassName?: string;
};

export function WorkspaceNestedTextarea({
  label,
  placeholder,
  id,
  wellClassName,
  labelClassName,
  disabled,
  rows = 3,
  layout = "stacked",
  ...props
}: WorkspaceNestedTextareaProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  if (layout === "inline") {
    return (
      <div
        className={cn(
          WORKSPACE_NESTED_INLINE_ROW,
          "min-h-9 items-stretch",
          disabled && "opacity-50",
          wellClassName,
        )}
      >
        <label
          htmlFor={inputId}
          className={cn(
            WORKSPACE_NESTED_FIELD_LABEL_BAND,
            "w-[5.75rem] shrink-0 sm:w-[6.5rem]",
            labelClassName,
          )}
        >
          {label}
        </label>
        <div className={cn(WORKSPACE_NESTED_FIELD_INPUT_WELL, "items-stretch py-1.5")}>
          <TextareaField id={inputId} rows={rows} placeholder={placeholder ?? label} disabled={disabled} {...props} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(WORKSPACE_NESTED_FIELD_SHELL, disabled && "opacity-50", wellClassName)}>
      <label htmlFor={inputId} className={WORKSPACE_NESTED_FIELD_LABEL_BAND}>
        {label}
      </label>
      <div className={cn(WORKSPACE_NESTED_FIELD_INPUT_WELL, "items-stretch py-2.5")}>
        <TextareaField id={inputId} rows={rows} placeholder={placeholder ?? label} disabled={disabled} {...props} />
      </div>
    </div>
  );
}
