import type { ManualImageReference } from "@/lib/image-generator/manual-reference-upload";
import type { VideoBrief, VideoPlan, VideoScenePlan } from "./video-generator-types";
import { VIDEO_SCENE_MAX_SECONDS } from "./video-model-defaults";

/** Minimum clip length for reference-stills passthrough (more scenes per target length than 5 s Director default). */
export const REFERENCE_STILL_SCENE_MIN_SECONDS = 4;

/** Paste into any Video Studio brief when the job is a real client location commercial. */
export const CLIENT_LOCATION_COMMERCIAL_BRIEF_BLOCK = `Client location commercial (mandatory when reference photos are attached):
Use uploaded storefront, showroom, or interior photos as ground truth, not inspiration. Replicate the real location at 1:1: same building materials, sign copy and logo placement, door and window layout, awning, landscaping, and overall camera angle family. Do not invent a generic strip mall, fictional signage, or simplified architecture. Assign each location scene referenceIndexes to the matching upload. Motion may be cinematic; the built environment and branding must match the references.`;

export const REFERENCE_STILLS_FLYTHROUGH_BRIEF_BLOCK = `Reference stills fly-through (mandatory when numbered location photos are attached and there is no product lock):
Each uploaded image is a sequential frame from a real walkthrough. Scene N must use referenceIndexes [N] only. Do not invent rooms, furniture, or signage that are not visible in that image. Storyboard frames are 1:1 matches to the uploads; only motionPrompt describes camera glide for image-to-video.`;

export function isReferenceStillsFlythroughBrief(brief: Pick<VideoBrief, "references" | "productSpec" | "subject">): boolean {
  return brief.references.length > 0 && !brief.productSpec && !brief.subject;
}

export function isReferenceStillsFlythroughPlan(plan: VideoPlan): boolean {
  if (plan.referenceStillsFlythrough) return true;
  return plan.scenes.length > 0 && !plan.scenes.some((s) => s.productView);
}

export function isReferenceStillsFlythrough(
  brief: Pick<VideoBrief, "references" | "productSpec" | "subject">,
  plan: VideoPlan,
): boolean {
  return isReferenceStillsFlythroughBrief(brief) && isReferenceStillsFlythroughPlan(plan);
}

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

export function sceneBeatReferenceFileName(
  scene: VideoScenePlan,
  briefReferences: ManualImageReference[],
): string | undefined {
  if (scene.postCutReferenceFileName?.trim()) return scene.postCutReferenceFileName.trim();
  const n = scene.referenceIndexes[0];
  if (!n) return undefined;
  return briefReferences[n - 1]?.fileName;
}

export function assertReferenceStillsSceneCount(plan: VideoPlan, referenceCount: number): void {
  if (!plan.referenceStillsFlythrough) return;
  if (plan.scenes.length !== referenceCount) {
    throw new Error(
      `Reference stills fly-through needs one scene per uploaded image (${referenceCount} images, ${plan.scenes.length} scenes). Regenerate the plan or match upload count.`,
    );
  }
}

export function referenceStillsMinTotalSeconds(sceneCount: number): number {
  return sceneCount * REFERENCE_STILL_SCENE_MIN_SECONDS;
}

export type ReferenceStillDurationSplit = {
  durations: number[];
  /** Actual timeline length after enforcing the per-still minimum (may exceed the brief target). */
  totalSeconds: number;
};

/** Integer durations for N stills (4..15 s per clip). Raises total to fit every upload when the brief target is too short. */
export function splitReferenceStillDurations(
  lengthSeconds: number,
  sceneCount: number,
): ReferenceStillDurationSplit {
  if (sceneCount <= 0) return { durations: [], totalSeconds: 0 };
  const minSec = REFERENCE_STILL_SCENE_MIN_SECONDS;
  const minTotal = referenceStillsMinTotalSeconds(sceneCount);
  const totalSeconds = Math.max(lengthSeconds, minTotal);
  const maxTotal = sceneCount * VIDEO_SCENE_MAX_SECONDS;
  if (totalSeconds > maxTotal) {
    throw new Error(
      `${sceneCount} reference stills allow at most ${maxTotal} s total (${VIDEO_SCENE_MAX_SECONDS} s per clip). Shorten the target length or split into two videos.`,
    );
  }
  const base = Math.floor(totalSeconds / sceneCount);
  const rem = totalSeconds % sceneCount;
  const durations = Array.from({ length: sceneCount }, (_, i) => (i < rem ? base + 1 : base));
  const total = durations.reduce((sum, d) => sum + d, 0);
  if (total !== totalSeconds) {
    durations[durations.length - 1] += totalSeconds - total;
  }
  return { durations, totalSeconds };
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
