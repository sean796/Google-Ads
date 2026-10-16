import { parseClarifyJson } from "@/lib/flow-freeform/flow-freeform-prompts";
import type { FlowFreeformClarifyResult } from "@/lib/flow-freeform/flow-freeform-types";
import { callAgentCategoryOpenRouterChat, streamAgentCategoryOpenRouterChat } from "@/lib/openrouter-agent-category-api";
import type { OpenRouterAppMessage, OpenRouterAppStreamDelta } from "@/lib/openrouter-app-api";
import { parseJsonObjectFromModelText } from "@/lib/openrouter-vision-chat";
import type {
  ProductViewId,
  VideoBrief,
  VideoPlan,
  VideoPlanContinuity,
  VideoScenePlan,
  VideoTransition,
} from "./video-generator-types";
import { formatProductSpecPromptBlock, PRODUCT_VIEW_IDS } from "./video-product-agent";
import { videoLog, videoLogError, videoTimer } from "./video-log";
import {
  HEYGEN_VOICES,
  NARRATION_WORDS_PER_SECOND,
  VIDEO_SCENE_MAX_SECONDS,
  VIDEO_SCENE_MIN_SECONDS,
  type HeygenVoice,
} from "./video-model-defaults";

/** Director agent: clarifies the brief, then writes the scene plan. Runs on the research model. */

export function briefBlock(brief: VideoBrief): string {
  const refs = brief.references.length
    ? brief.references.map((r, i) => `Image ${i + 1}: ${r.fileName}`).join("\n")
    : "(none)";
  const subject = brief.subject
    ? "Subject harness (attached first): the one product this video is about, photographed from several angles. continuity.heroSubject names exactly this product and every scene features it as it is; the harness is not one of the numbered images and is assigned to no scene."
    : "Subject harness: none.";
  const specText = formatProductSpecPromptBlock(brief.productSpec);
  const refCount = brief.references.length;
  return `Target length: ${brief.lengthSeconds} seconds
Aspect ratio: ${brief.aspect}
Resolution: ${brief.resolution}
${subject}
${specText ? `${specText}\n` : ""}Numbered reference images uploaded: ${refCount}. Subject photos and the subject harness are NOT numbered images. Every scene referenceIndexes entry must use integers 1..${refCount}, or [] when ${refCount} is 0. Do not assign Image numbers that appear only in the brief text if those files were not uploaded.
Images uploaded by the user (attached ${brief.subject ? "after the harness" : "below"} in this order):
${refs}

Brief:
${brief.prompt.trim()}`;
}

/** System text plus one user message: the text, the subject harness when present, then every uploaded image in upload order. */
export function directorMessages(system: string, userText: string, brief: VideoBrief): OpenRouterAppMessage[] {
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        { type: "text", text: userText },
        ...(brief.subject ? [{ type: "image_url", image_url: { url: brief.subject.dataUrl } }] : []),
        ...brief.references.map((r) => ({ type: "image_url", image_url: { url: r.dataUrl } })),
      ],
    },
  ];
}

/** Every legal scene count for `lengthSeconds` with a balanced integer duration array (e.g. `6 scenes [5, 5, 5, 5, 5, 5], 5 scenes [6, 6, 6, 6, 6], 4 scenes [8, 8, 7, 7]`). */
export function integerSceneSplits(lengthSeconds: number): string {
  const min = Math.ceil(lengthSeconds / VIDEO_SCENE_MAX_SECONDS);
  const max = Math.floor(lengthSeconds / VIDEO_SCENE_MIN_SECONDS);
  const counts = Array.from({ length: max - min + 1 }, (_, i) => max - i);
  return counts
    .map((n) => {
      const base = Math.floor(lengthSeconds / n);
      const rem = lengthSeconds % n;
      const durations = Array.from({ length: n }, (_, idx) => (idx < rem ? base + 1 : base));
      return `${n} scenes [${durations.join(", ")}]`;
    })
    .join("; ");
}

