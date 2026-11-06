import { parseClarifyJson } from "@/lib/flow-freeform/flow-freeform-prompts";
import { PRODUCT_VISION_MODEL } from "@/lib/video-generator/video-model-defaults";
import type { FlowFreeformClarifyResult } from "@/lib/flow-freeform/flow-freeform-types";
import {
  callAgentCategoryOpenRouterChat,
  streamAgentCategoryOpenRouterChat,
  type AgentOpenRouterCategory,
} from "@/lib/openrouter-agent-category-api";
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
import { parseVideoPlanAudio } from "./video-audio-plan";
import {
  CLIENT_LOCATION_COMMERCIAL_BRIEF_BLOCK,
  REFERENCE_STILLS_FLYTHROUGH_BRIEF_BLOCK,
  isReferenceStillsFlythroughBrief,
  referenceStillsMinTotalSeconds,
  splitReferenceStillDurations,
} from "./video-client-location-reference";
import { referenceVideoBriefExtra, referenceVideoMessageParts } from "@/lib/openrouter-multimodal-parts";
import { videoLog, videoLogError, videoTimer } from "./video-log";
import {
  HEYGEN_VOICES,
  NARRATION_WORDS_PER_SECOND,
  VIDEO_SCENE_MAX_SECONDS,
  VIDEO_SCENE_MIN_SECONDS,
  type HeygenVoice,
} from "./video-model-defaults";

/** Director agent: clarifies the brief, then writes the scene plan. Uses Gemini multimodal vision when a reference clip is attached. */
export const DIRECTOR_VIDEO_VISION_MODEL = PRODUCT_VISION_MODEL;

export function hasAttachedReferenceVideo(brief: VideoBrief): boolean {
  const clip = brief.referenceVideo;
  if (!clip) return false;
  if (clip.serverId?.trim()) return true;
  return Boolean(clip.dataUrl?.startsWith("data:video/"));
}

function directorOpenRouterModel(brief: VideoBrief): string | undefined {
  return hasAttachedReferenceVideo(brief) ? DIRECTOR_VIDEO_VISION_MODEL : undefined;
}

/** Plan step after a reference video upload: skip MCQ; the model already watched the clip. */
export const REFERENCE_VIDEO_SKIP_CLARIFY_QUESTIONS: { id: string; text: string }[] = [
  { id: "reference_video", text: "Reference video" },
  { id: "audio_generation", text: "Audio for the final cut" },
];

export function referenceVideoSkipClarifyAnswers(brief: VideoBrief): Record<string, string> {
  const prompt = brief.prompt.toLowerCase();
  let audio = "Silent video only";
  if (/voiceover|narration|spoken|voice over/.test(prompt) && !/no voice|without voice|silent/.test(prompt)) {
    audio = "Voiceover only with no music";
  } else if (/music|soundtrack|backing track/.test(prompt) && !/no music|silent|without music/.test(prompt)) {
    audio = "AI instrumental backing track only";
  }
  return {
    reference_video:
      "Watch the attached reference video first. Match its real environment, lighting, materials, signage, room order, camera height, and travel path. Do not substitute a generic warehouse, forest, tunnel, or other invented location. No people unless they appear in the clip. Honor the written brief for exclusions (e.g. no camera operator reflections).",
    audio_generation: audio,
  };
}

