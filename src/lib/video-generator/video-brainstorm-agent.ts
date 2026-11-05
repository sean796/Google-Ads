import { callAgentCategoryOpenRouterChat } from "@/lib/openrouter-agent-category-api";
import type { OpenRouterAppMessage } from "@/lib/openrouter-app-api";
import { parseJsonObjectFromModelText } from "@/lib/openrouter-vision-chat";
import { referenceVideoBriefExtra, referenceVideoMessageParts } from "@/lib/openrouter-multimodal-parts";
import type { VideoSample } from "./video-brainstorm-api";
import type { VideoBriefReferenceClip } from "./video-generator-types";
import { videoLog, videoLogError, videoTimer } from "./video-log";
import {
  VIDEO_ASPECTS,
  VIDEO_LENGTH_OPTIONS,
  VIDEO_SCENE_MAX_SECONDS,
  VIDEO_SCENE_MIN_SECONDS,
  type VideoAspect,
  type VideoLengthSeconds,
} from "./video-model-defaults";

/** Producer agent: turns the client's notes, product images and a sampled video into a Brief plus the beats to cut. */

export type BrainstormBeat = { sampleTime: number; title: string };

export type BrainstormResult = {
  brief: string;
  lengthSeconds: VideoLengthSeconds;
  aspect: VideoAspect;
  beats: BrainstormBeat[];
};

const SCHEMA = `{"brief":"string","lengthSeconds":${VIDEO_LENGTH_OPTIONS.join("|")},"aspect":"${VIDEO_ASPECTS.join("|")}","beats":[{"sampleTime":"number, one of the sample times given","title":"string"}]}`;

export function buildBrainstormSystemPrompt(): string {
  return `You are the producer turning client material into the brief for ONE short video made by a Director, a storyboard artist and an image-to-video model.
Output a single JSON object only, no markdown fences.
Schema:
${SCHEMA}
Rules:
- Subject harness: when the user text says one is attached, the FIRST image is the subject harness: the real product photographed from several angles, tiled on one sheet. It is the one product this film is about. Name and describe the product from the harness, and state in the brief that every shot features exactly this product (same design, materials, proportions and details), never a different or generic one.
- brief: the Director reads only this text and the images, so it must stand alone: what the product is (named from the subject harness when attached, else from the uploaded images and notes), what the film is for, the look and mood, how literally to follow the client video, the camera and screen direction, what must stay identical in every shot, and then the beats as a numbered list in order. 150 to 300 words. Plain English, no markdown.
- lengthSeconds: one of ${VIDEO_LENGTH_OPTIONS.join(", ")}. Every scene lasts ${VIDEO_SCENE_MIN_SECONDS} to ${VIDEO_SCENE_MAX_SECONDS} s, so choose the length that fits the beat count (beats x 5 s at least, beats x 15 s at most); with a client video, stay close to its duration.
- aspect: one of ${VIDEO_ASPECTS.join(", ")}; match the client video's frame shape, else what the notes imply.
- beats: only when a client reference video is attached (full clip or sample frames), else []. A beat is one distinct moment: the subject, action, or setting changes. sampleTime is seconds into the clip (0 to video duration), in ascending order; pick distinct moments, not two beats at the same second. Between ceil(lengthSeconds / ${VIDEO_SCENE_MAX_SECONDS}) and floor(lengthSeconds / ${VIDEO_SCENE_MIN_SECONDS}) beats. title is three to six words naming the moment.`;
}

function userText(args: {
  notes: string;
  subjectDataUrl?: string;
  images: { fileName: string }[];
  samples: VideoSample[];
  referenceVideo?: VideoBriefReferenceClip | null;
  durationSeconds?: number;
}): string {
  const subject = args.subjectDataUrl
    ? "Subject harness: attached first (one sheet of the real product from several angles)."
    : "Subject harness: none.";
  const images = args.images.length
    ? `Product images (attached ${args.subjectDataUrl ? "after the subject harness" : "first"}, in this order):\n${args.images.map((r, i) => `Image ${i + 1}: ${r.fileName}`).join("\n")}`
    : "Product images: none.";
  const samples = args.referenceVideo
    ? `${referenceVideoBriefExtra(args.referenceVideo)} Attached after the product images. Set each beat sampleTime to the second in the full timeline where that moment occurs.`
    : args.samples.length
      ? `Client video: ${args.durationSeconds ?? 0} s. One sample frame every 2 s is attached after the product images, in time order:\n${args.samples
          .map((s, i) => `Sample ${i + 1} at ${s.time} s`)
          .join("\n")}`
      : "Client video: none, so beats must be exactly [].";
  return `${subject}

${images}

${samples}

Client notes:
${args.notes.trim() || "(none)"}

Write the brief now.`;
}

function imagePart(url: string) {
  return { type: "image_url", image_url: { url } };
}

