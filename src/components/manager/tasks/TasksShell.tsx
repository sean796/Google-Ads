import React from "react";
import { taskCanExecuteWithAgent, isClientAgnosticExecutionKind } from "@/lib/agent-runs-types";
import { resolveTaskExecuteSiteId } from "@/lib/agent-runs-types";
import { resolveEffectiveExecutionKind } from "@/lib/task-automation-ui";
import { TasksNavSidebar } from "@/components/manager/tasks/TasksNavSidebar";
import { TasksContextHeader } from "@/components/manager/tasks/TasksContextHeader";
import { TasksListView } from "@/components/manager/tasks/TasksListView";
import { TasksBoardView } from "@/components/manager/tasks/TasksBoardView";
import { TasksCalendarView } from "@/components/manager/tasks/TasksCalendarView";
import { TasksFilesView } from "@/components/manager/tasks/TasksFilesView";
import { TaskDetailPane } from "@/components/manager/tasks/TaskDetailPane";
import { NewProjectDialog } from "@/components/manager/tasks/NewProjectDialog";
import { NewTaskDialog } from "@/components/manager/tasks/NewTaskDialog";
import { AddSectionDialog } from "@/components/manager/tasks/AddSectionDialog";
import { taskHasPulseAssignee } from "@/lib/tasks-filter";
import type { TasksShellProps } from "@/components/manager/tasks/tasks-shell-types";
import { useTasksShellViewModel } from "@/components/manager/tasks/use-tasks-shell-view-model";
import { useTasksShellTaskHandlers } from "@/components/manager/tasks/use-tasks-shell-task-handlers";
import { useTasksShellProjectHandlers } from "@/components/manager/tasks/use-tasks-shell-project-handlers";
import { useTasksShellDetailHandlers } from "@/components/manager/tasks/use-tasks-shell-detail-handlers";

export function TasksShell({ onOpenPulseForge }: TasksShellProps = {}): React.ReactElement {
  const {
    activeTeam,
    members,
    taskProjects,
    taskTags,
    taskTemplates,
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
    inProjectBundle,
    tasks,
    sections,
    projectFiles,
    regularProjects,
    humanMembers,
    siteOptions,
    memberNames,
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
  } = useTasksShellViewModel({ onOpenPulseForge });

  const {
    patchTaskInView,
    addTaskInView,
    removeTaskFromView,
    setSectionsInView,
    handleAfterAutomationExecute,
    queueTaskPatch,
    handleStatusChange,
  } = useTasksShellTaskHandlers({
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
  });

  const {
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    handleCreateTask,
    handleInlineAddTask,
    handleMoveTask,
  } = useTasksShellProjectHandlers({
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
  });

  const {
    handleCreateSection,
    handleUpdateSection,
    handleDeleteSection,
    handleAddNote,
    handleUploadFile,
    handleAddSubtask,
    handleUpdateTask,
    handleDeleteAutomationOrTask,
    handleDeleteTask,
  } = useTasksShellDetailHandlers({
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
  });

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