export function briefBlock(brief: VideoBrief): string {
  const refs = brief.references.length
    ? brief.references.map((r, i) => `Image ${i + 1}: ${r.fileName}`).join("\n")
    : "(none)";
  const subject = brief.subject
    ? "Subject harness (attached first): reference photos of the marketed product SKU. continuity.heroSubject names that product or brand line for the film; only scenes whose opening frame shows that SKU use the Locked Product Bible and productView. The harness is not a numbered image and is assigned to no scene."
    : "Subject harness: none.";
  const specText = formatProductSpecPromptBlock(brief.productSpec);
  const refCount = brief.references.length;
  const refVideo = brief.referenceVideo;
  const refVideoLine = refVideo
    ? `${referenceVideoBriefExtra(refVideo)} The reference video walkthrough frames and contact sheet are attached in this message. ZERO HALLUCINATION MANDATE: Read the exact business name and brand signage directly from the storefront awning and display walls in the attached visual frames (e.g., "Blind Magic", "Hunter Douglas"). Do NOT infer unrelated trades (e.g. flooring, cabinets, renovation) from neighboring strip-mall signs. All scenes, titles, environment prompts, and storyboard prompts must depict ONLY the real facility shown.`
    : "";
  const promptText = brief.prompt.trim();
  const briefSection = promptText
    ? promptText
    : brief.subject || refCount > 0 || brief.referenceVideo
      ? "(none — user supplied no written brief. Infer the business identity, products, rooms, and walkthrough order directly from the attached visual reference frames.)"
      : "(none)";
  return `Target length: ${brief.lengthSeconds} seconds
Aspect ratio: ${brief.aspect}
Resolution: ${brief.resolution}
${subject}
${specText ? `${specText}\n` : ""}Numbered reference images uploaded: ${refCount}. Subject photos and the subject harness are NOT numbered images. Every scene referenceIndexes entry must use integers 1..${refCount}, or [] when ${refCount} is 0. Do not assign Image numbers that appear only in the brief text if those files were not uploaded.
Images uploaded by the user (attached ${brief.subject ? "after the harness" : "below"} in this order):
${refs}
${refVideoLine ? `\n${refVideoLine}` : ""}

Brief:
${briefSection}${isReferenceStillsFlythroughBrief(brief) ? `\n\n${REFERENCE_STILLS_FLYTHROUGH_BRIEF_BLOCK}` : ""}`;
}

function referenceStillsDirectorRules(referenceCount: number, lengthSeconds: number): string {
  const minTotal = referenceCount * 4;
  const effective = Math.max(lengthSeconds, minTotal);
  return `- Reference stills fly-through (${referenceCount} numbered uploads, no product lock):
- Do NOT output ${referenceCount} scenes in JSON. Output 0 to 8 anchor scenes only for standout frames you can describe from the attachments (reception, display wall, exterior sign, etc.).
- The application expands to exactly ${referenceCount} scenes in upload order (Image 1 through Image ${referenceCount}) after parse. Every still gets a clip even if you omit it from JSON.
- For each anchor scene you write, set referenceIndexes to [i] for that image only. storyboardPrompt must say opening frame matches Image i at 1:1.
- motionPrompt: smooth forward glide or dolly only; no whip pans.
- Durations in your JSON are ignored for stills mode; the app assigns about ${Math.round(effective / referenceCount)} s per still (${effective} s total minimum ${minTotal} s for ${referenceCount} clips).`;
}

function directorSceneForReferenceImage(directorScenes: VideoScenePlan[], imageN: number): VideoScenePlan | undefined {
  const byRef = directorScenes.find((s) => s.referenceIndexes[0] === imageN);
  if (byRef) return byRef;
  return directorScenes.find((s) => s.order === imageN);
}

/** One React-safe id per upload index; Director anchor ids may repeat across scenes or match multiple stills. */
export function referenceStillSceneId(imageN: number, directorId?: string): string {
  const pad = String(imageN).padStart(2, "0");
  const prefix = `still_${pad}_`;
  const refOnly = `reference_still_${pad}`;
  let slug = directorId?.trim() ?? "";
  if (!slug || slug === refOnly) return refOnly;
  while (/^still_\d{2}_/.test(slug)) {
    slug = slug.replace(/^still_\d{2}_/, "");
  }
  slug = slug.replace(/^reference_still_\d{2}_?/, "");
  if (!slug) return refOnly;
  return `${prefix}${slug}`;
}

