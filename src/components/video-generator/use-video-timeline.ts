import { errorText } from "@/components/video-generator/video-generator-helpers";
import { useCallback } from "react";
import type { StoryboardFrame, VideoPlan, VideoScenePlan, VideoStoredClip, VideoTransition } from "@/lib/video-generator/video-generator-types";
import { rerenderVideoScene, uploadTimelineVideoClip } from "@/lib/video-generator/video-render-api";
import { videoLogError } from "@/lib/video-generator/video-log";
import type { VideoGeneratorState } from "@/components/video-generator/use-video-generator-state";
import type { useVideoDrawScenes } from "@/components/video-generator/use-video-draw-scenes";
import type { useVideoFrameRegen } from "@/components/video-generator/use-video-frame-regen";

export function useVideoTimeline(
  s: VideoGeneratorState,
  scenes: ReturnType<typeof useVideoDrawScenes>,
  frameRegen: ReturnType<typeof useVideoFrameRegen>,
) {
  const { drawScenes } = scenes;
  const { restitchVideo } = frameRegen;
  const {
    setStep,
    setMaxStep,
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
    productLock,
    effectiveProjectName,
    bumpRun,
    requireApiKey,
    apiKeyRef,
  } = s;

const normalizeTimelineScenes = useCallback((scenes: VideoScenePlan[]): VideoScenePlan[] => {
  return scenes.map((sc, idx) => {
    if (idx === 0) {
      const { transitionIn: _drop, ...rest } = sc;
      return { ...rest, order: 1 };
    }
    return {
      ...sc,
      order: idx + 1,
      transitionIn: sc.transitionIn ?? { type: "dissolve", seconds: 0.7 },
    };
  });
}, []);

const insertClipSceneIntoTimeline = useCallback(
  (entry: {
    title: string;
    durationSeconds: number;
    clipFile: string;
    clipUrl: string;
    thumbnailDataUrl?: string;
  }) => {
    const newSceneId = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const baseScene: VideoScenePlan = {
      id: newSceneId,
      order: 1,
      title: entry.title,
      durationSeconds: Math.max(1, Math.min(60, Math.round(entry.durationSeconds || 5))),
      sceneInstructions: `Uploaded video clip: ${entry.title}`,
      storyboardPrompt: `Uploaded video clip: ${entry.title}`,
      motionPrompt: "Play uploaded video clip.",
      continuityNotes: "",
      narration: "",
      referenceIndexes: [],
      approved: true,
      customClipFile: entry.clipFile,
      customClipUrl: entry.clipUrl,
    };
    const newFrame: StoryboardFrame = {
      sceneId: newSceneId,
      status: "done",
      imageDataUrl: entry.thumbnailDataUrl || undefined,
      videoPrompt: "Uploaded video clip",
    };

    let nextPlan: VideoPlan;
    if (!plan) {
      nextPlan = {
        title: effectiveProjectName,
        logline: "Custom timeline video project.",
        voice: "none",
        fadeInSeconds: 0.6,
        fadeOutSeconds: 0.8,
        continuity: {
          heroSubject: productLock.spec?.name ?? "Subject",
          screenDirection: "left_to_right",
          cameraSide: "front",
          palette: "natural",
          lightArc: "daylight",
        },
        scenes: [baseScene],
      };
      setFrames([newFrame]);
      setStep("storyboard");
      setMaxStep("storyboard");
    } else {
      const selectedIdx = plan.scenes.findIndex((s) => s.id === selectedSceneId);
      const insertAt = selectedIdx >= 0 ? selectedIdx + 1 : plan.scenes.length;
      const copy = [...plan.scenes];
      copy.splice(insertAt, 0, baseScene);
      nextPlan = {
        ...plan,
        scenes: normalizeTimelineScenes(copy),
      };
      setFrames((prev) => [...prev, newFrame]);
    }

    setPlan(nextPlan);
    setSelectedSceneId(newSceneId);
    if (render && render.scenes.every((s) => s.status === "done")) {
      void restitchVideo(nextPlan);
    }
  },
  [effectiveProjectName, normalizeTimelineScenes, plan, productLock.spec?.name, render, restitchVideo, selectedSceneId, setFrames, setMaxStep, setPlan, setSelectedSceneId, setStep],
);

const addVideoClipFilesToTimeline = useCallback(
  async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("video/"));
    if (!list.length) return;
    setError("");
    setBusy(`Uploading ${list.length === 1 ? list[0].name : `${list.length} video clips`} to timeline`);
    try {
      for (const file of list) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
          reader.readAsDataURL(file);
        });
        const uploaded = await uploadTimelineVideoClip({
          apiKey: apiKeyRef.current,
          fileName: file.name,
          dataUrl,
        });
        const cleanTitle = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || "Video Clip";
        insertClipSceneIntoTimeline({
          title: cleanTitle,
          durationSeconds: uploaded.durationSeconds,
          clipFile: uploaded.clipFile,
          clipUrl: uploaded.clipUrl,
          thumbnailDataUrl: uploaded.thumbnailDataUrl,
        });
      }
    } catch (e) {
      videoLogError("render", "upload timeline clip failed", e);
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  },
  [insertClipSceneIntoTimeline, apiKeyRef, setBusy, setError],
);

