/** OpenRouter chat content parts for multimodal messages (images + video). */

import type { VideoBriefReferenceClip } from "@/lib/video-generator/video-generator-types";

export type OpenRouterVideoProcessing = "agentic" | "static";

export type OpenRouterVideoUrlPart = {
  type: "video_url";
  video_url: {
    url: string;
    processing?: OpenRouterVideoProcessing;
  };
};

export function openRouterVideoUrlPart(url: string, durationSeconds?: number): OpenRouterVideoUrlPart {
  const processing =
    typeof durationSeconds === "number" && durationSeconds > 45 ? ("agentic" as const) : ("static" as const);
  return {
    type: "video_url",
    video_url: { url, processing },
  };
}

export function referenceVideoLlmSegments(clip: VideoBriefReferenceClip) {
  if (clip.llmSegments?.length) return clip.llmSegments;
  if (clip.dataUrl?.startsWith("data:video/")) {
    return [{ part: 1, startSec: 0, endSec: clip.durationSeconds, dataUrl: clip.dataUrl }];
  }
  return [];
}

export type NeoPulseReferenceVideoPart = {
  type: "neo_pulse_reference_video";
  serverId: string;
};

export function referenceVideoContentParts(clip: VideoBriefReferenceClip): OpenRouterVideoUrlPart[] {
  return referenceVideoLlmSegments(clip)
    .filter((s) => s.dataUrl?.startsWith("data:video/"))
    .map((s) => openRouterVideoUrlPart(s.dataUrl!, Math.max(0, s.endSec - s.startSec)));
}

/** Director/Producer: server hydrates video_url parts (no giant base64 in the browser). */
export function referenceVideoMessageParts(
  clip: VideoBriefReferenceClip,
): Array<OpenRouterVideoUrlPart | NeoPulseReferenceVideoPart> {
  const serverId = clip.serverId?.trim();
  if (serverId) {
    return [{ type: "neo_pulse_reference_video", serverId }];
  }
  return referenceVideoContentParts(clip);
}

export function referenceVideoBriefExtra(clip: VideoBriefReferenceClip): string {
  const partCount = clip.llmSegments?.length ?? (clip.dataUrl ? 1 : clip.serverId ? 1 : 0);
  if (!partCount && !clip.serverId) return "";
  if (partCount <= 1) {
    return `Reference video attached: ${clip.fileName} (${clip.durationSeconds} s). Watch the clip for walkthrough order, rooms, signage, and camera path.`;
  }
  return `Reference video attached in ${partCount} consecutive parts (${clip.fileName}, ${clip.durationSeconds} s total). Parts are in upload order; treat them as one continuous clip.`;
}
