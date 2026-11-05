import { useEffect, useState } from "react";
import { Button, DialogShell } from "@/ui";
import { MetaAdsVisualSettingsPanel } from "@/components/ppc/meta/MetaAdsVisualSettingsPanel";
import { cloneVisualToolPalette } from "@/lib/ppc/meta-ad-visual-tool-palette";
import { resolveMetaTypographyStyle } from "@/lib/ppc/meta-ad-typography-styles";
import type {
  MetaAdColorPalette,
  MetaAdTypographyStyle,
  MetaAdVisualToolPalette,
  MetaGenerateConfig,
} from "@/lib/ppc/meta-ads-types";

export type MetaAdsWorkspaceDefaultsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generateConfig: MetaGenerateConfig;
  disabled?: boolean;
  onSave: (defaults: {
    defaultColorPalette: MetaAdColorPalette;
    defaultVisualToolPalette: MetaAdVisualToolPalette;
    defaultTypographyStyle: MetaAdTypographyStyle;
  }) => void;
};

export function MetaAdsWorkspaceDefaultsDialog({
  open,
  onOpenChange,
  generateConfig,
  disabled = false,
  onSave,
}: MetaAdsWorkspaceDefaultsDialogProps) {
  const [draftColors, setDraftColors] = useState<MetaAdColorPalette>(() => ({
    ...generateConfig.defaultColorPalette,
  }));
  const [draftTools, setDraftTools] = useState<MetaAdVisualToolPalette>(() =>
    cloneVisualToolPalette(generateConfig.defaultVisualToolPalette),
  );
  const [draftTypographyStyle, setDraftTypographyStyle] = useState<MetaAdTypographyStyle>(() =>
    resolveMetaTypographyStyle(generateConfig.defaultTypographyStyle),
  );

  useEffect(() => {
    if (!open) return;
    setDraftColors({ ...generateConfig.defaultColorPalette });
    setDraftTools(cloneVisualToolPalette(generateConfig.defaultVisualToolPalette));
    setDraftTypographyStyle(resolveMetaTypographyStyle(generateConfig.defaultTypographyStyle));
  }, [
    generateConfig.defaultColorPalette,
    generateConfig.defaultVisualToolPalette,
    generateConfig.defaultTypographyStyle,
    open,
  ]);

  const handleSave = () => {
    onSave({
      defaultColorPalette: { ...draftColors },
      defaultVisualToolPalette: cloneVisualToolPalette(draftTools),
      defaultTypographyStyle: draftTypographyStyle,
    });
    onOpenChange(false);
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Workspace defaults"
      actions={
        <>
          <Button variant="tool" disabled={disabled} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="run" disabled={disabled} onClick={handleSave}>
            Save
          </Button>
        </>
      }
    >
      <MetaAdsVisualSettingsPanel
        colorPalette={draftColors}
        visualToolPalette={draftTools}
        typographyStyle={draftTypographyStyle}
        disabled={disabled}
        onColorPaletteChange={setDraftColors}
        onVisualToolPaletteChange={setDraftTools}
        onTypographyStyleChange={setDraftTypographyStyle}
      />
    </DialogShell>
  );
}
