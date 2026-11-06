import type { PpcGenerateProgressState } from "@/lib/ppc/google-ads-progress-types";
import type { PpcPageBucketHostedLink } from "@/lib/ppc/ppc-page-bucket-inventory";

export function googleAdsDetailsCanOpen(
  generateProgress: PpcGenerateProgressState | null,
  isGenerating: boolean,
  pageBucketHostedLink?: PpcPageBucketHostedLink | null,
  isPublishing = false,
): boolean {
  return (
    Boolean(pageBucketHostedLink) ||
    isGenerating ||
    isPublishing ||
    Boolean(generateProgress?.steps.some((s) => s.status !== "waiting"))
  );
}
