import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { usePulseAssistContext } from "@/contexts/pulse-assist-context";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { resolveTaskExecuteSiteId } from "@/lib/agent-runs-types";
import { taskSupportsManualAutomationExecute } from "@/lib/task-automation-ui";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { filterTasks, filterTasksByQuery, sortTasks } from "@/lib/tasks-filter";
import { isAutomationProject, isProjectBundleNavMode } from "@/lib/task-automation-templates";
import type {
  TaskFile,
  TaskNote,
  TaskProject,
  TaskSection,
  TeamTask,
  TasksFilterMode,
  TasksNavMode,
  TasksSortMode,
  TasksViewMode,
} from "@/lib/tasks-types";
import type { TasksShellProps } from "@/components/manager/tasks/tasks-shell-types";

export function useTasksShellViewModel({ onOpenPulseForge }: TasksShellProps = {}) {
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

  return {
    onOpenPulseForge,
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
    startRunFromTask,
    activeWordPressSiteId,
    teamId,
    userId,
    navMode,
    setNavMode,
    viewMode,
    setViewMode,
    filterMode,
    setFilterMode,
    sortMode,
    setSortMode,
    searchQuery,
    setSearchQuery,
    activeProjectId,
    setActiveProjectId,
    selectedTaskId,
    setSelectedTaskId,
    selectedNotes,
    setSelectedNotes,
    selectedFiles,
    setSelectedFiles,
    selectedSubtasks,
    setSelectedSubtasks,
    saving,
    setSaving,
    uploading,
    setUploading,
    projectDialogOpen,
    setProjectDialogOpen,
    taskDialogOpen,
    setTaskDialogOpen,
    sectionDialogOpen,
    setSectionDialogOpen,
    creatingSection,
    setCreatingSection,
    editingProject,
    setEditingProject,
    editingSection,
    setEditingSection,
    editingTask,
    setEditingTask,
    updateTimerRef,
    pendingPatchRef,
    activeBundle,
    inProjectBundle,
    tasks,
    sections,
    projectFiles,
    regularProjects,
    humanMembers,
    siteOptions,
    memberNames,
    activeProject,
    activeBundleIsAutomation,
    taskDialogAutomationContext,
    taskDialogProjects,
    contextTitle,
    selectedTask,
    selectedTaskProject,
    selectedTaskAutomationContext,
    selectedTaskForExecute,
    automationProjectForTask,
    canExecuteTask,
    displayTasks,
  };
}
