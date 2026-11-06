import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { TaskFormPayload } from "@/components/manager/tasks/NewTaskDialog";
import {
  addTaskNote,
  createProjectSection,
  createSubtask,
  deleteProjectSection,
  deleteTask,
  updateProjectSection,
  updateTask,
  uploadTaskFile,
} from "@/lib/tasks-api";
import { isAutomationProject } from "@/lib/task-automation-templates";
import type {
  TaskFile,
  TaskNote,
  TaskProject,
  TaskSection,
  TeamTask,
} from "@/lib/tasks-types";
import type { TeamMember } from "@/lib/teams-types";
import type { TaskProjectBundle } from "@/contexts/TeamContext";

type UseTasksShellDetailHandlersParams = {
  teamId: number | null;
  activeProjectId: number | null;
  selectedTaskId: number | null;
  selectedTask: TeamTask | null;
  selectedTaskAutomationContext: boolean;
  tasks: TeamTask[];
  sections: TaskSection[];
  taskProjects: TaskProject[];
  projectBundles: Record<number, TaskProjectBundle>;
  members: TeamMember[];
  inProjectBundle: boolean;
  setCreatingSection: Dispatch<SetStateAction<boolean>>;
  setSelectedNotes: Dispatch<SetStateAction<TaskNote[]>>;
  setSelectedFiles: Dispatch<SetStateAction<TaskFile[]>>;
  setSelectedSubtasks: Dispatch<SetStateAction<TeamTask[]>>;
  setSelectedTaskId: Dispatch<SetStateAction<number | null>>;
  setUploading: Dispatch<SetStateAction<boolean>>;
  updateProjectBundle: (projectId: number, patch: Partial<TaskProjectBundle>) => void;
  refreshProjectBundle: (projectId: number) => Promise<void>;
  setSectionsInView: (
    next: TaskSection[] | ((prev: TaskSection[]) => TaskSection[]),
  ) => void;
  patchTaskInView: (task: TeamTask) => void;
  removeTaskFromView: (taskId: number) => void;
  handleDeleteProject: (projectId: number) => Promise<void>;
};

