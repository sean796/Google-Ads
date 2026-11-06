import { logger } from "@/lib/logger";
import type { OptimizationHistoryEntry } from "@/components/integrations/wordpress/OptimizationHistoryPanel";

const HISTORY_STORAGE_KEY_PREFIX = "optimization_history_";
const MAX_HISTORY_ENTRIES = 50;

export function getOptimizationHistory(siteId: string): OptimizationHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(`${HISTORY_STORAGE_KEY_PREFIX}${siteId}`);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    logger.error('[OptimizationHistory] Failed to parse stored history:', e);
  }
  return [];
}

export function addOptimizationHistoryEntry(siteId: string, entry: OptimizationHistoryEntry): void {
  if (typeof window === "undefined") return;
  try {
    const history = getOptimizationHistory(siteId);
    const updated = [entry, ...history].slice(0, MAX_HISTORY_ENTRIES);
    localStorage.setItem(`${HISTORY_STORAGE_KEY_PREFIX}${siteId}`, JSON.stringify(updated));
  } catch (e) {
    logger.error('[OptimizationHistory] Failed to add history entry:', e);
  }
}

export function updateOptimizationHistoryEntry(siteId: string, entryId: string, updates: Partial<OptimizationHistoryEntry>): void {
  if (typeof window === "undefined") return;
  try {
    const history = getOptimizationHistory(siteId);
    const updated = history.map((entry) =>
      entry.id === entryId ? { ...entry, ...updates } : entry
    );
    localStorage.setItem(`${HISTORY_STORAGE_KEY_PREFIX}${siteId}`, JSON.stringify(updated));
  } catch (e) {
    logger.error('[OptimizationHistory] Failed to update history entry:', e);
  }
}

export function clearOptimizationHistory(siteId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(`${HISTORY_STORAGE_KEY_PREFIX}${siteId}`);
  } catch (e) {
    logger.error('[OptimizationHistory] Failed to clear history:', e);
  }
}

