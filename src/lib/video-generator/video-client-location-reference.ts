import type { ManualImageReference } from "@/lib/image-generator/manual-reference-upload";
import type { VideoScenePlan } from "./video-generator-types";

/** Paste into any Video Studio brief when the job is a real client location commercial. */
export const CLIENT_LOCATION_COMMERCIAL_BRIEF_BLOCK = `Client location commercial (mandatory when reference photos are attached):
Use uploaded storefront, showroom, or interior photos as ground truth, not inspiration. Replicate the real location at 1:1: same building materials, sign copy and logo placement, door and window layout, awning, landscaping, and overall camera angle family. Do not invent a generic strip mall, fictional signage, or simplified architecture. Assign each location scene referenceIndexes to the matching upload. Motion may be cinematic; the built environment and branding must match the references.`;

export function sceneBeatReferenceDataUrls(
  scene: VideoScenePlan,
  briefReferences: ManualImageReference[],
): string[] {
  if (scene.postCutReferenceDataUrl?.startsWith("data:image/")) {
    return [scene.postCutReferenceDataUrl];
  }
  return scene.referenceIndexes.map((n) => {
    const ref = briefReferences[n - 1];
    if (!ref) throw new Error(`Upload ${n} was removed after the plan was written; regenerate the plan.`);
    return ref.dataUrl;
  });
}

export function clientLocationReferencePromptBlock(args: {
  fileName?: string;
  forEnvironmentPlate?: boolean;
}): string {
  const label = args.fileName?.trim() || "client location reference photo";
  const surface = args.forEnvironmentPlate
    ? "Environment Plate (empty of people and products unless they appear in the reference as fixed set dressing)"
    : "storyboard opening frame";
  return `
Client location reference (${label}) — MANDATORY 1:1 replication for this ${surface}:
Match the reference photograph exactly for facade or interior architecture, sign copy, logo placement, brand colors on signage, door and window positions, awning or canopy shape, pavement, and landscaping. Do not substitute a generic building, do not redesign the sign, and do not mirror-flip the storefront left-for-right. Camera may dolly or drift only within the same viewing direction family as the reference.`;
}
