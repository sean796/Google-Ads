import React from "react";
import {
  TaskFormDatePicker,
  TaskFormFlatGrid,
  TaskFormFlatSelectPlaceholder,
  TaskFormPlaceholderCell,
  TaskFormTimePicker,
} from "@/components/manager/tasks/TaskFormLayout";
import {
  TASK_FORM_FLAT_CONTROL_CLASS,
} from "@/components/manager/tasks/task-form-layout-styles";
import { GscReportingExecutionFields } from "@/components/manager/tasks/GscReportingExecutionFields";
import { AdsReportingExecutionFields } from "@/components/manager/tasks/AdsReportingExecutionFields";
import { LocalDominatorExportExecutionFields } from "@/components/manager/tasks/LocalDominatorExportExecutionFields";
import { PostCreatorExecutionFields } from "@/components/manager/tasks/PostCreatorExecutionFields";
import { TaskTriggerFields } from "@/components/manager/tasks/TaskTriggerFields";
import { ensurePostCreatorPayload } from "@/lib/post-creator/post-creator-defaults";
import { automationUsesTriggerUi } from "@/lib/task-automation-ui";
import { TASK_EXECUTION_KIND_OPTIONS } from "@/lib/task-execution-kind-options";
import type {
  TaskExecutionKind,
  TaskExecutionPayload,
  TaskRecurrenceRule,
  TaskScheduleMode,
  TaskStatus,
} from "@/lib/tasks-types";
import { TASK_RECURRENCE_LABELS, TASK_RECURRENCE_RULES, TASK_STATUS_LABELS, TASK_STATUSES } from "@/lib/tasks-types";
import type { TaskTriggerConfig } from "@/lib/task-trigger-types";
import { Field } from "@/ui";

export type AutomationActionDraft = {
  title: string;
  status: TaskStatus;
  scheduleMode?: TaskScheduleMode;
  dueDate?: string;
  dueTime?: string;
  recurrenceRule?: TaskRecurrenceRule;
  triggerConfig: TaskTriggerConfig;
  executionKind: TaskExecutionKind;
  executionPayload: TaskExecutionPayload;
};

/** @deprecated Use AutomationActionDraft */
export type AutomationTaskDraft = AutomationActionDraft;

export type AutomationActionFlatRowProps = {
  draft: AutomationActionDraft;
  saving: boolean;
  onChange: (patch: Partial<AutomationActionDraft>) => void;
};

function handleExecutionKindChange(
  kind: TaskExecutionKind,
  draft: AutomationActionDraft,
): Partial<AutomationActionDraft> {
  if (kind === "post_creator") {
    return {
      executionKind: kind,
      scheduleMode: "calendar",
      recurrenceRule: draft.recurrenceRule && draft.recurrenceRule !== "none" ? draft.recurrenceRule : "monthly",
      executionPayload: ensurePostCreatorPayload(draft.executionPayload),
    };
  }
  if (kind === "gsc_reporting" || kind === "ads_reporting") {
    return {
      executionKind: kind,
      scheduleMode: "calendar",
      recurrenceRule: draft.recurrenceRule && draft.recurrenceRule !== "none" ? draft.recurrenceRule : "monthly",
      executionPayload: {
        comparePreset: draft.executionPayload.comparePreset ?? "mom",
        saveToDisk: draft.executionPayload.saveToDisk !== false,
      },
    };
  }
  if (kind === "local_dominator_export") {
    return {
      executionKind: kind,
      scheduleMode: "calendar",
      recurrenceRule: "none",
      executionPayload: {
        businessName: draft.executionPayload.businessName ?? "",
        keyword: draft.executionPayload.keyword ?? "",
        saveLocalArchive: draft.executionPayload.saveLocalArchive ?? true,
        saveToDisk: draft.executionPayload.saveToDisk !== false,
      },
    };
  }
  if (kind === "chatgpt_website_audit") {
    return {
      executionKind: kind,
      scheduleMode: "calendar",
      recurrenceRule: "none",
      executionPayload: {
        saveLocalArchive: true,
        saveToDisk: draft.executionPayload.saveToDisk !== false,
      },
    };
  }
  if (kind === "browser_automation") {
    return {
      executionKind: kind,
      scheduleMode: "calendar",
      recurrenceRule: "none",
      executionPayload: {
        saveLocalArchive: true,
        saveToDisk: draft.executionPayload.saveToDisk !== false,
        targetUrl: draft.executionPayload.targetUrl ?? "",
        browserInstructionsHtml: draft.executionPayload.browserInstructionsHtml ?? "",
      },
    };
  }
  return {
    executionKind: kind,
    scheduleMode: "trigger",
    recurrenceRule: "none",
    executionPayload: { ...draft.executionPayload, updateMode: draft.executionPayload.updateMode ?? "update" },
  };
}

