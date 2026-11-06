import type { ManualImageReference } from "@/lib/image-generator/manual-reference-upload";
import { manualReferenceFromDataUrl } from "@/lib/image-generator/manual-reference-upload";
import { cutVideoBeats } from "@/lib/video-generator/video-brainstorm-api";
import type { VideoBriefReferenceClip, VideoPlan } from "@/lib/video-generator/video-generator-types";
import type { VideoAspect, VideoLengthSeconds } from "@/lib/video-generator/video-model-defaults";
import { videoLog } from "@/lib/video-generator/video-log";

export function extractReferenceVideoBeatsTimes(plan: VideoPlan, videoDurationSeconds?: number): number[] {
  const totalPlanSeconds = plan.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
  const videoDuration = videoDurationSeconds || totalPlanSeconds;
  const scale = totalPlanSeconds > 0 ? videoDuration / totalPlanSeconds : 1;
  let runningTime = 0;
  const times: number[] = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    const t = Math.min(Math.max(0, runningTime * scale), Math.max(0, videoDuration - 0.2));
    times.push(Number(t.toFixed(2)));
    runningTime += plan.scenes[i].durationSeconds;
  }
  return times;
}

export async function extractAndApplyReferenceVideoBeats(args: {
  apiKey: string;
  serverId: string;
  plan: VideoPlan;
  durationSeconds?: number;
}): Promise<{ plan: VideoPlan; newReferences: ManualImageReference[] }> {
  const times = extractReferenceVideoBeatsTimes(args.plan, args.durationSeconds);
  videoLog("plan", "extracting reference video beats from server", { serverId: args.serverId, times });
  const cut = await cutVideoBeats({ apiKey: args.apiKey, id: args.serverId, times });
  const updatedScenes = args.plan.scenes.map((s, i) => {
    const beat = cut.beats[i];
    if (!beat?.dataUrl) return s;
    return {
      ...s,
      referenceIndexes: [i + 1],
      postCutReferenceDataUrl: beat.dataUrl,
      postCutReferenceFileName: `ref_frame_${i + 1}_${Math.round(times[i])}s.png`,
    };
  });
  const newReferences = await Promise.all(
    cut.beats.map((b, i) =>
      manualReferenceFromDataUrl(`ref_frame_${i + 1}_${Math.round(times[i])}s.png`, b.dataUrl),
    ),
  );
  const enrichedPlan: VideoPlan = {
    ...args.plan,
    referenceStillsFlythrough: true,
    scenes: updatedScenes,
  };
  return { plan: enrichedPlan, newReferences };
}

export const RENDER_POLL_MS = 10_000;

export type InstructionScope = "scene" | "video";

/** What Brainstorming hands to the Brief. */
export type BrainstormBrief = {
  prompt: string;
  lengthSeconds: VideoLengthSeconds;
  aspect: VideoAspect;
  references: ManualImageReference[];
  referenceVideo?: VideoBriefReferenceClip | null;
};

export function sortReferencesByFileName(refs: ManualImageReference[]): ManualImageReference[] {
  return [...refs].sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function makeProjectId(): string {
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
