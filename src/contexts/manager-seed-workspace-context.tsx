import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import type { WordPressSite } from "@/components/integrations/types";

export type ManagerWorkspaceSeedMode = "connected" | "temp";

type ManagerSeedWorkspaceContextValue = {
  mode: ManagerWorkspaceSeedMode;
  /** When switching to temp, prefills `tempSeedUrl` from the active connected site. */
  setMode: (m: ManagerWorkspaceSeedMode) => void;
  tempSeedUrl: string;
  setTempSeedUrl: (v: string) => void;
  debouncedTempSeed: string;
  canUseConnected: boolean;
  /** Enabled WordPress sites (excludes disabled). */
  enabledSites: WordPressSite[];
  /** Active site when at least one integration exists (else null). */
  connectedSite: WordPressSite | null;
  /** Copy public URL of connected site into temp seed (used when entering temp from UI that split these). */
  pickTempFromConnected: () => void;
};

const ManagerSeedWorkspaceContext = createContext<ManagerSeedWorkspaceContextValue | null>(null);

export function useManagerSeedWorkspace(): ManagerSeedWorkspaceContextValue {
  const v = useContext(ManagerSeedWorkspaceContext);
  if (!v) {
    throw new Error("useManagerSeedWorkspace must be used within ManagerSeedWorkspaceProvider");
  }
  return v;
}

/**
 * App-wide "Connected WordPress site vs temp/manual seed" mode and a single temp URL (debounced),
 * for SAP Generator and Research tabs. Must live under ActiveWordPressSiteProvider.
 */
export function ManagerSeedWorkspaceProvider({ children }: { children: ReactNode }) {
  const { sites } = useWordPressSites();
  const { activeWordPressSiteId, setActiveWordPressSiteId } = useActiveWordPressSite();

  const enabledSites = useMemo(() => sites.filter((s) => s.enabled !== false), [sites]);

  const [mode, setModeInternal] = useState<ManagerWorkspaceSeedMode>(() =>
    enabledSites.length === 0 ? "temp" : "connected",
  );
  const [tempSeedUrl, setTempSeedUrl] = useState("");
  const [debouncedTempSeed, setDebouncedTempSeed] = useState("");
  const prevEnabledSitesCountRef = useRef<number | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedTempSeed(tempSeedUrl), 400);
    return () => window.clearTimeout(t);
  }, [tempSeedUrl]);

  useEffect(() => {
    const prev = prevEnabledSitesCountRef.current;
    const next = enabledSites.length;
    prevEnabledSitesCountRef.current = next;

    if (next === 0) {
      setModeInternal("temp");
      return;
    }
    if ((prev === 0 || prev === null) && next > 0) {
      setModeInternal("connected");
    }
  }, [enabledSites.length]);

  useEffect(() => {
    if (sites.length === 0) return;
    const valid = Boolean(activeWordPressSiteId && sites.some((s) => s.id === activeWordPressSiteId));
    if (!valid) {
      const fallback = enabledSites[0]?.id ?? sites[0]?.id;
      if (fallback && fallback !== activeWordPressSiteId) {
        setActiveWordPressSiteId(fallback);
      }
    }
  }, [sites, enabledSites, activeWordPressSiteId, setActiveWordPressSiteId]);

  const connectedSite = enabledSites.find((s) => s.id === activeWordPressSiteId) ?? null;
  const canUseConnected = enabledSites.length > 0;

  const pickTempFromConnected = useCallback(() => {
    const u = connectedSite ? getPublicSiteUrl(connectedSite) : "";
    if (u) setTempSeedUrl(u);
  }, [connectedSite]);

  const setMode = useCallback(
    (m: ManagerWorkspaceSeedMode) => {
      if (m === "temp") {
        setModeInternal("temp");
        pickTempFromConnected();
      } else {
        setModeInternal("connected");
      }
    },
    [pickTempFromConnected],
  );

  const value = useMemo<ManagerSeedWorkspaceContextValue>(
    () => ({
      mode: canUseConnected ? mode : "temp",
      setMode,
      tempSeedUrl,
      setTempSeedUrl,
      debouncedTempSeed,
      canUseConnected,
      enabledSites,
      connectedSite: canUseConnected ? connectedSite : null,
      pickTempFromConnected,
    }),
    [
      canUseConnected,
      mode,
      setMode,
      tempSeedUrl,
      debouncedTempSeed,
      enabledSites,
      connectedSite,
      pickTempFromConnected,
    ],
  );

  return (
    <ManagerSeedWorkspaceContext.Provider value={value}>{children}</ManagerSeedWorkspaceContext.Provider>
  );
}
