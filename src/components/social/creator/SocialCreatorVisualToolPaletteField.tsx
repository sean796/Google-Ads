import { MetaAdsColorColumnCell } from "@/components/social/creator/SocialCreatorColorPaletteField";
import { metaVisualColorColumnMode } from "@/components/social/creator/social-visual-color-palette";
import {
  cloneVisualToolPalette,
  emptyVisualToolPalette,
  META_VISUAL_TOOL_KEYS,
  META_VISUAL_TOOL_LABELS,
  patchVisualToolWeight,
} from "@/lib/ppc/meta-ad-visual-tool-palette";
import {
  META_TYPOGRAPHY_STYLES,
  resolveMetaTypographyStyle,
  type MetaAdTypographyStyle,
} from "@/lib/ppc/meta-ad-typography-styles";
import type { MetaAdColorPalette, MetaAdVisualToolKey, MetaAdVisualToolPalette } from "@/lib/social/social-creator-types";
import { chunkMetaVisualToolKeys, META_VISUAL_TOOL_COL_HEADER_CLASS, META_VISUAL_TOOL_COLOR_STRIPE_CLASS, META_VISUAL_TOOL_HALF_GRID_CLASS, META_VISUAL_TOOL_ROW_LABEL_CLASS, META_VISUAL_TOOL_STYLE_SELECT_CLASS, META_VISUAL_TOOLS_PER_ROW, metaVisualSettingsRowClass } from "@/components/social/creator/social-creator-visual-settings-layout";
import { SocialCreatorDarkSelect } from "@/components/social/creator/SocialCreatorDarkSelect";
import { cn } from "@/lib/utils";
import { Field } from "@/ui";

export type SocialCreatorVisualToolPaletteFieldProps = {
  value: MetaAdVisualToolPalette;
  colorPalette?: MetaAdColorPalette;
  typographyStyle?: MetaAdTypographyStyle;
  rowOffset?: number;
  disabled?: boolean;
  onChange: (palette: MetaAdVisualToolPalette) => void;
  onColorPaletteChange?: (palette: MetaAdColorPalette) => void;
  onTypographyStyleChange?: (style: MetaAdTypographyStyle) => void;
  onResetToWorkspace?: () => void;
};

function formatWeight(value: number): string {
  return value.toFixed(2);
}

function parseWeightInput(raw: string): number {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function ToolHalfHeader({ showToolsLabel = false }: { showToolsLabel?: boolean }) {
  return (
    <div className={META_VISUAL_TOOL_HALF_GRID_CLASS}>
      {showToolsLabel ? (
        <span className={META_VISUAL_TOOL_ROW_LABEL_CLASS}>Tools</span>
      ) : (
        <span aria-hidden className="min-w-0" />
      )}
      <span aria-hidden className="min-w-0" />
      <span className={cn(META_VISUAL_TOOL_COL_HEADER_CLASS, "text-center")}>Degree</span>
    </div>
  );
}

function ToolHalfCells({
  toolKey,
  palette,
  typographyStyle,
  disabled,
  onChange,
  onTypographyStyleChange,
}: {
  toolKey: MetaAdVisualToolKey;
  palette: MetaAdVisualToolPalette;
  typographyStyle?: MetaAdTypographyStyle;
  disabled?: boolean;
  onChange: (palette: MetaAdVisualToolPalette) => void;
  onTypographyStyleChange?: (style: MetaAdTypographyStyle) => void;
}) {
  const weight = palette[toolKey];
  const label = META_VISUAL_TOOL_LABELS[toolKey];

  return (
    <div className={META_VISUAL_TOOL_HALF_GRID_CLASS}>
      <span className={META_VISUAL_TOOL_ROW_LABEL_CLASS}>{label}</span>
      {toolKey === "typography" ? (
        <SocialCreatorDarkSelect
          value={resolveMetaTypographyStyle(typographyStyle)}
          disabled={disabled}
          ariaLabel="Typography style"
          options={META_TYPOGRAPHY_STYLES.map((style) => ({ value: style.id, label: style.label }))}
          onChange={(next) => onTypographyStyleChange?.(resolveMetaTypographyStyle(next))}
        />
      ) : (
        <span aria-hidden className="min-w-0" />
      )}
      <Field
        size="count"
        placeholder="Degree"
        type="number"
        min={0}
        max={1}
        step={0.05}
        value={formatWeight(weight.degree)}
        disabled={disabled}
        aria-label={`${label} degree`}
        onChange={(e) =>
          onChange(patchVisualToolWeight(palette, toolKey, "degree", parseWeightInput(e.target.value)))
        }
      />
    </div>
  );
}

function EmptyToolHalf() {
  return <div className={META_VISUAL_TOOL_HALF_GRID_CLASS} aria-hidden />;
}

export function SocialCreatorVisualToolPaletteField({
  value,
  colorPalette,
  typographyStyle,
  rowOffset = 0,
  disabled,
  onChange,
  onColorPaletteChange,
  onTypographyStyleChange,
  onResetToWorkspace,
}: SocialCreatorVisualToolPaletteFieldProps) {
  const palette = value ?? emptyVisualToolPalette();
  const toolRows = chunkMetaVisualToolKeys(META_VISUAL_TOOL_KEYS, META_VISUAL_TOOLS_PER_ROW);
  const toolsDataOffset = rowOffset + 1;

  return (
    <div>
      <div className={cn(metaVisualSettingsRowClass(rowOffset), META_VISUAL_TOOL_COLOR_STRIPE_CLASS)}>
        <ToolHalfHeader showToolsLabel />
        <ToolHalfHeader />
        <MetaAdsColorColumnCell mode="heading" />
      </div>
      {toolRows.map((rowKeys, rowIndex) => {
        const leftKey = rowKeys[0];
        const rightKey = rowKeys[1];
        const colorMode = metaVisualColorColumnMode(rowIndex);

        return (
          <div
            key={`${leftKey ?? "empty"}-${rowIndex}`}
            className={cn(metaVisualSettingsRowClass(toolsDataOffset + rowIndex), META_VISUAL_TOOL_COLOR_STRIPE_CLASS)}
          >
            {leftKey ? (
              <ToolHalfCells
                toolKey={leftKey}
                palette={palette}
                typographyStyle={typographyStyle}
                disabled={disabled}
                onChange={onChange}
                onTypographyStyleChange={onTypographyStyleChange}
              />
            ) : (
              <EmptyToolHalf />
            )}
            {rightKey ? (
              <ToolHalfCells
                toolKey={rightKey}
                palette={palette}
                typographyStyle={typographyStyle}
                disabled={disabled}
                onChange={onChange}
                onTypographyStyleChange={onTypographyStyleChange}
              />
            ) : (
              <EmptyToolHalf />
            )}
            <MetaAdsColorColumnCell
              mode={colorMode}
              value={colorPalette}
              disabled={disabled}
              onResetToWorkspace={onResetToWorkspace}
              onChange={(next) => {
                if (next && onColorPaletteChange) onColorPaletteChange(next);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}