import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTeam } from "@/contexts/TeamContext";
import { usePulseAssistContext } from "@/contexts/pulse-assist-context";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { MobileTaskCardList } from "@/components/mobile-app/MobileTaskCardList";
import { TaskDetailPane } from "@/components/manager/tasks/TaskDetailPane";
import {
  addTaskNote,
  createSubtask,
  deleteTask,
  fetchTaskDetail,
  fetchTaskProjects,
  updateTask,
  uploadTaskFile,
} from "@/lib/tasks-api";
import { filterTasks, filterTasksByQuery, sortTasks } from "@/lib/tasks-filter";
import type { TaskFile, TaskNote, TaskProject, TaskStatus, TeamTask } from "@/lib/tasks-types";
import { Field } from "@/ui";

export function MobileTasksScreen({
  pushTaskId = null,
  onPushTaskHandled,
}: {
  pushTaskId?: number | null;
  onPushTaskHandled?: () => void;
}) {
  const { activeTeam, members, myTasks, taskTags, setMyTasks } = useTeam();
  const { setTasksBridge } = usePulseAssistContext();
  const { sites: wpSites } = useWordPressSites();
  const teamId = activeTeam?.id ?? null;

  const [taskProjects, setTaskProjects] = useState<TaskProject[]>([]);

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<TaskNote[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<TaskFile[]>([]);
  const [selectedSubtasks, setSelectedSubtasks] = useState<TeamTask[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  const displayTasks = useMemo(() => {
    let list = filterTasks(myTasks, "incomplete");
    list = filterTasksByQuery(list, searchQuery);
    return sortTasks(list, "dueDate");
  }, [myTasks, searchQuery]);

  const selectedTask = useMemo(
    () => myTasks.find((task) => task.id === selectedTaskId) ?? null,
    [myTasks, selectedTaskId],
  );

  useEffect(() => {
    if (!teamId) {
      setTaskProjects([]);
      return;
    }
    let cancelled = false;
    void fetchTaskProjects(teamId).then((projects) => {
      if (!cancelled) setTaskProjects(projects);
    });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  useEffect(() => {
    const project = selectedTask
      ? (taskProjects.find((item) => item.id === selectedTask.projectId) ?? null)
      : null;
    setTasksBridge({
      activeProjectId: project?.id ?? null,
      activeProjectTitle: project?.title?.trim() || null,
    });
  }, [selectedTask, taskProjects, setTasksBridge]);

  const patchTaskInView = useCallback(
    (task: TeamTask) => {
      setMyTasks((prev) => prev.map((item) => (item.id === task.id ? task : item)));
    },
    [setMyTasks],
  );

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

  useEffect(() => {
    if (!pushTaskId) return;
    setSelectedTaskId(pushTaskId);
    onPushTaskHandled?.();
  }, [onPushTaskHandled, pushTaskId]);

  const handleStatusChange = useCallback(
    async (taskId: number, status: TaskStatus) => {
      if (!teamId) return;
      setSaving(true);
      try {
        const updated = await updateTask(teamId, taskId, { status });
        if (updated.task) patchTaskInView(updated.task);
      } finally {
        setSaving(false);
      }
    },
    [patchTaskInView, teamId],
  );

  return (
    <div className="mobile-screen mobile-screen--tasks flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mobile-screen__toolbar">
        <h2 className="mobile-screen__title">My Tasks</h2>
        <Field
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search tasks"
          aria-label="Search tasks"
        />
      </div>

      <div className="mobile-screen__body min-h-0 flex-1 overflow-y-auto">
        <MobileTaskCardList
          tasks={displayTasks}
          selectedTaskId={selectedTaskId}
          members={members}
          onSelectTask={setSelectedTaskId}
          onStatusChange={(taskId, status) => void handleStatusChange(taskId, status)}
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
        onClose={() => setSelectedTaskId(null)}
        onMarkDone={() => {
          if (!selectedTask) return;
          void handleStatusChange(selectedTask.id, "done");
        }}
        onUpdate={(patch) => {
          if (!teamId || !selectedTask) return;
          setSaving(true);
          void updateTask(teamId, selectedTask.id, patch)
            .then((updated) => {
              if (updated.task) patchTaskInView(updated.task);
            })
            .finally(() => setSaving(false));
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
          void deleteTask(teamId, selectedTask.id).then(() => {
            setMyTasks((prev) => prev.filter((task) => task.id !== selectedTask.id));
            setSelectedTaskId(null);
          });
        }}
      />
    </div>
  );
}