function answersBlock(answers: Record<string, string>, questions: { id: string; text: string }[]): string {
  const lines = questions
    .map((q) => {
      const a = answers[q.id]?.trim();
      return a ? `- ${q.text} -> ${a}` : "";
    })
    .filter(Boolean);
  return lines.length ? lines.join("\n") : "(none)";
}

export function buildDirectorClarifySystemPrompt(): string {
  return `You are the Director for ONE short video (storyboard first, then one continuous clip per scene).
Output a single JSON object only, no markdown fences.
Schema: {"questions":[{"id":"string","text":"string","options":["string",...]}]}
Always ask 2 to 4 questions, never zero. Each question has 2 to 6 distinct, fixed options the user can pick without typing.
Prioritize the creative decisions the brief leaves open or only implies: pacing and energy, camera style, main subject or character, time of day and light, text overlays, closing shot or call to action, how literally to follow the uploaded images.
Narration, voiceover, music and sound are OFF unless the brief asks for them; never ask about them unless the brief mentions them.
Look at every uploaded image before asking; do not ask what they show or whether to use them. When a subject harness is attached, the hero subject is that product: never ask what the subject is or whether to feature it.
Do NOT ask about length, aspect ratio, or resolution; those are already set. Do not restate facts the brief already decides as a question.
Ids must be snake_case and unique.`;
}

export async function runVideoDirectorClarify(args: {
  apiKey: string;
  siteId?: string | null;
  brief: VideoBrief;
  signal?: AbortSignal;
}): Promise<FlowFreeformClarifyResult> {
  const elapsed = videoTimer();
  videoLog("clarify", "request", { promptChars: args.brief.prompt.length, subjectHarness: Boolean(args.brief.subject), references: args.brief.references.map((r) => r.fileName) });
  const res = await callAgentCategoryOpenRouterChat({
    category: "research",
    siteId: args.siteId,
    apiKey: args.apiKey,
    messages: directorMessages(buildDirectorClarifySystemPrompt(), briefBlock(args.brief), args.brief),
    maxTokens: 16000,
    reasoning: { effort: "low" },
    temperature: 0.25,
    responseFormat: { type: "json_object" },
    signal: args.signal,
  });
  videoLog("clarify", "reply", { seconds: elapsed(), finishReason: res.finishReason, content: res.content });
  const parsed = parseClarifyJson(res.content);
  if (parsed.questions.length === 0) {
    videoLogError("clarify", "no questions in reply", res.content);
    throw new Error("Director returned no questions; the brief step requires 2 to 4 multiple-choice questions.");
  }
  videoLog("clarify", "questions", parsed.questions.map((q) => q.text));
  return parsed;
}

export const PLAN_SCHEMA = `{"title":"string","logline":"string","voice":"none|nadine|tabitha|bram|gareth|noelle|meredith|sabrina|lucian|weston|vincent","fadeInSeconds":0.6,"fadeOutSeconds":0.8,"continuity":{"heroSubject":"string","screenDirection":"left_to_right|right_to_left","cameraSide":"string","palette":"string","lightArc":"string"},"scenes":[{"id":"string","order":1,"title":"string","durationSeconds":8,"sceneInstructions":"string","environmentId":"factory_bay","environmentPrompt":"string","storyboardPrompt":"string","motionPrompt":"string","continuityNotes":"string","narration":"string","referenceIndexes":[2],"productView":"three_quarter","transitionIn":null},{"id":"string","order":2,"title":"string","durationSeconds":7,"sceneInstructions":"string","environmentId":"forest_clearing_piers","environmentPrompt":"string","storyboardPrompt":"string","motionPrompt":"string","continuityNotes":"string","narration":"string","referenceIndexes":[3],"productView":"front_elevation","transitionIn":{"type":"dissolve|fade_black|fade_white|wipe_left|wipe_right|zoom_in|cut|continue","seconds":0.7}}]}`;

