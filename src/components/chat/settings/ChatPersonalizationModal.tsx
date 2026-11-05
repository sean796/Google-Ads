import React, { useRef, useState } from "react";
import { Button, DialogShell, Field, FileInput, SelectField } from "@/ui";
import { useChatPreferences } from "@/hooks/use-chat-preferences";
import { CHAT_TIMEZONE_OPTIONS } from "@/lib/chat-preferences-presets";
import { mergeChatPreferences } from "@/lib/chat-preferences-types";
import { uploadChatAvatar } from "@/lib/chat-preferences-api";
import { useTeam } from "@/contexts/TeamContext";
import { ChatPrefsPresetsSection } from "@/components/chat/settings/ChatPrefsPresetsSection";
import { ChatPrefsZoneThemesSection } from "@/components/chat/settings/ChatPrefsZoneThemesSection";
import { ChatPrefsAppearanceSection } from "@/components/chat/settings/ChatPrefsAppearanceSection";
import { ChatPrefsNotificationsSection } from "@/components/chat/settings/ChatPrefsNotificationsSection";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ChatPersonalizationModal({ open, onOpenChange }: Props): React.ReactElement {
  const { activeTeam } = useTeam();
  const teamId = activeTeam?.id ?? null;
  const { draft, setDraft, applyPreset, savePrefs, saveCustomPreset, deleteSavedPreset, resetDraft } =
    useChatPreferences();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const updateDraft = (patch: Parameters<typeof mergeChatPreferences>[1]) => {
    setDraft((current) => mergeChatPreferences(current, patch));
  };

  const handleSave = async () => {
    if (!teamId) return;
    setSaving(true);
    try {
      await savePrefs();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (!teamId) return;
    setUploading(true);
    try {
      const result = await uploadChatAvatar(teamId, file);
      if (result.ok && result.avatarUrl) {
        updateDraft({ profile: { avatarUrl: result.avatarUrl } });
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (!next) resetDraft();
        onOpenChange(next);
      }}
      size="xl"
      title="Personalization"
      actions={
        <>
          <Button variant="tool" onClick={() => resetDraft()}>
            Reset
          </Button>
          <Button variant="run" disabled={saving} onClick={() => void handleSave()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-8">
          <ChatPrefsPresetsSection
            draft={draft}
            onApplyPreset={applyPreset}
            onSaveCustom={(name) => void saveCustomPreset(name)}
            onDeleteSaved={(id) => void deleteSavedPreset(id)}
          />
          <section className="flex flex-col gap-1.5">
            <h3 className="text-base font-semibold">Profile</h3>
            <div className="flex items-center gap-3">
              {draft.profile.avatarUrl ? (
                <img src={draft.profile.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ui-field text-base font-semibold">
                  {(draft.profile.displayName || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <FileInput
                ref={fileRef}
                                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleAvatarUpload(file);
                  e.target.value = "";
                }}
              />
              <Button variant="tool" disabled={uploading} onClick={() => fileRef.current?.click()}>
                Upload avatar
              </Button>
            </div>
            <Field
              placeholder="Display name"
              value={draft.profile.displayName}
              onChange={(e) => updateDraft({ profile: { displayName: e.target.value } })}
            />
            <Field
              placeholder="Status, what are you working on?"
              aria-label="Status"
              value={draft.profile.statusText}
              onChange={(e) => updateDraft({ profile: { statusText: e.target.value } })}
            />
            <SelectField
              placeholder="Timezone"
              width="full"
              value={draft.profile.timezone}
              options={CHAT_TIMEZONE_OPTIONS.map((tz) => ({ value: tz, label: tz }))}
              onValueChange={(tz) => updateDraft({ profile: { timezone: tz } })}
            />
            <Field
              placeholder="Avatar URL"
              value={draft.profile.avatarUrl ?? ""}
              onChange={(e) => updateDraft({ profile: { avatarUrl: e.target.value.trim() || null } })}
            />
          </section>
        </div>
        <div className="flex flex-col gap-8">
          <ChatPrefsZoneThemesSection draft={draft} onChange={(appearance) => updateDraft({ appearance })} />
          <ChatPrefsAppearanceSection draft={draft} onChange={(appearance) => updateDraft({ appearance })} />
          <ChatPrefsNotificationsSection
            draft={draft}
            onChangeNotifications={(notifications) => updateDraft({ notifications })}
            onChangeBehavior={(behavior) => updateDraft({ behavior })}
          />
        </div>
      </div>
    </DialogShell>
  );
}
