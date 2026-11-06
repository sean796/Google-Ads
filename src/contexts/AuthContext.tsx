import { createContext, useContext } from "react";
import type { AuthUser, TeamPermissions, TeamSummary } from "@/lib/teams-types";

export type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  activeTeam: TeamSummary | null;
  permissions: TeamPermissions | null;
  login: (email: string, password: string, rememberDevice?: boolean) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setActiveTeam: (team: TeamSummary | null) => void;
  setPermissions: (permissions: TeamPermissions | null) => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** @deprecated use user.email */
export function useAuthUsername(): string | null {
  const { user } = useAuth();
  return user?.email ?? null;
}
