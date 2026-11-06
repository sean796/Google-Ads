import { useState, useCallback, useEffect } from "react";
import type { OptimizationSettings } from "@/components/integrations/wordpress/OptimizationSettingsPanel";
import { DEFAULT_SETTINGS } from "@/lib/optimization-settings-defaults";

const SETTINGS_STORAGE_KEY_PREFIX = "optimization_settings_";
const MODE_STORAGE_KEY_PREFIX = "optimization_mode_";

export function useOptimizationSettings(siteId: string) {
  const [settings, setSettingsState] = useState<OptimizationSettings>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(`${SETTINGS_STORAGE_KEY_PREFIX}${siteId}`);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error('[OptimizationSettings] Failed to parse stored settings:', e);
        }
      }
    }
    return DEFAULT_SETTINGS;
  });

  const setSettings = useCallback((newSettings: OptimizationSettings) => {
    setSettingsState(newSettings);
    if (typeof window !== "undefined") {
      localStorage.setItem(`${SETTINGS_STORAGE_KEY_PREFIX}${siteId}`, JSON.stringify(newSettings));
    }
  }, [siteId]);

  return [settings, setSettings] as const;
}

export function useOptimizationMode(siteId: string) {
  const [mode, setModeState] = useState<'quick' | 'standard' | 'full'>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(`${MODE_STORAGE_KEY_PREFIX}${siteId}`);
      if (stored === 'quick' || stored === 'standard' || stored === 'full') {
        return stored;
      }
    }
    return 'standard' as const;
  });

  const setMode = useCallback((newMode: 'quick' | 'standard' | 'full') => {
    setModeState(newMode);
    if (typeof window !== "undefined") {
      localStorage.setItem(`${MODE_STORAGE_KEY_PREFIX}${siteId}`, newMode);
    }
  }, [siteId]);

  return [mode, setMode] as const;
}

