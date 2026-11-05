import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SocialCreatorVisualSettingsPanel } from "@/components/social/creator/SocialCreatorVisualSettingsPanel";
import { BULK_HEADER_ICON_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { hasMetaColorPalette } from "@/lib/ppc/meta-ad-color-palette";
import {
  cloneVisualToolPalette,
  hasActiveVisualToolPalette,
} from "@/lib/ppc/meta-ad-visual-tool-palette";
import { rowHasManualVisualToolPalette } from "@/lib/ppc/meta-ad-visual-tool-themes";
import type { MetaAdColorPalette, SocialCreatorRow, MetaAdVisualToolPalette, SocialGenerateConfig } from "@/lib/social/social-creator-types";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

export type SocialCreatorRowVisualDialogProps = {
  row: SocialCreatorRow;
  generateConfig: SocialGenerateConfig;
  disabled?: boolean;
  onUpdateAd: (patch: Partial<SocialCreatorRow>) => void;
};

function rowHasVisualOverrides(row: SocialCreatorRow): boolean {
  return hasMetaColorPalette(row.colorPalette) || rowHasManualVisualToolPalette(row.visualToolPalette);
}

function effectiveRowColorPalette(row: SocialCreatorRow, generateConfig: SocialGenerateConfig): MetaAdColorPalette {
  if (hasMetaColorPalette(row.colorPalette)) {
    return { ...row.colorPalette! };
  }
  return { ...generateConfig.defaultColorPalette };
}

function effectiveRowVisualToolPalette(
  row: SocialCreatorRow,
  generateConfig: SocialGenerateConfig,
): MetaAdVisualToolPalette {
  if (row.visualToolPalette && hasActiveVisualToolPalette(row.visualToolPalette)) {
    return cloneVisualToolPalette(row.visualToolPalette);
  }
  return cloneVisualToolPalette(generateConfig.defaultVisualToolPalette);
}

export function SocialCreatorRowVisualDialog({
  row,
  generateConfig,
  disabled = false,
  onUpdateAd,
}: SocialCreatorRowVisualDialogProps) {
  const [open, setOpen] = useState(false);
  const [draftColors, setDraftColors] = useState<MetaAdColorPalette>(() =>
    effectiveRowColorPalette(row, generateConfig),
  );
  const [draftTools, setDraftTools] = useState<MetaAdVisualToolPalette>(() =>
    effectiveRowVisualToolPalette(row, generateConfig),
  );

  useEffect(() => {
    if (!open) return;
    setDraftColors(effectiveRowColorPalette(row, generateConfig));
    setDraftTools(effectiveRowVisualToolPalette(row, generateConfig));
  }, [generateConfig, open, row]);

  const hasOverrides = rowHasVisualOverrides(row);

  const handleSave = () => {
    onUpdateAd({
      colorPalette: { ...draftColors },
      visualToolPalette: cloneVisualToolPalette(draftTools),
    });
    setOpen(false);
  };

  const handleResetToWorkspace = () => {
    onUpdateAd({ colorPalette: undefined, visualToolPalette: undefined });
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="quiet"
        type="button"
        disabled={disabled}
        aria-label="Row visual controls"
        title="Colors and tool weights for this ad"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-2xl rounded-none border-0 bg-black p-6 text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-white">Row visual</DialogTitle>
          </DialogHeader>
          <SocialCreatorVisualSettingsPanel
            colorPalette={draftColors}
            visualToolPalette={draftTools}
            disabled={disabled}
            onColorPaletteChange={setDraftColors}
            onVisualToolPaletteChange={setDraftTools}
            onResetToWorkspace={handleResetToWorkspace}
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="quiet"
              type="button"
              disabled={disabled}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="run" type="button" disabled={disabled} onClick={handleSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
