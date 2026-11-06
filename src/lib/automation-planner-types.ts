import type { AutomationRecipeBucket, AutomationRecipeCatalogItem } from "@/lib/automation-recipes-types";
import type {
  TaskExecutionKind,
  TaskExecutionPayload,
  TaskRecurrenceRule,
  TaskTemplateTaskDef,
} from "@/lib/tasks-types";
import type { TaskTriggerConfig, TaskTriggerSource } from "@/lib/task-trigger-types";

export type ScheduleFrequency = "once" | "daily" | "weekly" | "monthly" | "yearly";

export type AutomationScheduleBlock = {
  keyword: string;
  kind: "calendar";
  frequency: ScheduleFrequency;
  startDate: string;
  time: string;
  targetBucket?: AutomationRecipeBucket;
};

export type AutomationGscTriggerBlock = {
  keyword: string;
  kind: "gsc";
  source: TaskTriggerSource;
  targetBucket?: AutomationRecipeBucket;
  triggerConfig: TaskTriggerConfig;
};

export type AutomationPollTriggerBlock = {
  keyword: string;
  kind: "poll";
  pollHours: number;
  targetBucket?: AutomationRecipeBucket;
  triggerConfig: TaskTriggerConfig;
  /** WordPress-style schedule for external platform publish windows (WHEN). */
  watchSchedule?: TaskExecutionPayload;
};

export type AutomationTriggerBlock =
  | AutomationScheduleBlock
  | AutomationGscTriggerBlock
  | AutomationPollTriggerBlock;

export type AutomationActionBlock = {
  keyword: string;
  executionKind: TaskExecutionKind;
  executionPayload: TaskExecutionPayload;
  title?: string;
};

export type AutomationPlan = {
  keyword: string;
  name: string;
  description?: string;
  category?: string;
  prerequisites?: string[];
  trigger: AutomationTriggerBlock;
  action: AutomationActionBlock;
  /** Multi-action recipes (e.g. seo-autopilot-flywheel). */
  actions?: AutomationActionBlock[];
};

export type AutomationPlanRecipeMeta = Pick<
  AutomationRecipeCatalogItem,
  "keyword" | "name" | "description" | "category" | "prerequisites"
>;

export type AutomationPlanTaskInput = Omit<TaskTemplateTaskDef, "keyword" | "title"> & {
  keyword?: string;
  title?: string;
};

export const SCHEDULE_BLOCK_KEYWORDS: Record<ScheduleFrequency, string> = {
  once: "schedule-once",
  daily: "schedule-daily",
  weekly: "schedule-weekly",
  monthly: "schedule-monthly",
  yearly: "schedule-yearly",
};