export function useTasksShellDetailHandlers({
  teamId,
  activeProjectId,
  selectedTaskId,
  selectedTask,
  selectedTaskAutomationContext,
  tasks,
  sections,
  taskProjects,
  projectBundles,
  members,
  inProjectBundle,
  setCreatingSection,
  setSelectedNotes,
  setSelectedFiles,
  setSelectedSubtasks,
  setSelectedTaskId,
  setUploading,
  updateProjectBundle,
  refreshProjectBundle,
  setSectionsInView,
  patchTaskInView,
  removeTaskFromView,
  handleDeleteProject,
}: UseTasksShellDetailHandlersParams) {
  const handleCreateSection = useCallback(
    async (payload: { keyword: string; title: string }) => {
      if (!teamId || activeProjectId == null) return false;
      setCreatingSection(true);
      try {
        const result = await createProjectSection(teamId, activeProjectId, {
          keyword: payload.keyword,
          title: payload.title,
          sortOrder: sections.length,
        });
        if (result.ok && result.section) {
          setSectionsInView((prev) => [...prev, result.section!]);
          return true;
        }
        return false;
      } finally {
        setCreatingSection(false);
      }
    },
    [activeProjectId, sections.length, setCreatingSection, setSectionsInView, teamId],
  );

  const handleUpdateSection = useCallback(
    async (sectionId: number, payload: { keyword: string; title: string }) => {
      if (!teamId || activeProjectId == null) return false;
      const result = await updateProjectSection(teamId, activeProjectId, sectionId, payload);
      if (result.ok && result.section) {
        setSectionsInView((prev) => prev.map((s) => (s.id === sectionId ? result.section! : s)));
        return true;
      }
      return false;
    },
    [activeProjectId, setSectionsInView, teamId],
  );

  const handleDeleteSection = useCallback(
    async (sectionId: number) => {
      if (!teamId || activeProjectId == null) return;
      const deletedTaskIds = new Set(
        tasks.filter((t) => t.sectionId === sectionId).map((t) => t.id),
      );
      const result = await deleteProjectSection(teamId, activeProjectId, sectionId);
      if (result.ok) {
        setSectionsInView((prev) => prev.filter((s) => s.id !== sectionId));
        if (activeProjectId != null) {
          const currentTasks = projectBundles[activeProjectId]?.tasks ?? [];
          updateProjectBundle(activeProjectId, {
            tasks: currentTasks.filter((t) => t.sectionId !== sectionId),
          });
        }
        if (selectedTaskId != null && deletedTaskIds.has(selectedTaskId)) {
          setSelectedTaskId(null);
        }
      }
    },
    [activeProjectId, projectBundles, selectedTaskId, setSelectedTaskId, setSectionsInView, tasks, teamId, updateProjectBundle],
  );

  const handleAddNote = useCallback(
    async (body: string, mentionUserIds: number[]) => {
      if (!teamId || selectedTaskId == null) return;
      const result = await addTaskNote(teamId, selectedTaskId, body, mentionUserIds);
      if (result.ok && result.note) {
        setSelectedNotes((prev) => [...prev, result.note!]);
      }
    },
    [selectedTaskId, setSelectedNotes, teamId],
  );

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!teamId || selectedTaskId == null) return;
      setUploading(true);
      try {
        const result = await uploadTaskFile(teamId, selectedTaskId, file);
        if (result.ok && result.file) {
          setSelectedFiles((prev) => [...prev, result.file!]);
          if (inProjectBundle && activeProjectId != null) {
            void refreshProjectBundle(activeProjectId);
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [activeProjectId, inProjectBundle, refreshProjectBundle, selectedTaskId, setSelectedFiles, setUploading, teamId],
  );

  const handleAddSubtask = useCallback(
    async (title: string) => {
      if (!teamId || selectedTaskId == null) return;
      const result = await createSubtask(teamId, selectedTaskId, {
        title,
        keyword: title.toLowerCase().replace(/\s+/g, "-"),
      });
      if (result.ok && result.task) {
        setSelectedSubtasks((prev) => [...prev, result.task!]);
      }
    },
    [selectedTaskId, setSelectedSubtasks, teamId],
  );

  const handleUpdateTask = useCallback(
    async (taskId: number, payload: TaskFormPayload) => {
      if (!teamId) return false;
      const result = await updateTask(teamId, taskId, payload);
      if (result.ok && result.task) {
        patchTaskInView(result.task);
        return true;
      }
      return false;
    },
    [patchTaskInView, teamId],
  );

  const handleDeleteTaskById = useCallback(
    async (taskId: number) => {
      if (!teamId) return;
      const result = await deleteTask(teamId, taskId);
      if (result.ok) {
        removeTaskFromView(taskId);
        if (selectedTaskId === taskId) {
          setSelectedTaskId(null);
        }
      }
    },
    [removeTaskFromView, selectedTaskId, setSelectedTaskId, teamId],
  );

  const handleDeleteAutomationOrTask = useCallback(
    async (taskId: number) => {
      if (!teamId) return;
      const task =
        tasks.find((t) => t.id === taskId) ??
        (activeProjectId != null
          ? projectBundles[activeProjectId]?.tasks.find((t) => t.id === taskId)
          : undefined);
      if (task) {
        const project = taskProjects.find((p) => p.id === task.projectId);
        if (project && isAutomationProject(project, projectBundles[project.id]?.tasks, members)) {
          await handleDeleteProject(task.projectId);
          return;
        }
      }
      await handleDeleteTaskById(taskId);
    },
    [
      activeProjectId,
      handleDeleteProject,
      handleDeleteTaskById,
      members,
      projectBundles,
      taskProjects,
      tasks,
      teamId,
    ],
  );

  const handleDeleteTask = useCallback(async () => {
    if (selectedTaskId == null) return;
    if (selectedTaskAutomationContext && selectedTask) {
      await handleDeleteProject(selectedTask.projectId);
      return;
    }
    await handleDeleteTaskById(selectedTaskId);
  }, [
    handleDeleteProject,
    handleDeleteTaskById,
    selectedTask,
    selectedTaskAutomationContext,
    selectedTaskId,
  ]);

  return {
    handleCreateSection,
    handleUpdateSection,
    handleDeleteSection,
    handleAddNote,
    handleUploadFile,
    handleAddSubtask,
    handleUpdateTask,
    handleDeleteAutomationOrTask,
    handleDeleteTask,
  };
}
