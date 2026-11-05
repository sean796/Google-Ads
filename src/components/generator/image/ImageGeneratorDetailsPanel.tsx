
import type { ImageReferenceProvenance } from "@/components/generator/image/image-generator-types";

type ImageGeneratorDetailsPanelProps = {
  isGenerating: boolean;
  isGeneratingChecklist: boolean;
  error: string | null;
  imageSourceMode: string;
  referenceResearch: ImageReferenceProvenance | null;
};

export function ImageGeneratorDetailsPanel({
  isGenerating,
  isGeneratingChecklist,
  error,
  imageSourceMode,
  referenceResearch,
}: ImageGeneratorDetailsPanelProps) {
  const status = isGeneratingChecklist
    ? "Building checklist…"
    : isGenerating
      ? "Gathering references and generating image…"
      : error
        ? error
        : referenceResearch
          ? "Ready"
          : "Run Image to gather Google Images sources.";

  return (
    <div className="space-y-4 p-3 text-base text-foreground">
      <div className="space-y-1">
        <label className="text-base font-semibold text-foreground">Status</label>
        <p className="text-base text-muted-foreground">{status}</p>
        <p className="text-base text-muted-foreground">Mode: {imageSourceMode}</p>
      </div>

      {referenceResearch ? (
        <div className="space-y-3">
          <label className="text-base font-semibold text-foreground">
            Google Images references
          </label>
          <p className="text-base text-muted-foreground">
            Grounding: {referenceResearch.mode}
            {referenceResearch.queries.length
              ? ` · Queries: ${referenceResearch.queries.join(", ")}`
              : ""}
          </p>
          {referenceResearch.references.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {referenceResearch.references.map((ref) => (
                <div key={`${ref.query}-${ref.imageUrl}`} className="space-y-2 bg-black p-3">
                  {ref.previewDataUrl || ref.imageUrl ? (
                    <img
                      src={ref.previewDataUrl || ref.imageUrl}
                      alt={`Reference for ${ref.query}`}
                      className="max-h-36 w-full object-contain"
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
                  {ref.sourceUrl ? (
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
          {referenceResearch.spatialLayout ? (
            <div className="space-y-1 bg-black p-3">
              <label className="text-base font-semibold text-foreground">
                Spatial layout contract
              </label>
              <pre className="whitespace-pre-wrap font-sans text-base text-muted-foreground">
                {referenceResearch.spatialLayout}
              </pre>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-base text-muted-foreground">No reference research yet.</p>
      )}
    </div>
  );
}
