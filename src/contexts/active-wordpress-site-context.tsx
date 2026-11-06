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

export const ActiveWordPressSiteContext = createContext<ActiveWordPressSiteContextValue | null>(null);

export function useActiveWordPressSite(): ActiveWordPressSiteContextValue {
  const ctx = useContext(ActiveWordPressSiteContext);
  if (!ctx) {
    throw new Error("useActiveWordPressSite must be used within ActiveWordPressSiteProvider");
  }
  return ctx;
}

/** Shared active integration site id (localStorage-backed). Lives under WordPressSitesProvider. */

