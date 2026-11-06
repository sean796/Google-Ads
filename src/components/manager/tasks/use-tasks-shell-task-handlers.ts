import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  fetchTaskDetail,
  updateTask,
} from "@/lib/tasks-api";
import type {
  TaskFile,
  TaskNote,
  TaskSection,
  TeamTask,
  TaskStatus,
  TasksNavMode,
} from "@/lib/tasks-types";
import type { TaskProjectBundle } from "@/contexts/TeamContext";

type UseTasksShellTaskHandlersParams = {
  teamId: number | null;
  navMode: TasksNavMode;
  activeProjectId: number | null;
  selectedTaskId: number | null;
  tasks: TeamTask[];
  projectBundles: Record<number, TaskProjectBundle>;
  inProjectBundle: boolean;
  updateTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  pendingPatchRef: MutableRefObject<Record<string, unknown>>;
  setMyTasks: Dispatch<SetStateAction<TeamTask[]>>;
  updateProjectBundle: (projectId: number, patch: Partial<TaskProjectBundle>) => void;
  refreshProjectBundle: (projectId: number) => Promise<void>;
  refreshTasksWorkspace: () => Promise<void>;
  setSelectedNotes: Dispatch<SetStateAction<TaskNote[]>>;
  setSelectedFiles: Dispatch<SetStateAction<TaskFile[]>>;
  setSelectedSubtasks: Dispatch<SetStateAction<TeamTask[]>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
};

export function useTasksShellTaskHandlers({
  teamId,
  navMode,
  activeProjectId,
  selectedTaskId,
  tasks,
  projectBundles,
  inProjectBundle,
  updateTimerRef,
  pendingPatchRef,
  setMyTasks,
  updateProjectBundle,
  refreshProjectBundle,
  refreshTasksWorkspace,
  setSelectedNotes,
  setSelectedFiles,
  setSelectedSubtasks,
  setSaving,
}: UseTasksShellTaskHandlersParams) {
  const patchTaskInView = useCallback(
    (task: TeamTask) => {
      if (navMode === "my") {
        setMyTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
        return;
      }
      if (activeProjectId == null) return;
      const currentTasks = projectBundles[activeProjectId]?.tasks ?? [];
      updateProjectBundle(activeProjectId, {
        tasks: currentTasks.map((t) => (t.id === task.id ? task : t)),
      });
    },
    [activeProjectId, navMode, projectBundles, setMyTasks, updateProjectBundle],
  );

  const addTaskInView = useCallback(
    (task: TeamTask) => {
      if (navMode === "my") {
        setMyTasks((prev) => [...prev, task]);
        return;
      }
      if (activeProjectId == null) return;
      const currentTasks = projectBundles[activeProjectId]?.tasks ?? [];
      updateProjectBundle(activeProjectId, { tasks: [...currentTasks, task] });
    },
    [activeProjectId, navMode, projectBundles, setMyTasks, updateProjectBundle],
  );

  const removeTaskFromView = useCallback(
    (taskId: number) => {
      if (navMode === "my") {
        setMyTasks((prev) => prev.filter((t) => t.id !== taskId));
        return;
      }
      if (activeProjectId == null) return;
      const currentTasks = projectBundles[activeProjectId]?.tasks ?? [];
      updateProjectBundle(activeProjectId, {
        tasks: currentTasks.filter((t) => t.id !== taskId),
      });
    },
    [activeProjectId, navMode, projectBundles, setMyTasks, updateProjectBundle],
  );

  const setSectionsInView = useCallback(
    (next: TaskSection[] | ((prev: TaskSection[]) => TaskSection[])) => {
      if (activeProjectId == null) return;
      const current = projectBundles[activeProjectId]?.sections ?? [];
      const resolved = typeof next === "function" ? next(current) : next;
      updateProjectBundle(activeProjectId, { sections: resolved });
    },
    [activeProjectId, projectBundles, updateProjectBundle],
  );

  useEffect(() => {
    if (!teamId || !inProjectBundle || activeProjectId == null) return;
    if (projectBundles[activeProjectId]) return;
    void refreshProjectBundle(activeProjectId);
  }, [activeProjectId, inProjectBundle, projectBundles, refreshProjectBundle, teamId]);

  const refreshTaskDetail = useCallback(async () => {
    if (!teamId || selectedTaskId == null) {
      setSelectedNotes([]);
      setSelectedFiles([]);
      setSelectedSubtasks([]);
      return;
    }
    const detail = await fetchTaskDetail(teamId, selectedTaskId);
    if (detail.task) {
      patchTaskInView(detail.task);
      setSelectedNotes(detail.notes);
      setSelectedFiles(detail.files);
      setSelectedSubtasks(detail.subtasks);
    }
  }, [patchTaskInView, selectedTaskId, setSelectedFiles, setSelectedNotes, setSelectedSubtasks, teamId]);

  useEffect(() => {
    void refreshTaskDetail();
  }, [refreshTaskDetail]);

  const handleAfterAutomationExecute = useCallback(() => {
    void refreshTasksWorkspace();
    if (activeProjectId != null) void refreshProjectBundle(activeProjectId);
    void refreshTaskDetail();
  }, [activeProjectId, refreshProjectBundle, refreshTaskDetail, refreshTasksWorkspace]);

  const flushTaskPatch = useCallback(async () => {
    if (!teamId || selectedTaskId == null) return;
    const patch = pendingPatchRef.current;
    if (Object.keys(patch).length === 0) return;
    pendingPatchRef.current = {};
    setSaving(true);
    try {
      const result = await updateTask(teamId, selectedTaskId, patch as Parameters<typeof updateTask>[2]);
      if (result.ok && result.task) {
        patchTaskInView(result.task);
      }
    } finally {
      setSaving(false);
    }
  }, [patchTaskInView, pendingPatchRef, selectedTaskId, setSaving, teamId]);

  const queueTaskPatch = useCallback(
    (patch: Parameters<typeof updateTask>[2]) => {
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
      if (selectedTaskId != null) {
        const current = tasks.find((t) => t.id === selectedTaskId);
        if (current) {
          const next: TeamTask = { ...current, ...patch };
          if (patch.executionPayload) {
            next.executionPayload = { ...current.executionPayload, ...patch.executionPayload };
          }
          if (patch.triggerConfig) {
            next.triggerConfig = { ...current.triggerConfig, ...patch.triggerConfig };
          }
          patchTaskInView(next);
        }
      }
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      updateTimerRef.current = setTimeout(() => void flushTaskPatch(), 400);
    },
    [flushTaskPatch, patchTaskInView, pendingPatchRef, selectedTaskId, tasks, updateTimerRef],
  );

  const handleStatusChange = useCallback(
    async (taskId: number, status: TaskStatus) => {
      if (!teamId) return;
      const result = await updateTask(teamId, taskId, { status });
      if (result.ok && result.task) {
        patchTaskInView(result.task);
        if (navMode === "my") void refreshTasksWorkspace();
      }
    },
    [navMode, patchTaskInView, refreshTasksWorkspace, teamId],
  );

  return {
    patchTaskInView,
    addTaskInView,
    removeTaskFromView,
    setSectionsInView,
    refreshTaskDetail,
    handleAfterAutomationExecute,
    queueTaskPatch,
    handleStatusChange,
  };
}
