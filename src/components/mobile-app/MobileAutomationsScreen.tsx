import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTeam } from "@/contexts/TeamContext";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { AgentRunsPanel } from "@/components/agent-runs/AgentRunsPanel";
import { MobileTaskCardList } from "@/components/mobile-app/MobileTaskCardList";
import { TaskDetailPane } from "@/components/manager/tasks/TaskDetailPane";
import {
  addTaskNote,
  createSubtask,
  deleteTask,
  fetchTaskDetail,
  updateTask,
  uploadTaskFile,
} from "@/lib/tasks-api";
import { filterTasks, sortTasks } from "@/lib/tasks-filter";
import { isAutomationProject } from "@/lib/task-automation-templates";
import { isAgentRunTerminal } from "@/lib/agent-runs-types";
import type { TaskFile, TaskNote, TaskProject, TaskStatus, TeamTask } from "@/lib/tasks-types";
import { Button } from "@/ui";

export function MobileAutomationsScreen() {
  const { activeTeam, members, taskProjects, projectBundles, taskTags, refreshProjectBundle } = useTeam();
  const { runs } = useAgentRunsContext();
  const { sites: wpSites } = useWordPressSites();
  const teamId = activeTeam?.id ?? null;

  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<TaskNote[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<TaskFile[]>([]);
  const [selectedSubtasks, setSelectedSubtasks] = useState<TeamTask[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const automationProjects = useMemo(() => {
    const projects: TaskProject[] = [];
    for (const project of taskProjects) {
      const bundleTasks = projectBundles[project.id]?.tasks;
      if (isAutomationProject(project, bundleTasks, members)) {
        projects.push(project);
      }
    }
    return projects;
  }, [members, projectBundles, taskProjects]);

  useEffect(() => {
    if (activeProjectId != null) return;
    if (automationProjects.length > 0) {
      setActiveProjectId(automationProjects[0].id);
    }
  }, [activeProjectId, automationProjects]);

  useEffect(() => {
    if (!teamId || activeProjectId == null) return;
    if (projectBundles[activeProjectId]) return;
    void refreshProjectBundle(activeProjectId);
  }, [activeProjectId, projectBundles, refreshProjectBundle, teamId]);

  const activeBundle = activeProjectId != null ? projectBundles[activeProjectId] : null;
  const activeBundleTasks = activeBundle?.tasks;
  const tasks = useMemo(() => activeBundleTasks ?? [], [activeBundleTasks]);

  const runningCount = useMemo(
    () => runs.filter((run) => !isAgentRunTerminal(run.status)).length,
    [runs],
  );

  const memberNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const member of members) {
      map.set(member.userId, member.displayName || member.email);
    }
    return map;
  }, [members]);

  const siteOptions = useMemo(
    () =>
      wpSites
        .filter((site) => site.enabled !== false)
        .map((site) => ({ id: site.id, name: site.name.trim() || site.siteUrl })),
    [wpSites],
  );

  const displayTasks = useMemo(() => sortTasks(filterTasks(tasks, "all"), "dueDate"), [tasks]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  const refreshTaskDetail = useCallback(async () => {
    if (!teamId || selectedTaskId == null) {
      setSelectedNotes([]);
      setSelectedFiles([]);
      setSelectedSubtasks([]);
      return;
    }
    const detail = await fetchTaskDetail(teamId, selectedTaskId);
    if (detail.task && activeProjectId != null) {
      setSelectedNotes(detail.notes);
      setSelectedFiles(detail.files);
      setSelectedSubtasks(detail.subtasks);
    }
  }, [activeProjectId, selectedTaskId, teamId]);

  useEffect(() => {
    void refreshTaskDetail();
  }, [refreshTaskDetail]);

  const handleAfterAutomationExecute = useCallback(() => {
    if (activeProjectId != null) void refreshProjectBundle(activeProjectId);
    void refreshTaskDetail();
  }, [activeProjectId, refreshProjectBundle, refreshTaskDetail]);

  const activeProject = useMemo(
    () => automationProjects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, automationProjects],
  );

  return (
    <div className="mobile-screen mobile-screen--automations flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mobile-screen__toolbar">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h2 className="mobile-screen__title">Automations</h2>
          {runningCount > 0 ? <span className="mobile-app-header__pill">{runningCount} live</span> : null}
        </div>
        {automationProjects.length > 0 ? (
          <div className="mobile-chip-row">
            {automationProjects.map((project) => (
              <Button
                pressed={activeProjectId === project.id}
                variant="quiet"
                key={project.id}
                onClick={() => {
                  setActiveProjectId(project.id);
                  setSelectedTaskId(null);
                }}
              >
                {project.title}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-base text-muted-foreground">No automation projects yet.</p>
        )}
      </div>

      <div className="mobile-automations-runs shrink-0">
        <AgentRunsPanel />
      </div>

      <div className="mobile-screen__body min-h-0 flex-1 overflow-y-auto">
        <MobileTaskCardList
          tasks={displayTasks}
          selectedTaskId={selectedTaskId}
          members={members}
          emptyLabel="No automation tasks yet"
          showExecuteAction
          teamId={teamId}
          onSelectTask={setSelectedTaskId}
          onStatusChange={(taskId, status) => {
            if (!teamId) return;
            void updateTask(teamId, taskId, { status });
          }}
          onExecuteTask={() => void handleAfterAutomationExecute()}
        />
      </div>

      <TaskDetailPane
        open={selectedTask != null}
        task={selectedTask}
        notes={selectedNotes}
        files={selectedFiles}
        subtasks={selectedSubtasks}
        tags={taskTags}
        members={members}
        siteOptions={siteOptions}
        memberNames={memberNames}
        teamId={teamId}
        saving={saving}
        uploading={uploading}
        isAutomationContext
        automationProject={activeProject}
        onClose={() => setSelectedTaskId(null)}
        onMarkDone={() => undefined}
        onUpdate={(patch) => {
          if (!teamId || !selectedTask) return;
          setSaving(true);
          void updateTask(teamId, selectedTask.id, patch).finally(() => setSaving(false));
        }}
        mentionMembers={members}
        onAddNote={(body, mentionUserIds) => {
          if (!teamId || !selectedTask) return;
          void addTaskNote(teamId, selectedTask.id, body, mentionUserIds).then(() => refreshTaskDetail());
        }}
        onUploadFile={(file) => {
          if (!teamId || !selectedTask) return;
          setUploading(true);
          void uploadTaskFile(teamId, selectedTask.id, file)
            .then(() => refreshTaskDetail())
            .finally(() => setUploading(false));
        }}
        onAddSubtask={(title) => {
          if (!teamId || !selectedTask) return;
          void createSubtask(teamId, selectedTask.id, { title }).then(() => refreshTaskDetail());
        }}
        onToggleSubtask={(taskId, status) => {
          if (!teamId) return;
          void updateTask(teamId, taskId, { status }).then(() => refreshTaskDetail());
        }}
        onDelete={() => {
          if (!teamId || !selectedTask) return;
          void deleteTask(teamId, selectedTask.id).then(() => setSelectedTaskId(null));
        }}
        onExecuteAutomationTask={() => void handleAfterAutomationExecute()}
      />
    </div>
  );
}
