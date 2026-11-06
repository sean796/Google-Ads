import { errorText, extractAndApplyReferenceVideoBeats } from "@/components/video-generator/video-generator-helpers";
import { useCallback } from "react";
import type { VideoPlan } from "@/lib/video-generator/video-generator-types";
import { rerenderVideoScene, restitchVideoRender, sliceReferenceVideoClips } from "@/lib/video-generator/video-render-api";
import { videoLog, videoLogError } from "@/lib/video-generator/video-log";
import type { VideoGeneratorState } from "@/components/video-generator/use-video-generator-state";
import type { useVideoDrawScenes } from "@/components/video-generator/use-video-draw-scenes";
import type { useVideoPlanDraft } from "@/components/video-generator/use-video-plan-draft";

export function useVideoFrameRegen(
  s: VideoGeneratorState,
  scenes: ReturnType<typeof useVideoDrawScenes>,
  planDraft: ReturnType<typeof useVideoPlanDraft>,
) {
  const { drawScenes } = scenes;
  const { restoreReferenceFrame } = planDraft;
  const {
    prompt,
    references,
    setReferences,
    referenceVideo,
    plan,
    setPlan,
    frames,
    setFrames,
    render,
    setRender,
    setBusy,
    setError,
    runRef,
    brief,
    advance,
    requireApiKey,
  } = s;

const regenerateFrame = useCallback(
  async (sceneId: string, customInstruction?: string) => {
    const key = requireApiKey();
    if (!key || !plan) return;
    const run = runRef.current;
    const index = plan.scenes.findIndex((s) => s.id === sceneId);
    const scene = plan.scenes[index];
    const hasRefOrUpdate = Boolean(scene?.postCutReferenceDataUrl || customInstruction?.trim());
    const currentFrameUrl = hasRefOrUpdate ? undefined : frames.find((f) => f.sceneId === sceneId)?.imageDataUrl;
    const currentMap = currentFrameUrl ? new Map([[sceneId, currentFrameUrl]]) : new Map();
    let activePlan = plan;
    if (customInstruction?.trim()) {
      const cleanInst = customInstruction.trim();
      activePlan = {
        ...activePlan,
        scenes: activePlan.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                revisionNotes: [cleanInst],
                storyboardPrompt: cleanInst,
              }
            : s,
        ),
      };
      setPlan(activePlan);
    }
    const existing = new Map(frames.filter((f) => f.imageDataUrl && f.sceneId !== sceneId).map((f) => [f.sceneId, f.imageDataUrl as string]));
    const existingEnv = new Map(frames.filter((f) => f.environmentDataUrl).map((f) => [f.sceneId, f.environmentDataUrl as string]));
    const next = activePlan.scenes[index + 1];
    setBusy(`Storyboard artist is redrawing scene ${activePlan.scenes[index]?.order ?? ""}`);
    await drawScenes(key, run, activePlan, [sceneId], next ? [sceneId, next.id] : [sceneId], existing, currentMap, existingEnv);
    setBusy(null);
  },
  [drawScenes, frames, plan, requireApiKey, runRef, setBusy, setPlan],
);

