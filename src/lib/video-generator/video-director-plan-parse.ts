import { parseJsonObjectFromModelText } from "@/lib/openrouter-vision-chat";
import type {
  ProductViewId,
  VideoPlan,
  VideoPlanContinuity,
  VideoScenePlan,
  VideoTransition,
} from "./video-generator-types";
import { PRODUCT_VIEW_IDS } from "./video-product-agent";
import { parseVideoPlanAudio } from "./video-audio-plan";
import {
  HEYGEN_VOICES,
  VIDEO_SCENE_MAX_SECONDS,
  VIDEO_SCENE_MIN_SECONDS,
  type HeygenVoice,
} from "./video-model-defaults";

function readInt(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) ? v : Number.parseInt(String(v ?? ""), 10);
}

function readNumber(v: unknown): number {
  return typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
}

function clampTransitionSeconds(seconds: number, fallback = 0.7): number {
  const raw = Number.isNaN(seconds) || seconds <= 0 ? fallback : seconds;
  const clamped = Math.min(1.5, Math.max(0.4, raw));
  return Math.round(clamped * 10) / 10;
}

export function parseTransition(raw: unknown, idx: number): VideoTransition {
  const o = (raw ?? {}) as Record<string, unknown>;
  const rawType = String(o.type ?? "").trim().toLowerCase();
  const seconds = readNumber(o.seconds);
  if (rawType === "cut" || rawType === "hard_cut" || rawType === "match_cut" || rawType === "none") {
    return { type: "cut", seconds: 0 };
  }
  if (rawType === "continue") {
    return { type: "continue", seconds: 0 };
  }
  if (rawType === "dissolve" || rawType === "crossfade" || rawType === "fade") {
    return { type: "dissolve", seconds: clampTransitionSeconds(seconds, 0.7) };
  }
  if (rawType === "fade_black" || rawType === "fadeblack" || rawType === "dip_to_black") {
    return { type: "fade_black", seconds: clampTransitionSeconds(seconds, 0.8) };
  }
  if (rawType === "fade_white" || rawType === "fadewhite" || rawType === "dip_to_white") {
    return { type: "fade_white", seconds: clampTransitionSeconds(seconds, 0.7) };
  }
  if (rawType === "wipe_left" || rawType === "wipeleft" || rawType === "slide_left" || rawType === "slideleft") {
    return { type: "wipe_left", seconds: clampTransitionSeconds(seconds, 0.6) };
  }
  if (rawType === "wipe_right" || rawType === "wiperight" || rawType === "slide_right" || rawType === "slideright") {
    return { type: "wipe_right", seconds: clampTransitionSeconds(seconds, 0.6) };
  }
  if (rawType === "zoom_in" || rawType === "zoomin" || rawType === "zoom") {
    return { type: "zoom_in", seconds: clampTransitionSeconds(seconds, 0.6) };
  }
  if (raw === undefined || raw === null) {
    return { type: "dissolve", seconds: 0.7 };
  }
  return { type: "dissolve", seconds: clampTransitionSeconds(Number.isNaN(seconds) ? 0.7 : seconds, 0.7) };
}

function parseReferenceIndexes(raw: unknown, idx: number, referenceCount: number): number[] {
  if (referenceCount === 0) return [];
  if (!Array.isArray(raw) || raw.length === 0) {
    return [Math.min(idx + 1, referenceCount)];
  }
  const indexes = [...new Set(raw.map(readInt).filter((n) => Number.isInteger(n) && n >= 1 && n <= referenceCount))];
  if (indexes.length === 0) {
    return [Math.min(idx + 1, referenceCount)];
  }
  return indexes;
}

function parseProductView(raw: unknown): ProductViewId | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const v = raw.trim() as ProductViewId;
  return PRODUCT_VIEW_IDS.includes(v) ? v : undefined;
}

