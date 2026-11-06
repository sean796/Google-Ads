import { parseClarifyJson } from "@/lib/flow-freeform/flow-freeform-prompts";
import type { FlowFreeformClarifyResult } from "@/lib/flow-freeform/flow-freeform-types";
import {
  callAgentCategoryOpenRouterChat,
  streamAgentCategoryOpenRouterChat,
} from "@/lib/openrouter-agent-category-api";
import type { OpenRouterAppStreamDelta } from "@/lib/openrouter-app-api";
import type { VideoBrief, VideoPlan } from "./video-generator-types";
import {
  isReferenceStillsFlythroughBrief,
  referenceStillsMinTotalSeconds,
} from "./video-client-location-reference";
import { videoLog, videoLogError, videoTimer } from "./video-log";
import {
  answersBlock,
  applyReferenceStillsFlythroughPlan,
  briefBlock,
  directorMessages,
  directorOpenRouterModel,
  integerSceneSplits,
} from "./video-director-brief";
import {
  buildDirectorClarifySystemPrompt,
  buildDirectorPlanSystemPrompt,
} from "./video-director-prompts";
import { parseVideoPlan } from "./video-director-plan-parse";
import { hasAttachedReferenceVideo } from "./video-director-brief";
import { VIDEO_SCENE_MAX_SECONDS, VIDEO_SCENE_MIN_SECONDS } from "./video-model-defaults";

export {
  DIRECTOR_VIDEO_VISION_MODEL,
  REFERENCE_VIDEO_SKIP_CLARIFY_QUESTIONS,
  applyReferenceStillsFlythroughPlan,
  briefBlock,
  directorMessages,
  hasAttachedReferenceVideo,
  integerSceneSplits,
  referenceStillSceneId,
  referenceVideoSkipClarifyAnswers,
} from "./video-director-brief";
export {
  PLAN_SCHEMA,
  SCENE_RULES,
  buildDirectorClarifySystemPrompt,
  buildDirectorPlanSystemPrompt,
} from "./video-director-prompts";
export { parseScene, parseTransition, parseVideoPlan } from "./video-director-plan-parse";

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