/** After Director parse: one scene per upload, 1:1 refs and storyboard contract (01.jpg, 02.jpg, …). */
export function applyReferenceStillsFlythroughPlan(plan: VideoPlan, brief: VideoBrief): VideoPlan {
  if (!isReferenceStillsFlythroughBrief(brief) || plan.scenes.some((s) => s.productView)) {
    return plan;
  }
  const n = brief.references.length;
  if (n === 0) return { ...plan, referenceStillsFlythrough: true, scenes: [] };
  const { durations, totalSeconds } = splitReferenceStillDurations(brief.lengthSeconds, n);
  const alreadyExpanded =
    plan.referenceStillsFlythrough &&
    plan.scenes.length === n &&
    plan.scenes.every((s, i) => s.order === i + 1 && s.referenceIndexes[0] === i + 1);
  if (alreadyExpanded) {
    return {
      ...plan,
      referenceStillsFlythrough: true,
      referenceStillsTotalSeconds: totalSeconds,
      scenes: plan.scenes.map((s, idx) => ({
        ...s,
        durationSeconds: durations[idx] ?? durations[durations.length - 1],
      })),
    };
  }
  const defaultTransition = { type: "dissolve" as const, seconds: 0.6 };
  const scenes: VideoScenePlan[] = brief.references.map((ref, idx) => {
    const imageN = idx + 1;
    const fileLabel = ref.fileName?.trim() || `Image ${imageN}`;
    const fromDirector = directorSceneForReferenceImage(plan.scenes, imageN);
    const durationSeconds = durations[idx] ?? durations[durations.length - 1];
    const storyboardDefault = `Opening frame matches Image ${imageN} (${fileLabel}) at 1:1. Replicate layout, materials, signage, and camera angle exactly; do not invent furniture or rooms not in the photo.`;
    const envDefault = `Same location as ${fileLabel} (Image ${imageN}) at 1:1; no invented architecture.`;
    const sceneId = referenceStillSceneId(imageN, fromDirector?.id);
    return {
      id: sceneId,
      order: imageN,
      title: fromDirector?.title?.trim() || fileLabel.replace(/\.[^.]+$/, "") || `Still ${imageN}`,
      durationSeconds,
      sceneInstructions:
        fromDirector?.sceneInstructions?.trim() ||
        `Smooth forward glide on the walkthrough frame from ${fileLabel}. No on-screen text added.`,
      environmentId: fromDirector?.environmentId?.trim() || sceneId,
      environmentPrompt: fromDirector?.environmentPrompt?.trim() || envDefault,
      storyboardPrompt:
        fromDirector?.storyboardPrompt?.trim() && fromDirector.storyboardPrompt.includes(fileLabel)
          ? fromDirector.storyboardPrompt.trim()
          : storyboardDefault,
      motionPrompt:
        fromDirector?.motionPrompt?.trim() || "Smooth forward glide at chest height along the walkthrough path.",
      continuityNotes:
        fromDirector?.continuityNotes?.trim() ||
        "Same walkthrough sequence; chest-height camera; empty showroom with no people visible.",
      narration: plan.voice === "none" ? "" : (fromDirector?.narration ?? ""),
      referenceIndexes: [imageN],
      transitionIn: imageN === 1 ? null : (fromDirector?.transitionIn ?? defaultTransition),
      productView: undefined,
      revisionNotes: fromDirector?.revisionNotes,
      postCutReferenceDataUrl: fromDirector?.postCutReferenceDataUrl,
      postCutReferenceFileName: fromDirector?.postCutReferenceFileName,
    };
  });
  return {
    ...plan,
    referenceStillsFlythrough: true,
    referenceStillsTotalSeconds: totalSeconds,
    scenes,
  };
}

