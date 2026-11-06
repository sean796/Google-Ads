import { errorText, type InstructionScope } from "@/components/video-generator/video-generator-helpers";
import { useCallback } from "react";
import { applySceneClientInstruction, runVideoDirectorRevisePlan } from "@/lib/video-generator/video-director-revise";
import type { VideoPlan, PostCutSceneReference, VideoScenePlan } from "@/lib/video-generator/video-generator-types";
import { DEFAULT_VOICE_MODEL } from "@/lib/video-generator/video-model-defaults";
import { createVideoRender, rerenderVideoScene, startVideoRender, uploadVideoRenderFrame } from "@/lib/video-generator/video-render-api";
import { videoLog, videoLogError, videoTimer } from "@/lib/video-generator/video-log";
import type { VideoGeneratorState } from "@/components/video-generator/use-video-generator-state";
import type { useVideoDrawScenes } from "@/components/video-generator/use-video-draw-scenes";

export function useVideoRender(
  s: VideoGeneratorState,
  scenes: ReturnType<typeof useVideoDrawScenes>,
) {
  const { drawScenes } = scenes;
  const {
    videoModel,
    prompt,
    aspect,
    resolution,
    plan,
    setPlan,
    frames,
    setFrames,
    selectedSceneId,
    setSelectedSceneId,
    render,
    setRender,
    setBusy,
    setError,
    brief,
    bumpRun,
    advance,
    requireApiKey,
  } = s;

const sendInstruction = useCallback(
  async (
    scope: InstructionScope,
    instruction: string,
    targetSceneId?: string,
    postCutReference?: PostCutSceneReference,
  ) => {
    const key = requireApiKey();
    const text = instruction.trim();
    if (!key || !plan || !text) return;
    const activeSceneId = targetSceneId ?? selectedSceneId;
    if (scope === "scene" && !activeSceneId) return;
    setError("");
    try {
      if (scope === "scene") {
        const sceneId = activeSceneId as string;
        const before = plan.scenes.find((s) => s.id === sceneId);
        const planForRevise: VideoPlan = postCutReference
          ? {
              ...plan,
              scenes: plan.scenes.map((s) =>
                s.id === sceneId
                  ? {
                      ...s,
                      postCutReferenceDataUrl: postCutReference.dataUrl,
                      postCutReferenceFileName: postCutReference.fileName,
                    }
                  : s,
              ),
            }
          : plan;
        if (postCutReference) setPlan(planForRevise);
        const baseScene = planForRevise.scenes.find((s) => s.id === sceneId);
        if (!baseScene) return;
        setBusy(`Applying change to scene ${baseScene.order}`);
        const revisedWithApproval: VideoScenePlan = {
          ...applySceneClientInstruction(baseScene, text),
          approved: before?.approved,
          postCutReferenceDataUrl: postCutReference?.dataUrl ?? before?.postCutReferenceDataUrl,
          postCutReferenceFileName: postCutReference?.fileName ?? before?.postCutReferenceFileName,
        };
        const revised = revisedWithApproval;
        const index = planForRevise.scenes.findIndex((s) => s.id === sceneId);
        const nextPlan: VideoPlan = {
          ...planForRevise,
          scenes: planForRevise.scenes.map((s) => (s.id === sceneId ? revisedWithApproval : s)),
        };
        const run = bumpRun(`scene ${revised.order} revised`);
        setPlan(nextPlan);
        // Pre-Scene Brief Review mode: update the scene brief only; do not draw frames until user approves
        if (frames.length === 0) {
          return;
        }
        const current =
          postCutReference || (revisedWithApproval.revisionNotes?.length ?? 0) > 0
            ? undefined
            : frames.find((f) => f.imageDataUrl && f.sceneId === sceneId)?.imageDataUrl;
        const currentEnvUrl = frames.find((f) => f.environmentDataUrl && f.sceneId === sceneId)?.environmentDataUrl;
        const envChanged =
          Boolean(postCutReference) || revised.environmentPrompt !== before?.environmentPrompt;
        const existing = new Map(frames.filter((f) => f.imageDataUrl && f.sceneId !== sceneId).map((f) => [f.sceneId, f.imageDataUrl as string]));
        const existingEnv = new Map(
          frames
            .filter((f) => f.environmentDataUrl && (!envChanged || f.sceneId !== sceneId))
            .map((f) => [f.sceneId, f.environmentDataUrl as string]),
        );
        setFrames((prev) =>
          prev.map((f) =>
            f.sceneId === sceneId
              ? {
                  ...f,
                  status: "waiting",
                  imageDataUrl: nextPlan.referenceStillsFlythrough ? undefined : f.imageDataUrl,
                  videoPrompt: undefined,
                }
              : f,
          ),
        );
        const next = nextPlan.scenes[index + 1];
        setBusy(`Storyboard artist is redrawing scene ${revised.order} keyframe`);
        const { framesById, promptsById } = await drawScenes(
          key,
          run,
          nextPlan,
          [sceneId],
          next ? [sceneId, next.id] : [sceneId],
          existing,
          current ? new Map([[sceneId, current]]) : new Map(),
          existingEnv,
          envChanged && currentEnvUrl ? new Map([[sceneId, currentEnvUrl]]) : new Map(),
        );
        const newFrameUrl = framesById.get(sceneId);
        const newVideoPrompt = promptsById.get(sceneId);
        if (render && newFrameUrl && newVideoPrompt) {
          setBusy(`Re-rendering clip for scene ${revised.order} with your changes`);
          const snapshot = await rerenderVideoScene({
            apiKey: key,
            renderId: render.id,
            sceneId,
            dataUrl: newFrameUrl,
            videoPrompt: newVideoPrompt,
            narration: revised.narration,
            transitionIn: revised.transitionIn,
          });
          setRender(snapshot);
          advance("render");
        }
        return;
      }
      setBusy("Director is revising the plan");
      const nextPlan = await runVideoDirectorRevisePlan({ apiKey: key, brief, plan, instruction: text });
      const run = bumpRun("plan revised");
      setPlan(nextPlan);
      if (!nextPlan.scenes.some((s) => s.id === selectedSceneId)) setSelectedSceneId(nextPlan.scenes[0].id);
      // Pre-Scene Brief Review mode: update the plan briefs only; do not draw frames until user approves
      if (frames.length === 0) {
        return;
      }
      const changed = nextPlan.scenes
        .filter((s) => {
          const before = plan.scenes.find((p) => p.id === s.id);
          return !before || before.storyboardPrompt !== s.storyboardPrompt || before.environmentPrompt !== s.environmentPrompt;
        })
        .map((s) => s.id);
      videoLog("revise", "scenes whose storyboard changed will be redrawn", changed);
      const kept = new Map(frames.filter((f) => f.imageDataUrl && !changed.includes(f.sceneId)).map((f) => [f.sceneId, f]));
      const existingEnv = new Map(
        frames.filter((f) => f.environmentDataUrl && !changed.includes(f.sceneId)).map((f) => [f.sceneId, f.environmentDataUrl as string]),
      );
      setFrames(
        nextPlan.scenes.map((s) => {
          const k = kept.get(s.id);
          return k ? { ...k, videoPrompt: undefined } : { sceneId: s.id, status: "waiting" as const, environmentStatus: "waiting" as const };
        }),
      );
      const existing = new Map(Array.from(kept.values()).map((f) => [f.sceneId, f.imageDataUrl as string]));
      await drawScenes(
        key,
        run,
        nextPlan,
        changed,
        nextPlan.scenes.map((s) => s.id),
        existing,
        new Map(),
        existingEnv,
      );
    } catch (e) {
      videoLogError("revise", "failed", e);
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  },
  [advance, brief, bumpRun, drawScenes, frames, plan, render, requireApiKey, selectedSceneId, setBusy, setError, setFrames, setPlan, setRender, setSelectedSceneId],
);

/** Every scene either has a finished storyboard frame + clip prompt OR is an uploaded/stored video clip: the render can be bought/stitched. */
const readyToRender =
  Boolean(plan && plan.scenes.length > 0) &&
  (plan?.scenes.every((s) => {
    if (s.customClipFile) return true;
    const f = frames.find((fr) => fr.sceneId === s.id);
    return Boolean(f && f.status === "done" && f.imageDataUrl && f.videoPrompt);
  }) ?? false);

const renderVideo = useCallback(async () => {
  const key = requireApiKey();
  if (!key || !plan || !readyToRender) return;
  setError("");
  const elapsed = videoTimer();
  try {
    setBusy("Submitting the render");
    // Decision Model (Liquid d1.1) Anti-Morphing & Anti-Artifact Batch Audit
    const { auditSceneClipWithDecisionAgent } = await import("@/lib/decision-tree/studio-decision-auditor");
    const scenes = await Promise.all(
      plan.scenes.map(async (s) => {
        const frame = frames.find((f) => f.sceneId === s.id);
        if (!s.customClipFile && (!frame?.imageDataUrl || !frame.videoPrompt)) {
          throw new Error(`Scene ${s.order} has no frame or clip prompt.`);
        }
        let basePrompt = frame?.videoPrompt || "Uploaded video clip";
        try {
          const audit = await auditSceneClipWithDecisionAgent({
            sceneTitle: s.title,
            sceneOrder: s.order,
            videoPrompt: basePrompt,
            apiKey: key,
            hasReferenceStill: Boolean(plan.referenceStillsFlythrough || s.postCutReferenceDataUrl || frame?.imageDataUrl),
            briefContext: `${plan.title} ${plan.logline} ${prompt} ${(s.revisionNotes || []).join(" ")}`,
          });
          if (audit.enhancedPrompt) {
            basePrompt = audit.enhancedPrompt;
          }
        } catch {
          // graceful fallback to basePrompt
        }
        return {
          id: s.id,
          order: s.order,
          durationSeconds: Math.max(4, Math.min(15, Math.round(s.durationSeconds || 5))),
          videoPrompt: basePrompt,
          narration: s.narration,
          transitionIn: s.transitionIn,
          customClipFile: s.customClipFile,
          frameDataUrl: frame?.imageDataUrl,
        };
      }),
    );
    const renderId = await createVideoRender({
      apiKey: key,
      model: videoModel,
      resolution,
      aspectRatio: aspect,
      voiceModel: DEFAULT_VOICE_MODEL,
      voice: plan.voice,
      fadeInSeconds: plan.fadeInSeconds ?? 0.6,
      fadeOutSeconds: plan.fadeOutSeconds ?? 0.8,
      scenes: scenes.map(({ frameDataUrl: _frame, ...scene }) => scene),
    });
    for (const scene of scenes) {
      if (scene.frameDataUrl && scene.frameDataUrl.startsWith("data:image/")) {
        videoLog("render", `uploading frame for scene ${scene.order}`, { bytes: scene.frameDataUrl.length });
        await uploadVideoRenderFrame({ apiKey: key, renderId, sceneId: scene.id, dataUrl: scene.frameDataUrl });
      }
    }
    const snapshot = await startVideoRender({ apiKey: key, renderId });
    videoLog("render", "started", { seconds: elapsed(), snapshot });
    setRender(snapshot);
    advance("render");
  } catch (e) {
    videoLogError("render", `submit failed after ${elapsed()} s`, e);
    setError(errorText(e));
  } finally {
    setBusy(null);
  }
}, [advance, aspect, frames, plan, readyToRender, requireApiKey, resolution, videoModel, prompt, setBusy, setError, setRender]);

const renderActive = render !== null && (render.status === "rendering" || render.status === "stitching");

  return {
    sendInstruction,
    readyToRender,
    renderActive,
    renderVideo,
  };
}