/** Batch resets every scene keyframe back to the exact frame cut from the uploaded reference video */
const syncAllFramesFromReferenceVideo = useCallback(async () => {
  if (!plan || !brief.referenceVideo?.serverId) return;
  const key = requireApiKey();
  if (!key) return;
  setBusy(`Extracting ${plan.scenes.length} frames from reference video`);
  try {
    const { plan: enrichedPlan, newReferences } = await extractAndApplyReferenceVideoBeats({
      apiKey: key,
      serverId: brief.referenceVideo.serverId,
      plan,
      durationSeconds: brief.referenceVideo.durationSeconds,
    });
    setReferences((prev) => (prev.length === 0 ? newReferences : prev));
    let activePlan = enrichedPlan;

    // Also ensure scene clips are chopped and ready
    try {
      let runningTime = 0;
      const sceneSlices = activePlan.scenes.map((s, idx) => {
        const startSeconds = runningTime;
        const durationSeconds = Math.max(1, Math.round(s.durationSeconds || 5));
        runningTime += durationSeconds;
        return {
          sceneId: s.id,
          order: s.order || idx + 1,
          startSeconds,
          durationSeconds,
        };
      });
      const slicedClips = await sliceReferenceVideoClips({
        apiKey: key,
        brainstormId: brief.referenceVideo.serverId,
        scenes: sceneSlices,
      });
      if (slicedClips.length > 0) {
        activePlan = {
          ...activePlan,
          scenes: activePlan.scenes.map((s) => {
            const clip = slicedClips.find((c) => c.sceneId === s.id || c.order === s.order);
            if (clip) {
              return {
                ...s,
                referenceClipFile: clip.clipFile,
                referenceClipUrl: clip.clipUrl,
                referenceClipStartSeconds: clip.startSeconds,
                referenceClipDurationSeconds: clip.durationSeconds,
                customClipFile: s.customClipFile || clip.clipFile,
                customClipUrl: s.customClipUrl || clip.clipUrl,
              };
            }
            return s;
          }),
        };
      }
    } catch (sliceErr) {
      videoLogError("storyboard", "failed to slice reference video clips in syncAllFrames", sliceErr);
    }

    setPlan(activePlan);
    setFrames((prev) =>
      prev.map((f) => {
        const s = activePlan.scenes.find((sc) => sc.id === f.sceneId);
        const realPhoto = s?.order === 1 && references.length > 0 ? references[0]?.dataUrl : undefined;
        const targetUrl = realPhoto ?? s?.postCutReferenceDataUrl;
        if (targetUrl) {
          return {
            ...f,
            status: "done",
            imageDataUrl: targetUrl,
            environmentStatus: "done",
            environmentDataUrl: targetUrl,
          };
        }
        return f;
      }),
    );
  } catch (e) {
    videoLogError("storyboard", "failed to sync all frames from reference video", e);
    setError(errorText(e));
  } finally {
    setBusy(null);
  }
}, [brief.referenceVideo, plan, requireApiKey, references, setBusy, setError, setFrames, setPlan, setReferences]);

const regenerateEnvironmentPlate = useCallback(
  async (sceneId: string) => {
    const key = requireApiKey();
    if (!key || !plan) return;
    // ZERO HALLUCINATION LOCK: Reference video environment is the real frame; no synthetic plate
    if (brief.referenceVideo?.serverId || plan.referenceStillsFlythrough) {
      await restoreReferenceFrame(sceneId);
      return;
    }
    const run = runRef.current;
    const index = plan.scenes.findIndex((s) => s.id === sceneId);
    const currentEnvUrl = frames.find((f) => f.sceneId === sceneId)?.environmentDataUrl;
    const existing = new Map(frames.filter((f) => f.imageDataUrl && f.sceneId !== sceneId).map((f) => [f.sceneId, f.imageDataUrl as string]));
    const existingEnv = new Map(frames.filter((f) => f.environmentDataUrl && f.sceneId !== sceneId).map((f) => [f.sceneId, f.environmentDataUrl as string]));
    const currentEnv = currentEnvUrl ? new Map([[sceneId, currentEnvUrl]]) : new Map<string, string>();
    const next = plan.scenes[index + 1];
    setBusy(`Re-rendering environment plate and keyframe for scene ${plan.scenes[index]?.order ?? ""}`);
    await drawScenes(key, run, plan, [sceneId], next ? [sceneId, next.id] : [sceneId], existing, new Map(), existingEnv, currentEnv);
    setBusy(null);
  },
  [brief.referenceVideo, drawScenes, frames, plan, requireApiKey, restoreReferenceFrame, runRef, setBusy],
);

