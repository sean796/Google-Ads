import { callAgentCategoryOpenRouterChat } from "@/lib/openrouter-agent-category-api";
import { parseJsonObjectFromModelText } from "@/lib/openrouter-vision-chat";
import { continuityBlock } from "./video-storyboard-agent";
import { formatProductSpecPromptBlock } from "./video-product-agent";
import type { ProductSpec, VideoPlan, VideoScenePlan } from "./video-generator-types";
import { videoLog, videoLogError, videoTimer } from "./video-log";

/** Cinematographer: looks at the storyboard frame, its neighbours and the continuity rules, and writes the image-to-video prompt. */

export function buildCinematographerSystemPrompt(): string {
  return `You are the Cinematographer on a short video that must cut together as one seamless piece.
You receive the Director's continuity rules, Locked Product Bible (when present), this scene (including any Client Post-Cut Revision Notes), the previous and next scenes, and one or two images: image 1 is this scene's approved storyboard still; image 2 (when present) is the previous scene's storyboard still.
Write the prompt for an image-to-video model that animates this scene as ONE continuous shot.
Output a single JSON object only, no markdown fences. Schema: {"facing":"string","facingMatchesDirection":true,"videoPrompt":"string"}
Rules:
- facing: inspect image 1 and state the orientation of the hero subject ("screen left", "screen right", "toward camera", "three-quarter", or "stationary").
- facingMatchesDirection: set true whenever either (a) a moving subject faces the plan's screenDirection, OR (b) the hero subject is a stationary/architectural/product object or three-quarter view where the CAMERA moves (dolly, pan, tracking, push-in) in the plan's screenDirection. If a subject in image 1 is angled opposite to screenDirection, DO NOT fail the shot — set facingMatchesDirection to true and write camera-led motion (camera tracks/dollies in the plan's screenDirection while preserving the subject's geometry as shown in the frame).
- videoPrompt: 45 to 85 words, present tense, ONE continuous shot with ONE slow, physically grounded camera move and ONE micro-action. Incorporate every Client Post-Cut Revision Note for this scene directly into videoPrompt.
- Rigid-body lock: preserve the exact shape, materials, colors, and layout of every person, prop, and product visible in image 1. When a Locked Product Bible is included for this scene, that SKU stays rigid and undeformed throughout the move.
- Environment lock: preserve the exact ground, backdrop, and lighting from image 1. Do not add people, products, vehicles, or structures that are not already in image 1.
- For "cut", "dissolve", "fade_black", "fade_white", "wipe_left", "wipe_right", "zoom_in", or scene 1: the clip opens directly on this scene's storyboard frame.
- For a "continue" join: the clip bridges from the previous scene's end state into this scene's storyboard frame in one smooth continuous camera take.
- End the clip in a clean, stable pose and lighting state for the next scene. Mention only subjects, objects and setting elements visible in the images.`;
}

function sceneLine(label: string, scene: VideoScenePlan | undefined): string {
  if (!scene) return `${label}: none`;
  return `${label}: scene ${scene.order} "${scene.title}" (${scene.durationSeconds} s, location ${scene.environmentId ?? "auto"}). Motion: ${scene.motionPrompt}. Narration: ${scene.narration || "none"}`;
}

export async function writeSceneVideoPrompt(args: {
  apiKey: string;
  siteId?: string | null;
  plan: VideoPlan;
  scene: VideoScenePlan;
  frameDataUrl: string;
  productSpec?: ProductSpec | null;
  previousScene?: VideoScenePlan;
  previousFrameDataUrl?: string;
  nextScene?: VideoScenePlan;
}): Promise<string> {
  const join = args.scene.transitionIn
    ? `${args.scene.transitionIn.type}${args.scene.transitionIn.seconds > 0 ? ` ${args.scene.transitionIn.seconds} s` : ""}`
    : "scene 1 (opens the video)";
  const specBlock = formatProductSpecPromptBlock(args.productSpec);
  const revisionBlock = args.scene.revisionNotes?.length
    ? `\nClient Post-Cut Revision Notes (mandatory in videoPrompt): ${args.scene.revisionNotes.join("; ")}`
    : "";
  const text = `Video: "${args.plan.title}" (${args.plan.logline})
Continuity: ${continuityBlock(args.plan)}
${specBlock ? `${specBlock}\n` : ""}This scene: ${args.scene.order} "${args.scene.title}", ${args.scene.durationSeconds} s clip, location: ${args.scene.environmentId ?? "auto"}, join from previous: ${join}
Scene instructions: ${args.scene.sceneInstructions}
Director motion: ${args.scene.motionPrompt}
Scene continuity: ${args.scene.continuityNotes}${revisionBlock}
Narration over this scene: ${args.scene.narration || "none"}
${sceneLine("Previous scene", args.previousScene)}
${sceneLine("Next scene", args.nextScene)}`;
  const images: Array<{ type: "image_url"; image_url: { url: string } }> = [{ type: "image_url", image_url: { url: args.frameDataUrl } }];
  if (args.previousFrameDataUrl) images.push({ type: "image_url", image_url: { url: args.previousFrameDataUrl } });
  const elapsed = videoTimer();
  videoLog("cinematographer", `scene ${args.scene.order} prompt start`, { join, images: images.length, revisions: args.scene.revisionNotes?.length ?? 0 });
  const res = await callAgentCategoryOpenRouterChat({
    category: "research",
    siteId: args.siteId,
    apiKey: args.apiKey,
    messages: [
      { role: "system", content: buildCinematographerSystemPrompt() },
      { role: "user", content: [{ type: "text", text }, ...images] },
    ],
    temperature: 0.3,
    maxTokens: 16000,
    reasoning: { effort: "low" },
    responseFormat: { type: "json_object" },
  });
  videoLog("cinematographer", `scene ${args.scene.order} reply`, { seconds: elapsed(), finishReason: res.finishReason, content: res.content });
  const parsed = parseJsonObjectFromModelText(res.content);
  let videoPrompt = String(parsed.videoPrompt ?? "").trim();
  const facing = String(parsed.facing ?? "").trim();
  if (!videoPrompt) {
    videoLogError("cinematographer", `scene ${args.scene.order} rejected`, "empty videoPrompt");
    throw new Error(`Cinematographer returned an empty videoPrompt for scene ${args.scene.order}.`);
  }
  if (parsed.facingMatchesDirection !== true) {
    const dirLabel = args.plan.continuity.screenDirection.replace(/_/g, " ");
    videoLog("cinematographer", `scene ${args.scene.order} adapting camera motion for ${facing || "angled"} subject (${dirLabel})`);
    videoPrompt = `Smooth ${dirLabel} camera tracking shot maintaining strict subject geometry from the opening frame. ${videoPrompt}`;
  }
  videoLog("cinematographer", `scene ${args.scene.order} prompt done`, { facing, words: videoPrompt.split(/\s+/).length, videoPrompt });
  return videoPrompt;
}
