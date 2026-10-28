import { isAutomationProject } from "@/lib/task-automation-templates";
import { resolveTaskExecuteSiteId } from "@/lib/agent-runs-types";
import type { TaskExecutionKind, TaskScheduleMode, TaskProject, TeamTask } from "@/lib/tasks-types";
import type { TeamMember } from "@/lib/teams-types";
import { ensurePostCreatorPayload, defaultPostCreatorExecutionPayloadForRecipe } from "@/lib/post-creator/post-creator-defaults";
import { normalizeLocalDominatorGridKeywordStored } from "@/lib/local-dominator/local-dominator-export-keyword";

export const EDITORIAL_POST_CREATOR_RECIPE_KEYWORDS = [
  "monthly-post-creator",
  "monthly-3-posts-editorial",
] as const;

export const EDITORIAL_POST_CREATOR_TASK_KEYWORDS = [
  "monthly-post-creator-run",
  "monthly-3-posts-run",
] as const;

export const GSC_REPORTING_RECIPE_KEYWORDS = [
  "gsc-monthly-mom-report",
  "gsc-monthly-yoy-report",
] as const;

export const GSC_REPORTING_TASK_KEYWORDS = ["gsc-mom-report", "gsc-yoy-report"] as const;

export const ADS_REPORTING_RECIPE_KEYWORDS = [
  "ads-monthly-mom-report",
  "ads-monthly-yoy-report",
] as const;

export const ADS_REPORTING_TASK_KEYWORDS = ["ads-mom-report", "ads-yoy-report"] as const;

export const RESEARCH_LOCAL_DOMINATOR_RECIPE_KEYWORDS = [
  "research-local-dominator-grid-export",
] as const;

export const RESEARCH_LOCAL_DOMINATOR_TASK_KEYWORDS = ["research-local-dominator-export"] as const;

export const RESEARCH_CHATGPT_AUDIT_RECIPE_KEYWORDS = ["chatgpt-website-audit"] as const;

export const RESEARCH_CHATGPT_AUDIT_TASK_KEYWORDS = ["chatgpt-website-audit-run"] as const;

const CALENDAR_AUTOMATION_KINDS = new Set<TaskExecutionKind>([
  "post_creator",
  "entity_page_creator",
  "entity_generator",
  "sap_generator",
  "gsc_reporting",
  "ads_reporting",
]);

export function isEditorialPostCreatorProject(
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): boolean {
  const recipeKw = (project?.sourceTemplateKeyword ?? "").trim();
  const projectKw = (project?.keyword ?? "").trim();
  return (
    EDITORIAL_POST_CREATOR_RECIPE_KEYWORDS.includes(
      recipeKw as (typeof EDITORIAL_POST_CREATOR_RECIPE_KEYWORDS)[number],
    ) ||
    EDITORIAL_POST_CREATOR_RECIPE_KEYWORDS.includes(
      projectKw as (typeof EDITORIAL_POST_CREATOR_RECIPE_KEYWORDS)[number],
    )
  );
}

export function isEditorialPostCreatorTask(
  task?: Pick<TeamTask, "keyword" | "executionKind"> | null,
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): boolean {
  if ((task?.executionKind ?? "").trim() === "post_creator") return true;
  if (isEditorialPostCreatorProject(project)) return true;
  const taskKw = (task?.keyword ?? "").trim();
  return EDITORIAL_POST_CREATOR_TASK_KEYWORDS.includes(
    taskKw as (typeof EDITORIAL_POST_CREATOR_TASK_KEYWORDS)[number],
  );
}

export function editorialPostCreatorRecipeKeyword(
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
  task?: Pick<TeamTask, "keyword"> | null,
): (typeof EDITORIAL_POST_CREATOR_RECIPE_KEYWORDS)[number] {
  const recipeKw = (project?.sourceTemplateKeyword ?? project?.keyword ?? "").trim();
  if (recipeKw === "monthly-3-posts-editorial" || task?.keyword === "monthly-3-posts-run") {
    return "monthly-3-posts-editorial";
  }
  return "monthly-post-creator";
}

