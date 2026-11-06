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

export type ManagerSeedWorkspaceContextValue = {
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

export const ManagerSeedWorkspaceContext = createContext<ManagerSeedWorkspaceContextValue | null>(null);

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

