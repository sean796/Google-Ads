import React from "react";
import { PulseForgePostSchedulePanel } from "@/components/manager/tasks/planner/PulseForgePostSchedulePanel";
import { ensureExecutionSchedulePayload } from "@/lib/post-creator/post-creator-schedule-payload";
import type { AutomationActionBlock } from "@/lib/automation-planner-types";

export type AutomationThenPanelProps = {
  action: AutomationActionBlock;
  disabled?: boolean;
  siteName?: string;
  onChange: (patch: Partial<AutomationActionBlock>) => void;
};

export function AutomationThenPanel({
  action,
  disabled = false,
  siteName = "",
  onChange,
}: AutomationThenPanelProps): React.ReactElement {
  return (
    <div className="rounded-none bg-ui-field/50 p-4">
      <PulseForgePostSchedulePanel
        heading="Schedule"
        executionKind={action.executionKind}
        executionPayload={ensureExecutionSchedulePayload(action.executionPayload)}
        disabled={disabled}
        siteName={siteName}
        onChange={(executionPayload) => onChange({ executionPayload })}
      />
    </div>
  );
}
