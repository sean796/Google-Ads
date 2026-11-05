
import { ImageColorInputField } from "@/components/generator/image/ImageColorInputField";
import {
  META_VISUAL_COLORS_ACTION_CLASS,
  META_VISUAL_COLORS_FIELDS_CLASS,
  META_VISUAL_COLORS_ROW_CLASS,
  META_VISUAL_COLORS_SIDE_CLASS,
  META_VISUAL_CONTROL_SURFACE_CLASS,
  META_VISUAL_TOOL_LABEL_CLASS,
  metaVisualSettingsRowClass,
} from "@/components/social/creator/social-creator-visual-settings-layout";
import type { MetaAdColorPalette } from "@/lib/social/social-creator-types";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

export type SocialCreatorColorPaletteFieldProps = {
  value?: MetaAdColorPalette;
  rowOffset?: number;
  disabled?: boolean;
  onChange: (palette: MetaAdColorPalette | undefined) => void;
  onResetToWorkspace?: () => void;
};

export type MetaAdsColorColumnMode =
  | "heading"
  | "background"
  | "accent"
  | "primary"
  | "reset"
  | "empty";

const COLOR_LABELS: Record<"background" | "accent" | "primary", string> = {
  background: "Background",
  accent: "Accent",
  primary: "Primary text",
};

export function metaVisualColorColumnMode(dataRowIndex: number): MetaAdsColorColumnMode {
  if (dataRowIndex === 0) return "background";
  if (dataRowIndex === 1) return "accent";
  if (dataRowIndex === 2) return "primary";
  if (dataRowIndex === 4) return "reset";
  return "empty";
}

export function patchMetaColorPalette(
  current: MetaAdColorPalette | undefined,
  key: keyof MetaAdColorPalette,
  color: string,
): MetaAdColorPalette | undefined {
  const next: MetaAdColorPalette = { ...current };
  if (color.trim()) {
    next[key] = color;
  } else {
    delete next[key];
  }
  if (!next.background && !next.accent && !next.primary) return undefined;
  return next;
}

export function MetaAdsColorColumnCell({
  mode,
  value,
  disabled,
  onChange,
  onResetToWorkspace,
}: {
  mode: MetaAdsColorColumnMode;
  value?: MetaAdColorPalette;
  disabled?: boolean;
  onChange?: (palette: MetaAdColorPalette | undefined) => void;
  onResetToWorkspace?: () => void;
}) {
  if (mode === "empty") {
    return <div className="min-w-0" aria-hidden />;
  }

  if (mode === "heading") {
    return (
      <span className={cn(META_VISUAL_TOOL_LABEL_CLASS, "min-w-0")}>Colors</span>
    );
  }

  if (mode === "reset") {
    if (!onResetToWorkspace) {
      return <div className="min-w-0" aria-hidden />;
    }
    return (
      <div className="flex min-h-0 items-center justify-end">
        <Button
          variant="quiet"
          type="button"
          disabled={disabled}
          onClick={onResetToWorkspace}
        >
          Use workspace defaults
        </Button>
      </div>
    );
  }

  return (
    <ImageColorInputField
      label={COLOR_LABELS[mode]}
      layout="cell"
      value={value?.[mode] ?? ""}
      disabled={disabled}
      onChange={(color) => onChange?.(patchMetaColorPalette(value, mode, color))}
    />
  );
}

export function MetaAdsColorLabelRow({
  rowOffset,
  disabled,
  onResetToWorkspace,
}: {
  rowOffset: number;
  disabled?: boolean;
  onResetToWorkspace?: () => void;
}) {
  return (
    <div className={cn(metaVisualSettingsRowClass(rowOffset), META_VISUAL_COLORS_ROW_CLASS)}>
      <span className={cn(META_VISUAL_COLORS_SIDE_CLASS, "text-base font-semibold text-foreground")}>
        Colors
      </span>
      <div className={META_VISUAL_COLORS_FIELDS_CLASS}>
        {(["background", "accent", "primary"] as const).map((key) => (
          <span key={key} className={META_VISUAL_TOOL_LABEL_CLASS}>
            {COLOR_LABELS[key]}
          </span>
        ))}
      </div>
      {onResetToWorkspace ? (
        <Button
          variant="quiet"
          type="button"
          disabled={disabled}
          onClick={onResetToWorkspace}
        >
          Use workspace defaults
        </Button>
      ) : (
        <span aria-hidden className={META_VISUAL_COLORS_ACTION_CLASS} />
      )}
    </div>
  );
}

export function MetaAdsColorInputRow({
  rowOffset,
  value,
  disabled,
  onChange,
}: {
  rowOffset: number;
  value?: MetaAdColorPalette;
  disabled?: boolean;
  onChange: (palette: MetaAdColorPalette | undefined) => void;
}) {
  return (
    <div className={cn(metaVisualSettingsRowClass(rowOffset), META_VISUAL_COLORS_ROW_CLASS)}>
      <span aria-hidden className={META_VISUAL_COLORS_SIDE_CLASS} />
      <div className={META_VISUAL_COLORS_FIELDS_CLASS}>
        {(["background", "accent", "primary"] as const).map((key) => (
          <ImageColorInputField
            key={key}
            label={COLOR_LABELS[key]}
            layout="input"
            value={value?.[key] ?? ""}
            disabled={disabled}
            onChange={(color) => onChange(patchMetaColorPalette(value, key, color))}
          />
        ))}
      </div>
      <span aria-hidden className={META_VISUAL_COLORS_ACTION_CLASS} />
    </div>
  );
}

export function SocialCreatorColorPaletteField({
  value,
  rowOffset = 0,
  disabled,
  onChange,
  onResetToWorkspace,
}: SocialCreatorColorPaletteFieldProps) {
  return (
    <div>
      <MetaAdsColorLabelRow rowOffset={rowOffset} disabled={disabled} onResetToWorkspace={onResetToWorkspace} />
      <MetaAdsColorInputRow rowOffset={rowOffset + 1} value={value} disabled={disabled} onChange={onChange} />
    </div>
  );
}
