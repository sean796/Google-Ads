import {
  TaskFormFieldGrid,
  TaskFormInfield,
  TaskFormInfieldSelect,
  TaskFormPanel,
} from "@/components/manager/tasks/TaskFormLayout";
import { GscReportingExecutionFields } from "@/components/manager/tasks/GscReportingExecutionFields";
import { AdsReportingExecutionFields } from "@/components/manager/tasks/AdsReportingExecutionFields";
import { LocalDominatorExportExecutionFields } from "@/components/manager/tasks/LocalDominatorExportExecutionFields";
import { PostCreatorExecutionFields } from "@/components/manager/tasks/PostCreatorExecutionFields";
import { EntityPageCreatorExecutionFields } from "@/components/manager/tasks/EntityPageCreatorExecutionFields";
import { EntityGeneratorExecutionFields } from "@/components/manager/tasks/EntityGeneratorExecutionFields";
import { SapGeneratorExecutionFields } from "@/components/manager/tasks/SapGeneratorExecutionFields";
import { ContentGapCheckExecutionFields } from "@/components/manager/tasks/ContentGapCheckExecutionFields";
import { ensureContentGapCheckPayload } from "@/lib/content-gap/resolve-content-gap-count";
import { BrowserAutomationExecutionFields } from "@/components/manager/tasks/BrowserAutomationExecutionFields";
import { ensurePostCreatorPayload } from "@/lib/post-creator/post-creator-defaults";
import { ensureEntityPageCreatorPayload } from "@/lib/entity-page-creator/entity-page-creator-defaults";
import type { EntityPageCreatorExecutionPayload, TaskRecurrenceRule } from "@/lib/tasks-types";
import { TASK_RECURRENCE_LABELS, TASK_RECURRENCE_RULES } from "@/lib/tasks-types";
import { Field } from "@/ui";
import type { TaskDetailAutomationSchedulePanelProps } from "@/components/manager/tasks/task-detail-pane-types";

export function TaskDetailAutomationSchedulePanel({
  task,
  executionKind,
  executionPayload,
  saving,
  onUpdate,
}: TaskDetailAutomationSchedulePanelProps) {
  return (
    <TaskFormPanel title="Calendar schedule">
      <TaskFormInfieldSelect
        label="Recurrence"
        value={task.recurrenceRule ?? "none"}
        onChange={(v) => onUpdate({ recurrenceRule: v as TaskRecurrenceRule })}
        disabled={saving}
        options={TASK_RECURRENCE_RULES.filter((r) => r !== "none").map((rule) => ({
          value: rule,
          label: TASK_RECURRENCE_LABELS[rule],
        }))}
      />
      <TaskFormFieldGrid>
        <TaskFormInfield label="Due date">
          <Field
            placeholder="Due date"
            type="date"
            value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
            onChange={(e) => onUpdate({ dueDate: e.target.value })}
            disabled={saving}
          />
        </TaskFormInfield>
        <TaskFormInfield label="Due time">
          <Field
            placeholder="Due time"
            type="time"
            value={task.dueTime ?? ""}
            onChange={(e) => onUpdate({ dueTime: e.target.value })}
            disabled={saving}
            aria-label="Due time"
          />
        </TaskFormInfield>
      </TaskFormFieldGrid>
      {executionKind === "entity_page_creator" ? (
        <EntityPageCreatorExecutionFields
          layout="stack"
          executionPayload={ensureEntityPageCreatorPayload(executionPayload as EntityPageCreatorExecutionPayload)}
          disabled={saving}
          onChange={(nextPayload) =>
            onUpdate({
              executionPayload: ensureEntityPageCreatorPayload(nextPayload as EntityPageCreatorExecutionPayload),
              executionKind: "entity_page_creator",
              scheduleMode: "calendar",
            })
          }
        />
      ) : null}
      {executionKind === "entity_generator" ? (
        <EntityGeneratorExecutionFields
          executionPayload={ensureEntityPageCreatorPayload(executionPayload as EntityPageCreatorExecutionPayload)}
          disabled={saving}
          onChange={(nextPayload) =>
            onUpdate({
              executionPayload: ensureEntityPageCreatorPayload(nextPayload as EntityPageCreatorExecutionPayload),
              executionKind: "entity_generator",
              scheduleMode: "calendar",
            })
          }
        />
      ) : null}
      {executionKind === "sap_generator" ? (
        <SapGeneratorExecutionFields
          executionPayload={ensureEntityPageCreatorPayload(executionPayload as EntityPageCreatorExecutionPayload)}
          disabled={saving}
          onChange={(nextPayload) =>
            onUpdate({
              executionPayload: ensureEntityPageCreatorPayload(nextPayload as EntityPageCreatorExecutionPayload),
              executionKind: "sap_generator",
              scheduleMode: "calendar",
            })
          }
        />
      ) : null}
      {executionKind === "post_creator" ? (
        <PostCreatorExecutionFields
          layout="stack"
          executionPayload={ensurePostCreatorPayload(executionPayload)}
          disabled={saving}
          onChange={(nextPayload) =>
            onUpdate({ executionPayload: ensurePostCreatorPayload(nextPayload), executionKind: "post_creator", scheduleMode: "calendar" })
          }
        />
      ) : null}
      {executionKind === "gsc_reporting" ? (
        <GscReportingExecutionFields
          layout="stack"
          executionPayload={executionPayload}
          disabled={saving}
          onChange={(nextPayload) => onUpdate({ executionPayload: nextPayload })}
        />
      ) : null}
      {executionKind === "ads_reporting" ? (
        <AdsReportingExecutionFields
          layout="stack"
          executionPayload={executionPayload}
          disabled={saving}
          onChange={(nextPayload) => onUpdate({ executionPayload: nextPayload })}
        />
      ) : null}
      {executionKind === "local_dominator_export" ? (
        <LocalDominatorExportExecutionFields
          layout="stack"
          executionPayload={executionPayload}
          disabled={saving}
          onChange={(nextPayload) => onUpdate({ executionPayload: nextPayload })}
        />
      ) : null}
      {executionKind === "content_gap_check" ? (
        <ContentGapCheckExecutionFields
          layout="stack"
          clientSiteId={task.wordpressSiteId ?? ""}
          executionPayload={executionPayload}
          disabled={saving}
          onChange={(nextPayload) =>
            onUpdate({
              executionPayload: ensureContentGapCheckPayload(nextPayload),
              executionKind: "content_gap_check",
              scheduleMode: "calendar",
            })
          }
        />
      ) : null}
      {executionKind === "browser_automation" ? (
        <BrowserAutomationExecutionFields
          layout="stack"
          clientSiteId={task.wordpressSiteId ?? ""}
          executionPayload={executionPayload}
          disabled={saving}
          onChange={(nextPayload) =>
            onUpdate({
              executionPayload: nextPayload,
              executionKind: "browser_automation",
              scheduleMode: "calendar",
            })
          }
        />
      ) : null}
    </TaskFormPanel>
  );
}
