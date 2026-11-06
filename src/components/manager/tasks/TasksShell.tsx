import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { usePulseAssistContext } from "@/contexts/pulse-assist-context";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { taskCanExecuteWithAgent, resolveTaskExecuteSiteId, isClientAgnosticExecutionKind } from "@/lib/agent-runs-types";
import { automationUsesTriggerUi, resolveEffectiveExecutionKind, taskSupportsManualAutomationExecute } from "@/lib/task-automation-ui";
import { ensurePostCreatorPayload } from "@/lib/post-creator/post-creator-defaults";
import { TasksNavSidebar } from "@/components/manager/tasks/TasksNavSidebar";
import { TasksContextHeader } from "@/components/manager/tasks/TasksContextHeader";
import { TasksListView } from "@/components/manager/tasks/TasksListView";
import { TasksBoardView } from "@/components/manager/tasks/TasksBoardView";
import { TasksCalendarView } from "@/components/manager/tasks/TasksCalendarView";
import { TasksFilesView } from "@/components/manager/tasks/TasksFilesView";
import { TaskDetailPane } from "@/components/manager/tasks/TaskDetailPane";
import { NewProjectDialog } from "@/components/manager/tasks/NewProjectDialog";
import { NewTaskDialog, type TaskFormPayload } from "@/components/manager/tasks/NewTaskDialog";
import { AddSectionDialog } from "@/components/manager/tasks/AddSectionDialog";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import {
  addTaskNote,
  createProjectSection,
  createProjectTask,
  createSubtask,
  createTaskProject,
  deleteProjectSection,
  deleteTask,
  deleteTaskProject,
  fetchProjectSections,
  fetchTaskDetail,
  updateProjectSection,
  updateTask,
  updateTaskProject,
  uploadTaskFile,
} from "@/lib/tasks-api";
import { filterTasks, filterTasksByQuery, sortTasks, taskHasPulseAssignee } from "@/lib/tasks-filter";
import { isAutomationProject, isProjectBundleNavMode } from "@/lib/task-automation-templates";
import { isNeoPulseBotMember } from "@/lib/chat-neo-pulse";
import { defaultTaskTriggerConfig } from "@/lib/task-trigger-types";
import type {
  TaskFile,
  TaskNote,
  TaskProject,
  TaskSection,
  TeamTask,
  TaskStatus,
  TasksFilterMode,
  TasksNavMode,
  TasksSortMode,
  TasksViewMode,
} from "@/lib/tasks-types";

export type TasksShellProps = {
  onOpenPulseForge?: () => void;
};

