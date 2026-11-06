import type {
  TaskFile,
  TaskNote,
  TaskProject,
  TaskTag,
  TeamTask,
  TaskStatus,
  TaskExecutionPayload,
  TaskRecurrenceRule,
  TaskScheduleMode,
  TaskExecutionKind,
} from "@/lib/tasks-types";
import type { TaskTriggerConfig } from "@/lib/task-trigger-types";
import type { TeamMember } from "@/lib/teams-types";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewTaskDialog";

export type TaskDetailPaneProps = {
  open: boolean;
  task: TeamTask | null;
  notes: TaskNote[];
  files: TaskFile[];
  subtasks: TeamTask[];
  tags: TaskTag[];
  members: TeamMember[];
  siteOptions: WordPressSiteOption[];
  memberNames: Map<number, string>;
  teamId: number | null;
  saving: boolean;
  uploading: boolean;
  isAutomationContext?: boolean;
  automationProject?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null;
  onClose: () => void;
  onMarkDone: () => void;
  onUpdate: (patch: {
    keyword?: string;
    title?: string;
    description?: string;
    status?: TaskStatus;
    assigneeIds?: number[];
    dueDate?: string;
    dueTime?: string;
    tagIds?: string[];
    recurrenceRule?: TaskRecurrenceRule;
    scheduleMode?: TaskScheduleMode;
    triggerConfig?: TaskTriggerConfig;
    executionKind?: TaskExecutionKind;
    executionPayload?: TaskExecutionPayload;
  }) => void;
  mentionMembers: TeamMember[];
  onAddNote: (body: string, mentionUserIds: number[]) => void;
  onUploadFile: (file: File) => void;
  onAddSubtask: (title: string) => void;
  onToggleSubtask: (taskId: number, status: TaskStatus) => void;
  onDelete: () => void;
  onExecuteAutomationTask?: () => void;
  onExecuteWithAgent?: () => void;
  executeWithAgentDisabledReason?: string | null;
};

export type AutomationTab = "details" | "trigger" | "schedule" | "agent" | "activity";
export type RegularTab = "details" | "schedule" | "people" | "activity";
export type DetailTab = AutomationTab | RegularTab;

export const AUTOMATION_TRIGGER_TABS: { id: AutomationTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "trigger", label: "Trigger" },
  { id: "agent", label: "Agent" },
  { id: "activity", label: "Activity" },
];

export const AUTOMATION_CALENDAR_TABS: { id: AutomationTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "schedule", label: "Schedule" },
  { id: "agent", label: "Agent" },
  { id: "activity", label: "Activity" },
];

export const REGULAR_TABS: { id: RegularTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "schedule", label: "Schedule" },
  { id: "people", label: "People" },
  { id: "activity", label: "Activity" },
];

export type TaskDetailTabBarProps = {
  tabs: { id: DetailTab; label: string }[];
  activeTab: DetailTab;
  onChange: (tab: DetailTab) => void;
};

export type TaskDetailAutomationSchedulePanelProps = {
  task: TeamTask;
  executionKind: string;
  executionPayload: TaskExecutionPayload;
  saving: boolean;
  onUpdate: TaskDetailPaneProps["onUpdate"];
};

export type TaskDetailActivityPanelProps = {
  task: TeamTask;
  isAutomationContext: boolean;
  subtasks: TeamTask[];
  onToggleSubtask: TaskDetailPaneProps["onToggleSubtask"];
  onAddSubtask: TaskDetailPaneProps["onAddSubtask"];
  notes: TaskNote[];
  memberNames: Map<number, string>;
  mentionMembers: TeamMember[];
  saving: boolean;
  onAddNote: TaskDetailPaneProps["onAddNote"];
  teamId: number | null;
  files: TaskFile[];
  uploading: boolean;
  onUploadFile: TaskDetailPaneProps["onUploadFile"];
};
