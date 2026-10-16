/** OpenRouter id for default video generation (Grok Imagine Video 1.5 — physical-world & rigid-body I2V). */
export const DEFAULT_VIDEO_MODEL = "x-ai/grok-imagine-video-1.5";
export const PRODUCT_VISION_MODEL = "google/gemini-2.5-flash";

export const VIDEO_MODEL_PRESETS: { value: string; label: string }[] = [
  { value: DEFAULT_VIDEO_MODEL, label: "Grok Imagine Video 1.5" },
  { value: "x-ai/grok-imagine-video-1.5-lite", label: "Grok Imagine Video 1.5 Lite" },
  { value: "x-ai/grok-imagine-video", label: "Grok Imagine Video" },
  { value: "heygen/heygen-video-1", label: "HeyGen Video 1" },
];

/** Narration track: HeyGen Voice 1 text-to-speech through OpenRouter `/api/v1/audio/speech`. */
export const DEFAULT_VOICE_MODEL = "heygen/heygen-voice-1";
export const HEYGEN_VOICES = [
  "nadine",
  "tabitha",
  "bram",
  "gareth",
  "noelle",
  "meredith",
  "sabrina",
  "lucian",
  "weston",
  "vincent",
] as const;
export type HeygenVoice = (typeof HEYGEN_VOICES)[number];

/** HeyGen Video clips are 5..15 s (Grok 1..15); the Director splits the target across scenes. */
export const VIDEO_SCENE_MIN_SECONDS = 5;
export const VIDEO_SCENE_MAX_SECONDS = 15;
/** Spoken English pace used for the narration word budget per scene. */
export const NARRATION_WORDS_PER_SECOND = 2.3;

export const VIDEO_LENGTH_OPTIONS = [15, 30, 45, 60, 90, 120] as const;
export type VideoLengthSeconds = (typeof VIDEO_LENGTH_OPTIONS)[number];

/** Shared by the video models and the image generator (`image-api.ts` AspectRatio). */
export const VIDEO_ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
export type VideoAspect = (typeof VIDEO_ASPECTS)[number];

export const VIDEO_RESOLUTIONS = ["480p", "720p", "768p", "1080p", "2K"] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];

/** USD per output second from OpenRouter `/api/v1/videos/models` pricing_skus (Oct 2026); HeyGen rows are the first-frame (reference) rates. */
const USD_PER_SECOND: Record<string, Partial<Record<VideoResolution, number>>> = {
  "heygen/heygen-video-1": { "480p": 0.07, "768p": 0.1, "2K": 0.18 },
  "x-ai/grok-imagine-video": { "480p": 0.05, "720p": 0.07 },
  "x-ai/grok-imagine-video-1.5": { "480p": 0.08, "720p": 0.14, "1080p": 0.25 },
  "x-ai/grok-imagine-video-1.5-lite": { "480p": 0.02, "720p": 0.03, "1080p": 0.14 },
};

/** USD per clip on top of the per-second rate (`reference_input_images` SKU). */
const USD_PER_CLIP: Record<string, number> = {
  "heygen/heygen-video-1": 0.04,
};

export function resolutionsForVideoModel(model: string): VideoResolution[] {
  const skus = USD_PER_SECOND[model.trim()];
  if (!skus) return [...VIDEO_RESOLUTIONS];
  return VIDEO_RESOLUTIONS.filter((r) => skus[r] !== undefined);
}

/** Picks the best default HD resolution (`720p` or `768p`) supported by `model` instead of `480p`. */
export function defaultResolutionForVideoModel(model: string): VideoResolution {
  const allowed = resolutionsForVideoModel(model);
  if (allowed.includes("720p")) return "720p";
  if (allowed.includes("768p")) return "768p";
  if (allowed.includes("1080p")) return "1080p";
  return allowed[0] ?? "720p";
}

/** Estimated USD for `seconds` of output at `resolution` across `clipCount` clips; null when the model has no known SKU. */
export function estimateVideoCostUsd(
  model: string,
  resolution: VideoResolution,
  seconds: number,
  clipCount = 1,
): number | null {
  const id = model.trim();
  const perSecond = USD_PER_SECOND[id]?.[resolution];
  if (perSecond === undefined) return null;
  return perSecond * seconds + (USD_PER_CLIP[id] ?? 0) * clipCount;
}

export const VIDEO_ASPECT_BOX_CLASS: Record<VideoAspect, string> = {
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
  "4:3": "aspect-[4/3]",
  "3:4": "aspect-[3/4]",
};
