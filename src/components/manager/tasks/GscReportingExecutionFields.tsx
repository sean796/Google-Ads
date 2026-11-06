import React from "react";
import { Checkbox } from "@/ui";

import {
  TaskFormFlatGrid,
  TaskFormPlaceholderCell,
} from "@/components/manager/tasks/TaskFormLayout";
import { GscReportingPeriodFields } from "@/components/manager/tasks/GscReportingPeriodFields";
import type { TaskExecutionPayload } from "@/lib/tasks-types";

export type GscReportingExecutionFieldsProps = {
  executionPayload?: TaskExecutionPayload | null;
  disabled?: boolean;
  layout?: "stack" | "inline" | "workflow";
  onChange: (payload: TaskExecutionPayload) => void;
};

export function GscReportingExecutionFields({
  executionPayload,
  disabled = false,
  layout = "stack",
  onChange,
}: GscReportingExecutionFieldsProps): React.ReactElement {
  const payload = executionPayload ?? {};
  const saveToDisk = payload.saveToDisk !== false;
  const inline = layout === "inline";
  const workflow = layout === "workflow";

  const patch = (partial: Partial<TaskExecutionPayload>) => {
    onChange({ ...payload, ...partial });
  };

  if (workflow) {
    return (
      <>
        <GscReportingPeriodFields
          executionPayload={payload}
          disabled={disabled}
          layout="workflow"
          onChange={onChange}
        />
      </>
    );
  }

  if (inline) {
    return (
      <TaskFormFlatGrid className="grid-cols-2">
        <GscReportingPeriodFields
          executionPayload={payload}
          disabled={disabled}
          layout="task"
          onChange={onChange}
        />
        <TaskFormPlaceholderCell className="flex min-w-0 items-center gap-2">
          <Checkbox
            id="gsc-reporting-save-inline"
            checked={saveToDisk}
            disabled={disabled}
            onCheckedChange={(checked) => patch({ saveToDisk: checked === true })}
          />
          <label htmlFor="gsc-reporting-save-inline" className="text-base text-white">
            Save to disk
          </label>
        </TaskFormPlaceholderCell>
      </TaskFormFlatGrid>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <GscReportingPeriodFields
        executionPayload={payload}
        disabled={disabled}
        layout="task"
        onChange={onChange}
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id="gsc-reporting-save-stack"
          checked={saveToDisk}
          disabled={disabled}
          onCheckedChange={(checked) => patch({ saveToDisk: checked === true })}
        />
        <label htmlFor="gsc-reporting-save-stack" className="text-base text-white">
          Save report to disk
        </label>
      </div>
    </div>
  );
}