export const SCENE_RULES = `- durationSeconds is an integer from ${VIDEO_SCENE_MIN_SECONDS} to ${VIDEO_SCENE_MAX_SECONDS}.
- sceneInstructions: what happens in the scene, the beat it delivers, and any on-screen text (2 to 4 sentences). Each 5 to 8 second scene must execute ONE single continuous micro-action (e.g. "module sits completed on clean concrete factory floor as camera dollies past", "semi-truck cruises along mountain highway", "overhead crane lowers module onto concrete foundation piers", "module rests on foundation piers as interior lights glow warmly at dusk"). Never pack two separate events into a single scene.
- Single Standalone Unit Invariant (CRITICAL): Every scene in the video depicts ONE single standalone modular unit only — NEVER a row of multiple units, never 2, 3, or 4 modules side by side, even if the brief mentions the word "row" from a reference filename or if an uploaded photo shows multiple units stored together.
- Season & Weather Lock (No Unrequested Snow): Every outdoor scene across the entire video MUST share one single consistent season and ground condition (matching the uploaded beat reference images, or clear dry ground with green/alpine foliage when no season is specified). NEVER write "snow", "snow patches", "ice", "frost", or "winter" in environmentPrompt, storyboardPrompt, motionPrompt, or continuityNotes unless the user's brief text explicitly asks for a winter/snow video.
- environmentId: required snake_case identifier for the physical location of this scene (e.g. "factory_bay", "mountain_highway", "forest_clearing_piers"). Every scene set at the same physical site MUST share the exact same environmentId so their Environment Plates lock the same ground surface, gravel/grass/concrete, foundation piers, trees, and mountain horizon.
- environmentPrompt: required empty-stage environment description for this scene: ground material and texture, concrete foundation piers or factory floor, background walls/trees/mountains, sky, and lighting — with NO hero product, NO crane, and NO flatbed trailer or truck in the frame. Scenes sharing an environmentId must use the exact same ground, piers, and terrain description word-for-word, changing only camera angle or time-of-day lighting (daylight vs dusk vs night). Never include snow unless the brief explicitly requests snow.
- storyboardPrompt: the opening still as an image prompt: subject, framing, lens, lighting, palette, materials, mood. Describe only what is visible in that first frame, and include the exact 0%..100% left-to-right zone map of each visible face verbatim from the Locked Product Bible when present.
  * Completed Product & 1:1 Zone Map Invariant: Even if an uploaded beat sketch shows an early shell, every scene (including Scene 1 in the factory) MUST depict 1 single 100% completed product unit from the Locked Product Bible, preserving the exact 0%..100% left-to-right zone widths, glass-bay pane count, solid cladding strip between the glass bay and the door, door lower-solid/upper-window structure, wall sconce to the upper-right of the door, and single-pane narrow window. Never paraphrase the facade in a way that replaces a glass pane with solid cladding or changes window/door spacing.
  * Facade Invariant: Never mirror-flip the building. Each face keeps its openings and panels in the exact left-to-right order the Locked Product Bible gives.
  * Staging Isolation Invariant (No Stray Trailers or Cranes): Flatbed semi-trucks/trailers appear ONLY in scenes whose action beat is highway transport or loading directly onto/off the truck bed. Cranes and rigging cables appear ONLY in scenes whose action beat is actively hoisting or lowering the unit. In indoor factory bay scenes (e.g. Scene 1) and installed site/evening/night scenes, the unit rests directly on the clean factory floor or concrete foundation piers with NO flatbed trailer, NO truck, NO wheeled chassis, and NO crane cables anywhere in the frame.
  * Flatbed Truck Co-Linear Alignment & Reference Cab Direction: In any scene where the module is on a flatbed semi-truck, inspect the uploaded beat reference image for that scene and explicitly state which side of the frame the tractor cab is on (e.g. "tractor cab on the RIGHT end of the flatbed trailer facing screen-RIGHT, matching Reference Image N" or "tractor cab on the LEFT facing screen-LEFT"). Set continuity.screenDirection to match the vehicle travel direction in the uploaded beat reference image. State that the module's long axis is 100% parallel and co-linear with the flatbed trailer deck and tractor cab (0 degree yaw offset), resting flat and centered on the trailer bed.
  * Overhead Crane Rigging (Top Roof Corner Lugs Only): In any crane lift scene, explicitly state that the module hangs horizontally level from 4 steel cables attached ONLY to the 4 top roof corner lifting lugs/eyes connected to an overhead spreader bar directly above the module — never running cables diagonally across the glass or walls down to the bottom base corners, never suspended off to the side on a folding boom arm, and never with stick legs.
- motionPrompt: camera movement and subject motion across the clip, in present tense. One smooth camera move and one slow, physically grounded micro-action per clip. All vehicle travel moves FORWARD in the direction the tractor cab faces; rigid architectural structures never bend, warp, or change window counts.
- continuityNotes: character, wardrobe, setting, ground/pier layout, single-season weather, and palette details that must stay identical across scenes.
- narration: exactly "" (empty) unless the brief explicitly asks for narration, voiceover or spoken lines. Only when it does: the voiceover spoken during this scene, plain spoken English, no stage directions, no quotes, at most ${NARRATION_WORDS_PER_SECOND} words per second of the scene, rounded down (5 s: 11 words, 6 s: 13, 7 s: 15, 8 s: 17, 10 s: 22). Count the words of each narration before you answer and cut words until it fits; a hyphenated term counts as one word. Narration flows as one script across scenes.
- referenceIndexes: a required key on every scene: the numbers (Image N as labelled) of the uploaded images this scene's staging beat is drawn from, normally at most one. A contact sheet, overview or grid of many frames is context only and is assigned to no scene. Uploaded beat images define the scene activity, camera framing, season, and vehicle facing direction; the hero product's appearance and proportions always come from the Locked Product Bible. With no uploads, referenceIndexes is [].
- productView: optional key ("front_elevation" | "three_quarter" | "side_elevation" | "glazing_detail"). Set this on every scene when a Subject harness / Locked Product Bible is present so the storyboard artist receives the exact matching studio angle for this shot:
  * "front_elevation": straight-on shot of the front long side.
  * "three_quarter": front-right three-quarter angle (front long side and right end visible, front receding toward screen-left).
  * "side_elevation": front-left three-quarter angle (front long side and left end visible, front receding toward screen-right; use this when the camera sees the module from its left corner so the building never mirror-flips).
  * "glazing_detail": tight close-up on the front long side around its entry or largest opening.
- transitionIn: a required key on EVERY scene object. Exactly null on scene 1 (it opens the video). On every later scene an object, never omitted. Prefer smooth cinematic transitions (dissolve, fade_black, wipe_left, wipe_right, zoom_in) so the video flows seamlessly without abrupt jumps:
  * {"type":"dissolve","seconds":0.7} for a smooth 0.5..1.2s cross-dissolve between locations, camera angles, or beats (recommended default so scenes blend smoothly).
  * {"type":"fade_black","seconds":0.8} or {"type":"fade_white","seconds":0.7} for dramatic time-of-day transitions (such as daytime installation to night glow) or act changes.
  * {"type":"wipe_left","seconds":0.6} or {"type":"wipe_right","seconds":0.6} for directional travel transitions matching continuity.screenDirection.
  * {"type":"zoom_in","seconds":0.6} when pushing in from a wide establishing shot to a closer shot.
  * {"type":"continue","seconds":0} ONLY when the camera does not cut and continues the exact same camera angle and location from the previous clip's final frame.
  * {"type":"cut","seconds":0} only for an intentional immediate angle change at the exact same moment and location.`;

