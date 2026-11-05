import { CheckCircle2, Image as ImageIcon } from "lucide-react";
import { BULK_HEADER_RUN_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

type ImageGeneratorRunButtonProps = {
  hasApiKey: boolean;
  hasGeneratedChecklist: boolean;
  isGeneratingChecklist: boolean;
  isGenerating: boolean;
  workspaceBusy?: boolean;
  /** Solo mode: generate from keyword with no checklist or reference images. */
  skipChecklist?: boolean;
  className?: string;
  onGenerateChecklist: () => void;
  onGenerateImage: () => void;
};

export function ImageGeneratorRunButton({
  hasApiKey,
  hasGeneratedChecklist,
  isGeneratingChecklist,
  isGenerating,
  workspaceBusy = false,
  skipChecklist = false,
  className,
  onGenerateChecklist,
  onGenerateImage,
}: ImageGeneratorRunButtonProps) {
  const busy = isGeneratingChecklist || isGenerating;
  const disabled = workspaceBusy || busy || !hasApiKey;
  const btnClass = cn(BULK_HEADER_RUN_BTN, className);

  if (!skipChecklist && !hasGeneratedChecklist) {
    return (
      <Button
        variant="run"
        type="button"
        disabled={disabled}
        aria-label="Checklist"
        title="Generate image checklist"
        onClick={onGenerateChecklist}
      >
        {isGeneratingChecklist ? (
          null
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        )}
        Checklist
      </Button>
    );
  }

  return (
    <Button
      variant="run"
      type="button"
      disabled={disabled}
      aria-label="Image"
      title="Generate image"
      onClick={onGenerateImage}
    >
      {isGenerating ? (
        null
      ) : (
        <ImageIcon className="h-4 w-4 shrink-0" aria-hidden />
      )}
      Image
    </Button>
  );
}
