import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { syncActiveWordPressSiteToServer } from "@/components/integrations/storage";

export const ACTIVE_WP_SITE_STORAGE_KEY = "neo-pulse-active-wp-site-id";

type ActiveWordPressSiteContextValue = {
  activeWordPressSiteId: string | null;
  setActiveWordPressSiteId: (id: string | null) => void;
};

const ActiveWordPressSiteContext = createContext<ActiveWordPressSiteContextValue | null>(null);

export function useActiveWordPressSite(): ActiveWordPressSiteContextValue {
  const ctx = useContext(ActiveWordPressSiteContext);
  if (!ctx) {
    throw new Error("useActiveWordPressSite must be used within ActiveWordPressSiteProvider");
  }
  return ctx;
}

/** Shared active integration site id (localStorage-backed). Lives under WordPressSitesProvider. */
export function ActiveWordPressSiteProvider({ children }: { children: ReactNode }) {
  const { sites } = useWordPressSites();
  const enabledSites = useMemo(() => sites.filter((s) => s.enabled !== false), [sites]);
  const siteIdsKey = enabledSites.map((s) => s.id).join(",");

  const [activeWordPressSiteId, setActiveWordPressSiteIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_WP_SITE_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const setActiveWordPressSiteId = useCallback((id: string | null) => {
    setActiveWordPressSiteIdState((current) => {
      if (current === id) return current;
      try {
        if (id) localStorage.setItem(ACTIVE_WP_SITE_STORAGE_KEY, id);
        else localStorage.removeItem(ACTIVE_WP_SITE_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      void syncActiveWordPressSiteToServer(id);
      return id;
    });
  }, []);

  useEffect(() => {
    if (sites.length === 0) {
      setActiveWordPressSiteIdState(null);
      try {
        localStorage.removeItem(ACTIVE_WP_SITE_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    setActiveWordPressSiteIdState((current) => {
      const keep = Boolean(current && sites.some((s) => s.id === current));
      if (keep) return current;
      const fallback = enabledSites[0]?.id ?? sites[0]?.id ?? null;
      if (!fallback || fallback === current) return current;
      try {
        localStorage.setItem(ACTIVE_WP_SITE_STORAGE_KEY, fallback);
      } catch {
        /* ignore */
      }
      void syncActiveWordPressSiteToServer(fallback);
      return fallback;
    });
  }, [sites, siteIdsKey]);

  const value = useMemo(
    () => ({ activeWordPressSiteId, setActiveWordPressSiteId }),
    [activeWordPressSiteId, setActiveWordPressSiteId],
  );

  return (
    <ActiveWordPressSiteContext.Provider value={value}>{children}</ActiveWordPressSiteContext.Provider>
  );
}