export function buildDirectorPlanSystemPrompt(lengthSeconds: number, referenceCount: number): string {
  return `You are the Director writing the scene plan for ONE short video that must cut together as one seamless piece.
Each scene becomes a single continuous video clip generated from one storyboard still (image-to-video), so a scene is ONE shot: one location, one camera move, no cuts inside it.
Output a single JSON object only, no markdown fences.
Schema:
${PLAN_SCHEMA}
Rules:
- The durations MUST sum to exactly ${lengthSeconds}.
- order starts at 1 and increases by 1. Ids are snake_case and unique.
- voice: "none" unless the brief explicitly asks for narration, voiceover or spoken lines; the video then has no narration track and every scene's narration is "". Only when the brief asks: pick the HeyGen voice that fits its tone (nadine, tabitha, noelle, meredith, sabrina are female; bram, gareth, lucian, weston, vincent are male) and write narration for every scene.
- fadeInSeconds (0..1.5, default 0.6) and fadeOutSeconds (0..1.5, default 0.8) control smooth fade-in from black on Scene 1 and fade-out to black at the end of the final scene.
- continuity: heroSubject names the one subject every scene follows; screenDirection is the single direction all travel and progress moves across the frame for the whole video; cameraSide says which side of the action the camera stays on; palette and lightArc describe colour and how light changes from first to last scene.
- Numbered reference images available: ${referenceCount}. When ${referenceCount} is 0, every scene referenceIndexes must be []. When ${referenceCount} is greater than 0, use only integers 1..${referenceCount}. Never reference beat numbers from the brief unless that many images were actually uploaded.
${SCENE_RULES}
- Respect the user's answers and uploaded images: carry their subject identity, framing and setting cues through every scene.`;
}

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
  throw new Error(
    raw === undefined || raw === null
      ? `Scene ${idx + 1} is missing transitionIn.`
      : `Scene ${idx + 1} transitionIn.type must be cut, continue, dissolve, fade_black, fade_white, wipe_left, wipe_right, or zoom_in (got ${String(o.type)}).`,
  );
}