const rerenderSceneClip = useCallback(
  async (sceneId: string, customPrompt?: string) => {
    const key = requireApiKey();
    if (!key || !plan || !render) return;
    const scene = plan.scenes.find((s) => s.id === sceneId);
    const frame = frames.find((f) => f.sceneId === sceneId);
    let promptToUse = customPrompt?.trim() || frame?.videoPrompt?.trim() || scene?.motionPrompt?.trim() || "";
    if (!scene || !frame?.imageDataUrl || !promptToUse) {
      setError("Scene needs a finished storyboard frame and clip prompt before re-rendering.");
      return;
    }

    // Decision Model (Liquid d1.1) Anti-Morphing & Anti-Artifact Audit
    try {
      const { auditSceneClipWithDecisionAgent } = await import("@/lib/decision-tree/studio-decision-auditor");
      const audit = await auditSceneClipWithDecisionAgent({
        sceneTitle: scene.title,
        sceneOrder: scene.order,
        videoPrompt: promptToUse,
        apiKey: key,
        hasReferenceStill: Boolean(plan.referenceStillsFlythrough || scene.postCutReferenceDataUrl || frame.imageDataUrl),
        briefContext: `${plan.title} ${plan.logline} ${prompt} ${(scene.revisionNotes || []).join(" ")}`,
      });
      if (audit.enhancedPrompt) {
        promptToUse = audit.enhancedPrompt;
      }
      videoLog("render", `scene ${scene.order} Decision Model audit: ${audit.verdict}`, {
        antiMorphing: audit.antiMorphingScore,
        artifactFree: audit.artifactFreeProbability,
        refFidelity: audit.referenceFidelityScore,
      });
    } catch (auditErr) {
      videoLogError("render", `scene ${scene.order} decision audit warning`, auditErr);
    }

    if (promptToUse !== frame.videoPrompt) {
      setFrames((prev) =>
        prev.map((f) => (f.sceneId === sceneId ? { ...f, videoPrompt: promptToUse } : f)),
      );
    }
    setError("");
    setBusy(`Re-rendering clip for scene ${scene.order}`);
    try {
      const snapshot = await rerenderVideoScene({
        apiKey: key,
        renderId: render.id,
        sceneId,
        dataUrl: frame.imageDataUrl,
        videoPrompt: promptToUse,
        narration: scene.narration,
        transitionIn: scene.transitionIn,
      });
      setRender(snapshot);
      advance("render");
    } catch (e) {
      videoLogError("render", `scene ${scene.order} rerender failed`, e);
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  },
  [advance, frames, plan, render, requireApiKey, prompt, setBusy, setError, setFrames, setRender],
);

const clearSceneRevisionNotes = useCallback((sceneId: string) => {
  setPlan((prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      scenes: prev.scenes.map((s) => (s.id === sceneId ? { ...s, revisionNotes: [] } : s)),
    };
  });
}, [setPlan]);

const restitchVideo = useCallback(
  async (overridePlan?: VideoPlan) => {
    const key = requireApiKey();
    const activePlan = overridePlan ?? plan;
    if (!key || !activePlan || !render) return;
    setError("");
    setBusy("Re-assembling the final cut with updated transitions");
    try {
      const snapshot = await restitchVideoRender({
        apiKey: key,
        renderId: render.id,
        fadeInSeconds: activePlan.fadeInSeconds ?? 0,
        fadeOutSeconds: activePlan.fadeOutSeconds ?? 0,
        scenes: activePlan.scenes.map((s) => ({
          id: s.id,
          order: s.order,
          durationSeconds: s.durationSeconds,
          transitionIn: s.transitionIn,
          customClipFile: s.customClipFile,
        })),
      });
      setRender(snapshot);
    } catch (e) {
      videoLogError("render", "restitch failed", e);
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  },
  [plan, render, requireApiKey, setBusy, setError, setRender],
);

  return {
    regenerateFrame,
    syncAllFramesFromReferenceVideo,
    regenerateEnvironmentPlate,
    rerenderSceneClip,
    clearSceneRevisionNotes,
    restitchVideo,
  };
}