const addStoredClipToTimeline = useCallback(
  (clip: VideoStoredClip, label?: string) => {
    if (!clip.clipFile || !clip.clipUrl) return;
    insertClipSceneIntoTimeline({
      title: label ?? `Clip S${clip.order}`,
      durationSeconds: clip.durationSeconds || 5,
      clipFile: clip.clipFile,
      clipUrl: clip.clipUrl,
      thumbnailDataUrl: clip.frameUrl,
    });
  },
  [insertClipSceneIntoTimeline],
);

const moveSceneInTimeline = useCallback(
  (sceneId: string, direction: -1 | 1) => {
    if (!plan) return;
    const idx = plan.scenes.findIndex((s) => s.id === sceneId);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= plan.scenes.length) return;
    const copy = [...plan.scenes];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    const nextPlan: VideoPlan = {
      ...plan,
      scenes: normalizeTimelineScenes(copy),
    };
    setPlan(nextPlan);
    if (render && render.scenes.every((s) => s.status === "done")) {
      void restitchVideo(nextPlan);
    }
  },
  [normalizeTimelineScenes, plan, render, restitchVideo, setPlan],
);

const removeSceneFromTimeline = useCallback(
  (sceneId: string) => {
    if (!plan || plan.scenes.length <= 1) return;
    const filtered = plan.scenes.filter((s) => s.id !== sceneId);
    const nextPlan: VideoPlan = {
      ...plan,
      scenes: normalizeTimelineScenes(filtered),
    };
    setPlan(nextPlan);
    setFrames((prev) => prev.filter((f) => f.sceneId !== sceneId));
    if (selectedSceneId === sceneId) {
      setSelectedSceneId(nextPlan.scenes[0]?.id ?? null);
    }
    if (render && render.scenes.every((s) => s.status === "done")) {
      void restitchVideo(nextPlan);
    }
  },
  [normalizeTimelineScenes, plan, render, restitchVideo, selectedSceneId, setFrames, setPlan, setSelectedSceneId],
);

const updateSceneTransition = useCallback(
  (sceneId: string, transition: VideoTransition, applyToAll = false) => {
    if (!plan) return;
    const nextPlan: VideoPlan = {
      ...plan,
      scenes: plan.scenes.map((s, idx) => {
        if (idx === 0) return s;
        if (applyToAll || s.id === sceneId) {
          return { ...s, transitionIn: transition };
        }
        return s;
      }),
    };
    setPlan(nextPlan);
    if (render && render.scenes.every((s) => s.status === "done")) {
      void restitchVideo(nextPlan);
    }
  },
  [plan, render, restitchVideo, setPlan],
);

const updatePlanFades = useCallback(
  (fadeInSeconds: number, fadeOutSeconds: number) => {
    if (!plan) return;
    const nextPlan: VideoPlan = {
      ...plan,
      fadeInSeconds,
      fadeOutSeconds,
    };
    setPlan(nextPlan);
    if (render && render.scenes.every((s) => s.status === "done")) {
      void restitchVideo(nextPlan);
    }
  },
  [plan, render, restitchVideo, setPlan],
);