function parseReferenceIndexes(raw: unknown, idx: number, referenceCount: number): number[] {
  if (!Array.isArray(raw)) throw new Error(`Scene ${idx + 1} is missing referenceIndexes (use [] when no upload applies).`);
  const indexes = raw.map(readInt);
  const bad = indexes.find((n) => !Number.isInteger(n) || n < 1 || n > referenceCount);
  if (bad !== undefined) {
    if (referenceCount === 0 && indexes.length > 0) {
      throw new Error(
        `Scene ${idx + 1} references Image ${bad}, but you have 0 reference images uploaded. Subject photos are not numbered images. Upload storyboard beats under Reference images, or regenerate the plan after uploads match the brief.`,
      );
    }
    throw new Error(
      `Scene ${idx + 1} references Image ${bad}, but only ${referenceCount} reference image${referenceCount === 1 ? " is" : "s are"} uploaded (use 1..${referenceCount} or []).`,
    );
  }
  if (new Set(indexes).size !== indexes.length) throw new Error(`Scene ${idx + 1} referenceIndexes repeats an image.`);
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
  const scene: VideoScenePlan = {
    id: String(o.id ?? "").trim(),
    order: readInt(o.order),
    title: String(o.title ?? "").trim(),
    durationSeconds: readInt(o.durationSeconds),
    sceneInstructions: String(o.sceneInstructions ?? "").trim(),
    ...(environmentId ? { environmentId } : {}),
    ...(environmentPrompt ? { environmentPrompt } : {}),
    storyboardPrompt: String(o.storyboardPrompt ?? "").trim(),
    motionPrompt: String(o.motionPrompt ?? "").trim(),
    continuityNotes: String(o.continuityNotes ?? "").trim(),
    narration: String(o.narration ?? "").trim(),
    referenceIndexes: parseReferenceIndexes(o.referenceIndexes, idx, referenceCount),
    ...(productView ? { productView } : {}),
    ...(revisionNotes && revisionNotes.length ? { revisionNotes } : {}),
  };
  const missing = (["id", "title", "sceneInstructions", "storyboardPrompt", "motionPrompt"] as const).filter(
    (k) => !scene[k],
  );
  if (missing.length) {
    throw new Error(`Scene ${idx + 1} is missing: ${missing.join(", ")}.`);
  }
  if (
    !Number.isInteger(scene.durationSeconds) ||
    scene.durationSeconds < VIDEO_SCENE_MIN_SECONDS ||
    scene.durationSeconds > VIDEO_SCENE_MAX_SECONDS
  ) {
    throw new Error(
      `Scene ${idx + 1} duration must be ${VIDEO_SCENE_MIN_SECONDS}..${VIDEO_SCENE_MAX_SECONDS} s (got ${String(o.durationSeconds)}).`,
    );
  }
  if (scene.order !== idx + 1) {
    throw new Error(`Scene ${idx + 1} has order ${String(o.order)}; expected ${idx + 1}.`);
  }
  const words = scene.narration.split(/\s+/).filter(Boolean).length;
  const budget = Math.floor(scene.durationSeconds * NARRATION_WORDS_PER_SECOND);
  if (words > budget) {
    throw new Error(`Scene ${idx + 1} narration is ${words} words; at most ${budget} fit in ${scene.durationSeconds} s.`);
  }
  if (idx === 0) {
    if (o.transitionIn !== undefined && o.transitionIn !== null) {
      throw new Error("Scene 1 transitionIn must be null; it opens the video.");
    }
  } else {
    scene.transitionIn = parseTransition(o.transitionIn, idx);
  }
  return scene;
}

