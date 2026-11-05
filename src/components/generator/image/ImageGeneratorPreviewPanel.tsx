import { Label } from "@/components/ui/label";
import type { ImageReferenceProvenance } from "@/components/generator/image/image-generator-types";

type ImageGeneratorPreviewPanelProps = {
  imageDisplayUrl: string | null;
  error: string | null;
  hasApiKey: boolean;
  onImageError: () => void;
  referenceResearch?: ImageReferenceProvenance | null;
};

export function ImageGeneratorPreviewPanel({
  imageDisplayUrl,
  error,
  hasApiKey,
  onImageError,
  referenceResearch = null,
}: ImageGeneratorPreviewPanelProps) {
  return (
    <div className="space-y-4">
      {!hasApiKey ? (
        <p className="text-base text-muted-foreground">
          Please set your OpenRouter API key in Settings to generate images.
        </p>
      ) : null}

      {error ? (
        <div className="bg-destructive/10 p-4">
          <p className="text-base text-destructive">{error}</p>
        </div>
      ) : null}

      {referenceResearch ? (
        <div className="space-y-3 bg-zinc-900/50 p-4">
          <Label className="text-base font-semibold text-foreground">
            References
          </Label>
          <p className="text-base text-muted-foreground">
            Mode: {referenceResearch.mode}
            {referenceResearch.queries.length
              ? ` · Queries: ${referenceResearch.queries.join(", ")}`
              : ""}
          </p>
          {referenceResearch.references.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {referenceResearch.references.map((ref, index) => (
                <div key={`${ref.query}-${ref.imageUrl || ref.previewDataUrl || index}`} className="space-y-2 bg-black p-3">
                  {(ref.previewDataUrl || ref.imageUrl) ? (
                    <img
                      src={ref.previewDataUrl || ref.imageUrl}
                      alt={`Reference for ${ref.query}`}
                      className="max-h-40 w-full object-contain"
                    />
                  ) : null}
                  <p className="text-base text-foreground">
                    {ref.layer ? `${ref.layer} · ` : ""}
                    {ref.kind}: {ref.query}
                  </p>
                  {ref.why ? (
                    <p className="text-base text-muted-foreground">{ref.why}</p>
                  ) : null}
                  {ref.useFromImage?.length ? (
                    <p className="text-base text-foreground">
                      USE: {ref.useFromImage.join("; ")}
                    </p>
                  ) : null}
                  {ref.ignoreFromImage?.length ? (
                    <p className="text-base text-muted-foreground">
                      DO NOT USE: {ref.ignoreFromImage.join("; ")}
                    </p>
                  ) : null}
                  {ref.sourceUrl && ref.query === "manual upload" ? (
                    <p className="text-base text-muted-foreground">{ref.sourceUrl}</p>
                  ) : ref.sourceUrl ? (
                    <a
                      href={ref.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all text-base text-primary underline-offset-2 hover:underline"
                    >
                      {ref.sourceUrl}
                    </a>
                  ) : ref.imageUrl ? (
                    <a
                      href={ref.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all text-base text-primary underline-offset-2 hover:underline"
                    >
                      {ref.imageUrl}
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-base text-muted-foreground">
              No grounded references (abstract or none passed fit).
            </p>
          )}
        </div>
      ) : null}

      {imageDisplayUrl ? (
        <div className="space-y-4 bg-zinc-900/50 p-4">
          <Label className="text-base font-semibold text-foreground">Generated Image</Label>
          <div className="relative flex items-center justify-center overflow-hidden bg-zinc-900">
            <img
              src={
                imageDisplayUrl.startsWith("data:")
                  ? imageDisplayUrl
                  : imageDisplayUrl.startsWith("http")
                    ? imageDisplayUrl
                    : `data:image/png;base64,${imageDisplayUrl}`
              }
              alt="Generated image"
              className="max-h-[600px] max-w-full object-contain"
              onError={onImageError}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
