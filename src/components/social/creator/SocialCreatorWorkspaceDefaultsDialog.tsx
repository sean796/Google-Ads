import { useEffect, useState } from "react";
import { Button, DialogShell } from "@/ui";
import { SocialCreatorVisualSettingsPanel } from "@/components/social/creator/SocialCreatorVisualSettingsPanel";
import { cloneVisualToolPalette } from "@/lib/ppc/meta-ad-visual-tool-palette";
import { resolveMetaTypographyStyle } from "@/lib/ppc/meta-ad-typography-styles";
import type {
  MetaAdColorPalette,
  MetaAdTypographyStyle,
  MetaAdVisualToolPalette,
  SocialGenerateConfig,
  SocialVisualToolMode,
} from "@/lib/social/social-creator-types";

export type SocialCreatorWorkspaceDefaultsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generateConfig: SocialGenerateConfig;
  disabled?: boolean;
  onSave: (defaults: {
    defaultColorPalette: MetaAdColorPalette;
    defaultVisualToolPalette: MetaAdVisualToolPalette;
    defaultVisualToolMode: SocialVisualToolMode;
    defaultTypographyStyle: MetaAdTypographyStyle;
  }) => void;
};

export function SocialCreatorWorkspaceDefaultsDialog({
  open,
  onOpenChange,
  generateConfig,
  disabled = false,
  onSave,
}: SocialCreatorWorkspaceDefaultsDialogProps) {
  const [draftColors, setDraftColors] = useState<MetaAdColorPalette>(() => ({
    ...generateConfig.defaultColorPalette,
  }));
  const [draftTools, setDraftTools] = useState<MetaAdVisualToolPalette>(() =>
    cloneVisualToolPalette(generateConfig.defaultVisualToolPalette),
  );
  const [draftVisualToolMode, setDraftVisualToolMode] = useState<SocialVisualToolMode>(
    () => generateConfig.defaultVisualToolMode,
  );
  const [draftTypographyStyle, setDraftTypographyStyle] = useState<MetaAdTypographyStyle>(() =>
    resolveMetaTypographyStyle(generateConfig.defaultTypographyStyle),
  );

  useEffect(() => {
    if (!open) return;
    setDraftColors({ ...generateConfig.defaultColorPalette });
    setDraftTools(cloneVisualToolPalette(generateConfig.defaultVisualToolPalette));
    setDraftVisualToolMode(generateConfig.defaultVisualToolMode);
    setDraftTypographyStyle(resolveMetaTypographyStyle(generateConfig.defaultTypographyStyle));
  }, [
    generateConfig.defaultColorPalette,
    generateConfig.defaultVisualToolPalette,
    generateConfig.defaultVisualToolMode,
    generateConfig.defaultTypographyStyle,
    open,
  ]);

  const handleSave = () => {
    onSave({
      defaultColorPalette: { ...draftColors },
      defaultVisualToolPalette: cloneVisualToolPalette(draftTools),
      defaultVisualToolMode: draftVisualToolMode,
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
      <SocialCreatorVisualSettingsPanel
        colorPalette={draftColors}
        visualToolPalette={draftTools}
        visualToolMode={draftVisualToolMode}
        typographyStyle={draftTypographyStyle}
        disabled={disabled}
        onColorPaletteChange={setDraftColors}
        onVisualToolPaletteChange={setDraftTools}
        onVisualToolModeChange={setDraftVisualToolMode}
        onTypographyStyleChange={setDraftTypographyStyle}
      />
    </DialogShell>
  );
}
