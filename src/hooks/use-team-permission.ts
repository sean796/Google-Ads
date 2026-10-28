import { useMemo } from "react";
import { useTeam } from "@/contexts/TeamContext";
import type { TeamPermissionArea } from "@/lib/teams-types";
import { AUTH_DISABLED } from "@/lib/auth-disabled";

export function useTeamPermission() {
  const { permissions, activeTeam } = useTeam();

  return useMemo(() => {
    const canRead = (area: TeamPermissionArea): boolean => {
      if (AUTH_DISABLED) return true;
      if (!activeTeam) return true;
      if (!activeTeam.accessRole || activeTeam.accessRole === "owner" || activeTeam.accessRole === "admin") return true;
      const p = permissions?.[area];
      return Boolean(p?.read || p?.write);
    };

    const canWrite = (area: TeamPermissionArea): boolean => {
      if (AUTH_DISABLED) return true;
      if (!activeTeam) return true;
      if (!activeTeam.accessRole || activeTeam.accessRole === "owner" || activeTeam.accessRole === "admin") return true;
      return Boolean(permissions?.[area]?.write);
    };

    const isOwner = activeTeam?.accessRole === "owner";

    return { canRead, canWrite, isOwner, permissions, activeTeam };
  }, [permissions, activeTeam]);
}

/** Map manager dashboard cluster ids to permission areas. */
export function dashboardClusterToArea(cluster: string): TeamPermissionArea | null {
  const map: Record<string, TeamPermissionArea> = {
    properties: "properties",
    "api-keys": "api-keys",
    "master-rules": "master-rules",
    "ai-generation": "ai-generation",
    google: "google",
  };
  return map[cluster] ?? null;
}

/** Map manager tab values to permission areas. */
export function managerTabToArea(tab: string): TeamPermissionArea | null {
  const map: Record<string, TeamPermissionArea> = {
    dashboard: "properties",
    "content-optimizer": "content-optimizer",
    generator: "generator",
    "gsc-report": "gsc-report",
    sitemap: "sitemap",
    chat: "communication",
    users: "teams",
    support: "teams",
    "pulse-host": "hosting",
    "image-generator": "generator",
    "video-generator": "generator",
  };
  return map[tab] ?? null;
}
