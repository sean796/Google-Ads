import type { VideoBrief } from "./video-generator-types";
import {
  CLIENT_LOCATION_COMMERCIAL_BRIEF_BLOCK,
  isReferenceStillsFlythroughBrief,
} from "./video-client-location-reference";
import { hasAttachedReferenceVideo, referenceStillsDirectorRules } from "./video-director-brief";
import {
  NARRATION_WORDS_PER_SECOND,
  VIDEO_SCENE_MAX_SECONDS,
  VIDEO_SCENE_MIN_SECONDS,
} from "./video-model-defaults";

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