const updateScenePrompts = useCallback(
  async (
    sceneId: string,
    patch: {
      environmentPrompt?: string;
      storyboardPrompt?: string;
      motionPrompt?: string;
      videoPrompt?: string;
      postCutReferenceDataUrl?: string;
      postCutReferenceFileName?: string;
      customClipFile?: string | null;
      customClipUrl?: string | null;
    },
    action?: "save" | "redraw" | "rerender",
  ) => {
    if (!plan) return;
    const before = plan.scenes.find((s) => s.id === sceneId);
    if (!before) return;
    const updatedScene = {
      ...before,
      ...(patch.environmentPrompt !== undefined ? { environmentPrompt: patch.environmentPrompt } : {}),
      ...(patch.storyboardPrompt !== undefined ? { storyboardPrompt: patch.storyboardPrompt } : {}),
      ...(patch.motionPrompt !== undefined ? { motionPrompt: patch.motionPrompt } : {}),
      ...(patch.postCutReferenceDataUrl !== undefined ? { postCutReferenceDataUrl: patch.postCutReferenceDataUrl } : {}),
      ...(patch.postCutReferenceFileName !== undefined ? { postCutReferenceFileName: patch.postCutReferenceFileName } : {}),
      ...(patch.customClipFile !== undefined ? { customClipFile: patch.customClipFile === null ? undefined : patch.customClipFile } : {}),
      ...(patch.customClipUrl !== undefined ? { customClipUrl: patch.customClipUrl === null ? undefined : patch.customClipUrl } : {}),
    };
    const nextPlan: VideoPlan = {
      ...plan,
      scenes: plan.scenes.map((s) => (s.id === sceneId ? updatedScene : s)),
    };
    setPlan(nextPlan);
    if (patch.videoPrompt !== undefined) {
      setFrames((prev) =>
        prev.map((f) => (f.sceneId === sceneId ? { ...f, videoPrompt: patch.videoPrompt } : f)),
      );
    }
    const key = requireApiKey();
    if (!key || !action || action === "save") return;
    if (action === "redraw") {
      setError("");
      try {
        const run = bumpRun(`manual redraw scene ${updatedScene.order}`);
        const index = nextPlan.scenes.findIndex((s) => s.id === sceneId);
        const refChanged = Boolean(patch.postCutReferenceDataUrl && patch.postCutReferenceDataUrl !== before.postCutReferenceDataUrl);
        const currentFrame = refChanged ? undefined : frames.find((f) => f.sceneId === sceneId)?.imageDataUrl;
        const currentEnvUrl = frames.find((f) => f.sceneId === sceneId)?.environmentDataUrl;
        const envChanged = refChanged || (patch.environmentPrompt !== undefined && patch.environmentPrompt !== before.environmentPrompt);
        const existing = new Map(frames.filter((f) => f.imageDataUrl && f.sceneId !== sceneId).map((f) => [f.sceneId, f.imageDataUrl as string]));
        const existingEnv = new Map(
          frames
            .filter((f) => f.environmentDataUrl && (!envChanged || f.sceneId !== sceneId))
            .map((f) => [f.sceneId, f.environmentDataUrl as string]),
        );
        const next = nextPlan.scenes[index + 1];
        const { framesById, promptsById } = await drawScenes(
          key,
          run,
          nextPlan,
          [sceneId],
          next ? [sceneId, next.id] : [sceneId],
          existing,
          currentFrame ? new Map([[sceneId, currentFrame]]) : new Map(),
          existingEnv,
          envChanged && currentEnvUrl ? new Map([[sceneId, currentEnvUrl]]) : new Map(),
        );
        if (render && framesById.get(sceneId) && promptsById.get(sceneId)) {
          setBusy(`Re-rendering clip for scene ${updatedScene.order}`);
          const snapshot = await rerenderVideoScene({
            apiKey: key,
            renderId: render.id,
            sceneId,
            dataUrl: framesById.get(sceneId)!,
            videoPrompt: promptsById.get(sceneId)!,
            narration: updatedScene.narration,
            transitionIn: updatedScene.transitionIn,
          });
          setRender(snapshot);
        }
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(null);
      }
    } else if (action === "rerender" && render) {
      const frame = frames.find((f) => f.sceneId === sceneId);
      const vp = patch.videoPrompt ?? frame?.videoPrompt;
      if (!frame?.imageDataUrl || !vp) return;
      setError("");
      setBusy(`Re-rendering clip for scene ${updatedScene.order}`);
      try {
        const snapshot = await rerenderVideoScene({
          apiKey: key,
          renderId: render.id,
          sceneId,
          dataUrl: frame.imageDataUrl,
          videoPrompt: vp,
          narration: updatedScene.narration,
          transitionIn: updatedScene.transitionIn,
        });
        setRender(snapshot);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(null);
      }
    }
  },
  [bumpRun, drawScenes, frames, plan, render, requireApiKey, setBusy, setError, setFrames, setPlan, setRender],
);

  return {
    normalizeTimelineScenes,
    insertClipSceneIntoTimeline,
    addVideoClipFilesToTimeline,
    addStoredClipToTimeline,
    moveSceneInTimeline,
    removeSceneFromTimeline,
    updateSceneTransition,
    updatePlanFades,
    updateScenePrompts,
  };
}
