import { useCallback, type Dispatch, type SetStateAction } from "react";
import { ensurePostCreatorPayload } from "@/lib/post-creator/post-creator-defaults";
import type { TaskFormPayload } from "@/components/manager/tasks/NewTaskDialog";
import {
  createProjectTask,
  createTaskProject,
  deleteTaskProject,
  fetchProjectSections,
  updateTask,
  updateTaskProject,
} from "@/lib/tasks-api";
import { automationUsesTriggerUi } from "@/lib/task-automation-ui";
import { isAutomationProject } from "@/lib/task-automation-templates";
import { isNeoPulseBotMember } from "@/lib/chat-neo-pulse";
import { defaultTaskTriggerConfig } from "@/lib/task-trigger-types";
import type {
  TaskProject,
  TaskSection,
  TeamTask,
  TasksNavMode,
} from "@/lib/tasks-types";
import type { TeamMember } from "@/lib/teams-types";
import type { TaskProjectBundle } from "@/contexts/TeamContext";

type UseTasksShellProjectHandlersParams = {
  teamId: number | null;
  userId: number;
  navMode: TasksNavMode;
  activeProjectId: number | null;
  selectedTaskId: number | null;
  tasks: TeamTask[];
  sections: TaskSection[];
  taskProjects: TaskProject[];
  projectBundles: Record<number, TaskProjectBundle>;
  members: TeamMember[];
  activeBundleIsAutomation: boolean;
  setTaskProjects: Dispatch<SetStateAction<TaskProject[]>>;
  setNavMode: Dispatch<SetStateAction<TasksNavMode>>;
  setActiveProjectId: Dispatch<SetStateAction<number | null>>;
  setSelectedTaskId: Dispatch<SetStateAction<number | null>>;
  refreshTasksWorkspace: () => Promise<void>;
  refreshProjectBundle: (projectId: number) => Promise<void>;
  purgeProjectBundle: (projectId: number) => void;
  addTaskInView: (task: TeamTask) => void;
  patchTaskInView: (task: TeamTask) => void;
};

