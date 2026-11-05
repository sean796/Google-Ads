import React, { useMemo } from "react";
import { TaskTriggerFields } from "@/components/manager/tasks/TaskTriggerFields";
import { AutomationSchedulePanel } from "@/components/manager/tasks/planner/AutomationSchedulePanel";
import { AutomationBlockPicker } from "@/components/manager/tasks/planner/AutomationBlockPicker";
import { PulseForgePostSchedulePanel } from "@/components/manager/tasks/planner/PulseForgePostSchedulePanel";
import { ensureExecutionSchedulePayload } from "@/lib/post-creator/post-creator-schedule-payload";
import type { AutomationBlockCatalogItem } from "@/lib/automation-blocks-api";
import type {
  AutomationGscTriggerBlock,
  AutomationPollTriggerBlock,
  AutomationScheduleBlock,
  AutomationTriggerBlock,
} from "@/lib/automation-planner-types";
import { defaultTaskTriggerConfig } from "@/lib/task-trigger-types";

export type AutomationWhenPanelProps = {
  trigger: AutomationTriggerBlock;
  triggerBlocks: AutomationBlockCatalogItem[];
  disabled?: boolean;
  onChange: (trigger: AutomationTriggerBlock) => void;
};

function applyTriggerBlockDefaults(
  block: AutomationBlockCatalogItem,
  current: AutomationTriggerBlock,
): AutomationTriggerBlock {
  const defaults = block.defaults ?? {};
  if (block.kind === "calendar") {
    const d = defaults as Partial<AutomationScheduleBlock>;
    return {
      keyword: block.keyword,
      kind: "calendar",
      frequency: d.frequency ?? "monthly",
      startDate: d.startDate ?? "2026-09-01",
      time: d.time ?? "09:00",
      targetBucket: current.targetBucket,
    };
  }
  if (block.kind === "poll") {
    const d = defaults as Partial<AutomationPollTriggerBlock>;
    return {
      keyword: block.keyword,
      kind: "poll",
      pollHours: d.pollHours ?? 24,
      targetBucket: current.targetBucket,
      watchSchedule: d.watchSchedule,
      triggerConfig: d.triggerConfig ?? { ...defaultTaskTriggerConfig(), sources: ["schedule"] },
    };
  }
  const d = defaults as Partial<AutomationGscTriggerBlock>;
  return {
    keyword: block.keyword,
    kind: "gsc",
    source: d.source ?? "gsc",
    targetBucket: current.targetBucket,
    triggerConfig: d.triggerConfig ?? defaultTaskTriggerConfig(),
  };
}

export function AutomationWhenPanel({
  trigger,
  triggerBlocks,
  disabled = false,
  onChange,
}: AutomationWhenPanelProps): React.ReactElement {
  const scheduleBlocks = useMemo(
    () => triggerBlocks.filter((b) => b.kind === "calendar"),
    [triggerBlocks],
  );
  const gscBlocks = useMemo(
    () => triggerBlocks.filter((b) => b.kind === "gsc"),
    [triggerBlocks],
  );
  const pollBlocks = useMemo(
    () => triggerBlocks.filter((b) => b.kind === "poll" && b.keyword !== "schedule-poll"),
    [triggerBlocks],
  );

  const handleSelect = (keyword: string) => {
    const block = triggerBlocks.find((b) => b.keyword === keyword);
    if (!block) return;
    onChange(applyTriggerBlockDefaults(block, trigger));
  };

  return (
    <div className="flex flex-col gap-3 rounded-none bg-ui-field/50 p-4">
      <AutomationBlockPicker
        blocks={[...scheduleBlocks, ...gscBlocks, ...pollBlocks]}
        selectedKeyword={trigger.keyword}
        disabled={disabled}
        onSelect={handleSelect}
      />

      {trigger.kind === "calendar" ? (
        <AutomationSchedulePanel
          block={trigger}
          disabled={disabled}
          onChange={(patch) => onChange({ ...trigger, ...patch })}
        />
      ) : null}

      {trigger.kind === "gsc" ? (
        <TaskTriggerFields
          layout="inline"
          triggerConfig={trigger.triggerConfig}
          executionPayload={{ targetBucket: trigger.targetBucket }}
          disabled={disabled}
          onChange={(triggerConfig) => onChange({ ...trigger, triggerConfig })}
          onExecutionPayloadChange={(executionPayload) =>
            onChange({ ...trigger, targetBucket: executionPayload.targetBucket })
          }
        />
      ) : null}

      {trigger.kind === "poll" ? (
        <PulseForgePostSchedulePanel
          heading="External platform schedule"
          executionPayload={ensureExecutionSchedulePayload(trigger.watchSchedule)}
          disabled={disabled}
          onChange={(watchSchedule) => onChange({ ...trigger, watchSchedule })}
        />
      ) : null}
    </div>
  );
}
