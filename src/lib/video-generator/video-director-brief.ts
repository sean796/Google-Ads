import { PRODUCT_VISION_MODEL } from "@/lib/video-generator/video-model-defaults";
import type { OpenRouterAppMessage } from "@/lib/openrouter-app-api";
import type { VideoBrief, VideoPlan, VideoScenePlan } from "./video-generator-types";
import { formatProductSpecPromptBlock } from "./video-product-agent";
import {
  REFERENCE_STILLS_FLYTHROUGH_BRIEF_BLOCK,
  isReferenceStillsFlythroughBrief,
  splitReferenceStillDurations,
} from "./video-client-location-reference";
import { referenceVideoBriefExtra, referenceVideoMessageParts } from "@/lib/openrouter-multimodal-parts";
import { VIDEO_SCENE_MAX_SECONDS, VIDEO_SCENE_MIN_SECONDS } from "./video-model-defaults";

/** Director agent: clarifies the brief, then writes the scene plan. Uses Gemini multimodal vision when a reference clip is attached. */
export const DIRECTOR_VIDEO_VISION_MODEL = PRODUCT_VISION_MODEL;

export function hasAttachedReferenceVideo(brief: VideoBrief): boolean {
  const clip = brief.referenceVideo;
  if (!clip) return false;
  if (clip.serverId?.trim()) return true;
  return Boolean(clip.dataUrl?.startsWith("data:video/"));
}

export function directorOpenRouterModel(brief: VideoBrief): string | undefined {
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

export function referenceStillsDirectorRules(referenceCount: number, lengthSeconds: number): string {
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

export function answersBlock(answers: Record<string, string>, questions: { id: string; text: string }[]): string {
  const lines = questions
    .map((q) => {
      const a = answers[q.id]?.trim();
      return a ? `- ${q.text} -> ${a}` : "";
    })
    .filter(Boolean);
  return lines.length ? lines.join("\n") : "(none)";
}