export function TasksShell({ onOpenPulseForge }: TasksShellProps = {}): React.ReactElement {
  const { user } = useAuth();
  const {
    activeTeam,
    members,
    taskProjects,
    taskTags,
    taskTemplates,
    myTasks,
    completedToday,
    projectBundles,
    refreshTasksWorkspace,
    refreshProjectBundle,
    setMyTasks,
    setTaskProjects,
    setTaskTemplates,
    updateProjectBundle,
    purgeProjectBundle,
  } = useTeam();
  const { setTasksBridge } = usePulseAssistContext();
  const { startRunFromTask } = useAgentRunsContext();
  const { sites: wpSites } = useWordPressSites();
  const { activeWordPressSiteId } = useActiveWordPressSite();
  const teamId = activeTeam?.id ?? null;
  const userId = user?.id ?? 0;

  const [navMode, setNavMode] = useState<TasksNavMode>("my");
  const [viewMode, setViewMode] = useState<TasksViewMode>("list");
  const [filterMode, setFilterMode] = useState<TasksFilterMode>("incomplete");
  const [sortMode, setSortMode] = useState<TasksSortMode>("dueDate");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<TaskNote[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<TaskFile[]>([]);
  const [selectedSubtasks, setSelectedSubtasks] = useState<TeamTask[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [creatingSection, setCreatingSection] = useState(false);
  const [editingProject, setEditingProject] = useState<TaskProject | null>(null);
  const [editingSection, setEditingSection] = useState<TaskSection | null>(null);
  const [editingTask, setEditingTask] = useState<TeamTask | null>(null);

  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<Record<string, unknown>>({});

  const activeBundle = activeProjectId != null ? projectBundles[activeProjectId] : null;
  const inProjectBundle = isProjectBundleNavMode(navMode);
  const activeBundleTasks = activeBundle?.tasks;
  const activeBundleSections = activeBundle?.sections;
  const tasks = useMemo(
    () => (navMode === "my" ? myTasks : (activeBundleTasks ?? [])),
    [activeBundleTasks, myTasks, navMode],
  );
  const sections = useMemo(
    () => (navMode === "my" ? [] : (activeBundleSections ?? [])),
    [activeBundleSections, navMode],
  );
  const projectFiles = navMode === "my" ? [] : (activeBundle?.files ?? []);

  const regularProjects = useMemo(() => {
    const regular: TaskProject[] = [];
    for (const project of taskProjects) {
      const bundleTasks = projectBundles[project.id]?.tasks;
      if (isAutomationProject(project, bundleTasks, members)) continue;
      regular.push(project);
    }
    return regular;
  }, [members, projectBundles, taskProjects]);

  const humanMembers = useMemo(() => members.filter((m) => !m.isBot), [members]);

  const siteOptions = useMemo(
    () =>
      wpSites
        .filter((s) => s.enabled !== false)
        .map((s) => ({ id: s.id, name: s.name.trim() || s.siteUrl })),
    [wpSites],
  );

  const memberNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of members) {
      map.set(m.userId, m.displayName || m.email);
    }
    return map;
  }, [members]);

  const activeProject = useMemo(
    () => taskProjects.find((p) => p.id === activeProjectId) ?? null,
    [taskProjects, activeProjectId],
  );

  const activeBundleIsAutomation = useMemo(
    () =>
      activeProject != null
        ? isAutomationProject(activeProject, activeBundle?.tasks, members)
        : false,
    [activeBundle?.tasks, activeProject, members],
  );

  const taskDialogAutomationContext = useMemo(() => {
    if (editingTask) {
      const project = taskProjects.find((p) => p.id === editingTask.projectId);
      return project
        ? isAutomationProject(project, projectBundles[project.id]?.tasks, members)
        : false;
    }
    return false;
  }, [editingTask, members, projectBundles, taskProjects]);

  const taskDialogProjects = useMemo(() => {
    if (navMode === "project" && activeProject) return [activeProject];
    return regularProjects;
  }, [activeProject, navMode, regularProjects]);

  useEffect(() => {
    setTasksBridge({
      activeProjectId,
      activeProjectTitle: activeProject?.title?.trim() || null,
    });
  }, [activeProject?.title, activeProjectId, setTasksBridge]);

  const contextTitle = navMode === "my" ? "My Tasks" : (activeProject?.title ?? "Project");

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const selectedTaskProject = useMemo(
    () =>
      selectedTask != null ? (taskProjects.find((p) => p.id === selectedTask.projectId) ?? null) : null,
    [selectedTask, taskProjects],
  );

  const selectedTaskAutomationContext = useMemo(
    () =>
      selectedTaskProject != null
        ? isAutomationProject(
            selectedTaskProject,
            projectBundles[selectedTaskProject.id]?.tasks,
            members,
          )
        : false,
    [members, projectBundles, selectedTaskProject],
  );

  const selectedTaskForExecute = useMemo(() => {
    if (!selectedTask) return null;
    const siteId = resolveTaskExecuteSiteId(selectedTask, activeWordPressSiteId);
    return siteId ? { ...selectedTask, wordpressSiteId: siteId } : selectedTask;
  }, [activeWordPressSiteId, selectedTask]);

  const automationProjectForTask = useCallback(
    (task: TeamTask) => taskProjects.find((p) => p.id === task.projectId) ?? null,
    [taskProjects],
  );

  const canExecuteTask = useCallback(
    (task: TeamTask) => {
      const project = automationProjectForTask(task);
      return taskSupportsManualAutomationExecute(
        task,
        project,
        project ? projectBundles[project.id]?.tasks : undefined,
        members,
      );
    },
    [automationProjectForTask, members, projectBundles],
  );

  const displayTasks = useMemo(() => {
    let list = filterTasks(tasks, filterMode);
    list = filterTasksByQuery(list, searchQuery);
    list = sortTasks(list, sortMode);
    return list;
  }, [tasks, filterMode, searchQuery, sortMode]);

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
  }, [patchTaskInView, selectedTaskId, teamId]);

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
  }, [patchTaskInView, selectedTaskId, teamId]);

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
    [flushTaskPatch, patchTaskInView, selectedTaskId, tasks],
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
    [setTaskProjects, teamId],
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
    [activeProjectId, projectBundles, purgeProjectBundle, refreshTasksWorkspace, selectedTaskId, setTaskProjects, tasks, teamId],
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
    [activeProjectId, sections.length, setSectionsInView, teamId],
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
    [activeProjectId, projectBundles, selectedTaskId, setSectionsInView, tasks, teamId, updateProjectBundle],
  );

  const handleAddNote = useCallback(
    async (body: string, mentionUserIds: number[]) => {
      if (!teamId || selectedTaskId == null) return;
      const result = await addTaskNote(teamId, selectedTaskId, body, mentionUserIds);
      if (result.ok && result.note) {
        setSelectedNotes((prev) => [...prev, result.note!]);
      }
    },
    [selectedTaskId, teamId],
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
    [activeProjectId, inProjectBundle, refreshProjectBundle, selectedTaskId, teamId],
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
    [selectedTaskId, teamId],
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
    [removeTaskFromView, selectedTaskId, teamId],
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

  if (!teamId || !activeTeam) {
    return (
      <div className="flex h-full items-center justify-center bg-black px-6">
        <p className="text-base text-muted-foreground">Select a team to view tasks.</p>
      </div>
    );
  }

  const mainView = (() => {
    if (viewMode === "board") {
      return (
        <TasksBoardView
          tasks={displayTasks}
          selectedTaskId={selectedTaskId}
          memberNames={memberNames}
          members={members}
          onSelectTask={setSelectedTaskId}
          onStatusChange={(id, status) => void handleStatusChange(id, status)}
        />
      );
    }
    if (viewMode === "calendar") {
      return (
        <TasksCalendarView
          tasks={displayTasks}
          selectedTaskId={selectedTaskId}
          onSelectTask={setSelectedTaskId}
        />
      );
    }
    if (viewMode === "files") {
      return (
        <TasksFilesView teamId={teamId} files={projectFiles} onSelectTask={setSelectedTaskId} />
      );
    }
    return (
      <TasksListView
        sections={sections}
        tasks={displayTasks}
        tags={taskTags}
        filterMode={filterMode}
        selectedTaskId={selectedTaskId}
        memberNames={memberNames}
        members={members}
        siteOptions={siteOptions}
        myTasksMode={navMode === "my"}
        automationMode={navMode === "my"}
        scheduleColumnLabel={navMode === "my" ? "Trigger" : "Repeat"}
        showExecuteAction={navMode === "my"}
        canExecuteTask={canExecuteTask}
        automationProjectForTask={automationProjectForTask}
        teamId={teamId}
        onSelectTask={setSelectedTaskId}
        onStatusChange={(id, status) => void handleStatusChange(id, status)}
        onAddTask={(sectionId, title) => void handleInlineAddTask(sectionId, title)}
        onMoveTask={(taskId, sectionId) => void handleMoveTask(taskId, sectionId)}
        onEditSection={(sectionId) => {
          const section = sections.find((s) => s.id === sectionId) ?? null;
          setEditingSection(section);
          setSectionDialogOpen(true);
        }}
        onDeleteSection={(sectionId) => void handleDeleteSection(sectionId)}
        onEditTask={(taskId) => {
          const task = tasks.find((t) => t.id === taskId) ?? null;
          setEditingTask(task);
          setTaskDialogOpen(true);
        }}
        onDeleteTask={(taskId) => void handleDeleteAutomationOrTask(taskId)}
        onExecuteTask={() => handleAfterAutomationExecute()}
      />
    );
  })();

  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden bg-black">
      <TasksNavSidebar
        navMode={navMode}
        activeProjectId={activeProjectId}
        regularProjects={regularProjects}
        onSelectMyTasks={() => {
          setNavMode("my");
          setSelectedTaskId(null);
        }}
        onSelectProject={(id) => {
          setNavMode("project");
          setActiveProjectId(id);
          setSelectedTaskId(null);
        }}
        onNewProject={() => {
          setEditingProject(null);
          setProjectDialogOpen(true);
        }}
        onEditProject={(project) => {
          setEditingProject(project);
          setProjectDialogOpen(true);
        }}
        onDeleteProject={(projectId) => void handleDeleteProject(projectId)}
        onOpenPulseForge={onOpenPulseForge}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TasksContextHeader
          contextTitle={contextTitle}
          viewMode={viewMode}
          completedToday={completedToday}
          onViewModeChange={setViewMode}
          searchQuery={searchQuery}
          filterMode={filterMode}
          sortMode={sortMode}
          addTaskDisabled={regularProjects.length === 0}
          onSearchChange={setSearchQuery}
          onFilterChange={setFilterMode}
          onSortChange={setSortMode}
          onAddTask={() => {
            setEditingTask(null);
            setTaskDialogOpen(true);
          }}
          onAddSection={() => {
            setEditingSection(null);
            setSectionDialogOpen(true);
          }}
          showAddSection={navMode === "project" && viewMode === "list" && !sectionDialogOpen && !creatingSection}
        />
        <div className="min-h-0 flex-1 overflow-hidden">{mainView}</div>
      </div>
      <TaskDetailPane
        open={selectedTask != null}
        task={selectedTask}
        notes={selectedNotes}
        files={selectedFiles}
        subtasks={selectedSubtasks}
        tags={taskTags}
        members={members}
        mentionMembers={humanMembers}
        siteOptions={siteOptions}
        memberNames={memberNames}
        teamId={teamId}
        saving={saving}
        uploading={uploading}
        isAutomationContext={selectedTaskAutomationContext}
        automationProject={selectedTaskProject}
        onClose={() => setSelectedTaskId(null)}
        onMarkDone={() => {
          if (selectedTask) void handleStatusChange(selectedTask.id, "done");
        }}
        onUpdate={queueTaskPatch}
        onAddNote={(body, ids) => void handleAddNote(body, ids)}
        onUploadFile={(file) => void handleUploadFile(file)}
        onAddSubtask={(title) => void handleAddSubtask(title)}
        onToggleSubtask={(id, status) => void handleStatusChange(id, status)}
        onDelete={() => void handleDeleteTask()}
        onExecuteAutomationTask={handleAfterAutomationExecute}
        onExecuteWithAgent={
          selectedTaskForExecute && taskHasPulseAssignee(selectedTaskForExecute, members)
            ? async () => {
                if (!taskCanExecuteWithAgent(selectedTaskForExecute, members)) return;
                const result = await startRunFromTask(
                  {
                    ...selectedTaskForExecute,
                    executionKind: resolveEffectiveExecutionKind(selectedTaskForExecute),
                  },
                  { openSidebar: true },
                );
                void result;
              }
            : undefined
        }
        executeWithAgentDisabledReason={
          selectedTaskForExecute && taskHasPulseAssignee(selectedTaskForExecute, members)
            ? !taskCanExecuteWithAgent(selectedTaskForExecute, members, activeWordPressSiteId)
              ? !isClientAgnosticExecutionKind(
                  selectedTaskForExecute.executionKind,
                  selectedTaskForExecute.executionPayload,
                )
                  && !resolveTaskExecuteSiteId(selectedTaskForExecute, activeWordPressSiteId)
                ? "Set a client on the project."
                : "Complete execution settings."
              : null
            : null
        }
      />
      <NewProjectDialog
        open={projectDialogOpen}
        onOpenChange={(open) => {
          setProjectDialogOpen(open);
          if (!open) setEditingProject(null);
        }}
        teamId={teamId}
        templates={taskTemplates}
        sites={siteOptions}
        members={members}
        tags={taskTags}
        defaultSiteId={activeWordPressSiteId}
        editProject={editingProject}
        editProjectTasks={
          editingProject
            ? (projectBundles[editingProject.id]?.tasks ??
              (activeProjectId === editingProject.id ? tasks : []))
            : []
        }
        onTemplatesChange={setTaskTemplates}
        onCreate={handleCreateProject}
        onUpdate={handleUpdateProject}
      />
      <NewTaskDialog
        open={taskDialogOpen}
        onOpenChange={(open) => {
          setTaskDialogOpen(open);
          if (!open) setEditingTask(null);
        }}
        projects={taskDialogProjects}
        defaultProjectId={inProjectBundle ? activeProjectId : null}
        automationContext={taskDialogAutomationContext}
        editTask={editingTask}
        members={members}
        tags={taskTags}
        sites={siteOptions}
        onCreate={handleCreateTask}
        onUpdate={handleUpdateTask}
      />
      <AddSectionDialog
        open={sectionDialogOpen}
        onOpenChange={(open) => {
          setSectionDialogOpen(open);
          if (!open) setEditingSection(null);
        }}
        editSection={editingSection}
        onCreate={handleCreateSection}
        onUpdate={handleUpdateSection}
      />
    </div>
  );
}