export function resolveEffectiveExecutionKind(
  task?: Pick<TeamTask, "keyword" | "executionKind"> | null,
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): TaskExecutionKind {
  const kind = (task?.executionKind ?? "").trim();
  if (kind === "post_creator" || kind === "gsc_reporting" || kind === "ads_reporting" || kind === "entity_page_creator" || kind === "entity_generator" || kind === "sap_generator" || kind === "local_dominator_export" || kind === "chatgpt_website_audit" || kind === "browser_automation" || kind === "content_gap_check") return kind;
  if (isEditorialPostCreatorTask(task, project)) return "post_creator";
  if (isGscReportingTask(task, project)) return "gsc_reporting";
  if (isAdsReportingTask(task, project)) return "ads_reporting";
  if (isResearchChatGptAuditTask(task, project)) return "chatgpt_website_audit";
  if (isResearchLocalDominatorTask(task, project)) return "local_dominator_export";
  return (kind || "content_optimizer") as TaskExecutionKind;
}

export function isCalendarAutomationKind(kind: string | undefined | null): boolean {
  return CALENDAR_AUTOMATION_KINDS.has((kind ?? "").trim() as TaskExecutionKind);
}

export function automationUsesTriggerUi(
  kind: string | undefined | null,
  scheduleMode?: TaskScheduleMode,
  context?: {
    task?: Pick<TeamTask, "keyword" | "executionKind"> | null;
    project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null;
  },
): boolean {
  const resolvedKind = context
    ? resolveEffectiveExecutionKind(context.task, context.project)
    : (kind ?? "").trim();
  if (isCalendarAutomationKind(resolvedKind)) return false;
  if (scheduleMode === "calendar") return false;
  return true;
}

export function resolveEditorialPostCreatorTask(
  task: TeamTask,
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): {
  executionKind: TaskExecutionKind;
  scheduleMode: TaskScheduleMode;
  recurrenceRule: TeamTask["recurrenceRule"];
  executionPayload: TeamTask["executionPayload"];
} | null {
  if (!isEditorialPostCreatorTask(task, project)) return null;

  const recipeKw = editorialPostCreatorRecipeKeyword(project, task);
  const defaults = defaultPostCreatorExecutionPayloadForRecipe(recipeKw);

  return {
    executionKind: "post_creator",
    scheduleMode: "calendar",
    recurrenceRule: task.recurrenceRule && task.recurrenceRule !== "none" ? task.recurrenceRule : "monthly",
    executionPayload: ensurePostCreatorPayload({ ...defaults, ...task.executionPayload }),
  };
}

export function isGscReportingProject(
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): boolean {
  const recipeKw = (project?.sourceTemplateKeyword ?? "").trim();
  const projectKw = (project?.keyword ?? "").trim();
  return (
    GSC_REPORTING_RECIPE_KEYWORDS.includes(recipeKw as (typeof GSC_REPORTING_RECIPE_KEYWORDS)[number]) ||
    GSC_REPORTING_RECIPE_KEYWORDS.includes(projectKw as (typeof GSC_REPORTING_RECIPE_KEYWORDS)[number])
  );
}

export function isAdsReportingProject(
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): boolean {
  const recipeKw = (project?.sourceTemplateKeyword ?? "").trim();
  const projectKw = (project?.keyword ?? "").trim();
  return (
    ADS_REPORTING_RECIPE_KEYWORDS.includes(recipeKw as (typeof ADS_REPORTING_RECIPE_KEYWORDS)[number]) ||
    ADS_REPORTING_RECIPE_KEYWORDS.includes(projectKw as (typeof ADS_REPORTING_RECIPE_KEYWORDS)[number])
  );
}

export function isAdsReportingTask(
  task?: Pick<TeamTask, "keyword" | "executionKind"> | null,
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): boolean {
  if ((task?.executionKind ?? "").trim() === "ads_reporting") return true;
  if (isAdsReportingProject(project)) return true;
  const taskKw = (task?.keyword ?? "").trim();
  return ADS_REPORTING_TASK_KEYWORDS.includes(taskKw as (typeof ADS_REPORTING_TASK_KEYWORDS)[number]);
}

export function isGscReportingTask(
  task?: Pick<TeamTask, "keyword" | "executionKind"> | null,
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): boolean {
  if ((task?.executionKind ?? "").trim() === "gsc_reporting") return true;
  if (isGscReportingProject(project)) return true;
  const taskKw = (task?.keyword ?? "").trim();
  return GSC_REPORTING_TASK_KEYWORDS.includes(taskKw as (typeof GSC_REPORTING_TASK_KEYWORDS)[number]);
}

