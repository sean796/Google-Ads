import { errorText, extractAndApplyReferenceVideoBeats } from "@/components/video-generator/video-generator-helpers";
import { useCallback } from "react";
import { isReferenceStillsFlythroughBrief } from "@/lib/video-generator/video-client-location-reference";
import { applyReferenceStillsFlythroughPlan } from "@/lib/video-generator/video-director-agent";
import { hasAttachedReferenceVideo } from "@/lib/video-generator/video-director-agent";
import type { VideoPlan } from "@/lib/video-generator/video-generator-types";
import { sliceReferenceVideoClips } from "@/lib/video-generator/video-render-api";
import { videoLogError } from "@/lib/video-generator/video-log";
import type { VideoGeneratorState } from "@/components/video-generator/use-video-generator-state";
import type { useVideoDrawScenes } from "@/components/video-generator/use-video-draw-scenes";

export function useVideoStoryboard(
  s: VideoGeneratorState,
  scenes: ReturnType<typeof useVideoDrawScenes>,
) {
  const { drawScenes } = scenes;
  const {
    setStep,
    setMaxStep,
    setReferences,
    referenceVideo,
    plan,
    setPlan,
    frames,
    setFrames,
    setSelectedSceneId,
    setRender,
    setBusy,
    setError,
    brief,
    bumpRun,
    advance,
    requireApiKey,
  } = s;

const beginStoryboard = useCallback(
  async (key: string, next: VideoPlan) => {
    let activePlan = next;
    if (brief.referenceVideo?.serverId) {
      if (activePlan.scenes.some((s) => !s.postCutReferenceDataUrl)) {
        setBusy(`Extracting ${activePlan.scenes.length} reference stills from your video`);
        try {
          const { plan: enrichedPlan, newReferences } = await extractAndApplyReferenceVideoBeats({
            apiKey: key,
            serverId: brief.referenceVideo.serverId,
            plan: activePlan,
            durationSeconds: brief.referenceVideo.durationSeconds,
          });
          setReferences((prev) => (prev.length === 0 ? newReferences : prev));
          activePlan = enrichedPlan;
          setPlan(activePlan);
        } catch (cutErr) {
          videoLogError("storyboard", "failed to extract reference video beats in beginStoryboard", cutErr);
        }
      }

      // Chop reference video into exact scene clips for zero-hallucination ground truth
      if (activePlan.scenes.some((s) => !s.referenceClipFile)) {
        setBusy(`Chopping reference video into ${activePlan.scenes.length} scene clips (zero-hallucination reference)`);
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
            setPlan(activePlan);
          }
        } catch (sliceErr) {
          videoLogError("storyboard", "failed to slice reference video clips in beginStoryboard", sliceErr);
        }
      }
    }
    const run = bumpRun(`storyboard for "${activePlan.title}", ${activePlan.scenes.length} frames`);
    setFrames(activePlan.scenes.map((s) => ({ sceneId: s.id, status: "waiting" as const, environmentStatus: "waiting" as const })));
    setRender(null);
    setSelectedSceneId(activePlan.scenes[0].id);
    setMaxStep("storyboard");
    advance("storyboard");
    const ids = activePlan.scenes.map((s) => s.id);
    await drawScenes(key, run, activePlan, ids, ids, new Map());
  },
  [advance, brief.referenceVideo, bumpRun, drawScenes, setBusy, setFrames, setMaxStep, setPlan, setReferences, setRender, setSelectedSceneId],
);

/** A new plan lands in the Pre-Scene Brief Review & Approval stage first (no storyboard frames drawn until approved). */
const startPlan = useCallback(
  async (_key: string, next: VideoPlan) => {
    bumpRun(`plan "${next.title}" landed for pre-scene review`);
    setPlan(next);
    setFrames([]);
    setRender(null);
    setSelectedSceneId(next.scenes[0]?.id ?? null);
    setStep("plan");
    setMaxStep("plan");
  },
  [bumpRun, setFrames, setMaxStep, setPlan, setRender, setSelectedSceneId, setStep],
);

const toggleSceneApproved = useCallback((sceneId: string) => {
  setPlan((prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      scenes: prev.scenes.map((s) => (s.id === sceneId ? { ...s, approved: !s.approved } : s)),
    };
  });
}, [setPlan]);

const approveAllScenes = useCallback(() => {
  setPlan((prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      scenes: prev.scenes.map((s) => ({ ...s, approved: true })),
    };
  });
}, [setPlan]);

const approvePlanAndBeginStoryboard = useCallback(async () => {
  const key = requireApiKey();
  if (!key || !plan) return;
  let targetPlan = plan;
  if (brief.referenceVideo?.serverId && targetPlan.scenes.some((s) => !s.postCutReferenceDataUrl)) {
    setBusy(`Extracting ${targetPlan.scenes.length} reference stills from your video`);
    try {
      const { plan: enrichedPlan, newReferences } = await extractAndApplyReferenceVideoBeats({
        apiKey: key,
        serverId: brief.referenceVideo.serverId,
        plan: targetPlan,
        durationSeconds: brief.referenceVideo.durationSeconds,
      });
      setReferences((prev) => (prev.length === 0 ? newReferences : prev));
      targetPlan = enrichedPlan;
    } catch (cutErr) {
      videoLogError("storyboard", "failed to extract reference video beats on approve", cutErr);
    }
  }
  const expandedPlan = !hasAttachedReferenceVideo(brief) && isReferenceStillsFlythroughBrief(brief)
    ? applyReferenceStillsFlythroughPlan(targetPlan, brief)
    : targetPlan;
  const approvedPlan: VideoPlan = {
    ...expandedPlan,
    scenes: expandedPlan.scenes.map((s) => ({
      ...s,
      durationSeconds: Math.max(4, Math.min(15, Math.round(s.durationSeconds || 5))),
      approved: true,
    })),
  };
  setPlan(approvedPlan);
  setError("");
  try {
    await beginStoryboard(key, approvedPlan);
  } catch (e) {
    videoLogError("storyboard", "approve & begin failed", e);
    setError(errorText(e));
  } finally {
    setBusy(null);
  }
}, [beginStoryboard, brief, plan, requireApiKey, setBusy, setError, setPlan, setReferences]);

const continueToProduct = useCallback(() => advance("product"), [advance]);

  return {
    beginStoryboard,
    startPlan,
    toggleSceneApproved,
    approveAllScenes,
    approvePlanAndBeginStoryboard,
    continueToProduct,
  };
}
