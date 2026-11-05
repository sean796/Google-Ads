
import { BULK_HEADER_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { ImageChecklistItem } from "@/lib/image-checklist-builder";
import { Button } from "@/ui";

type ImageGeneratorChecklistPanelProps = {
  hasGeneratedChecklist: boolean;
  imageChecklist: ImageChecklistItem[];
  isGeneratingChecklist: boolean;
  hasApiKey: boolean;
  onRegenerateChecklist: () => void;
};

export function ImageGeneratorChecklistPanel({
  hasGeneratedChecklist,
  imageChecklist,
  isGeneratingChecklist,
  hasApiKey,
  onRegenerateChecklist,
}: ImageGeneratorChecklistPanelProps) {
  if (!hasGeneratedChecklist || imageChecklist.length === 0) return null;

  return (
    <div className="space-y-4 bg-ui-field/50 p-4">
      <label className="text-base font-semibold text-foreground">Image Generation Checklist</label>
      <div className="space-y-4">
        {imageChecklist.map((item, index) => (
          <div key={index} className="space-y-1 pb-3 last:pb-0">
            <h4 className="text-base font-semibold leading-tight text-foreground">{item.title}</h4>
            <p className="pl-2 text-base leading-relaxed text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
      <Button
        variant="quiet"
        type="button"
        onClick={onRegenerateChecklist}
        disabled={isGeneratingChecklist || !hasApiKey}
      >
        {isGeneratingChecklist ? (
          <>
            
            Regenerating
          </>
        ) : (
          "Regenerate checklist"
        )}
      </Button>
    </div>
  );
}
