import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { prefetchChatSession } from "@/lib/chat-session-cache";
import { readTeamMembersCache, prefetchTeamMembers, writeTeamMembersCache } from "@/lib/team-members-cache";
import { readTasksWorkspaceCache, writeTasksWorkspaceCache } from "@/lib/tasks-workspace-cache";
import {
  fetchMyTasks,
  fetchProjectFiles,
  fetchProjectSections,
  fetchProjectTasks,
  fetchTaskProjects,
  fetchTaskTags,
  fetchTaskTemplates,
} from "@/lib/tasks-api";
import type { TaskFile, TaskProject, TaskSection, TaskTag, TaskTemplate, TeamTask } from "@/lib/tasks-types";
import {
  fetchTeamMembers,
  fetchPendingInvites,
  fetchJobTitlePresets,
  fetchTeams,
  switchTeam as switchTeamApi,
} from "@/lib/teams-api";
import type { JobTitlePreset, TeamInvite, TeamMember, TeamPermissions, TeamSummary } from "@/lib/teams-types";

export type TaskProjectBundle = {
  tasks: TeamTask[];
  sections: TaskSection[];
  files: TaskFile[];
};

type TeamContextValue = {
  teams: TeamSummary[];
  activeTeam: TeamSummary | null;
  members: TeamMember[];
  invites: TeamInvite[];
  jobTitlePresets: JobTitlePreset[];
  permissions: TeamPermissions | null;
  loading: boolean;
  taskProjects: TaskProject[];
  taskTags: TaskTag[];
  taskTemplates: TaskTemplate[];
  myTasks: TeamTask[];
  completedToday: number;
  projectBundles: Record<number, TaskProjectBundle>;
  refresh: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  refreshTasksWorkspace: () => Promise<void>;
  refreshProjectBundle: (projectId: number) => Promise<void>;
  setMyTasks: React.Dispatch<React.SetStateAction<TeamTask[]>>;
  setTaskProjects: React.Dispatch<React.SetStateAction<TaskProject[]>>;
  setTaskTags: React.Dispatch<React.SetStateAction<TaskTag[]>>;
  setTaskTemplates: React.Dispatch<React.SetStateAction<TaskTemplate[]>>;
  setCompletedToday: React.Dispatch<React.SetStateAction<number>>;
  updateProjectBundle: (projectId: number, patch: Partial<TaskProjectBundle>) => void;
  purgeProjectBundle: (projectId: number) => void;
  switchTeam: (teamId: number) => Promise<boolean>;
  setActiveTeamLocal: (team: TeamSummary | null) => void;
  setPermissionsLocal: (permissions: TeamPermissions | null) => void;
};

export const TeamContext = createContext<TeamContextValue | null>(null);

export const PROJECT_BUNDLE_FETCH_CONCURRENCY = 3;

export type ProjectBundleQueueEntry = {
  projectId: number;
  resolve: () => void;
};

export function emptyProjectBundle(): TaskProjectBundle {
  return { tasks: [], sections: [], files: [] };
}



export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within TeamProvider");
  return ctx;
}
