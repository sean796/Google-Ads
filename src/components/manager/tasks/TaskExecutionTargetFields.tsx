import React from "react";
import {
  TaskFormFlatSelect,
  TaskFormFlatSelectPlaceholder,
  TaskFormInfieldSelect,
  TaskFormPlaceholderCell,
} from "@/components/manager/tasks/TaskFormLayout";
import {
  TASK_FORM_SELECT_CONTENT_CLASS,
  TASK_FORM_SELECT_ITEM_CLASS,
  TASK_FORM_SELECT_TRIGGER_CLASS,
} from "@/components/manager/tasks/task-form-layout-styles";
import type { TaskExecutionPayload } from "@/lib/tasks-types";
import {
  TASK_EXECUTION_TARGET_BUCKETS,
  TASK_EXECUTION_TARGET_BUCKET_LABELS,
  type TaskExecutionTargetBucket,
} from "@/lib/task-execution-bucket";
import { SelectField } from "@/ui";

export type TaskExecutionTargetFieldsProps = {
  executionPayload?: TaskExecutionPayload | null;
  disabled?: boolean;
  inputClassName?: string;
  variant?: "stack" | "inline" | "flat" | "flatPlaceholder" | "inlineRow";
  bucketLabel?: string;
  onChange: (executionPayload: TaskExecutionPayload) => void;
};

export function TaskExecutionTargetFields({
  executionPayload,
  disabled = false,
  variant = "stack",
  bucketLabel = "Bucket",
  onChange,
}: TaskExecutionTargetFieldsProps): React.ReactElement {
  const targetBucket = executionPayload?.targetBucket ?? "";

  const bucketOptions = [
    { value: "", label: "Select" },
    ...TASK_EXECUTION_TARGET_BUCKETS.map((bucket) => ({
      value: bucket,
      label: TASK_EXECUTION_TARGET_BUCKET_LABELS[bucket],
    })),
  ];

  const handleChange = (value: string) =>
    onChange({
      updateMode: executionPayload?.updateMode ?? "update",
      ...executionPayload,
      targetBucket: value as TaskExecutionTargetBucket,
      targetUrl: undefined,
    });

  const emptySelectValue = "__empty__";
  const toSelectValue = (value: string) => (value === "" ? emptySelectValue : value);
  const fromSelectValue = (value: string) => (value === emptySelectValue ? "" : value);

  if (variant === "flatPlaceholder") {
    return (
      <TaskFormFlatSelectPlaceholder
        placeholder={bucketLabel}
        value={targetBucket}
        onChange={handleChange}
        disabled={disabled}
        options={bucketOptions}
      />
    );
  }

  if (variant === "inlineRow") {
    return (
      <TaskFormPlaceholderCell className="flex w-full min-w-0 flex-row items-center gap-2">
        <span className="shrink-0 text-base text-muted-foreground">{bucketLabel}</span>
        <div className="min-w-0 flex-1">
          <SelectField placeholder="Select" value={toSelectValue(targetBucket)} onValueChange={(value) => handleChange(fromSelectValue(value))} disabled={disabled} options={bucketOptions.map((opt) => ({ value: toSelectValue(opt.value), label: opt.label }))} />
        </div>
      </TaskFormPlaceholderCell>
    );
  }

  if (variant === "flat") {
    return (
      <TaskFormFlatSelect
        label={bucketLabel}
        value={targetBucket}
        onChange={handleChange}
        disabled={disabled}
        options={bucketOptions}
      />
    );
  }

  return (
    <TaskFormInfieldSelect
      label={bucketLabel}
      value={targetBucket}
      onChange={handleChange}
      disabled={disabled}
      options={bucketOptions}
    />
  );
}
