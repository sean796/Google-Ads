import { ExternalLink } from "lucide-react";
import { WorkspaceDetailsPipelineSteps } from "@/components/shared/WorkspaceDetailsPipelineSteps";
import { WorkspaceDetailsStack } from "@/components/shared/WorkspaceDetailsStack";
import type { PpcGenerateProgressState } from "@/lib/ppc/google-ads-progress-types";
import type { PpcPageBucketHostedLink } from "@/lib/ppc/ppc-page-bucket-inventory";

export type GoogleAdsDetailsPanelProps = {
  generateProgress: PpcGenerateProgressState | null;
  isGenerating: boolean;
  isPublishing?: boolean;
  pageBucketHostedLink?: PpcPageBucketHostedLink | null;
};

function PageBucketJsonLink({ link }: { link: PpcPageBucketHostedLink }) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1 text-primary underline-offset-2 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink className="h-4 w-4" aria-hidden />
      <span>JSON</span>
      <span className="text-muted-foreground">({link.rowCount})</span>
    </a>
  );
}

export function GoogleAdsDetailsPanel({
  generateProgress,
  isGenerating,
  isPublishing = false,
  pageBucketHostedLink,
}: GoogleAdsDetailsPanelProps) {
  const hasSteps = Boolean(generateProgress?.steps.length);

  return (
    <WorkspaceDetailsStack>
      {!hasSteps ? (
        <>
          {pageBucketHostedLink ? (
            <div className="px-2.5 py-2 sm:px-3">
              <PageBucketJsonLink link={pageBucketHostedLink} />
            </div>
          ) : null}
          <p className="px-3 py-2 text-base text-muted-foreground">
            {isGenerating
              ? "Starting campaign generation…"
              : isPublishing
                ? "Starting campaign publish…"
                : "No generation or publish run yet."}
          </p>
        </>
      ) : (
        <WorkspaceDetailsPipelineSteps
          steps={generateProgress!.steps}
          renderTrailing={(step) =>
            (step.id === "load-wp" || step.id === "shared-load-wp") && pageBucketHostedLink ? (
              <PageBucketJsonLink link={pageBucketHostedLink} />
            ) : null
          }
        />
      )}
    </WorkspaceDetailsStack>
  );
}