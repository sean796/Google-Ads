import React from "react";
import {
  TaskFormFlatGrid,
  TaskFormFlatSelectPlaceholder,
  TaskFormPanel,
} from "@/components/manager/tasks/TaskFormLayout";
import { AutomationWhatAspectPills } from "@/components/manager/tasks/planner/AutomationWhatAspectPills";
import { TaskExecutionTargetFields } from "@/components/manager/tasks/TaskExecutionTargetFields";
import {
  ensureOptimizationOptions,
  inferOptimizerKindFromOptions,
  inferOptimizerKeywordFromOptions,
} from "@/lib/task-optimization-options-defaults";
import type { TaskExecutionKind, TaskExecutionPayload } from "@/lib/tasks-types";
import { TextareaField } from "@/ui";

export type ContentOptimizerExecutionFieldsProps = {
  layout?: "workflow" | "inline";
  actionBlockKeyword?: string;
  executionKind: TaskExecutionKind;
  executionPayload?: TaskExecutionPayload | null;
  disabled?: boolean;
  onChange: (patch: {
    executionKind: TaskExecutionKind;
    actionBlockKeyword: string;
    executionPayload: TaskExecutionPayload;
  }) => void;
};

export function ContentOptimizerExecutionFields({
  layout = "inline",
  actionBlockKeyword,
  executionKind,
  executionPayload,
  disabled = false,
  onChange,
}: ContentOptimizerExecutionFieldsProps): React.ReactElement {
  const blockKeyword =
    actionBlockKeyword?.trim() ||
    (executionKind === "content_optimizer_meta" ? "content-optimizer-meta" : "content-optimizer-full");
  const payload = ensureOptimizationOptions(executionPayload ?? {}, blockKeyword);

  const handlePayloadChange = (nextPayload: TaskExecutionPayload) => {
    const options = nextPayload.optimizationOptions ?? {};
    const nextKind = inferOptimizerKindFromOptions(options);
    const nextKeyword = inferOptimizerKeywordFromOptions(options);
    onChange({
      executionKind: nextKind,
      actionBlockKeyword: nextKeyword,
      executionPayload: nextPayload,
    });
  };

  const scopePanel = (
    <TaskFormPanel title="Scope">
      <TaskFormFlatGrid className="grid-cols-3">
        <TaskExecutionTargetFields
          variant="flatPlaceholder"
          bucketLabel="Target bucket"
          executionPayload={payload}
          disabled={disabled}
          onChange={(next) => handlePayloadChange({ ...payload, ...next })}
        />
        <TaskFormFlatSelectPlaceholder
          placeholder="Update mode"
          value={payload.updateMode ?? "update"}
          onChange={(value) => handlePayloadChange({ ...payload, updateMode: value as TaskExecutionPayload["updateMode"] })}
          disabled={disabled}
          options={[
            { value: "update", label: "Update live" },
            { value: "draft", label: "Draft only" },
          ]}
        />
        <TaskFormFlatSelectPlaceholder
          placeholder="Research"
          value={payload.optimizationOptions?.forceNewResearch === true ? "new" : "saved"}
          onChange={(value) =>
            handlePayloadChange({
              ...payload,
              optimizationOptions: {
                ...(payload.optimizationOptions ?? {}),
                forceNewResearch: value === "new",
              },
            })
          }
          disabled={disabled}
          options={[
            { value: "saved", label: "Saved brief" },
            { value: "new", label: "New research" },
          ]}
        />
      </TaskFormFlatGrid>
    </TaskFormPanel>
  );

  const instructionsPanel = (
    <TaskFormPanel title="Instructions">
      <TextareaField
        value={payload.optionalPrompt ?? ""}
        disabled={disabled}
        rows={3}
        placeholder="Instructions"
        aria-label="Instructions"
        onChange={(event) => handlePayloadChange({ ...payload, optionalPrompt: event.target.value })}
      />
    </TaskFormPanel>
  );

  if (layout === "workflow") {
    return (
      <>
        <TaskFormPanel title="SEO aspects">
          <AutomationWhatAspectPills
            executionPayload={payload}
            disabled={disabled}
            pillTone="monochrome"
            onChange={handlePayloadChange}
          />
        </TaskFormPanel>
        {scopePanel}
        {instructionsPanel}
      </>
    );
  }

  return (
    <>
      <AutomationWhatAspectPills
        executionPayload={payload}
        disabled={disabled}
        onChange={handlePayloadChange}
      />
      {scopePanel}
      {instructionsPanel}
    </>
  );
}
