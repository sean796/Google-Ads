import { ImageGeneratorChecklistPanel } from "@/components/generator/image/ImageGeneratorChecklistPanel";
import { ImageGeneratorPreviewPanel } from "@/components/generator/image/ImageGeneratorPreviewPanel";
import { ImageGeneratorSettingsPanel } from "@/components/generator/image/ImageGeneratorSettingsPanel";
import { ImageReferenceUploadPanel } from "@/components/generator/image/ImageReferenceUploadPanel";
import type { UseImageGeneratorResult } from "@/components/generator/image/image-generator-types";

type ImageGeneratorBodyProps = {
  generator: UseImageGeneratorResult;
  hideHeader?: boolean;
};

export function ImageGeneratorBody({ generator, hideHeader = false }: ImageGeneratorBodyProps) {
  const isSolo = generator.imageSourceMode === "solo";

  return (
    <div className="flex h-full flex-col space-y-4 p-6">
      {!hideHeader ? (
        <div>
          <h2 className="mb-2 text-xl font-semibold text-foreground">Image Generator</h2>
          <p className="text-base text-muted-foreground">
            {isSolo
              ? "Enter a keyword. Solo grounds on gathered Google Images sources and does not invent extra scene details."
              : "Generate an image based on your blueprint. Choose featured content or a specific section as inspiration."}
          </p>
        </div>
      ) : null}

      <ImageGeneratorSettingsPanel {...generator} />

      {!isSolo ? (
        <ImageGeneratorChecklistPanel
          hasGeneratedChecklist={generator.hasGeneratedChecklist}
          imageChecklist={generator.imageChecklist}
          isGeneratingChecklist={generator.isGeneratingChecklist}
          hasApiKey={generator.hasApiKey}
          onRegenerateChecklist={() => void generator.handleGenerateChecklist()}
        />
      ) : null}

      <ImageReferenceUploadPanel
        manualReferences={generator.manualReferences}
        isPreparingReferences={generator.isPreparingReferences}
        disabled={generator.isGenerating || generator.isGeneratingChecklist}
        onAddFiles={(files) => void generator.addManualReferences(files)}
        onRemoveReference={generator.removeManualReference}
      />

      <ImageGeneratorPreviewPanel
        imageDisplayUrl={generator.imageDisplayUrl}
        error={generator.error}
        hasApiKey={generator.hasApiKey}
        onImageError={generator.handlePreviewError}
        referenceResearch={generator.referenceResearch}
      />
    </div>
  );
}
