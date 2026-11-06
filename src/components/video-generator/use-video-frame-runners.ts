import { errorText } from "@/components/video-generator/video-generator-helpers";
import { useCallback } from "react";
import { sceneBeatReferenceDataUrls } from "@/lib/video-generator/video-client-location-reference";
import { writeSceneVideoPrompt } from "@/lib/video-generator/video-cinematographer-agent";
import type { StoryboardFrame, VideoPlan } from "@/lib/video-generator/video-generator-types";
import { generateEnvironmentPlate, generateStoryboardFrame } from "@/lib/video-generator/video-storyboard-agent";
import { videoLog, videoLogError } from "@/lib/video-generator/video-log";
import type { VideoGeneratorState } from "@/components/video-generator/use-video-generator-state";

export function useVideoFrameRunners(s: VideoGeneratorState) {
  const {
    imageModel,
    prompt,
    aspect,
    references,
    referenceVideo,
    subject,
    plan,
    setFrames,
    render,
    error,
    productLock,
    runRef,
    productViewsMap,
    brief,
  } = s;

const runEnvironment = useCallback(
  async (
    key: string,
    run: number,
    currentPlan: VideoPlan,
    sceneId: string,
    opts: { masterEnvironmentDataUrl?: string; currentEnvironmentDataUrl?: string } = {},
  ): Promise<string | undefined> => {
    const scene = currentPlan.scenes.find((s) => s.id === sceneId);
    if (!scene) return undefined;
    const patch = (next: Partial<StoryboardFrame>) => {
      if (runRef.current !== run) return;
      setFrames((prev) => prev.map((f) => (f.sceneId === sceneId ? { ...f, ...next } : f)));
    };
    patch({ environmentStatus: "generating", error: undefined });
    try {
      const environmentDataUrl = await generateEnvironmentPlate({
        apiKey: key,
        imageModel,
        plan: currentPlan,
        scene,
        aspect,
        masterEnvironmentDataUrl: opts.masterEnvironmentDataUrl,
        currentEnvironmentDataUrl: opts.currentEnvironmentDataUrl,
      });
      if (runRef.current !== run) return undefined;
      patch({ environmentStatus: "done", environmentDataUrl });
      return environmentDataUrl;
    } catch (e) {
      videoLogError("storyboard", `scene ${scene.order} environment plate failed`, e);
      patch({ environmentStatus: "failed", status: "failed", error: errorText(e) });
      return undefined;
    }
  },
  [aspect, imageModel, runRef, setFrames],
);

/** Draws one frame; resolves to the image data URL, or undefined when the tile failed or the run is stale. */
const runFrame = useCallback(
  async (
    key: string,
    run: number,
    currentPlan: VideoPlan,
    sceneId: string,
    refs: {
      environmentDataUrl?: string;
      sameLocationFrameDataUrl?: string;
      heroFrameDataUrl?: string;
      currentFrameDataUrl?: string;
    } = {},
  ): Promise<string | undefined> => {
    const scene = currentPlan.scenes.find((s) => s.id === sceneId);
    if (!scene) return undefined;
    const patch = (next: Partial<StoryboardFrame>) => {
      if (runRef.current !== run) return;
      setFrames((prev) => prev.map((f) => (f.sceneId === sceneId ? { ...f, ...next } : f)));
    };
    patch({
      status: "generating",
      error: undefined,
      imageDataUrl: currentPlan.referenceStillsFlythrough || Boolean(brief.referenceVideo?.serverId) ? undefined : refs.currentFrameDataUrl,
      videoPrompt: undefined,
    });
    try {
      const sceneReferenceDataUrls = sceneBeatReferenceDataUrls(scene, references);
      const imageDataUrl = await generateStoryboardFrame({
        apiKey: key,
        imageModel,
        plan: currentPlan,
        scene,
        aspect,
        subjectDataUrl: subject?.dataUrl,
        productSpec: scene.productView ? productLock.spec : undefined,
        productViews: productViewsMap,
        environmentDataUrl: refs.environmentDataUrl,
        sameLocationFrameDataUrl: refs.sameLocationFrameDataUrl,
        sceneReferenceDataUrls,
        heroFrameDataUrl: refs.heroFrameDataUrl,
        currentFrameDataUrl: refs.currentFrameDataUrl,
        referenceStillsFlythrough: Boolean(currentPlan.referenceStillsFlythrough || brief.referenceVideo?.serverId),
        beatReferenceFileName: scene.postCutReferenceFileName ?? references[scene.referenceIndexes[0] - 1]?.fileName,
      });
      if (runRef.current !== run) {
        videoLog("storyboard", `scene ${scene.order} frame dropped: run ${run} is stale (current run ${runRef.current})`);
        return undefined;
      }
      patch({ status: "done", imageDataUrl });
      return imageDataUrl;
    } catch (e) {
      videoLogError("storyboard", `scene ${scene.order} failed`, e);
      patch({ status: "failed", error: errorText(e) });
      return undefined;
    }
  },
  [aspect, brief.referenceVideo?.serverId, imageModel, productLock.spec, productViewsMap, references, subject, runRef, setFrames],
);

/** Strict 1:1: use the brief upload or cut video frame as the storyboard still (motion is added at render). */
const runPassthroughFrame = useCallback(
  async (run: number, currentPlan: VideoPlan, sceneId: string): Promise<string | undefined> => {
    const scene = currentPlan.scenes.find((s) => s.id === sceneId);
    if (!scene) return undefined;
    const patch = (next: Partial<StoryboardFrame>) => {
      if (runRef.current !== run) return;
      setFrames((prev) => prev.map((f) => (f.sceneId === sceneId ? { ...f, ...next } : f)));
    };
    patch({ status: "generating", environmentStatus: "done", error: undefined, videoPrompt: undefined });
    try {
      const imageDataUrl = scene.postCutReferenceDataUrl ?? sceneBeatReferenceDataUrls(scene, references)[0];
      if (!imageDataUrl?.startsWith("data:image/")) {
        throw new Error(
          `Scene ${scene.order} has no reference still. Match one upload per scene or regenerate the plan.`,
        );
      }
      if (runRef.current !== run) return undefined;
      patch({ status: "done", imageDataUrl, environmentStatus: "done", environmentDataUrl: imageDataUrl });
      videoLog("storyboard", `scene ${scene.order} passthrough still`, {
        fileName: scene.postCutReferenceFileName ?? references[scene.referenceIndexes[0] - 1]?.fileName,
      });
      return imageDataUrl;
    } catch (e) {
      videoLogError("storyboard", `scene ${scene.order} passthrough failed`, e);
      patch({ status: "failed", error: errorText(e) });
      return undefined;
    }
  },
  [references, runRef, setFrames],
);

/** Cinematographer writes scene `index`'s clip prompt from its frame and the previous frame; a failure fails the tile. */
const writePrompt = useCallback(
  async (
    key: string,
    run: number,
    currentPlan: VideoPlan,
    index: number,
    frameDataUrl: string,
    previousFrameDataUrl?: string,
  ): Promise<string | undefined> => {
    const scene = currentPlan.scenes[index];
    const patch = (next: Partial<StoryboardFrame>) => {
      if (runRef.current !== run) return;
      setFrames((prev) => prev.map((f) => (f.sceneId === scene.id ? { ...f, ...next } : f)));
    };
    try {
      const videoPrompt = await writeSceneVideoPrompt({
        apiKey: key,
        plan: currentPlan,
        scene,
        frameDataUrl,
        productSpec: scene.productView ? productLock.spec : undefined,
        previousScene: currentPlan.scenes[index - 1],
        previousFrameDataUrl,
        nextScene: currentPlan.scenes[index + 1],
      });
      if (runRef.current !== run) {
        videoLog("cinematographer", `scene ${scene.order} prompt dropped: run ${run} is stale (current run ${runRef.current})`);
        return undefined;
      }
      patch({ videoPrompt });
      return videoPrompt;
    } catch (e) {
      videoLogError("cinematographer", `scene ${scene.order} failed`, e);
      patch({ status: "failed", error: errorText(e) });
      return undefined;
    }
  },
  [productLock.spec, runRef, setFrames],
);

/**
 * 1. Renders Environment Plates per location (`environmentId` master first, then same-location angle/lighting variants) and tiles them into an Environment Harness.
 * 2. Draws keyframes (`drawIds`), chaining same-location keyframes so ground, piers, and surroundings stay locked across consecutive shots.
 * 3. Writes Cinematographer clip prompts (`promptIds`).
 */

  return {
    runEnvironment,
    runFrame,
    runPassthroughFrame,
    writePrompt,
  };
}