function parseContinuity(raw: unknown): VideoPlanContinuity {
  const o = (raw ?? {}) as Record<string, unknown>;
  const direction = String(o.screenDirection ?? "").trim();
  if (direction !== "left_to_right" && direction !== "right_to_left") {
    throw new Error("Director plan continuity.screenDirection must be left_to_right or right_to_left.");
  }
  const continuity: VideoPlanContinuity = {
    heroSubject: String(o.heroSubject ?? "").trim(),
    screenDirection: direction,
    cameraSide: String(o.cameraSide ?? "").trim(),
    palette: String(o.palette ?? "").trim(),
    lightArc: String(o.lightArc ?? "").trim(),
  };
  const missing = (["heroSubject", "cameraSide", "palette", "lightArc"] as const).filter((k) => !continuity[k]);
  if (missing.length) {
    throw new Error(`Director plan continuity is missing: ${missing.join(", ")}.`);
  }
  return continuity;
}

function clampFadeSeconds(v: unknown, fallback: number): number {
  const n = readNumber(v);
  if (Number.isNaN(n)) return fallback;
  const clamped = Math.min(1.5, Math.max(0, n));
  return Math.round(clamped * 10) / 10;
}

export function parseVideoPlan(raw: string, lengthSeconds: number, referenceCount: number): VideoPlan {
  const j = parseJsonObjectFromModelText(raw);
  const title = String(j.title ?? "").trim();
  const logline = String(j.logline ?? "").trim();
  const scenesRaw = j.scenes;
  if (!title || !Array.isArray(scenesRaw) || scenesRaw.length === 0) {
    throw new Error("Director plan is missing title or scenes.");
  }
  const voice = String(j.voice ?? "").trim();
  if (voice !== "none" && !(HEYGEN_VOICES as readonly string[]).includes(voice)) {
    throw new Error(`Director plan voice must be none or one of ${HEYGEN_VOICES.join(", ")} (got ${voice || "nothing"}).`);
  }
  const continuity = parseContinuity(j.continuity);
  const scenes = scenesRaw.map((s, idx) => parseScene(s, idx, referenceCount));
  const ids = new Set(scenes.map((s) => s.id));
  if (ids.size !== scenes.length) throw new Error("Scene ids must be unique.");
  const total = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
  if (total !== lengthSeconds) {
    throw new Error(`Scene durations sum to ${total} s; the plan must total ${lengthSeconds} s.`);
  }
  const narrated = scenes.filter((s) => s.narration).map((s) => s.order);
  if (voice === "none" && narrated.length) {
    throw new Error(`Director wrote narration for scene ${narrated.join(", ")} but the brief did not ask for narration; narration must be "".`);
  }
  if (voice !== "none" && narrated.length !== scenes.length) {
    throw new Error(`Director picked voice ${voice} but left narration empty on some scenes; every scene needs narration or voice must be none.`);
  }
  const fadeInSeconds = clampFadeSeconds(j.fadeInSeconds, 0.6);
  const fadeOutSeconds = clampFadeSeconds(j.fadeOutSeconds, 0.8);
  return {
    title,
    logline,
    continuity,
    voice: voice as HeygenVoice | "none",
    fadeInSeconds,
    fadeOutSeconds,
    scenes,
  };
}

