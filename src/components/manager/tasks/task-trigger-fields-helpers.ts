import type { TaskExecutionPayload } from "@/lib/tasks-types";
import type {
  TaskTriggerConfig,
  TaskTriggerCondition,
  TaskTriggerEvaluateResult,
  TaskTriggerSignal,
} from "@/lib/task-trigger-types";
import { TASK_TRIGGER_SIGNAL_DEFAULTS } from "@/lib/task-trigger-types";
export type TaskTriggerFieldsProps = {
  triggerConfig: TaskTriggerConfig;
  executionPayload?: TaskExecutionPayload | null;
  disabled?: boolean;
  layout?: "stack" | "inline";
  onChange: (config: TaskTriggerConfig) => void;
  onExecutionPayloadChange: (payload: TaskExecutionPayload) => void;
};

export function conditionKey(condition: TaskTriggerCondition): string {
  return `${condition.signal}:${condition.operator}:${condition.value}:${condition.minImpressions ?? ""}`;
}

export const MATCH_OPTIONS = [
  { value: "any", label: "Any condition" },
  { value: "all", label: "All conditions" },
];
export const EVALUATE_STATES = ["Evaluate", "Evaluating"] as const;
export const TEST_FIRE_STATES = ["Test trigger (simulated match, live run)", "Queuing"] as const;
export const ROW_CLASS = "flex min-h-9 min-w-0 flex-wrap items-center gap-x-2 gap-y-1";
export function toggleCondition(
  conditions: TaskTriggerCondition[],
  signal: TaskTriggerSignal,
): TaskTriggerCondition[] {
  const existing = conditions.find((c) => c.signal === signal);
  if (existing) {
    return conditions.filter((c) => c.signal !== signal);
  }
  const defaults = TASK_TRIGGER_SIGNAL_DEFAULTS[signal];
  return [
    ...conditions,
    {
      signal,
      operator: defaults.operator,
      value: defaults.value,
      minImpressions: defaults.minImpressions,
    },
  ];
}
export type TaskTriggerEvaluatePanelProps = {
  evaluating: boolean;
  testFiring: boolean;
  result: TaskTriggerEvaluateResult | null;
  error: string | null;
  disabled?: boolean;
  onEvaluate: () => void;
  onTestFire: () => void;
};
