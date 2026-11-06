import { useState, useEffect, useCallback } from "react";
import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_CONTENT_CLEARED,
  NOTIFY_PLEASE_ENTER_A_PROFILE_NAME,
  NOTIFY_PLEASE_SELECT_A_PROFILE_TO_UPDATE,
  NOTIFY_PROFILE_SAVED,
  NOTIFY_PROFILE_UPDATED,
} from "@/lib/notify-messages";
import type { KnowledgeProfile, StoredFile } from "@/lib/knowledge-base/types";
import { KB_PROFILES_STORAGE_KEY } from "@/lib/knowledge-base/storage";

export function useKnowledgeBaseProfiles({
  currentFiles,
  onManualContentUpdate,
}: {
  currentFiles: StoredFile[];
  onManualContentUpdate: (content: string) => void;
}) {
  const [profiles, setProfiles] = useState<KnowledgeProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState("");
  const [newProfileName, setNewProfileName] = useState("");
  const [manualContent, setManualContent] = useState("");

  useEffect(() => {
    const storedProfiles = localStorage.getItem(KB_PROFILES_STORAGE_KEY);
    if (storedProfiles) {
      try {
        setProfiles(JSON.parse(storedProfiles) as KnowledgeProfile[]);
      } catch (e) {
        console.error("Error loading profiles:", e);
      }
    }
  }, [currentFiles]);

  useEffect(() => {
    if (selectedProfile) {
      const profile = profiles.find((p) => p.id === selectedProfile);
      if (profile) {
        setManualContent(profile.content);
      }
    }
  }, [selectedProfile, profiles]);

  useEffect(() => {
    onManualContentUpdate(manualContent);
  }, [manualContent, onManualContentUpdate]);

  const saveProfile = useCallback(
    (isNew: boolean) => {
      if (isNew && !newProfileName.trim()) {
        notify.error(NOTIFY_PLEASE_ENTER_A_PROFILE_NAME);
        return;
      }

      if (isNew) {
        const newProfile: KnowledgeProfile = {
          id: `profile-${Date.now()}`,
          name: newProfileName.trim(),
          content: manualContent,
        };
        const updated = [...profiles, newProfile];
        setProfiles(updated);
        localStorage.setItem(KB_PROFILES_STORAGE_KEY, JSON.stringify(updated));
        setSelectedProfile(newProfile.id);
        setNewProfileName("");
        notify.success(NOTIFY_PROFILE_SAVED);
      } else {
        if (!selectedProfile) {
          notify.error(NOTIFY_PLEASE_SELECT_A_PROFILE_TO_UPDATE);
          return;
        }
        const updated = profiles.map((p) =>
          p.id === selectedProfile ? { ...p, content: manualContent } : p,
        );
        setProfiles(updated);
        localStorage.setItem(KB_PROFILES_STORAGE_KEY, JSON.stringify(updated));
        notify.success(NOTIFY_PROFILE_UPDATED);
      }
    },
    [newProfileName, manualContent, profiles, selectedProfile],
  );

  const clearContent = useCallback(() => {
    setManualContent("");
    notify.success(NOTIFY_CONTENT_CLEARED);
  }, []);

  return {
    profiles,
    selectedProfile,
    setSelectedProfile,
    newProfileName,
    setNewProfileName,
    manualContent,
    setManualContent,
    saveProfile,
    clearContent,
  };
}