export function isResearchLocalDominatorProject(
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): boolean {
  const recipeKw = (project?.sourceTemplateKeyword ?? "").trim();
  const projectKw = (project?.keyword ?? "").trim();
  return (
    RESEARCH_LOCAL_DOMINATOR_RECIPE_KEYWORDS.includes(
      recipeKw as (typeof RESEARCH_LOCAL_DOMINATOR_RECIPE_KEYWORDS)[number],
    ) ||
    RESEARCH_LOCAL_DOMINATOR_RECIPE_KEYWORDS.includes(
      projectKw as (typeof RESEARCH_LOCAL_DOMINATOR_RECIPE_KEYWORDS)[number],
    )
  );
}

export function isResearchLocalDominatorTask(
  task?: Pick<TeamTask, "keyword" | "executionKind"> | null,
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): boolean {
  if ((task?.executionKind ?? "").trim() === "local_dominator_export") return true;
  if (isResearchLocalDominatorProject(project)) return true;
  const taskKw = (task?.keyword ?? "").trim();
  return RESEARCH_LOCAL_DOMINATOR_TASK_KEYWORDS.includes(
    taskKw as (typeof RESEARCH_LOCAL_DOMINATOR_TASK_KEYWORDS)[number],
  );
}

export function isResearchChatGptAuditProject(
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): boolean {
  const recipeKw = (project?.sourceTemplateKeyword ?? "").trim();
  const projectKw = (project?.keyword ?? "").trim();
  return (
    RESEARCH_CHATGPT_AUDIT_RECIPE_KEYWORDS.includes(
      recipeKw as (typeof RESEARCH_CHATGPT_AUDIT_RECIPE_KEYWORDS)[number],
    ) ||
    RESEARCH_CHATGPT_AUDIT_RECIPE_KEYWORDS.includes(
      projectKw as (typeof RESEARCH_CHATGPT_AUDIT_RECIPE_KEYWORDS)[number],
    )
  );
}

export function isResearchChatGptAuditTask(
  task?: Pick<TeamTask, "keyword" | "executionKind"> | null,
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): boolean {
  if ((task?.executionKind ?? "").trim() === "chatgpt_website_audit") return true;
  if (isResearchChatGptAuditProject(project)) return true;
  const taskKw = (task?.keyword ?? "").trim();
  return RESEARCH_CHATGPT_AUDIT_TASK_KEYWORDS.includes(
    taskKw as (typeof RESEARCH_CHATGPT_AUDIT_TASK_KEYWORDS)[number],
  );
}

export function gscReportingRecipeKeyword(
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
  task?: Pick<TeamTask, "keyword"> | null,
): (typeof GSC_REPORTING_RECIPE_KEYWORDS)[number] {
  const recipeKw = (project?.sourceTemplateKeyword ?? project?.keyword ?? "").trim();
  if (recipeKw === "gsc-monthly-yoy-report" || task?.keyword === "gsc-yoy-report") {
    return "gsc-monthly-yoy-report";
  }
  return "gsc-monthly-mom-report";
}

export function resolveGscReportingTask(
  task: TeamTask,
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): {
  executionKind: TaskExecutionKind;
  scheduleMode: TaskScheduleMode;
  recurrenceRule: TeamTask["recurrenceRule"];
  executionPayload: TeamTask["executionPayload"];
} | null {
  if (!isGscReportingTask(task, project)) return null;

  const recipeKw = gscReportingRecipeKeyword(project, task);
  const comparePreset = recipeKw === "gsc-monthly-yoy-report" ? "yoy" : "mom";

  return {
    executionKind: "gsc_reporting",
    scheduleMode: "calendar",
    recurrenceRule: task.recurrenceRule && task.recurrenceRule !== "none" ? task.recurrenceRule : "monthly",
    executionPayload: {
      comparePreset,
      saveToDisk: task.executionPayload?.saveToDisk !== false,
      ...task.executionPayload,
    },
  };
}