/** Validates one scene object from the Director; `idx` is the zero-based position it must occupy. */
export function parseScene(raw: unknown, idx: number, referenceCount: number): VideoScenePlan {
  const o = (raw ?? {}) as Record<string, unknown>;
  const productView = parseProductView(o.productView);
  const environmentId = typeof o.environmentId === "string" && o.environmentId.trim() ? o.environmentId.trim() : undefined;
  const environmentPrompt =
    typeof o.environmentPrompt === "string" && o.environmentPrompt.trim() ? o.environmentPrompt.trim() : undefined;
  const revisionNotes = Array.isArray(o.revisionNotes)
    ? o.revisionNotes.map((n) => String(n ?? "").trim()).filter(Boolean)
    : undefined;
  const order = idx + 1;
  const title = String(o.title ?? "").trim() || `Scene ${order}`;
  let durationSeconds = readInt(o.durationSeconds);
  if (!Number.isInteger(durationSeconds) || durationSeconds < VIDEO_SCENE_MIN_SECONDS) {
    durationSeconds = VIDEO_SCENE_MIN_SECONDS;
  } else if (durationSeconds > VIDEO_SCENE_MAX_SECONDS) {
    durationSeconds = VIDEO_SCENE_MAX_SECONDS;
  }
  const scene: VideoScenePlan = {
    id: String(o.id ?? "").trim() || `scene-${order}`,
    order,
    title,
    durationSeconds,
    sceneInstructions: String(o.sceneInstructions ?? "").trim() || title,
    ...(environmentId ? { environmentId } : {}),
    ...(environmentPrompt ? { environmentPrompt } : {}),
    storyboardPrompt: String(o.storyboardPrompt ?? "").trim() || "Match the reference framing.",
    motionPrompt: String(o.motionPrompt ?? "").trim() || "Smooth forward glide.",
    continuityNotes: String(o.continuityNotes ?? "").trim(),
    narration: String(o.narration ?? "").trim(),
    referenceIndexes: parseReferenceIndexes(o.referenceIndexes, idx, referenceCount),
    ...(productView ? { productView } : {}),
    ...(revisionNotes && revisionNotes.length ? { revisionNotes } : {}),
  };
  if (idx > 0) {
    scene.transitionIn = parseTransition(o.transitionIn, idx);
  }
  return scene;
}

function parseContinuity(raw: unknown): VideoPlanContinuity {
  const o = (raw ?? {}) as Record<string, unknown>;
  const directionRaw = String(o.screenDirection ?? "").trim().toLowerCase();
  const screenDirection =
    directionRaw === "right_to_left" || directionRaw === "rtl" ? "right_to_left" : "left_to_right";
  return {
    heroSubject: String(o.heroSubject ?? "").trim() || "Location fly-through",
    screenDirection,
    cameraSide: String(o.cameraSide ?? "").trim() || "center path",
    palette: String(o.palette ?? "").trim() || "natural interior light",
    lightArc: String(o.lightArc ?? "").trim() || "even",
  };
}

function clampFadeSeconds(v: unknown, fallback: number): number {
  const n = readNumber(v);
  if (Number.isNaN(n)) return fallback;
  const clamped = Math.min(1.5, Math.max(0, n));
  return Math.round(clamped * 10) / 10;
}

