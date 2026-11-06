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

type ChatPreferencesContextValue = {
  prefs: ChatUserPreferences;
  loading: boolean;
  draft: ChatUserPreferences;
  setDraft: React.Dispatch<React.SetStateAction<ChatUserPreferences>>;
  applyPreset: (id: ChatBuiltinPresetId | string) => void;
  savePrefs: (patch?: ChatPreferencesPatch) => Promise<boolean>;
  saveCustomPreset: (name: string) => Promise<boolean>;
  deleteSavedPreset: (id: string) => Promise<boolean>;
  resetDraft: () => void;
};

export const ChatPreferencesContext = createContext<ChatPreferencesContextValue | null>(null);

export function readCachedPrefs(teamId: number): ChatUserPreferences | null {
  try {
    const raw = localStorage.getItem(prefsLocalStorageKey(teamId));
    if (!raw) return null;
    return normalizeChatPreferences(JSON.parse(raw) as ChatUserPreferences);
  } catch {
    return null;
  }
}

export function writeCachedPrefs(teamId: number, prefs: ChatUserPreferences): void {
  try {
    localStorage.setItem(prefsLocalStorageKey(teamId), JSON.stringify(prefs));
  } catch {
    // ignore quota errors
  }
}

export function prefsToPatch(p: ChatUserPreferences): ChatPreferencesPatch {
  return {
    activePresetId: p.activePresetId,
    profile: p.profile,
    appearance: p.appearance,
    notifications: p.notifications,
    behavior: p.behavior,
    savedPresets: p.savedPresets,
  };
}



export function useChatPreferences(): ChatPreferencesContextValue {
  const ctx = useContext(ChatPreferencesContext);
  if (!ctx) throw new Error("useChatPreferences must be used within ChatPreferencesProvider");
  return ctx;
}
