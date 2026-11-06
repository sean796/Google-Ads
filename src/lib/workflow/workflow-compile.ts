import { pulseAssigneeIds } from "@/lib/chat-neo-pulse";
import {
  createProjectTask,
  createTaskProject,
  updateTask,
} from "@/lib/tasks-api";
import { fetchTeamMembers } from "@/lib/teams-api";
import { auditPlatformsForSave } from "@/lib/dfs-article-audit/dfs-article-audit-types";
import { findClientNode } from "@/lib/workflow/workflow-graph-utils";
import { linearOrderedNodes } from "@/lib/workflow/workflow-graph-mutations";
import { hasWorkflowPublishSchedule } from "@/lib/workflow/workflow-schedule-upstream";
import type { TaskExecutionPayload, TaskRecurrenceRule } from "@/lib/tasks-types";
import type {
  WorkflowActionConfig,
  WorkflowClientConfig,
  WorkflowDefinition,
  WorkflowNode,
} from "@/lib/workflow/workflow-types";

function actionNodes(workflow: WorkflowDefinition): WorkflowNode[] {
  return workflow.nodes.filter((node) => node.kind === "action_agent");
}

/** Only the first workflow action step may run on the client publish calendar; downstream steps chain in-run. */
export function workflowCalendarEntryActionNodeIds(workflow: WorkflowDefinition): Set<string> {
  const ids = new Set<string>();
  for (const node of linearOrderedNodes(workflow)) {
    if (node.kind !== "action_agent") continue;
    ids.add(node.id);
    break;
  }
  return ids;
}

export async function compileWorkflowTasks(
  teamId: number,
  workflow: WorkflowDefinition,
): Promise<WorkflowDefinition> {
  const members = await fetchTeamMembers(teamId);
  const assigneeIds = pulseAssigneeIds(members);
  const client = findClientNode(workflow);
  const clientConfig = (client?.config ?? {}) as WorkflowClientConfig;
  const clientUsesCalendar = hasWorkflowPublishSchedule(clientConfig);
  const calendarEntryIds = clientUsesCalendar
    ? workflowCalendarEntryActionNodeIds(workflow)
    : new Set<string>();
  let projectId = (workflow as WorkflowDefinition & { projectId?: number }).projectId;

  if (!projectId) {
    const created = await createTaskProject(teamId, {
      title: `${workflow.name} (workflow runtime)`,
      isAutomation: true,
      automationVisibility: "private",
      wordpressSiteId: workflow.wordpressSiteId ?? null,
    });
    if (!created.project) return workflow;
    projectId = created.project.id;
  }

  const nextNodes = [...workflow.nodes];
  for (const node of actionNodes(workflow)) {
    const config = node.config as WorkflowActionConfig & { compiledTaskId?: number };
    const isCalendarEntry = clientUsesCalendar && calendarEntryIds.has(node.id);
    const recurrenceRule: TaskRecurrenceRule =
      clientConfig.frequency === "once"
        ? "none"
        : clientConfig.frequency === "daily" ||
            clientConfig.frequency === "weekly" ||
            clientConfig.frequency === "yearly"
          ? clientConfig.frequency
          : "monthly";
    const executionPayload: TaskExecutionPayload =
      config.executionKind === "dfs_llm_article_audit"
        ? {
            targetBucket: "posts",
            ...config.executionPayload,
            auditPlatforms: auditPlatformsForSave(config.executionPayload?.auditPlatforms),
          }
        : config.executionKind === "chatgpt_website_audit"
          ? {
              targetBucket: "pages",
              ...config.executionPayload,
            }
          : config.executionPayload;
    const payload = {
      keyword: `workflow_${workflow.id}_${node.id}`,
      title: config.title ?? node.label,
      scheduleMode: (isCalendarEntry ? "calendar" : "trigger") as "calendar" | "trigger",
      ...(isCalendarEntry
        ? {
            dueDate: String(clientConfig.startDate ?? "").slice(0, 10),
            dueTime: String(clientConfig.time ?? "09:00").slice(0, 5),
            recurrenceRule,
          }
        : {}),
      executionKind: config.executionKind,
      executionPayload,
      wordpressSiteId: workflow.wordpressSiteId ?? undefined,
      assigneeIds,
    };
    if (config.compiledTaskId) {
      await updateTask(teamId, config.compiledTaskId, payload);
      continue;
    }
    const created = await createProjectTask(teamId, projectId, payload);
    if (created.task) {
      const idx = nextNodes.findIndex((item) => item.id === node.id);
      if (idx >= 0) {
        nextNodes[idx] = {
          ...nextNodes[idx],
          config: { ...config, compiledTaskId: created.task.id },
        };
      }
    }
  }

  return { ...workflow, nodes: nextNodes, ...(projectId ? { projectId } : {}) };
}
