import { ExternalLink } from "lucide-react";
import type { MetaAdImageReferenceSummary } from "@/lib/ppc/meta-ad-image-reference-types";
import { metaReferenceRoleLabel } from "@/lib/ppc/meta-ad-image-reference-types";

export type MetaAdsImageReferencesSectionProps = {
  references: MetaAdImageReferenceSummary[];
  title?: string;
};

function referenceSourceLabel(source: MetaAdImageReferenceSummary["source"]): string {
  return source === "neo-pulse-marketing" ? "NEO Pulse marketing" : "DataForSEO Google Images";
}

export function MetaAdsImageReferencesSection({
  references,
  title = "Instagram ad references",
}: MetaAdsImageReferencesSectionProps) {
  if (!references.length) {
    return (
      <div className="space-y-1 px-3 py-2">
        <p className="text-base text-muted-foreground">{title}</p>
        <p className="text-base text-foreground">No reference ads were attached for this run.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-3 py-2">
      <p className="text-base text-muted-foreground">{title}</p>
      <ul className="space-y-3">
        {references.map((ref) => {
          const preview = ref.previewDataUrl ?? ref.imageUrl;
          return (
            <li key={ref.id} className="space-y-2 bg-ui-field/50 p-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-base font-medium text-foreground">{ref.id}</span>
                <span className="text-base text-foreground">{metaReferenceRoleLabel(ref.role)}</span>
                <span className="text-base text-muted-foreground">{referenceSourceLabel(ref.source)}</span>
              </div>
              <p className="text-base text-foreground">
                <span className="text-muted-foreground">Query: </span>
                {ref.query}
              </p>
              {ref.visualDescription ? (
                <p className="text-base text-foreground">{ref.visualDescription}</p>
              ) : null}
              {ref.why ? (
                <p className="text-base text-muted-foreground">{ref.why}</p>
              ) : null}
              {ref.useFromImage?.length ? (
                <p className="text-base text-foreground">
                  <span className="text-muted-foreground">Use: </span>
                  {ref.useFromImage.join(" · ")}
                </p>
              ) : null}
              {ref.sourcePageUrl ? (
                <a
                  href={ref.sourcePageUrl.startsWith("http") ? ref.sourcePageUrl : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-base text-primary underline-offset-2 hover:underline"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  <span>{ref.sourcePageUrl}</span>
                </a>
              ) : null}
              {preview ? (
                <img
                  src={preview}
                  alt=""
                  className="max-h-48 w-auto max-w-full object-contain bg-ui-field"
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
