import { useEffect, useRef, useCallback } from "react";
import { BlueprintData } from "./use-blueprint-management";
import { logger } from "@/lib/logger";

const DRAFT_AUTOSAVE_KEY = "neo-pulse-draft-autosave";
const AUTOSAVE_INTERVAL = 30000; // 30 seconds

export interface DraftData {
  blueprint: BlueprintData;
  timestamp: number;
}

interface UseAutosaveOptions {
  flowTitle: string;
  /** Section count or other monotonic key for structural draft saves */
  draftStructureKey: number;
  knowledgeFiles: Array<{ name: string; size: number; content: string; starred: boolean; timestamp: number }>;
  activeKnowledgeBaseText: string;
  generateBlueprint: () => BlueprintData;
  enabled?: boolean;
}

export function useAutosave({
  flowTitle,
  draftStructureKey,
  knowledgeFiles,
  activeKnowledgeBaseText,
  generateBlueprint,
  enabled = true,
}: UseAutosaveOptions) {
  const lastSaveRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousStructureKeyRef = useRef<number>(draftStructureKey);

  const saveDraft = useCallback(() => {
    if (!enabled) return;

    try {
      const blueprint = generateBlueprint();
      const draftData: DraftData = {
        blueprint,
        timestamp: Date.now(),
      };

      localStorage.setItem(DRAFT_AUTOSAVE_KEY, JSON.stringify(draftData));
      lastSaveRef.current = Date.now();
    } catch (error) {
      logger.error("Failed to save draft:", error);
    }
  }, [enabled, generateBlueprint]);

  // Auto-save with immediate save for structural changes (e.g. section count)
  // and debounced save for content edits
  useEffect(() => {
    if (!enabled) return;

    const isStructuralChange = previousStructureKeyRef.current !== draftStructureKey;

    if (isStructuralChange) {
      previousStructureKeyRef.current = draftStructureKey;
      // Save immediately for structural changes
      saveDraft();
      // Clear any pending timeout since we just saved
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // For content edits (non-structural changes), use debounced save
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout to save after 30 seconds of inactivity
    timeoutRef.current = setTimeout(() => {
      saveDraft();
    }, AUTOSAVE_INTERVAL);

    // Cleanup timeout on unmount or dependency change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [flowTitle, draftStructureKey, knowledgeFiles, activeKnowledgeBaseText, enabled, saveDraft]);

  // Save on unmount if there are unsaved changes
  useEffect(() => {
    return () => {
      if (enabled && timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        saveDraft();
      }
    };
  }, [enabled, saveDraft]);

  return {
    saveDraft,
    hasUnsavedChanges: Date.now() - lastSaveRef.current > AUTOSAVE_INTERVAL,
  };
}

export function loadDraft(): DraftData | null {
  try {
    const stored = localStorage.getItem(DRAFT_AUTOSAVE_KEY);
    if (stored) {
      return JSON.parse(stored) as DraftData;
    }
  } catch (error) {
    logger.error("Failed to load draft:", error);
  }
  return null;
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_AUTOSAVE_KEY);
  } catch (error) {
    logger.error("Failed to clear draft:", error);
  }
}

export function hasDraft(): boolean {
  try {
    return localStorage.getItem(DRAFT_AUTOSAVE_KEY) !== null;
  } catch {
    return false;
  }
}
