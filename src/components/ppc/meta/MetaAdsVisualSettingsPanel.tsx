
import { MetaAdsVisualToolPaletteField } from "@/components/ppc/meta/MetaAdsVisualToolPaletteField";
import {
  META_VISUAL_CELL_CLASS,
  META_VISUAL_GRID_CLASS,
  META_VISUAL_TEXTAREA_CLASS,
  metaVisualSettingsRowClass,
} from "@/components/ppc/meta/meta-ads-visual-settings-layout";
import type { MetaAdColorPalette, MetaAdTypographyStyle, MetaAdVisualToolPalette } from "@/lib/ppc/meta-ads-types";
import { cn } from "@/lib/utils";
import { TextareaField } from "@/ui";

export type MetaAdsVisualSettingsPanelProps = {
  colorPalette: MetaAdColorPalette;
  visualToolPalette: MetaAdVisualToolPalette;
  typographyStyle?: MetaAdTypographyStyle;
  visualNote?: string;
  stripeRowOffset?: number;
  disabled?: boolean;
  onColorPaletteChange: (palette: MetaAdColorPalette) => void;
  onVisualToolPaletteChange: (palette: MetaAdVisualToolPalette) => void;
  onTypographyStyleChange?: (style: MetaAdTypographyStyle) => void;
  onVisualNoteChange?: (note: string) => void;
  onResetToWorkspace?: () => void;
};

export function MetaAdsVisualSettingsPanel({
  colorPalette,
  visualToolPalette,
  typographyStyle,
  visualNote,
  stripeRowOffset = 0,
  disabled = false,
  onColorPaletteChange,
  onVisualToolPaletteChange,
  onTypographyStyleChange,
  onVisualNoteChange,
  onResetToWorkspace,
}: MetaAdsVisualSettingsPanelProps) {
  const promptRowIndex = stripeRowOffset;
  const toolsRowOffset = stripeRowOffset + (onVisualNoteChange ? 1 : 0);

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

      <MetaAdsVisualToolPaletteField
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
    </div>
  );
}
