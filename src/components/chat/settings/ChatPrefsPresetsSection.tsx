import React from "react";
import { cn } from "@/lib/utils";
import { CHAT_BUILTIN_PRESETS } from "@/lib/chat-preferences-presets";
import type { ChatUserPreferences } from "@/lib/chat-preferences-types";
import { Button, Field } from "@/ui";

type Props = {
  draft: ChatUserPreferences;
  onApplyPreset: (id: string) => void;
  onSaveCustom: (name: string) => void;
  onDeleteSaved: (id: string) => void;
};

export function ChatPrefsPresetsSection({
  draft,
  onApplyPreset,
  onSaveCustom,
  onDeleteSaved,
}: Props): React.ReactElement {
  const [customName, setCustomName] = React.useState("");

  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Presets</h3>
      <div className="flex flex-wrap gap-2">
        {CHAT_BUILTIN_PRESETS.map((preset) => (
          <Button
            pressed={draft.activePresetId === preset.id}
            key={preset.id}
            type="button"
            onClick={() => onApplyPreset(preset.id)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      {draft.savedPresets.length > 0 ? (
        <div className="space-y-2">
          <p className="text-base text-muted-foreground">Saved presets</p>
          {draft.savedPresets.map((preset) => (
            <div key={preset.id} className="flex items-center gap-2">
              <Button
                pressed={draft.activePresetId === preset.id}
                variant="quiet"
                type="button"
                onClick={() => onApplyPreset(preset.id)}
              >
                {preset.name}
              </Button>
              <Button
                variant="quiet"
                type="button"
                onClick={() => onDeleteSaved(preset.id)}
              >
                Delete
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Field
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="Preset name"
        />
        <Button
          variant="run"
          type="button"
          disabled={!customName.trim()}
          onClick={() => {
            onSaveCustom(customName.trim());
            setCustomName("");
          }}
        >
          Save current
        </Button>
      </div>
    </section>
  );
}