/** System text plus one user message: reference video first, then brief text, subject harness, then beat images. */
export function directorMessages(system: string, userText: string, brief: VideoBrief): OpenRouterAppMessage[] {
  const refVideo = brief.referenceVideo;
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        ...(refVideo ? referenceVideoMessageParts(refVideo) : []),
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

export function buildDirectorClarifySystemPrompt(brief: VideoBrief): string {
  const refVideo = hasAttachedReferenceVideo(brief);
  const refVideoBlock = refVideo
    ? `A reference video is attached in the user message BEFORE the brief text. You MUST watch the entire clip before asking anything. Never ask the user to pick a generic environment (warehouse, forest, tunnel, cathedral, city street, etc.) when the video already shows the real location. Never ask time of day, lighting mood, or drone/camera path when the video already defines them — copy what you see.
When a reference video is attached, ask at most ONE question and only if the brief leaves audio ambiguous: use id "audio_generation" with fixed options (silent video only; AI instrumental backing track only; AI backing track plus voiceover; voiceover only with no music; I will upload my own music later). If the brief already states silent, music, or voiceover clearly, return {"questions":[]}.`
    : `Always ask 2 to 4 questions, never zero. Each question has 2 to 6 distinct, fixed options the user can pick without typing.
Prioritize the creative decisions the brief leaves open or only implies: pacing and energy, camera style, main subject or character, time of day and light, text overlays, closing shot or call to action, how literally to follow the uploaded images.
Always include exactly one question with id "audio_generation" about audio for the final cut (backing track and/or voiceover), unless the brief already states the full audio plan end to end (e.g. silent only, or exact music style plus narration). That question must offer clear fixed options such as: silent video only; AI instrumental backing track only; AI backing track plus voiceover script; voiceover only with no music; I will upload my own music later. Do not ask a second music question.
If the brief only mentions narration or only mentions music, still ask audio_generation once so backing track and voiceover choices are explicit.
Look at every uploaded image before asking; do not ask what they show or whether to use them. When the Brief is empty, derive creative direction from the attachments; do not ask what the images show. When a subject harness is attached, the hero subject is that product: never ask what the subject is or whether to feature it.`;
  return `You are the Director for ONE short video (storyboard first, then one continuous clip per scene).
Output a single JSON object only, no markdown fences.
Schema: {"questions":[{"id":"string","text":"string","options":["string",...]}]}
${refVideoBlock}
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
  videoLog("clarify", "request", {
    promptChars: args.brief.prompt.length,
    subjectHarness: Boolean(args.brief.subject),
    referenceVideo: Boolean(args.brief.referenceVideo?.serverId),
    references: args.brief.references.map((r) => r.fileName),
  });
  const res = await callAgentCategoryOpenRouterChat({
    category: "research",
    model: directorOpenRouterModel(args.brief),
    siteId: args.siteId,
    apiKey: args.apiKey,
    messages: directorMessages(buildDirectorClarifySystemPrompt(args.brief), briefBlock(args.brief), args.brief),
    maxTokens: 16000,
    reasoning: { effort: "low" },
    temperature: 0.25,
    responseFormat: { type: "json_object" },
    signal: args.signal,
  });
  videoLog("clarify", "reply", { seconds: elapsed(), finishReason: res.finishReason, content: res.content });
  const parsed = parseClarifyJson(res.content);
  if (parsed.questions.length === 0 && !hasAttachedReferenceVideo(args.brief)) {
    videoLogError("clarify", "no questions in reply", res.content);
    throw new Error("Director returned no questions; the brief step requires 2 to 4 multiple-choice questions.");
  }
  videoLog("clarify", "questions", parsed.questions.map((q) => q.text));
  return parsed;
}

export const PLAN_SCHEMA = `{"title":"string","logline":"string","voice":"none|nadine|tabitha|bram|gareth|noelle|meredith|sabrina|lucian|weston|vincent","fadeInSeconds":0.6,"fadeOutSeconds":0.8,"audio":{"backingTrack":"none|generated|upload_later","backingTrackPrompt":"string when generated, else omit or empty"},"continuity":{"heroSubject":"string","screenDirection":"left_to_right|right_to_left","cameraSide":"string","palette":"string","lightArc":"string"},"scenes":[{"id":"string","order":1,"title":"string","durationSeconds":6,"sceneInstructions":"string","environmentId":"suburban_sidewalk_morning","environmentPrompt":"string","storyboardPrompt":"string","motionPrompt":"string","continuityNotes":"string","narration":"","referenceIndexes":[1],"transitionIn":null},{"id":"string","order":2,"title":"string","durationSeconds":6,"sceneInstructions":"string","environmentId":"living_room_window","environmentPrompt":"string","storyboardPrompt":"string","motionPrompt":"string","continuityNotes":"string","narration":"","referenceIndexes":[],"productView":"front_elevation","transitionIn":{"type":"dissolve|fade_black|fade_white|wipe_left|wipe_right|zoom_in|cut|continue","seconds":0.7}}]}`;

export const SCENE_RULES = `- durationSeconds is an integer from ${VIDEO_SCENE_MIN_SECONDS} to ${VIDEO_SCENE_MAX_SECONDS}.
- sceneInstructions: what happens in the scene, the beat it delivers, and any on-screen text (2 to 4 sentences). Each 5 to 8 second scene must execute ONE single continuous micro-action (e.g. "woman and golden retriever walk along a suburban sidewalk at sunrise", "camera holds on a honeycomb shade in a living-room window as light shifts", "slow push-in on the product hero angle"). Never pack two separate events into a single scene.
- Brief-driven cast and props: people, pets, vehicles, interiors, and locations come from the Brief and uploaded beat references. Do not invent products, buildings, or props the brief does not imply. When a Locked Product Bible exists, not every scene shows that SKU on screen.
- Season & Weather Lock (No Unrequested Snow): Outdoor scenes share one consistent season and ground condition (matching beat references, or dry temperate ground when unspecified). NEVER write "snow", "ice", "frost", or "winter" in environmentPrompt, storyboardPrompt, motionPrompt, or continuityNotes unless the brief explicitly requests winter.
- environmentId: required snake_case identifier for this scene's physical location (e.g. "suburban_sidewalk_morning", "living_room_window", "retail_showroom"). Scenes at the same site share the same environmentId so Environment Plates lock ground, backdrop, and season.
- environmentPrompt: required empty-stage description: ground/floor, walls/sky/trees/horizon, and lighting only. No people, pets, hero product, or scene action. No props unless the brief requires a fixed set dressing element in every shot at that location. Scenes sharing an environmentId reuse the same terrain and backdrop wording, changing only camera height/angle or time-of-day light when needed.
- storyboardPrompt: the opening still as an image prompt: who/what is visible, framing, lens, lighting, palette, mood. Describe only the first frame of this clip.
  * When the Locked Product Bible applies (scene has productView): include the product at 1:1 from the bible (materials, color, 0%..100% zones on visible faces). Never mirror-flip the primary face left-for-right versus the bible.
  * When the scene is lifestyle or narrative without the SKU in frame: omit productView and describe characters, setting, and action from the brief; do not place the studio turntable product in the background unless the brief asks for it.
  * Match uploaded beat references for framing, travel direction, and wardrobe when referenceIndexes cites them.
- motionPrompt: camera movement and subject motion across the clip, in present tense. One smooth camera move and one slow, physically grounded micro-action per clip. Rigid objects and architecture do not bend or change feature counts mid-clip.
- continuityNotes: character, wardrobe, setting, ground layout, season, and palette that must stay identical across scenes.
- narration: exactly "" (empty) when plan voice is "none". When voice is a HeyGen voice (user chose voiceover in brief or audio_generation answer): the voiceover spoken during this scene, plain spoken English, no stage directions, no quotes, at most ${NARRATION_WORDS_PER_SECOND} words per second of the scene, rounded down (5 s: 11 words, 6 s: 13, 7 s: 15, 8 s: 17, 10 s: 22). Count the words of each narration before you answer and cut words until it fits; a hyphenated term counts as one word. Narration flows as one script across scenes.
- referenceIndexes: a required key on every scene: Image N numbers this scene's beat is drawn from (normally at most one). Contact sheets are not assigned to scenes. Beat images guide activity, framing, and facing; locked SKU appearance comes from the Product Bible only when productView is set. With no uploads, referenceIndexes is []. For client storefront, showroom, or office location commercials, every scene that depicts that place MUST set referenceIndexes to the upload that shows that exact facility (exterior or matching interior). Never plan a generic fictional building when a real location photo was uploaded.
- Client location fidelity: when numbered references include a real storefront, showroom, or interior for a paying client, storyboardPrompt and environmentPrompt describe that exact facility at 1:1 (materials, sign copy, logo placement, doors, windows, awning, landscaping). Generic strip-mall or invented signage is forbidden.
- productView: optional ("front_elevation" | "three_quarter" | "side_elevation" | "glazing_detail"). Set ONLY when the opening frame shows the Locked Product SKU (studio angle match). Omit on pure lifestyle, character, or environment beats where the SKU is not visible.
  * "front_elevation": straight-on primary face.
  * "three_quarter": front-right three-quarter (primary face + right end).
  * "side_elevation": front-left three-quarter (primary face + left end).
  * "glazing_detail": tight close-up on the primary face / key product detail.
- transitionIn: a required key on EVERY scene object. Exactly null on scene 1 (it opens the video). On every later scene an object, never omitted. Prefer smooth cinematic transitions (dissolve, fade_black, wipe_left, wipe_right, zoom_in) so the video flows seamlessly without abrupt jumps:
  * {"type":"dissolve","seconds":0.7} for a smooth 0.5..1.2s cross-dissolve between locations, camera angles, or beats (recommended default so scenes blend smoothly).
  * {"type":"fade_black","seconds":0.8} or {"type":"fade_white","seconds":0.7} for dramatic time-of-day transitions (such as daytime installation to night glow) or act changes.
  * {"type":"wipe_left","seconds":0.6} or {"type":"wipe_right","seconds":0.6} for directional travel transitions matching continuity.screenDirection.
  * {"type":"zoom_in","seconds":0.6} when pushing in from a wide establishing shot to a closer shot.
  * {"type":"continue","seconds":0} ONLY when the camera does not cut and continues the exact same camera angle and location from the previous clip's final frame.
  * {"type":"cut","seconds":0} only for an intentional immediate angle change at the exact same moment and location.`;

export function buildDirectorPlanSystemPrompt(brief: VideoBrief): string {
  const lengthSeconds = brief.lengthSeconds;
  const referenceCount = brief.references.length;
  const stillsRules =
    isReferenceStillsFlythroughBrief(brief) && referenceCount > 0
      ? `\n${referenceStillsDirectorRules(referenceCount, lengthSeconds)}\n`
      : "";
  return `You are the Director writing the scene plan for ONE short video that must cut together as one seamless piece.
Each scene becomes a single continuous video clip generated from one storyboard still (image-to-video), so a scene is ONE shot: one location, one camera move, no cuts inside it.
Output a single JSON object only, no markdown fences.
Schema:
${PLAN_SCHEMA}
Rules:
- The durations MUST sum to exactly ${lengthSeconds}.
- order starts at 1 and increases by 1. Ids are snake_case and unique.
- voice: "none" unless the brief or the user's audio_generation answer requests voiceover (voiceover only, or backing track plus voiceover). When voiceover is requested: pick the HeyGen voice that fits tone (nadine, tabitha, noelle, meredith, sabrina are female; bram, gareth, lucian, weston, vincent are male) and write narration for every scene.
- audio: required object. backingTrack is "none" (silent or voiceover-only with no music), "generated" (AI instrumental bed under the full video), or "upload_later" (user supplies music). When backingTrack is "generated", backingTrackPrompt is a single concise music brief: genre, mood, tempo, instrumentation, no vocals, suited to a ${lengthSeconds}s commercial. Honor the user's audio_generation answer exactly. Silent video: backingTrack "none", voice "none", all narration "". Voiceover only: backingTrack "none", voice set, narration on every scene. AI backing only: backingTrack "generated", voice "none", narration "". Backing plus voiceover: backingTrack "generated", voice set, narration on every scene. User uploads music: backingTrack "upload_later", omit backingTrackPrompt.
- fadeInSeconds (0..1.5, default 0.6) and fadeOutSeconds (0..1.5, default 0.8) control smooth fade-in from black on Scene 1 and fade-out to black at the end of the final scene.
- continuity: heroSubject names the one subject every scene follows; screenDirection is the single direction all travel and progress moves across the frame for the whole video; cameraSide says which side of the action the camera stays on; palette and lightArc describe colour and how light changes from first to last scene.
- Numbered reference images available: ${referenceCount}. When ${referenceCount} is 0, every scene referenceIndexes must be []. When ${referenceCount} is greater than 0, use only integers 1..${referenceCount}. Never reference beat numbers from the brief unless that many images were actually uploaded.
${stillsRules}${SCENE_RULES}
- Respect the user's answers and uploaded images: carry their subject identity, framing and setting cues through every scene.
${
  hasAttachedReferenceVideo(brief)
    ? `- Reference video mode (ZERO HALLUCINATION MANDATE):
  * The attached visual frames (beat frames and contact sheet) are the ABSOLUTE GROUND TRUTH for the business identity, storefront signage, interior displays, and walkthrough order.
  * You MUST inspect the storefront awning, windows, doors, and interior display walls in the attached images: read the exact business name (e.g. "Blind Magic Window Coverings", "Hunter Douglas") and featured product types (blinds, shades, shutters, drapery, window coverings).
  * FORBIDDEN: NEVER invent an unrelated industry, product category, or fictional company name (such as flooring, cabinetry, kitchen renovation, automotive, or construction). Never latch onto background strip-mall signs down the street.
  * plan.title, continuity.heroSubject, and every scene's title, environmentPrompt, and storyboardPrompt MUST describe ONLY what is physically visible in the attached reference frames.
  * The video is a flythrough of THIS EXACT FACILITY. Every scene must match the real sequence of rooms/displays shown in the beat frames.`
    : ""
}
When the brief is a client location or showroom commercial, obey:
${CLIENT_LOCATION_COMMERCIAL_BRIEF_BLOCK}`;
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

Write the scene plan JSON now.${
    isReferenceStillsFlythroughBrief(args.brief) && args.brief.references.length > 0
      ? ` Reference stills mode: output 0 to 8 anchor scenes only (not ${args.brief.references.length}). Use durationSeconds 5 on each scene for schema validity; the app expands to one scene per upload (${args.brief.references.length} total) and splits ~${Math.max(args.brief.lengthSeconds, referenceStillsMinTotalSeconds(args.brief.references.length))} s across them.`
      : ` Pre-computed integer duration splits for ${args.brief.lengthSeconds} seconds (${VIDEO_SCENE_MIN_SECONDS}..${VIDEO_SCENE_MAX_SECONDS} s per scene): ${integerSceneSplits(args.brief.lengthSeconds)}. Pick one of these exact integer duration arrays immediately without arithmetic trial-and-error and output the JSON scene plan.`
  }`;
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
    model: directorOpenRouterModel(args.brief),
    siteId: args.siteId,
    apiKey: args.apiKey,
    messages: directorMessages(
      buildDirectorPlanSystemPrompt(args.brief),
      user,
      args.brief,
    ),
    maxTokens: 64000,
    reasoning: { effort: "low" },
    temperature: 0.4,
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
    let plan: VideoPlan | null = null;
    if (res.content?.trim()) {
      try {
        plan = applyReferenceStillsFlythroughPlan(
          parseVideoPlan(res.content, args.brief.lengthSeconds, args.brief.references.length),
          args.brief,
        );
      } catch (contentErr) {
        videoLog("plan", "res.content alone did not parse directly, checking combined text", contentErr);
      }
    }
    if (!plan) {
      const planText = [res.content, res.reasoning].filter((s) => s.trim()).join("\n\n");
      plan = applyReferenceStillsFlythroughPlan(
        parseVideoPlan(planText, args.brief.lengthSeconds, args.brief.references.length),
        args.brief,
      );
    }
    videoLog("plan", "accepted", {
      title: plan.title,
      referenceStillsFlythrough: plan.referenceStillsFlythrough,
      referenceStillsTotalSeconds: plan.referenceStillsTotalSeconds,
      sceneCount: plan.scenes.length,
      scenes: plan.scenes.map((s) => `${s.order}: ${s.title} (${s.durationSeconds} s, env ${s.environmentId ?? "auto"}, view ${s.productView ?? "auto"}, join ${s.transitionIn?.type ?? "open"}, refs ${s.referenceIndexes.join(",") || "none"})`),
    });
    return plan;
  } catch (e) {
    videoLogError("plan", "rejected", e);
    throw e;
  }
}