export function resolveResearchLocalDominatorTask(
  task: TeamTask,
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): {
  executionKind: TaskExecutionKind;
  scheduleMode: TaskScheduleMode;
  recurrenceRule: TeamTask["recurrenceRule"];
  executionPayload: TeamTask["executionPayload"];
} | null {
  if (!isResearchLocalDominatorTask(task, project)) return null;

  return {
    executionKind: "local_dominator_export",
    scheduleMode: "calendar",
    recurrenceRule: task.recurrenceRule ?? "none",
    executionPayload: {
      businessName: task.executionPayload?.businessName ?? "",
      saveLocalArchive: task.executionPayload?.saveLocalArchive ?? true,
      saveToDisk: task.executionPayload?.saveToDisk !== false,
      ...task.executionPayload,
      keyword: normalizeLocalDominatorGridKeywordStored(task.executionPayload?.keyword),
    },
  };
}

export function resolveResearchChatGptAuditTask(
  task: TeamTask,
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): {
  executionKind: TaskExecutionKind;
  scheduleMode: TaskScheduleMode;
  recurrenceRule: TeamTask["recurrenceRule"];
  executionPayload: TeamTask["executionPayload"];
} | null {
  if (!isResearchChatGptAuditTask(task, project)) return null;

  return {
    executionKind: "chatgpt_website_audit",
    scheduleMode: "calendar",
    recurrenceRule: task.recurrenceRule ?? "none",
    executionPayload: {
      saveLocalArchive: true,
      saveToDisk: task.executionPayload?.saveToDisk !== false,
      ...task.executionPayload,
    },
  };
}

export function isWorkflowRuntimeTask(
  task?: Pick<TeamTask, "keyword"> | null,
): boolean {
  return (task?.keyword ?? "").trim().startsWith("workflow_");
}

export function resolveTaskForAutomationExecute(
  task: TeamTask,
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): TeamTask {
  if (isWorkflowRuntimeTask(task)) {
    const kind =
      (task.executionKind ?? "").trim() || resolveEffectiveExecutionKind(task, project);
    return {
      ...task,
      executionKind: kind,
      scheduleMode:
        isCalendarAutomationKind(kind) || task.scheduleMode === "calendar" ? "calendar" : task.scheduleMode,
    };
  }

  const gscResolved = resolveGscReportingTask(task, project);
  if (gscResolved) {
    return { ...task, ...gscResolved };
  }
  const researchResolved = resolveResearchLocalDominatorTask(task, project);
  if (researchResolved) {
    return { ...task, ...researchResolved };
  }
  const chatgptResolved = resolveResearchChatGptAuditTask(task, project);
  if (chatgptResolved) {
    return { ...task, ...chatgptResolved };
  }
  const editorial = resolveEditorialPostCreatorTask(task, project);
  if (editorial) {
    return { ...task, ...editorial };
  }
  const kind = resolveEffectiveExecutionKind(task, project);
  return {
    ...task,
    executionKind: kind,
    scheduleMode:
      isCalendarAutomationKind(kind) || task.scheduleMode === "calendar" ? "calendar" : task.scheduleMode,
  };
}

export function automationExecuteUsesTriggerRun(
  task: TeamTask,
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null,
): boolean {
  const resolved = resolveTaskForAutomationExecute(task, project);
  return automationUsesTriggerUi(resolved.executionKind, resolved.scheduleMode, {
    task: resolved,
    project,
  });
}

export function taskSupportsManualAutomationExecute(
  task: Pick<TeamTask, "executionKind" | "keyword" | "projectId">,
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword" | "isAutomation"> | null,
  projectTasks?: TeamTask[],
  members?: TeamMember[],
): boolean {
  if ((task.executionKind ?? "").trim()) return true;
  if (isEditorialPostCreatorTask(task, project)) return true;
  if (isGscReportingTask(task, project)) return true;
  if (isResearchLocalDominatorTask(task, project)) return true;
  if (isResearchChatGptAuditTask(task, project)) return true;
  if (project && isAutomationProject(project, projectTasks, members)) return true;
  return false;
}

export function prepareTaskForAutomationExecute(
  task: TeamTask,
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword" | "wordpressSiteId"> | null,
  activeWordPressSiteId?: string | null,
): TeamTask {
  const resolved = resolveTaskForAutomationExecute(task, project);
  const siteId =
    resolveTaskExecuteSiteId(resolved, activeWordPressSiteId) || project?.wordpressSiteId?.trim() || "";
  return siteId ? { ...resolved, wordpressSiteId: siteId } : resolved;
}
