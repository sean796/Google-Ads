

import { SocialCreatorColorPaletteField } from "@/components/social/creator/SocialCreatorColorPaletteField";
import { SocialCreatorDarkSelect } from "@/components/social/creator/SocialCreatorDarkSelect";
import { SocialCreatorVisualToolPaletteField } from "@/components/social/creator/SocialCreatorVisualToolPaletteField";
import {
  META_VISUAL_CELL_CLASS,
  META_VISUAL_GRID_CLASS,
  META_VISUAL_TEXTAREA_CLASS,
  metaVisualSettingsRowClass,
} from "@/components/social/creator/social-creator-visual-settings-layout";
import {
  META_TYPOGRAPHY_STYLES,
  resolveMetaTypographyStyle,
} from "@/lib/ppc/meta-ad-typography-styles";
import type {
  MetaAdColorPalette,
  MetaAdTypographyStyle,
  MetaAdVisualToolPalette,
  SocialVisualToolMode,
} from "@/lib/social/social-creator-types";
import { cn } from "@/lib/utils";
import { TextareaField, Switch } from "@/ui";

export type SocialCreatorVisualSettingsPanelProps = {
  colorPalette: MetaAdColorPalette;
  visualToolPalette: MetaAdVisualToolPalette;
  visualToolMode?: SocialVisualToolMode;
  typographyStyle?: MetaAdTypographyStyle;
  visualNote?: string;
  stripeRowOffset?: number;
  disabled?: boolean;
  onColorPaletteChange: (palette: MetaAdColorPalette) => void;
  onVisualToolPaletteChange: (palette: MetaAdVisualToolPalette) => void;
  onVisualToolModeChange?: (mode: SocialVisualToolMode) => void;
  onTypographyStyleChange?: (style: MetaAdTypographyStyle) => void;
  onVisualNoteChange?: (note: string) => void;
  onResetToWorkspace?: () => void;
};

export function SocialCreatorVisualSettingsPanel({
  colorPalette,
  visualToolPalette,
  visualToolMode,
  typographyStyle,
  visualNote,
  stripeRowOffset = 0,
  disabled = false,
  onColorPaletteChange,
  onVisualToolPaletteChange,
  onVisualToolModeChange,
  onTypographyStyleChange,
  onVisualNoteChange,
  onResetToWorkspace,
}: SocialCreatorVisualSettingsPanelProps) {
  const resolvedMode = visualToolMode ?? "fixed";
  const showModeControl = visualToolMode != null && onVisualToolModeChange != null;
  const promptRowIndex = stripeRowOffset;
  const modeRowIndex = stripeRowOffset + (onVisualNoteChange ? 1 : 0);
  const toolsRowOffset = showModeControl ? modeRowIndex + 1 : modeRowIndex;

  return (
    <div className="space-y-0">
      {onVisualNoteChange ? (
        <div
          className={cn(
            metaVisualSettingsRowClass(promptRowIndex),
            META_VISUAL_GRID_CLASS,
            "items-start",
          )}
        >
          <span className={cn(META_VISUAL_CELL_CLASS, "pt-2 text-base font-semibold text-foreground")}>
            Prompt Modifier
          </span>
          <TextareaField
            value={visualNote ?? ""}
            placeholder="Optional: what should the image show?"
            aria-label="Prompt Modifier"
            disabled={disabled}
            onChange={(e) => onVisualNoteChange(e.target.value)}
          />
        </div>
      ) : null}

      {showModeControl ? (
        <div
          className={cn(
            metaVisualSettingsRowClass(modeRowIndex),
            META_VISUAL_GRID_CLASS,
            "items-center",
          )}
        >
          <span className={cn(META_VISUAL_CELL_CLASS, "text-base font-semibold text-foreground")}>
            Random
          </span>
          <div className="col-span-3 flex items-center gap-3">
            <Switch
              checked={resolvedMode === "context"}
              disabled={disabled}
              aria-label="Random visuals per post"
              onCheckedChange={(checked) =>
                onVisualToolModeChange?.(checked ? "context" : "fixed")
              }
            />
            <span className="text-base text-muted-foreground">
              {resolvedMode === "context" ? "On (varies per post)" : "Off (use palette below)"}
            </span>
          </div>
        </div>
      ) : null}

      {resolvedMode === "fixed" ? (
        <SocialCreatorVisualToolPaletteField
          value={visualToolPalette}
          colorPalette={colorPalette}
          typographyStyle={typographyStyle}
          rowOffset={toolsRowOffset}
          disabled={disabled}
          onChange={onVisualToolPaletteChange}
          onColorPaletteChange={onColorPaletteChange}
          onTypographyStyleChange={onTypographyStyleChange}
          onResetToWorkspace={onResetToWorkspace}
        />
      ) : (
        <>
          <div className={cn(metaVisualSettingsRowClass(toolsRowOffset), META_VISUAL_GRID_CLASS)}>
            <span className={cn(META_VISUAL_CELL_CLASS, "text-base text-muted-foreground")}>Typography</span>
            <SocialCreatorDarkSelect
              value={resolveMetaTypographyStyle(typographyStyle)}
              disabled={disabled}
              ariaLabel="Typography style"
              options={META_TYPOGRAPHY_STYLES.map((style) => ({ value: style.id, label: style.label }))}
              onChange={(next) => onTypographyStyleChange?.(resolveMetaTypographyStyle(next))}
            />
          </div>
          <SocialCreatorColorPaletteField
            value={colorPalette}
            rowOffset={toolsRowOffset + 1}
            disabled={disabled}
            onChange={(next) => {
              if (next) onColorPaletteChange(next);
            }}
          />
        </>
      )}
    </div>
  );
}