function tryParseJsonCandidate(candidate: string): Record<string, unknown> | null {
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed) as unknown;
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      return obj as Record<string, unknown>;
    }
  } catch {
    // Try cleaning trailing commas and inline comments
    try {
      const sanitized = trimmed
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, "$1");
      const obj = JSON.parse(sanitized) as unknown;
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        return obj as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function planJsonFromDirectorText(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  // 1. Direct parse attempt
  const direct = tryParseJsonCandidate(trimmed);
  if (direct && Array.isArray(direct.scenes) && direct.scenes.length > 0) {
    return direct;
  }

  // 2. Extract code blocks (```json ... ``` or ``` ... ```) in reverse order (most recent final answer first)
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(trimmed)) !== null) {
    if (match[1]?.trim()) {
      blocks.push(match[1].trim());
    }
  }

  // Check code blocks from last to first for valid scenes array
  for (let i = blocks.length - 1; i >= 0; i--) {
    const parsed = tryParseJsonCandidate(blocks[i]);
    if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
      return parsed;
    }
  }

  // If a block parsed into an object without scenes, save as fallback
  for (let i = blocks.length - 1; i >= 0; i--) {
    const parsed = tryParseJsonCandidate(blocks[i]);
    if (parsed) return parsed;
  }

  // 3. Fallback: Search for JSON around "scenes" key
  const scenesIndex = trimmed.lastIndexOf('"scenes"');
  if (scenesIndex >= 0) {
    const start = trimmed.lastIndexOf("{", scenesIndex);
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = trimmed.slice(start, end + 1);
      const parsed = tryParseJsonCandidate(candidate);
      if (parsed) return parsed;
    }
  }

  // 4. Default parseJsonObjectFromModelText fallback
  try {
    return parseJsonObjectFromModelText(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = tryParseJsonCandidate(trimmed.slice(start, end + 1));
      if (candidate) return candidate;
    }
    return direct || {};
  }
}

export function parseVideoPlan(raw: string, lengthSeconds: number, referenceCount: number): VideoPlan {
  const j = planJsonFromDirectorText(raw);
  const title = String(j.title ?? "").trim() || "Video plan";
  const logline = String(j.logline ?? "").trim();
  const scenesRaw = j.scenes;
  if (!Array.isArray(scenesRaw) || scenesRaw.length === 0) {
    throw new Error("Director plan did not include a scenes array. Try generating the plan again.");
  }
  const voiceRaw = String(j.voice ?? "none").trim();
  const voice: HeygenVoice | "none" =
    voiceRaw === "none"
      ? "none"
      : (HEYGEN_VOICES as readonly string[]).includes(voiceRaw)
        ? (voiceRaw as HeygenVoice)
        : "none";
  const continuity = parseContinuity(j.continuity);
  const scenes = scenesRaw.map((s, idx) => parseScene(s, idx, referenceCount));
  const ids = new Set<string>();
  scenes.forEach((s, i) => {
    if (ids.has(s.id)) {
      s.id = `${s.id}-${i + 1}`;
    }
    ids.add(s.id);
  });
  let total = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
  if (total !== lengthSeconds && scenes.length > 0) {
    const last = scenes[scenes.length - 1];
    const delta = lengthSeconds - total;
    const next = last.durationSeconds + delta;
    if (next >= VIDEO_SCENE_MIN_SECONDS && next <= VIDEO_SCENE_MAX_SECONDS) {
      last.durationSeconds = next;
    } else {
      const per = Math.max(
        VIDEO_SCENE_MIN_SECONDS,
        Math.min(VIDEO_SCENE_MAX_SECONDS, Math.round(lengthSeconds / scenes.length)),
      );
      scenes.forEach((s) => {
        s.durationSeconds = per;
      });
      total = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
      if (total !== lengthSeconds && scenes.length > 0) {
        scenes[scenes.length - 1].durationSeconds += lengthSeconds - total;
      }
    }
  }
  if (voice !== "none") {
    scenes.forEach((s) => {
      if (!s.narration.trim()) {
        s.narration = s.title;
      }
    });
  } else {
    scenes.forEach((s) => {
      s.narration = "";
    });
  }
  const fadeInSeconds = clampFadeSeconds(j.fadeInSeconds, 0.6);
  const fadeOutSeconds = clampFadeSeconds(j.fadeOutSeconds, 0.8);
  const audio = parseVideoPlanAudio(j.audio) ?? { backingTrack: "none" as const };
  return {
    title,
    logline,
    continuity,
    voice: voice as HeygenVoice | "none",
    fadeInSeconds,
    fadeOutSeconds,
    audio,
    scenes,
  };
}