export function useTasksShellProjectHandlers({
  teamId,
  userId,
  navMode,
  activeProjectId,
  selectedTaskId,
  tasks,
  sections,
  taskProjects,
  projectBundles,
  members,
  activeBundleIsAutomation,
  setTaskProjects,
  setNavMode,
  setActiveProjectId,
  setSelectedTaskId,
  refreshTasksWorkspace,
  refreshProjectBundle,
  purgeProjectBundle,
  addTaskInView,
  patchTaskInView,
}: UseTasksShellProjectHandlersParams) {
  const handleCreateProject = useCallback(
    async (payload: Parameters<typeof createTaskProject>[1]) => {
      if (!teamId) return false;
      const result = await createTaskProject(teamId, payload);
      if (result.ok && result.project) {
        setTaskProjects((prev) => [...prev, result.project!]);
        setNavMode("project");
        setActiveProjectId(result.project.id);
        return true;
      }
      return false;
    },
    [setActiveProjectId, setNavMode, setTaskProjects, teamId],
  );

  const handleUpdateProject = useCallback(
    async (
      projectId: number,
      payload: { keyword: string; title: string; description?: string; wordpressSiteId?: string | null },
    ) => {
      if (!teamId) return false;
      const result = await updateTaskProject(teamId, projectId, payload);
      if (result.ok && result.project) {
        setTaskProjects((prev) => prev.map((p) => (p.id === projectId ? result.project! : p)));
        void refreshTasksWorkspace();
        if (activeProjectId === projectId) {
          void refreshProjectBundle(projectId);
        }
        return true;
      }
      return false;
    },
    [activeProjectId, refreshProjectBundle, refreshTasksWorkspace, setTaskProjects, teamId],
  );

  const handleDeleteProject = useCallback(
    async (projectId: number) => {
      if (!teamId) return;
      const result = await deleteTaskProject(teamId, projectId);
      if (result.ok) {
        setTaskProjects((prev) => prev.filter((p) => p.id !== projectId));
        purgeProjectBundle(projectId);
        if (activeProjectId === projectId) {
          setNavMode("my");
          setActiveProjectId(null);
          setSelectedTaskId(null);
        } else if (selectedTaskId != null) {
          const selected =
            tasks.find((t) => t.id === selectedTaskId) ??
            Object.values(projectBundles).flatMap((bundle) => bundle.tasks).find((t) => t.id === selectedTaskId);
          if (selected?.projectId === projectId) {
            setSelectedTaskId(null);
          }
        }
        void refreshTasksWorkspace();
      }
    },
    [activeProjectId, projectBundles, purgeProjectBundle, refreshTasksWorkspace, selectedTaskId, setActiveProjectId, setNavMode, setSelectedTaskId, setTaskProjects, tasks, teamId],
  );

  const handleCreateTask = useCallback(
    async (payload: TaskFormPayload & { projectId: number }) => {
      if (!teamId || payload.projectId <= 0) return false;

      let sectionId = 0;
      if (activeProjectId === payload.projectId && sections.length > 0) {
        sectionId = sections[0]!.id;
      } else {
        const sectionList = await fetchProjectSections(teamId, payload.projectId);
        sectionId = sectionList[0]?.id ?? 0;
      }

      const targetProject = taskProjects.find((p) => p.id === payload.projectId);
      const targetIsAutomation =
        targetProject != null
          ? isAutomationProject(targetProject, projectBundles[payload.projectId]?.tasks, members)
          : false;
      const pulseId = members.find((m) => isNeoPulseBotMember(m))?.userId ?? null;

      const assigneeIds = targetIsAutomation
        ? pulseId != null
          ? [pulseId]
          : []
        : payload.assigneeIds && payload.assigneeIds.length > 0
          ? payload.assigneeIds
          : userId > 0
            ? [userId]
            : [];

      const automationUsesCalendar =
        targetIsAutomation &&
        !automationUsesTriggerUi(payload.executionKind, payload.scheduleMode ?? "calendar");

      const result = await createProjectTask(teamId, payload.projectId, {
        keyword: payload.keyword,
        title: payload.title,
        description: payload.description,
        status: payload.status,
        dueDate: targetIsAutomation && !automationUsesCalendar ? undefined : payload.dueDate,
        dueTime: targetIsAutomation && !automationUsesCalendar ? undefined : payload.dueTime,
        recurrenceRule: targetIsAutomation && !automationUsesCalendar ? "none" : payload.recurrenceRule,
        scheduleMode: targetIsAutomation
          ? automationUsesCalendar
            ? "calendar"
            : "trigger"
          : payload.scheduleMode ?? "calendar",
        triggerConfig: targetIsAutomation && !automationUsesCalendar ? payload.triggerConfig : undefined,
        assigneeIds,
        tagIds: targetIsAutomation ? undefined : payload.tagIds,
        executionKind: targetIsAutomation ? payload.executionKind : undefined,
        executionPayload:
          targetIsAutomation && payload.executionKind === "post_creator"
            ? ensurePostCreatorPayload(payload.executionPayload)
            : targetIsAutomation
              ? payload.executionPayload
              : undefined,
        sectionId,
      });
      if (result.ok && result.task) {
        if (navMode === "my") {
          addTaskInView(result.task);
          void refreshTasksWorkspace();
        } else if (activeProjectId === payload.projectId) {
          addTaskInView(result.task);
        } else {
          void refreshProjectBundle(payload.projectId);
        }
        setSelectedTaskId(result.task.id);
        return true;
      }
      return false;
    },
    [
      activeProjectId,
      addTaskInView,
      members,
      navMode,
      projectBundles,
      refreshProjectBundle,
      refreshTasksWorkspace,
      sections,
      setSelectedTaskId,
      taskProjects,
      teamId,
      userId,
    ],
  );

  const handleInlineAddTask = useCallback(
    async (sectionId: number, title: string) => {
      if (!teamId || activeProjectId == null) return;
      const keyword = title.toLowerCase().replace(/\s+/g, "-");
      const pulseId = members.find((m) => isNeoPulseBotMember(m))?.userId ?? null;
      const result = await createProjectTask(
        teamId,
        activeProjectId,
        activeBundleIsAutomation
          ? {
              keyword,
              title,
              sectionId,
              scheduleMode: "trigger",
              recurrenceRule: "none",
              assigneeIds: pulseId != null ? [pulseId] : [],
              executionKind: "content_optimizer",
              executionPayload: { updateMode: "update" },
              triggerConfig: defaultTaskTriggerConfig(),
            }
          : {
              keyword,
              title,
              sectionId,
              assigneeIds: userId > 0 ? [userId] : [],
            },
      );
      if (result.ok && result.task) {
        addTaskInView(result.task);
      }
    },
    [activeBundleIsAutomation, activeProjectId, addTaskInView, members, teamId, userId],
  );

  const handleMoveTask = useCallback(
    async (taskId: number, sectionId: number) => {
      if (!teamId) return;
      const result = await updateTask(teamId, taskId, { sectionId });
      if (result.ok && result.task) {
        patchTaskInView(result.task);
      }
    },
    [patchTaskInView, teamId],
  );

  return {
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    handleCreateTask,
    handleInlineAddTask,
    handleMoveTask,
  };
}
