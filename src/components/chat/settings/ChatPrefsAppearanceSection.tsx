import React from "react";
import { CHAT_ACCENT_OPTIONS } from "@/lib/chat-preferences-presets";
import type { ChatLayoutMode, ChatUserPreferences } from "@/lib/chat-preferences-types";
import { Button, CheckField } from "@/ui";

type Props = {
  draft: ChatUserPreferences;
  onChange: (patch: Partial<ChatUserPreferences["appearance"]>) => void;
};

function ToggleRow({
  label,
  checked,
  onChecked,
}: {
  label: string;
  checked: boolean;
  onChecked: (v: boolean) => void;
}): React.ReactElement {
  return (
    <CheckField label={label} checked={checked} onCheckedChange={onChecked} />
  );
}

export function ChatPrefsAppearanceSection({ draft, onChange }: Props): React.ReactElement {
  const { appearance } = draft;

  const setSidebar = (key: keyof typeof appearance.sidebarSections, value: boolean) => {
    onChange({
      sidebarSections: { ...appearance.sidebarSections, [key]: value },
    });
  };

  const setLayoutMode = (mode: ChatLayoutMode) => {
    if (mode === "minimal") {
      onChange({
        layoutMode: "minimal",
        zoneThemes: { left: "slack", main: "slack", right: "slack" },
        headingTheme: "slack",
      });
    } else {
      onChange({ layoutMode: "default" });
    }
  };

  return (
    <section className="space-y-4">
      <h3 className="text-base font-semibold">Layout</h3>
      <div className="space-y-2">
        <p className="text-base text-muted-foreground">Layout mode</p>
        <div className="flex gap-2">
          {(["default", "minimal"] as const).map((mode) => (
            <Button
              pressed={appearance.layoutMode === mode}
              key={mode}
              onClick={() => setLayoutMode(mode)}
            >
              {mode === "default" ? "Default" : "Minimal"}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-base text-muted-foreground">Accent</p>
        <div className="flex flex-wrap gap-2">
          {CHAT_ACCENT_OPTIONS.map((accent) => (
            <Button
              pressed={appearance.accentPreset === accent.id}
              variant="quiet"
              key={accent.id}
              aria-label={accent.id}
              onClick={() => onChange({ accentPreset: accent.id })}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        {(["comfortable", "compact"] as const).map((density) => (
          <Button
            pressed={appearance.density === density}
            key={density}
            onClick={() => onChange({ density })}
          >
            {density}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        {(["default", "large"] as const).map((scale) => (
          <Button
            pressed={appearance.fontScale === scale}
            key={scale}
            onClick={() => onChange({ fontScale: scale })}
          >
            {scale === "default" ? "Default" : "Large"}
          </Button>
        ))}
      </div>
      <div className="space-y-1">
        <p className="text-base text-muted-foreground">Sidebar sections</p>
        <ToggleRow label="Channels" checked={appearance.sidebarSections.channels} onChecked={(v) => setSidebar("channels", v)} />
        <ToggleRow label="DMs" checked={appearance.sidebarSections.dms} onChecked={(v) => setSidebar("dms", v)} />
        <ToggleRow label="Mentions" checked={appearance.sidebarSections.mentions} onChecked={(v) => setSidebar("mentions", v)} />
      </div>
    </section>
  );
}
