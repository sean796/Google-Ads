import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { fetchChatPreferences, patchChatPreferences } from "@/lib/chat-preferences-api";
import {
  applyBuiltinPreset,
  applyPresetSnapshot,
  buildCustomPresetPatch,
  deleteSavedPresetPatch,
} from "@/lib/chat-preferences-presets";
import type {
  ChatBuiltinPresetId,
  ChatPreferencesPatch,
  ChatUserPreferences,
} from "@/lib/chat-preferences-types";
import {
  defaultChatPreferences,
  mergeChatPreferences,
  normalizeChatPreferences,
  prefsLocalStorageKey,
} from "@/lib/chat-preferences-types";

import {
  ChatPreferencesContext,
  prefsToPatch,
  readCachedPrefs,
  writeCachedPrefs,
} from "./ChatPreferencesContext";

export function ChatPreferencesProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { user, checkAuth } = useAuth();
  const { activeTeam, refreshMembers } = useTeam();
  const teamId = activeTeam?.id ?? null;

  const initial = useMemo(
    () => {
      const cached = teamId ? readCachedPrefs(teamId) : null;
      if (cached) return cached;
      return defaultChatPreferences(user?.displayName ?? "", user?.avatarUrl ?? null);
    },
    [teamId, user?.displayName, user?.avatarUrl],
  );

  const [prefs, setPrefs] = useState<ChatUserPreferences>(initial);
  const [draft, setDraft] = useState<ChatUserPreferences>(initial);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) {
      setLoading(false);
      return;
    }
    const cached = readCachedPrefs(teamId);
    if (cached) {
      setPrefs(cached);
      setDraft(cached);
    }
    let cancelled = false;
    setLoading(true);
    void fetchChatPreferences(teamId).then((server) => {
      if (cancelled) return;
      if (server) {
        const normalized = normalizeChatPreferences(server);
        setPrefs(normalized);
        setDraft(normalized);
        writeCachedPrefs(teamId, normalized);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const applyPreset = useCallback(
    (id: ChatBuiltinPresetId | string) => {
      setDraft((current) => {
        const builtin = ["minimal", "balanced", "all", "focus"].includes(id)
          ? applyBuiltinPreset(current, id as ChatBuiltinPresetId | "slack")
          : (() => {
              const saved = current.savedPresets.find((p) => p.id === id);
              if (!saved) return current;
              return applyPresetSnapshot(current, saved.snapshot, id);
            })();
        return builtin;
      });
    },
    [],
  );

  const savePrefs = useCallback(
    async (patch?: ChatPreferencesPatch): Promise<boolean> => {
      if (!teamId) return false;
      const merged = patch ? mergeChatPreferences(draft, patch) : draft;
      const payload = patch ?? prefsToPatch(draft);
      const result = await patchChatPreferences(teamId, payload);
      if (result.ok && result.prefs) {
        setPrefs(result.prefs);
        setDraft(result.prefs);
        writeCachedPrefs(teamId, result.prefs);
        if (merged.profile.displayName.trim()) {
          void checkAuth();
          void refreshMembers();
        }
        return true;
      }
      if (result.ok) {
        setPrefs(merged);
        setDraft(merged);
        writeCachedPrefs(teamId, merged);
        if (merged.profile.displayName.trim()) {
          void checkAuth();
          void refreshMembers();
        }
        return true;
      }
      return false;
    },
    [teamId, draft, checkAuth, refreshMembers],
  );

  const saveCustomPreset = useCallback(
    async (name: string): Promise<boolean> => {
      const patch = buildCustomPresetPatch(draft, name.trim());
      const next = mergeChatPreferences(draft, patch);
      setDraft(next);
      return savePrefs(patch);
    },
    [draft, savePrefs],
  );

  const deleteSavedPreset = useCallback(
    async (id: string): Promise<boolean> => {
      const patch = deleteSavedPresetPatch(draft, id);
      const next = mergeChatPreferences(draft, patch);
      setDraft(next);
      return savePrefs(patch);
    },
    [draft, savePrefs],
  );

  const resetDraft = useCallback(() => setDraft(prefs), [prefs]);

  const value = useMemo(
    () => ({
      prefs,
      loading,
      draft,
      setDraft,
      applyPreset,
      savePrefs,
      saveCustomPreset,
      deleteSavedPreset,
      resetDraft,
    }),
    [prefs, loading, draft, applyPreset, savePrefs, saveCustomPreset, deleteSavedPreset, resetDraft],
  );

  return <ChatPreferencesContext.Provider value={value}>{children}</ChatPreferencesContext.Provider>;
}
