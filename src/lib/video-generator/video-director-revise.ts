import { callAgentCategoryOpenRouterChat } from "@/lib/openrouter-agent-category-api";
import { parseJsonObjectFromModelText } from "@/lib/openrouter-vision-chat";
import { PLAN_SCHEMA, SCENE_RULES, briefBlock, directorMessages, parseScene, parseVideoPlan } from "./video-director-agent";
import type { VideoBrief, VideoPlan, VideoScenePlan } from "./video-generator-types";
import { videoLog, videoLogError, videoTimer } from "./video-log";

/** Director revisions driven by the instruction bar or Post-Cut panel: one scene, or the whole plan. Runs on the research model. */

function planBlock(plan: VideoPlan): string {
  return `Current plan (JSON):
${JSON.stringify(plan)}`;
}

export async function runVideoDirectorRevisePlan(args: {
  apiKey: string;
  siteId?: string | null;
  brief: VideoBrief;
  plan: VideoPlan;
  instruction: string;
  signal?: AbortSignal;
}): Promise<VideoPlan> {
  const system = `You are the Director revising the scene plan of ONE short video after a note from the client.
Output a single JSON object only, no markdown fences, with the full revised plan.
Schema:
${PLAN_SCHEMA}
Rules:
- Apply the client's note across the whole video. Change only what the note requires; every other scene keeps its id, order, duration, environmentId, environmentPrompt, prompts, narration, referenceIndexes, productView and transitionIn exactly as in the current plan. Every scene object carries all keys in the schema, including referenceIndexes and transitionIn.
- A scene whose storyboardPrompt or environmentPrompt text changes will be redrawn; keep them identical when the visual does not change.
- Durations must still sum to exactly ${args.brief.lengthSeconds} seconds. Scenes may be added, merged or removed only when the note asks for it.
- continuity.screenDirection stays as it is unless the note changes direction.
- voice stays "${args.plan.voice}" unless the note explicitly asks to add or remove narration.
${SCENE_RULES}`;
  const user = `${briefBlock(args.brief)}

${planBlock(args.plan)}

Client note for the whole video:
${args.instruction.trim()}

Return the full revised plan now.`;
  const elapsed = videoTimer();
  videoLog("revise", "plan instruction sent", { instruction: args.instruction, scenes: args.plan.scenes.length });
  const res = await callAgentCategoryOpenRouterChat({
    category: "research",
    siteId: args.siteId,
    apiKey: args.apiKey,
    messages: directorMessages(system, user, args.brief),
    maxTokens: 64000,
    reasoning: { effort: "low" },
    temperature: 0.3,
    responseFormat: { type: "json_object" },
    signal: args.signal,
  });
  videoLog("revise", "plan reply", { seconds: elapsed(), finishReason: res.finishReason, contentChars: res.content.length });
  try {
    const plan = parseVideoPlan(res.content, args.brief.lengthSeconds, args.brief.references.length);
    const mergedScenes = plan.scenes.map((s) => {
      const prev = args.plan.scenes.find((p) => p.id === s.id);
      const prevNotes = prev?.revisionNotes ?? [];
      return prevNotes.length && !s.revisionNotes?.length ? { ...s, revisionNotes: prevNotes } : s;
    });
    const finalPlan: VideoPlan = {
      ...plan,
      fadeInSeconds: plan.fadeInSeconds ?? args.plan.fadeInSeconds,
      fadeOutSeconds: plan.fadeOutSeconds ?? args.plan.fadeOutSeconds,
      scenes: mergedScenes,
    };
    videoLog("revise", "plan applied", finalPlan.scenes.map((s) => `${s.order}: ${s.title} (${s.durationSeconds} s)`));
    return finalPlan;
  } catch (e) {
    videoLogError("revise", "plan reply rejected", e);
    throw e;
  }
}

