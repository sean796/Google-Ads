import { useState, useCallback, useEffect, type ReactNode } from "react";
import { clearAllMasterInstructionsMemory } from "@/lib/master-instructions-storage";
import { clearDeviceAuth, loadDeviceAuth, saveDeviceAuth, setSessionToken, getSessionToken } from "@/lib/auth-device";
import { AUTH_DISABLED } from "@/lib/auth-disabled";
import { fetchAuthMe, loginWithEmail, logoutApi } from "@/lib/teams-api";
import type { AuthUser, TeamPermissions, TeamSummary } from "@/lib/teams-types";
import { AuthContext } from "./AuthContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  // Wave 0: no optimistic placeholder user from saved device auth.
  // The user is set only after the server verifies the session.
  const [user, setUser] = useState<AuthUser | null>(null);
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
      const device = loadDeviceAuth();
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
        // Wave 0: no placeholder user or demo team. Land on login.
        setUser(null);
        setActiveTeam(null);
        setPermissions(null);
      }
    } catch {
      setUser(null);
      setActiveTeam(null);
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
