import type { AgentRun } from "@/lib/agent-runs-types";
import { isAgentRunTerminal } from "@/lib/agent-runs-types";
import type { TaskProject, TeamTask } from "@/lib/tasks-types";
import type { TaskProjectBundle } from "@/contexts/TeamContext";

function automationProjectIds(projects: TaskProject[]): Set<number> {
  return new Set(projects.map((project) => project.id));
}

function automationTaskIds(
  projects: TaskProject[],
  projectBundles: Record<number, TaskProjectBundle>,
): Set<number> {
  const ids = new Set<number>();
  for (const project of projects) {
    for (const task of projectBundles[project.id]?.tasks ?? []) {
      ids.add(task.id);
    }
  }
  return ids;
}

export function primaryAutomationTask(
  projectId: number,
  projectBundles: Record<number, TaskProjectBundle>,
): TeamTask | null {
  const tasks = projectBundles[projectId]?.tasks ?? [];
  return tasks[0] ?? null;
}

export function runBelongsToForgeAutomation(
  run: AgentRun,
  projectIds: Set<number>,
  taskIds: Set<number>,
): boolean {
  if (run.source === "workflow") return true;
  if (Number(run.context?.workflowId ?? run.plan?.workflowId ?? 0) > 0) return true;
  const projectId = run.context?.projectId;
  if (projectId != null && projectIds.has(projectId)) return true;
  if (run.taskId > 0 && taskIds.has(run.taskId)) return true;
  return false;
}

export function filterForgeAgentRuns(
  runs: AgentRun[],
  automationProjects: TaskProject[],
  projectBundles: Record<number, TaskProjectBundle>,
): AgentRun[] {
  const projectIds = automationProjectIds(automationProjects);
  const taskIds = automationTaskIds(automationProjects, projectBundles);
  return runs.filter((run) => runBelongsToForgeAutomation(run, projectIds, taskIds));
}

export function activeForgeAgentRuns(
  runs: AgentRun[],
  automationProjects: TaskProject[],
  projectBundles: Record<number, TaskProjectBundle>,
): AgentRun[] {
  return filterForgeAgentRuns(runs, automationProjects, projectBundles).filter(
    (run) => !isAgentRunTerminal(run.status),
  );
}

export function activeRunForProject(
  runs: AgentRun[],
  projectId: number,
  projectBundles: Record<number, TaskProjectBundle>,
): AgentRun | null {
  const task = primaryAutomationTask(projectId, projectBundles);
  const active = runs.filter((run) => !isAgentRunTerminal(run.status));
  return (
    active.find((run) => run.context?.projectId === projectId) ??
    (task ? active.find((run) => run.taskId === task.id) ?? null : null)
  );
}