export async function runVideoDirectorReviseScene(args: {
  apiKey: string;
  siteId?: string | null;
  brief: VideoBrief;
  plan: VideoPlan;
  sceneId: string;
  instruction: string;
  signal?: AbortSignal;
}): Promise<VideoScenePlan> {
  const idx = args.plan.scenes.findIndex((s) => s.id === args.sceneId);
  if (idx < 0) throw new Error(`Scene ${args.sceneId} is not in the plan.`);
  const scene = args.plan.scenes[idx];
  const priorNotes = scene.revisionNotes ?? [];
  const system = `You are the Director revising ONE scene of a short video after a note from the client.
Output a single JSON object only, no markdown fences: the revised scene object with exactly this shape:
{"id":"${scene.id}","order":${scene.order},"title":"string","durationSeconds":${scene.durationSeconds},"sceneInstructions":"string","environmentId":"${scene.environmentId ?? `scene_${scene.order}_env`}","environmentPrompt":"string","storyboardPrompt":"string","motionPrompt":"string","continuityNotes":"string","narration":${scene.narration ? '"string"' : '""'},"referenceIndexes":${JSON.stringify(scene.referenceIndexes)}${scene.productView ? `,"productView":"${scene.productView}"` : ""},"transitionIn":${
    scene.transitionIn ? `{"type":"dissolve|fade_black|fade_white|wipe_left|wipe_right|zoom_in|cut|continue","seconds":${scene.transitionIn.seconds}}` : "null"
  }}
Rules:
- Keep id, order and durationSeconds exactly as given. referenceIndexes stays unless the note asks to draw this scene from a different uploaded image. ${scene.order === 1 ? "Scene 1 transitionIn is exactly null." : "transitionIn stays unless the note changes how this scene joins the previous one."}
- Apply the client's note to this scene (updating sceneInstructions, environmentPrompt when the ground/setting changes, storyboardPrompt when the opening frame changes, motionPrompt when camera or subject motion changes, and transitionIn when requested) while preserving all prior client revision notes on this scene unless the new note explicitly overrides them.
- Stay inside the plan continuity (hero subject, screen direction, camera side, palette, light arc) and Locked Product Bible.
${SCENE_RULES}`;
  const priorBlock = priorNotes.length
    ? `\nPrior client revision notes already active on this scene (keep enforcing these):\n${priorNotes.map((n, i) => `${i + 1}. ${n}`).join("\n")}\n`
    : "";
  const user = `${briefBlock(args.brief)}

${planBlock(args.plan)}

Scene to revise: ${scene.order} (${scene.title})
${priorBlock}
New client note for this scene:
${args.instruction.trim()}

Return the revised scene object now.`;
  const elapsed = videoTimer();
  videoLog("revise", `scene ${scene.order} instruction sent`, { instruction: args.instruction, priorNotes: priorNotes.length });
  const res = await callAgentCategoryOpenRouterChat({
    category: "research",
    siteId: args.siteId,
    apiKey: args.apiKey,
    messages: directorMessages(system, user, args.brief),
    maxTokens: 16000,
    reasoning: { effort: "low" },
    temperature: 0.3,
    responseFormat: { type: "json_object" },
    signal: args.signal,
  });
  videoLog("revise", `scene ${scene.order} reply`, { seconds: elapsed(), finishReason: res.finishReason, content: res.content });
  try {
    const parsed = parseScene(parseJsonObjectFromModelText(res.content), idx, args.brief.references.length);
    if (parsed.id !== scene.id || parsed.durationSeconds !== scene.durationSeconds) {
      throw new Error(`Director changed the scene id or duration; scene ${scene.order} must keep ${scene.id} at ${scene.durationSeconds} s.`);
    }
    if (Boolean(parsed.narration) !== Boolean(scene.narration)) {
      throw new Error(`Director ${parsed.narration ? "added" : "dropped"} narration on scene ${scene.order}; narration is ${args.plan.voice === "none" ? "off" : "on"} for this video.`);
    }
    const revised: VideoScenePlan = {
      ...parsed,
      environmentId: parsed.environmentId ?? scene.environmentId,
      environmentPrompt: parsed.environmentPrompt ?? scene.environmentPrompt,
      revisionNotes: [...priorNotes, args.instruction.trim()],
    };
    videoLog("revise", `scene ${scene.order} applied`, {
      title: revised.title,
      storyboardChanged: revised.storyboardPrompt !== scene.storyboardPrompt,
      environmentChanged: revised.environmentPrompt !== scene.environmentPrompt,
      revisionCount: revised.revisionNotes?.length ?? 0,
    });
    return revised;
  } catch (e) {
    videoLogError("revise", `scene ${scene.order} reply rejected`, e);
    throw e;
  }
}