export async function runVideoBrainstorm(args: {
  apiKey: string;
  siteId?: string | null;
  notes: string;
  /** Subject harness sheet; attached before every other image. */
  subjectDataUrl?: string;
  images: { fileName: string; dataUrl: string }[];
  samples: VideoSample[];
  referenceVideo?: VideoBriefReferenceClip | null;
  durationSeconds?: number;
  signal?: AbortSignal;
}): Promise<BrainstormResult> {
  const messages: OpenRouterAppMessage[] = [
    { role: "system", content: buildBrainstormSystemPrompt() },
    {
      role: "user",
      content: [
        { type: "text", text: userText(args) },
        ...(args.subjectDataUrl ? [imagePart(args.subjectDataUrl)] : []),
        ...args.images.map((r) => imagePart(r.dataUrl)),
        ...(args.referenceVideo
          ? referenceVideoMessageParts(args.referenceVideo)
          : args.samples.map((s) => imagePart(s.dataUrl))),
      ],
    },
  ];
  const elapsed = videoTimer();
  videoLog("brainstorm", "agent request", {
    notesChars: args.notes.length,
    subjectHarness: Boolean(args.subjectDataUrl),
    images: args.images.map((r) => r.fileName),
    samples: args.samples.length,
    durationSeconds: args.durationSeconds,
  });
  const res = await callAgentCategoryOpenRouterChat({
    category: "research",
    siteId: args.siteId,
    apiKey: args.apiKey,
    messages,
    maxTokens: 32000,
    reasoning: { effort: "low" },
    temperature: 0.3,
    responseFormat: { type: "json_object" },
    signal: args.signal,
  });
  videoLog("brainstorm", "agent reply", { seconds: elapsed(), finishReason: res.finishReason, contentChars: res.content.length, content: res.content });
  try {
    const result = parseBrainstorm(
      parseJsonObjectFromModelText(res.content),
      args.samples.map((s) => s.time),
      args.referenceVideo?.durationSeconds,
    );
    videoLog("brainstorm", "agent result", { lengthSeconds: result.lengthSeconds, aspect: result.aspect, beats: result.beats });
    return result;
  } catch (e) {
    videoLogError("brainstorm", "agent reply rejected", e);
    throw e;
  }
}

export function parseBrainstorm(
  raw: Record<string, unknown>,
  sampleTimes: number[],
  videoDurationSeconds?: number,
): BrainstormResult {
  const brief = String(raw.brief ?? "").trim();
  if (!brief) throw new Error("Brainstorm returned an empty brief.");
  const lengthSeconds = Number(raw.lengthSeconds);
  if (!(VIDEO_LENGTH_OPTIONS as readonly number[]).includes(lengthSeconds)) {
    throw new Error(`Brainstorm lengthSeconds must be one of ${VIDEO_LENGTH_OPTIONS.join(", ")} (got ${String(raw.lengthSeconds)}).`);
  }
  const aspect = String(raw.aspect ?? "");
  if (!(VIDEO_ASPECTS as readonly string[]).includes(aspect)) {
    throw new Error(`Brainstorm aspect must be one of ${VIDEO_ASPECTS.join(", ")} (got ${aspect || "empty"}).`);
  }
  if (!Array.isArray(raw.beats)) throw new Error("Brainstorm beats must be an array.");
  const beats: BrainstormBeat[] = raw.beats.map((b, i) => {
    const o = (b ?? {}) as Record<string, unknown>;
    const sampleTime = Number(o.sampleTime);
    const title = String(o.title ?? "").trim();
    if (sampleTimes.length) {
      if (!sampleTimes.includes(sampleTime)) {
        throw new Error(`Beat ${i + 1} sampleTime ${String(o.sampleTime)} is not one of the sample frames.`);
      }
    } else if (typeof videoDurationSeconds === "number" && videoDurationSeconds > 0) {
      if (sampleTime < 0 || sampleTime > videoDurationSeconds) {
        throw new Error(
          `Beat ${i + 1} sampleTime ${String(o.sampleTime)} must be between 0 and ${videoDurationSeconds} s.`,
        );
      }
    }
    if (!title) throw new Error(`Beat ${i + 1} has no title.`);
    return { sampleTime, title };
  });
  beats.forEach((b, i) => {
    if (i > 0 && b.sampleTime <= beats[i - 1].sampleTime) throw new Error(`Beat ${i + 1} is not later than beat ${i} (${b.sampleTime} s).`);
  });
  if (sampleTimes.length && !beats.length) throw new Error("Brainstorm returned no beats for the client video.");
  const min = Math.ceil(lengthSeconds / VIDEO_SCENE_MAX_SECONDS);
  const max = Math.floor(lengthSeconds / VIDEO_SCENE_MIN_SECONDS);
  if (beats.length && (beats.length < min || beats.length > max)) {
    throw new Error(`${beats.length} beats do not fit ${lengthSeconds} s (needs ${min} to ${max} beats).`);
  }
  return { brief, lengthSeconds: lengthSeconds as VideoLengthSeconds, aspect: aspect as VideoAspect, beats };
}
