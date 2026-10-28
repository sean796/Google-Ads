import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { clearAllMasterInstructionsMemory } from "@/lib/master-instructions-storage";
import { clearDeviceAuth, loadDeviceAuth, saveDeviceAuth, setSessionToken, getSessionToken } from "@/lib/auth-device";
import { AUTH_DISABLED, LOCAL_DEMO_EMAIL, LOCAL_DEMO_PASSWORD, LOCAL_DEMO_TEAM } from "@/lib/auth-disabled";
import { fetchAuthMe, loginWithEmail, logoutApi } from "@/lib/teams-api";
import type { AuthUser, TeamPermissions, TeamSummary } from "@/lib/teams-types";

type AuthContextValue = {
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

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const d = loadDeviceAuth();
    if (d?.email) {
      return { id: 1, email: d.email, displayName: d.email };
    }
    return null;
  });
  const [activeTeam, setActiveTeam] = useState<TeamSummary | null>(null);
  const [permissions, setPermissions] = useState<TeamPermissions | null>(null);
  const [loading, setLoading] = useState(!AUTH_DISABLED);

  const applyMe = useCallback((data: Awaited<ReturnType<typeof fetchAuthMe>>) => {
    if (data.user) {
      setUser(data.user);
    } else if (data.username) {
      setUser({ id: 0, email: data.username, displayName: data.username });
    } else {
      setUser(null);
    }
    setActiveTeam(data.activeTeam ?? null);
    setPermissions(data.permissions ?? data.activeTeam?.permissions ?? null);
  }, []);

  const checkAuth = useCallback(async () => {
    if (AUTH_DISABLED) {
      setLoading(false);
      return;
    }
    try {
      let device = loadDeviceAuth();
      if (!device) {
        saveDeviceAuth(LOCAL_DEMO_EMAIL, LOCAL_DEMO_PASSWORD);
        device = loadDeviceAuth();
      }
      if (device?.sessionToken && !getSessionToken()) {
        setSessionToken(device.sessionToken);
      }
      let data = await fetchAuthMe();
      if (!data.user && !data.username) {
        const saved = loadDeviceAuth();
        if (saved) {
          const loginResult = await loginWithEmail(saved.email, saved.password);
          if (loginResult.ok) {
            if (loginResult.sessionToken) {
              setSessionToken(loginResult.sessionToken);
              saveDeviceAuth(saved.email, saved.password, loginResult.sessionToken);
            }
            data = await fetchAuthMe();
          }
        }
      }
      if (data.user || data.username) {
        applyMe(data);
      } else {
        const fallbackDevice = loadDeviceAuth();
        if (fallbackDevice?.email) {
          setUser({
            id: 1,
            email: fallbackDevice.email,
            displayName: fallbackDevice.email,
          });
          setActiveTeam(LOCAL_DEMO_TEAM);
        } else {
          applyMe(data);
        }
      }
    } catch {
      const fallbackDevice = loadDeviceAuth();
      if (fallbackDevice?.email) {
        setUser({
          id: 1,
          email: fallbackDevice.email,
          displayName: fallbackDevice.email,
        });
        setActiveTeam(LOCAL_DEMO_TEAM);
      } else {
        setUser(null);
        setActiveTeam(null);
      }
      setPermissions(null);
    } finally {
      setLoading(false);
    }
  }, [applyMe]);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const login = useCallback(
    async (email: string, password: string, rememberDevice = true) => {
      const result = await loginWithEmail(email, password);
      if (result.ok) {
        if (result.sessionToken) {
          setSessionToken(result.sessionToken);
        }
        if (rememberDevice) {
          saveDeviceAuth(email, password, result.sessionToken);
        } else {
          clearDeviceAuth();
          if (result.sessionToken) {
            setSessionToken(result.sessionToken);
          }
        }
        await checkAuth();
      }
      return result;
    },
    [checkAuth],
  );

  const logout = useCallback(async () => {
    clearDeviceAuth();
    await logoutApi();
    setUser(null);
    setActiveTeam(null);
    setPermissions(null);
    clearAllMasterInstructionsMemory();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        activeTeam,
        permissions,
        login,
        logout,
        checkAuth,
        setActiveTeam,
        setPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

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