export function AutomationActionFlatRow({
  draft,
  saving,
  onChange,
}: AutomationActionFlatRowProps): React.ReactElement {
  const showTrigger = automationUsesTriggerUi(draft.executionKind, draft.scheduleMode);
  const showCalendar = !showTrigger;
  const isPostCreator = draft.executionKind === "post_creator";
  const isGscReporting = draft.executionKind === "gsc_reporting";
  const isAdsReporting = draft.executionKind === "ads_reporting";
  const isLocalDominatorExport = draft.executionKind === "local_dominator_export";

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <TaskFormFlatGrid className="grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <TaskFormPlaceholderCell>
          <Field
            value={draft.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Action title"
            aria-label="Action title"
            disabled={saving}
          />
        </TaskFormPlaceholderCell>
        <TaskFormFlatSelectPlaceholder
          placeholder="Status"
          value={draft.status}
          onChange={(v) => onChange({ status: v as TaskStatus })}
          disabled={saving}
          options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }))}
        />
        <TaskFormFlatSelectPlaceholder
          placeholder="Execution"
          value={draft.executionKind}
          onChange={(v) => onChange(handleExecutionKindChange(v as TaskExecutionKind, draft))}
          disabled={saving}
          options={TASK_EXECUTION_KIND_OPTIONS}
        />
      </TaskFormFlatGrid>

      {showCalendar ? (
        <>
          <TaskFormFlatGrid className="grid-cols-2 md:grid-cols-3">
            <TaskFormFlatSelectPlaceholder
              placeholder="Recurrence"
              value={draft.recurrenceRule === "none" ? "" : (draft.recurrenceRule ?? "monthly")}
              onChange={(v) => onChange({ recurrenceRule: (v || "monthly") as TaskRecurrenceRule })}
              disabled={saving}
              options={TASK_RECURRENCE_RULES.filter((r) => r !== "none").map((rule) => ({
                value: rule,
                label: TASK_RECURRENCE_LABELS[rule],
              }))}
            />
            <TaskFormDatePicker
              placeholder="Due date"
              value={draft.dueDate ?? ""}
              onChange={(dueDate) => onChange({ dueDate })}
              disabled={saving}
            />
            <TaskFormTimePicker
              placeholder="Due time"
              value={draft.dueTime ?? ""}
              onChange={(dueTime) => onChange({ dueTime })}
              disabled={saving}
            />
          </TaskFormFlatGrid>
          {isPostCreator ? (
            <PostCreatorExecutionFields
              layout="inline"
              executionPayload={draft.executionPayload}
              disabled={saving}
              onChange={(executionPayload) => onChange({ executionPayload })}
            />
          ) : null}
          {isGscReporting ? (
            <GscReportingExecutionFields
              layout="inline"
              executionPayload={draft.executionPayload}
              disabled={saving}
              onChange={(executionPayload) => onChange({ executionPayload })}
            />
          ) : null}
          {isAdsReporting ? (
            <AdsReportingExecutionFields
              layout="inline"
              executionPayload={draft.executionPayload}
              disabled={saving}
              onChange={(executionPayload) => onChange({ executionPayload })}
            />
          ) : null}
          {isLocalDominatorExport ? (
            <LocalDominatorExportExecutionFields
              layout="inline"
              executionPayload={draft.executionPayload}
              disabled={saving}
              onChange={(executionPayload) => onChange({ executionPayload })}
            />
          ) : null}
        </>
      ) : (
        <TaskTriggerFields
          layout="inline"
          triggerConfig={draft.triggerConfig}
          executionPayload={draft.executionPayload}
          disabled={saving}
          onChange={(triggerConfig) => onChange({ triggerConfig })}
          onExecutionPayloadChange={(executionPayload) => onChange({ executionPayload })}
        />
      )}
    </div>
  );
}

/** @deprecated Use AutomationActionFlatRow */
export const AutomationTaskFlatRow = AutomationActionFlatRow;
