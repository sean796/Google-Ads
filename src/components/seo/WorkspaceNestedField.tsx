import * as React from "react";

import { cn } from "@/lib/utils";
import { Field, TextareaField } from "@/ui";

/** Outer chrome for nested workspace fields (focus ring only; tone split inside). */
export const WORKSPACE_NESTED_FIELD_SHELL = cn(
  "overflow-hidden rounded-md border-0 shadow-none",
  "ring-0 ring-offset-0",
  "focus-within:ring-2 focus-within:ring-ring/60 focus-within:ring-offset-0",
);

/** Grey well shared by SEO workspace body fields (matches toolbar `BULK_HEADER_FIELD`). */
export const WORKSPACE_NESTED_FIELD_WELL = cn(
  WORKSPACE_NESTED_FIELD_SHELL,
  "bg-ui-field-hover",
);

/** Form labels on black bands: forced #fff (not muted / foreground). */
export const WORKSPACE_NESTED_FIELD_LABEL =
  "workspace-nested-label-band text-base font-normal leading-snug";

/** Label band: black beside the grey input well (two-tone only). */
export const WORKSPACE_NESTED_FIELD_LABEL_BAND = cn(
  WORKSPACE_NESTED_FIELD_LABEL,
  "flex items-center self-stretch bg-black px-2.5 py-2",
);

/** Input well: lighter grey nested beside the label band. */
export const WORKSPACE_NESTED_FIELD_INPUT_WELL =
  "flex min-w-0 flex-1 items-center self-stretch bg-ui-field-hover px-2.5 py-2";

/** Inline stat row label (same tone, truncates beside the value). */
export const WORKSPACE_NESTED_FIELD_LABEL_INLINE = WORKSPACE_NESTED_FIELD_LABEL;

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
