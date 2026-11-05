import React from "react";
import { CHAT_THEME_OPTIONS } from "@/lib/chat-preferences-presets";
import type { ChatThemeId, ChatUserPreferences } from "@/lib/chat-preferences-types";
import { themePreviewMutedStyle, themePreviewStyle } from "@/lib/chat-theme-palettes";
import { Button, SwatchButton } from "@/ui";

type Props = {
  draft: ChatUserPreferences;
  onChange: (patch: Partial<ChatUserPreferences["appearance"]>) => void;
};

type ZoneKey = "left" | "main" | "right";

function ThemePickerGrid({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: ChatThemeId;
  onSelect: (id: ChatThemeId) => void;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      <p className="text-base font-semibold">{label}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CHAT_THEME_OPTIONS.map((theme) => (
          <SwatchButton
            key={theme.id}
            onClick={() => onSelect(theme.id)}
            selected={value === theme.id}
            swatch={themePreviewStyle(theme.id)}
          >
            <span className="block font-semibold">{theme.label}</span>
            <span className="block text-base" style={themePreviewMutedStyle(theme.id)}>
              Aa
            </span>
          </SwatchButton>
        ))}
      </div>
    </div>
  );
}

export function ChatPrefsZoneThemesSection({ draft, onChange }: Props): React.ReactElement {
  const { appearance } = draft;
  const { zoneThemes } = appearance;

  const setZone = (zone: ZoneKey, themeId: ChatThemeId) => {
    onChange({ zoneThemes: { ...zoneThemes, [zone]: themeId } });
  };

  const applyToAllZones = () => {
    const source = zoneThemes.left;
    onChange({
      zoneThemes: { left: source, main: source, right: source },
    });
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Zone themes</h3>
        <Button type="button" onClick={applyToAllZones}>
          Apply to all zones
        </Button>
      </div>
      <ThemePickerGrid label="Left sidebar" value={zoneThemes.left} onSelect={(id) => setZone("left", id)} />
      <ThemePickerGrid label="Main chat" value={zoneThemes.main} onSelect={(id) => setZone("main", id)} />
      <ThemePickerGrid label="Right sidebar" value={zoneThemes.right} onSelect={(id) => setZone("right", id)} />
      <ThemePickerGrid
        label="Headings"
        value={appearance.headingTheme}
        onSelect={(headingTheme) => onChange({ headingTheme })}
      />
    </section>
  );
}
