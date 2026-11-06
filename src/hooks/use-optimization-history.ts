import { useState, useCallback, useEffect } from "react";
import { logger } from "@/lib/logger";
import type { OptimizationHistoryEntry } from "@/components/integrations/wordpress/OptimizationHistoryPanel";

const HISTORY_STORAGE_KEY_PREFIX = "optimization_history_";
const MAX_HISTORY_ENTRIES = 50;

export function useOptimizationHistory(siteId: string) {
  const [history, setHistoryState] = useState<OptimizationHistoryEntry[]>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(`${HISTORY_STORAGE_KEY_PREFIX}${siteId}`);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          logger.error('[OptimizationHistory] Failed to parse stored history:', e);
        }
      }
    }
    return [];
  });

  const addHistoryEntry = useCallback((entry: OptimizationHistoryEntry) => {
    setHistoryState((prev) => {
      const updated = [entry, ...prev].slice(0, MAX_HISTORY_ENTRIES);
      if (typeof window !== "undefined") {
        localStorage.setItem(`${HISTORY_STORAGE_KEY_PREFIX}${siteId}`, JSON.stringify(updated));
      }
      return updated;
    });
  }, [siteId]);

  const updateHistoryEntry = useCallback((entryId: string, updates: Partial<OptimizationHistoryEntry>) => {
    setHistoryState((prev) => {
      const updated = prev.map((entry) =>
        entry.id === entryId ? { ...entry, ...updates } : entry
      );
      if (typeof window !== "undefined") {
        localStorage.setItem(`${HISTORY_STORAGE_KEY_PREFIX}${siteId}`, JSON.stringify(updated));
      }
      return updated;
    });
  }, [siteId]);

  const clearHistory = useCallback(() => {
    setHistoryState([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(`${HISTORY_STORAGE_KEY_PREFIX}${siteId}`);
    }
  }, [siteId]);

  return {
    history,
    addHistoryEntry,
    updateHistoryEntry,
    clearHistory,
  };
}