export async function runVideoDirectorPlan(args: {
  apiKey: string;
  siteId?: string | null;
  brief: VideoBrief;
  questions: { id: string; text: string }[];
  answers: Record<string, string>;
  signal?: AbortSignal;
  /** Every reasoning and JSON delta the Director writes, in order, so the UI can show the plan being written. */
  onDelta: (delta: OpenRouterAppStreamDelta) => void;
}): Promise<VideoPlan> {
  const user = `${briefBlock(args.brief)}

User answers to your questions:
${answersBlock(args.answers, args.questions)}

Write the scene plan JSON now. Pre-computed integer duration splits for ${args.brief.lengthSeconds} seconds (${VIDEO_SCENE_MIN_SECONDS}..${VIDEO_SCENE_MAX_SECONDS} s per scene): ${integerSceneSplits(args.brief.lengthSeconds)}. Pick one of these exact integer duration arrays immediately without arithmetic trial-and-error and output the JSON scene plan.`;
  const elapsed = videoTimer();
  videoLog("plan", "request", {
    lengthSeconds: args.brief.lengthSeconds,
    subjectHarness: Boolean(args.brief.subject),
    hasProductSpec: Boolean(args.brief.productSpec),
    references: args.brief.references.map((r) => r.fileName),
    answers: args.answers,
  });
  const res = await streamAgentCategoryOpenRouterChat({
    category: "research",
    siteId: args.siteId,
    apiKey: args.apiKey,
    messages: directorMessages(
      buildDirectorPlanSystemPrompt(args.brief.lengthSeconds, args.brief.references.length),
      user,
      args.brief,
    ),
    maxTokens: 64000,
    reasoning: { effort: "low" },
    temperature: 0.4,
    responseFormat: { type: "json_object" },
    signal: args.signal,
    onDelta: (delta) => {
      if (delta.reasoning) videoLog("plan", "thinking", delta.reasoning);
      if (delta.content) videoLog("plan", "writing", delta.content);
      args.onDelta(delta);
    },
  });
  videoLog("plan", "stream complete", {
    seconds: elapsed(),
    finishReason: res.finishReason,
    reasoningChars: res.reasoning.length,
    contentChars: res.content.length,
  });
  try {
    const plan = parseVideoPlan(res.content, args.brief.lengthSeconds, args.brief.references.length);
    videoLog("plan", "accepted", {
      title: plan.title,
      scenes: plan.scenes.map((s) => `${s.order}: ${s.title} (${s.durationSeconds} s, env ${s.environmentId ?? "auto"}, view ${s.productView ?? "auto"}, join ${s.transitionIn?.type ?? "open"}, refs ${s.referenceIndexes.join(",") || "none"})`),
    });
    return plan;
  } catch (e) {
    videoLogError("plan", "rejected", e);
    throw e;
  }
}
