import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ManualImageReference } from "@/lib/image-generator/manual-reference-upload";
import {
  manualReferenceFromDataUrl,
  prepareVideoStudioReference,
  referenceUploadFiles,
} from "@/lib/image-generator/manual-reference-upload";
import { sceneBeatReferenceDataUrls } from "@/lib/video-generator/video-client-location-reference";
import { getImageModel, getVideoModel } from "@/lib/optimization-settings-storage";
import { writeGlobalVideoAgentModel } from "@/lib/global-agent-models";
import type { OpenRouterAppStreamDelta } from "@/lib/openrouter-app-api";
import { writeSceneVideoPrompt } from "@/lib/video-generator/video-cinematographer-agent";
import { runVideoDirectorClarify, runVideoDirectorPlan } from "@/lib/video-generator/video-director-agent";
import { runVideoDirectorRevisePlan, runVideoDirectorReviseScene } from "@/lib/video-generator/video-director-revise";
import type {
  ProductLockState,
  ProductViewId,
  StoryboardFrame,
  VideoBrief,
  VideoClarifyQuestion,
  VideoPlan,
  VideoProjectSnapshot,
  VideoProjectSummary,
  VideoRenderSnapshot,
  PostCutSceneReference,
  VideoScenePlan,
  VideoStoredClip,
  VideoStoredRenderSummary,
  VideoTransition,
} from "@/lib/video-generator/video-generator-types";
import {
  generateProductView,
  initialProductViews,
  surveyProduct,
} from "@/lib/video-generator/video-product-agent";
import {
  DEFAULT_VIDEO_MODEL,
  DEFAULT_VOICE_MODEL,
  VIDEO_LENGTH_OPTIONS,
  defaultResolutionForVideoModel,
  estimateVideoCostUsd,
  resolutionsForVideoModel,
  type VideoAspect,
  type VideoLengthSeconds,
  type VideoResolution,
} from "@/lib/video-generator/video-model-defaults";
import {
  createVideoRender,
  deleteVideoProject,
  exportVideoProjectZip,
  fetchVideoRender,
  listVideoProjects,
  loadVideoProject,
  parseVideoProjectJson,
  rerenderVideoScene,
  restitchVideoRender,
  saveVideoProject,
  serializeVideoProjectJson,
  startVideoRender,
  uploadTimelineVideoClip,
  uploadVideoRenderFrame,
} from "@/lib/video-generator/video-render-api";
import { buildSubjectHarness } from "@/lib/video-generator/video-brainstorm-api";
import { generateEnvironmentPlate, generateStoryboardFrame } from "@/lib/video-generator/video-storyboard-agent";
import { videoLog, videoLogError, videoTimer } from "@/lib/video-generator/video-log";
import { stepIndex, type VideoGeneratorStep } from "./video-generator-steps";

const RENDER_POLL_MS = 10_000;

export type InstructionScope = "scene" | "video";

/** What Brainstorming hands to the Brief. */
export type BrainstormBrief = {
  prompt: string;
  lengthSeconds: VideoLengthSeconds;
  aspect: VideoAspect;
  references: ManualImageReference[];
};

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function makeProjectId(): string {
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useVideoGenerator(apiKey: string) {
  const [projectId, setProjectId] = useState<string>(() => makeProjectId());
  const [projectName, setProjectName] = useState<string>("");
  const [savedProjects, setSavedProjects] = useState<VideoProjectSummary[]>([]);
  const [storedRenders, setStoredRenders] = useState<VideoStoredRenderSummary[]>([]);
  const [videoModel, setVideoModelState] = useState<string>(() =>
    typeof window === "undefined" ? DEFAULT_VIDEO_MODEL : getVideoModel(),
  );
  const imageModel = getImageModel();

  const [step, setStep] = useState<VideoGeneratorStep>("brainstorm");
  const [maxStep, setMaxStep] = useState<VideoGeneratorStep>("brief");
  const [prompt, setPrompt] = useState("");
  const [lengthSeconds, setLengthSeconds] = useState<VideoLengthSeconds>(VIDEO_LENGTH_OPTIONS[1]);
  const [aspect, setAspect] = useState<VideoAspect>("16:9");
  const [resolution, setResolution] = useState<VideoResolution>(() => defaultResolutionForVideoModel(videoModel));

  const setVideoModel = useCallback((nextModel: string) => {
    const trimmed = nextModel.trim();
    if (!trimmed) return;
    setVideoModelState(trimmed);
    writeGlobalVideoAgentModel(trimmed);
    setResolution((prev) => {
      const allowed = resolutionsForVideoModel(trimmed);
      return allowed.includes(prev) ? prev : defaultResolutionForVideoModel(trimmed);
    });
  }, []);
  const [references, setReferences] = useState<ManualImageReference[]>([]);
  const [isPreparingReferences, setIsPreparingReferences] = useState(false);
  /** The product photos and the one harness sheet the server tiles from them. */
  const [subjectPhotos, setSubjectPhotos] = useState<ManualImageReference[]>([]);
  const [subject, setSubject] = useState<ManualImageReference | null>(null);
  const [isPreparingSubject, setIsPreparingSubject] = useState(false);
  const [environmentHarnessDataUrl, setEnvironmentHarnessDataUrl] = useState<string | undefined>(undefined);
  const [questions, setQuestions] = useState<VideoClarifyQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<VideoPlan | null>(null);
  /** What the Director has written so far while the plan is in progress (reasoning, then the plan JSON). */
  const [planLive, setPlanLive] = useState<OpenRouterAppStreamDelta>({ reasoning: "", content: "" });
  const [frames, setFrames] = useState<StoryboardFrame[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [render, setRender] = useState<VideoRenderSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [productLock, setProductLock] = useState<ProductLockState>(() => ({
    spec: null,
    views: initialProductViews(),
    locked: false,
  }));
  /** Bumped whenever a new plan replaces the old one; frame and prompt results from an older run are dropped. */
  const runRef = useRef(0);

  const effectiveProjectName =
    projectName.trim() ||
    plan?.title?.trim() ||
    productLock.spec?.name?.trim() ||
    "Untitled Video Project";

  const needsProductStep = subjectPhotos.length > 0;

  const canStartStudio = Boolean(
    prompt.trim() || subjectPhotos.length > 0 || references.length > 0,
  );

  const productViewsMap = useMemo(() => {
    const map: Partial<Record<ProductViewId, string>> = {};
    for (const v of productLock.views) {
      if (v.imageDataUrl) map[v.id] = v.imageDataUrl;
    }
    return map;
  }, [productLock.views]);

  const brief: VideoBrief = useMemo(
    () => ({
      prompt,
      lengthSeconds,
      aspect,
      resolution,
      references,
      subject,
      productSpec: productLock.spec,
      productViews: productViewsMap,
      environmentHarnessDataUrl,
    }),
    [prompt, lengthSeconds, aspect, resolution, references, subject, productLock.spec, productViewsMap, environmentHarnessDataUrl],
  );

  const estimatedCostUsd = estimateVideoCostUsd(videoModel, resolution, lengthSeconds, plan?.scenes.length ?? 1);

  useEffect(() => videoLog("generator", `step -> ${step}`), [step]);
  useEffect(() => videoLog("generator", busy ? `busy: ${busy}` : "idle"), [busy]);
  useEffect(() => {
    if (error) videoLogError("generator", "error shown on the status line", error);
  }, [error]);

  /** Start a new run: results from earlier frame and prompt calls are dropped when they arrive. */
  const bumpRun = useCallback((why: string): number => {
    runRef.current += 1;
    videoLog("generator", `run ${runRef.current} started: ${why}`);
    return runRef.current;
  }, []);

  const advance = useCallback((next: VideoGeneratorStep) => {
    setStep(next);
    setMaxStep((prev) => (stepIndex(next) > stepIndex(prev) ? next : prev));
  }, []);

  const requireApiKey = useCallback((): string | null => {
    const key = apiKey.trim();
    if (!key) {
      setError("OpenRouter API key is missing. Add it in Dashboard > API Keys.");
      return null;
    }
    return key;
  }, [apiKey]);

  const addReferenceFiles = useCallback(async (files: FileList | File[]) => {
    const list = referenceUploadFiles(files);
    if (!list.length) {
      setError("Story-beat references must be images, not video. Use a reference video on the Video filter tab.");
      return;
    }
    setIsPreparingReferences(true);
    setError("");
    try {
      const settled = await Promise.allSettled(list.map((f) => prepareVideoStudioReference(f)));
      const prepared = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
      const failed = settled.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      if (!prepared.length) {
        setError(errorText(failed[0]?.reason ?? "Could not read the selected files as images."));
        return;
      }
      setReferences((prev) => [...prev, ...prepared]);
      if (failed.length) {
        setError(`${prepared.length} reference(s) added. ${failed.length} file(s) could not be read as images.`);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setIsPreparingReferences(false);
    }
  }, []);

  const removeReference = useCallback((id: string) => {
    setReferences((prev) => prev.filter((r) => r.id !== id));
  }, []);

  /** Removing the harness tile drops every subject photo with it. */
  const clearSubject = useCallback(() => {
    setSubjectPhotos([]);
    setSubject(null);
    videoLog("subject", "harness cleared");
  }, []);

  /** Rebuilds the harness sheet from `photos` on the server; no photos clears it. */
  const rebuildSubject = useCallback(
    async (key: string, photos: ManualImageReference[]) => {
      setSubjectPhotos(photos);
      if (!photos.length) {
        clearSubject();
        return;
      }
      setIsPreparingSubject(true);
      setError("");
      try {
        const harnessDataUrl = await buildSubjectHarness({ apiKey: key, images: photos.map((p) => ({ fileName: p.fileName, dataUrl: p.dataUrl })) });
        setSubject(await manualReferenceFromDataUrl("subject-harness.png", harnessDataUrl));
        videoLog("subject", "harness ready", { photos: photos.map((p) => p.fileName) });
      } catch (e) {
        videoLogError("subject", "harness build failed", e);
        setSubject(null);
        setError(errorText(e));
      } finally {
        setIsPreparingSubject(false);
      }
    },
    [clearSubject],
  );

  const addSubjectFiles = useCallback(
    async (files: FileList | File[]) => {
      const key = requireApiKey();
      if (!key) return;
      const list = referenceUploadFiles(files);
      if (!list.length) {
        setError("Product photos must be images, not video.");
        return;
      }
      videoLog("subject", "photos added", list.map((f) => ({ name: f.name, bytes: f.size })));
      setIsPreparingSubject(true);
      setError("");
      let prepared: ManualImageReference[];
      try {
        prepared = await Promise.all(list.map((f) => prepareVideoStudioReference(f)));
      } catch (e) {
        videoLogError("subject", "photo prepare failed", e);
        setError(errorText(e));
        setIsPreparingSubject(false);
        return;
      }
      await rebuildSubject(key, [...subjectPhotos, ...prepared]);
    },
    [rebuildSubject, requireApiKey, subjectPhotos],
  );

  const removeSubjectPhoto = useCallback(
    (id: string) => {
      const key = requireApiKey();
      if (!key) return;
      void rebuildSubject(key, subjectPhotos.filter((p) => p.id !== id));
    },
    [rebuildSubject, requireApiKey, subjectPhotos],
  );

  /** Brainstorming fills the Brief and opens it. */
  const setBriefFromBrainstorm = useCallback(
    (next: BrainstormBrief) => {
      setPrompt(next.prompt);
      setLengthSeconds(next.lengthSeconds);
      setAspect(next.aspect);
      setReferences(next.references);
      advance("brief");
    },
    [advance],
  );

  /** Renders one scene's empty-stage Environment Plate; resolves to its data URL or undefined on failure/stale run. */
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
    [aspect, imageModel],
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
      patch({ status: "generating", error: undefined, imageDataUrl: refs.currentFrameDataUrl, videoPrompt: undefined });
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
    [aspect, imageModel, productLock.spec, productViewsMap, references, subject],
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
    [productLock.spec],
  );

  /**
   * 1. Renders Environment Plates per location (`environmentId` master first, then same-location angle/lighting variants) and tiles them into an Environment Harness.
   * 2. Draws keyframes (`drawIds`), chaining same-location keyframes so ground, piers, and surroundings stay locked across consecutive shots.
   * 3. Writes Cinematographer clip prompts (`promptIds`).
   */
  const drawScenes = useCallback(
    async (
      key: string,
      run: number,
      currentPlan: VideoPlan,
      drawIds: string[],
      promptIds: string[],
      existing: Map<string, string>,
      current: Map<string, string> = new Map(),
      existingEnv: Map<string, string> = new Map(),
      currentEnv: Map<string, string> = new Map(),
    ): Promise<{ framesById: Map<string, string>; promptsById: Map<string, string> }> => {
      const heroId = currentPlan.scenes[0].id;
      const hasLockedProductViews = currentPlan.scenes.some((s) => s.productView);
      videoLog("storyboard", `run ${run}: draw ${drawIds.length} frames, write ${promptIds.length} prompts`, {
        draw: drawIds,
        prompts: promptIds,
        hasLockedProductViews,
        kept: [...existing.keys()],
        editedInPlace: [...current.keys()],
      });

      // Pass 1: Shared Environment Plates grouped by (environmentId, day/night)
      const envPromises = new Map<string, Promise<string | undefined>>();
      const needsEnvIds = drawIds.filter((id) => !existingEnv.has(id) || currentEnv.has(id));
      const groupEnvPromises = new Map<string, Promise<string | undefined>>();
      const locationDayPromises = new Map<string, Promise<string | undefined>>();
      let firstOutdoorEnvPromise: Promise<string | undefined> | undefined;

      const isSceneNight = (sc: VideoPlan["scenes"][number]): boolean => {
        const hay = `${sc.title} ${sc.environmentPrompt ?? ""} ${sc.storyboardPrompt}`.toLowerCase();
        return hay.includes("night") || hay.includes("moonlight") || hay.includes("midnight") || hay.includes("starlight");
      };
      const isSceneIndoor = (sc: VideoPlan["scenes"][number]): boolean => {
        const hay = `${sc.environmentId ?? ""} ${sc.environmentPrompt ?? ""} ${sc.title}`.toLowerCase();
        return hay.includes("factory") || hay.includes("indoor") || hay.includes("warehouse") || hay.includes("interior");
      };

      if (needsEnvIds.length > 0) {
        setBusy("Rendering shared Environment Plates for location & season consistency");
      }

      for (const s of currentPlan.scenes) {
        const locKey = s.environmentId?.trim() || `scene_${s.order}`;
        const night = isSceneNight(s);
        const indoor = isSceneIndoor(s);
        const groupKey = `${locKey}::${night ? "night" : "day"}`;

        if (existingEnv.has(s.id) && !currentEnv.has(s.id)) {
          const keptEnv = Promise.resolve(existingEnv.get(s.id));
          envPromises.set(s.id, keptEnv);
          if (!groupEnvPromises.has(groupKey)) groupEnvPromises.set(groupKey, keptEnv);
          if (!night && !locationDayPromises.has(locKey)) locationDayPromises.set(locKey, keptEnv);
          if (!indoor && !night && !firstOutdoorEnvPromise) firstOutdoorEnvPromise = keptEnv;
          continue;
        }
        if (!drawIds.includes(s.id)) {
          envPromises.set(s.id, Promise.resolve(existingEnv.get(s.id)));
          continue;
        }
        // Reuse the exact same Environment Plate for all scenes in the same (environmentId, day/night) group unless explicitly redrawing this scene's env
        if (groupEnvPromises.has(groupKey) && !currentEnv.has(s.id)) {
          const sharedP = groupEnvPromises.get(groupKey)!.then((envUrl) => {
            if (envUrl && runRef.current === run) {
              setFrames((prev) =>
                prev.map((f) => (f.sceneId === s.id ? { ...f, environmentStatus: "done", environmentDataUrl: envUrl } : f)),
              );
            }
            return envUrl;
          });
          envPromises.set(s.id, sharedP);
          continue;
        }

        const masterAnchorPromise = night
          ? locationDayPromises.get(locKey) ?? firstOutdoorEnvPromise
          : !indoor
            ? firstOutdoorEnvPromise
            : undefined;

        const p = (masterAnchorPromise ?? Promise.resolve(undefined)).then((masterEnv) =>
          runEnvironment(key, run, currentPlan, s.id, {
            masterEnvironmentDataUrl: masterEnv,
            currentEnvironmentDataUrl: currentEnv.get(s.id),
          }),
        );
        groupEnvPromises.set(groupKey, p);
        if (!night && !locationDayPromises.has(locKey)) locationDayPromises.set(locKey, p);
        if (!indoor && !night && !firstOutdoorEnvPromise) firstOutdoorEnvPromise = p;
        envPromises.set(s.id, p);
      }

      const resolvedEnvs = new Map<string, string>();
      await Promise.all(
        currentPlan.scenes.map(async (s) => {
          const envUrl = await envPromises.get(s.id);
          if (envUrl) resolvedEnvs.set(s.id, envUrl);
        }),
      );

      if (runRef.current === run && needsEnvIds.length >= 2 && resolvedEnvs.size >= 2) {
        const uniqueEnvImages: Array<{ fileName: string; dataUrl: string }> = [];
        const seenUrls = new Set<string>();
        for (const s of currentPlan.scenes) {
          const u = resolvedEnvs.get(s.id);
          if (u && !seenUrls.has(u)) {
            seenUrls.add(u);
            uniqueEnvImages.push({
              fileName: `env-${String(s.order).padStart(2, "0")}-${s.environmentId ?? s.id}.png`,
              dataUrl: u,
            });
          }
        }
        if (uniqueEnvImages.length >= 2) {
          void buildSubjectHarness({ apiKey: key, images: uniqueEnvImages })
            .then((sheetUrl) => {
              if (runRef.current === run) setEnvironmentHarnessDataUrl(sheetUrl);
            })
            .catch((e) => videoLogError("storyboard", "environment harness tile failed", e));
        }
      }

      // Pass 2: Keyframes (chaining consecutive scenes that share the same environmentId)
      const framePromises = new Map<string, Promise<string | undefined>>();
      if (hasLockedProductViews) {
        if (drawIds.length) {
          setBusy(
            `Storyboard artist is compositing ${drawIds.length === 1 ? "the scene" : `${drawIds.length} scenes`} onto locked Environment Plates`,
          );
        }
        for (let i = 0; i < currentPlan.scenes.length; i += 1) {
          const s = currentPlan.scenes[i];
          if (!drawIds.includes(s.id)) {
            framePromises.set(s.id, Promise.resolve(existing.get(s.id)));
            continue;
          }
          const prevScene = i > 0 ? currentPlan.scenes[i - 1] : undefined;
          const sharesPrevLocation = Boolean(
            s.environmentId && prevScene?.environmentId && s.environmentId === prevScene.environmentId,
          );
          const prevFramePromise = sharesPrevLocation && prevScene ? framePromises.get(prevScene.id) : undefined;
          const p = (prevFramePromise ?? Promise.resolve(undefined)).then((sameLocationFrameDataUrl) =>
            runFrame(key, run, currentPlan, s.id, {
              environmentDataUrl: resolvedEnvs.get(s.id),
              sameLocationFrameDataUrl,
              currentFrameDataUrl: current.get(s.id),
            }),
          );
          framePromises.set(s.id, p);
        }
      } else {
        let hero = existing.get(heroId);
        if (drawIds.includes(heroId)) {
          setBusy("Storyboard artist is drawing the hero frame (scene 1)");
          hero = await runFrame(key, run, currentPlan, heroId, {
            environmentDataUrl: resolvedEnvs.get(heroId),
            currentFrameDataUrl: current.get(heroId),
          });
          if (!hero) {
            if (runRef.current !== run) return { framesById: new Map(), promptsById: new Map() };
            videoLogError("storyboard", "hero frame failed; the other frames are marked failed", drawIds);
            setFrames((prev) =>
              prev.map((f) =>
                drawIds.includes(f.sceneId) && f.sceneId !== heroId
                  ? { ...f, status: "failed", error: "Scene 1 frame failed; regenerate it first" }
                  : f,
              ),
            );
            return { framesById: new Map(), promptsById: new Map() };
          }
        }
        const rest = drawIds.filter((id) => id !== heroId);
        if (rest.length) {
          setBusy(`Storyboard artist is drawing ${rest.length === 1 ? "the scene" : `${rest.length} scenes`} from the hero frame`);
        }
        for (const s of currentPlan.scenes) {
          framePromises.set(
            s.id,
            rest.includes(s.id)
              ? runFrame(key, run, currentPlan, s.id, {
                  environmentDataUrl: resolvedEnvs.get(s.id),
                  heroFrameDataUrl: hero,
                  currentFrameDataUrl: current.get(s.id),
                })
              : Promise.resolve(s.id === heroId ? hero : existing.get(s.id)),
          );
        }
      }

      const framesById = new Map<string, string>();
      const promptsById = new Map<string, string>();
      await Promise.all(
        currentPlan.scenes.map(async (s, i) => {
          const frame = await framePromises.get(s.id);
          if (frame) framesById.set(s.id, frame);
          if (!promptIds.includes(s.id)) return;
          if (!frame) return videoLog("cinematographer", `scene ${s.order} prompt skipped: its frame is missing`);
          const previous = i > 0 ? await framePromises.get(currentPlan.scenes[i - 1].id) : undefined;
          if (i > 0 && !previous && s.transitionIn?.type === "continue") {
            return videoLog("cinematographer", `scene ${s.order} prompt skipped: continue join requires previous frame`);
          }
          if (runRef.current !== run) return videoLog("cinematographer", `scene ${s.order} prompt skipped: run ${run} is stale`);
          const vp = await writePrompt(key, run, currentPlan, i, frame, previous);
          if (vp) promptsById.set(s.id, vp);
        }),
      );
      return { framesById, promptsById };
    },
    [productViewsMap, runEnvironment, runFrame, writePrompt],
  );

  const beginStoryboard = useCallback(
    async (key: string, next: VideoPlan) => {
      const run = bumpRun(`storyboard for "${next.title}", ${next.scenes.length} frames`);
      setFrames(next.scenes.map((s) => ({ sceneId: s.id, status: "waiting" as const, environmentStatus: "waiting" as const })));
      setRender(null);
      setSelectedSceneId(next.scenes[0].id);
      setMaxStep("storyboard");
      advance("storyboard");
      const ids = next.scenes.map((s) => s.id);
      await drawScenes(key, run, next, ids, ids, new Map());
    },
    [advance, bumpRun, drawScenes],
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
    [bumpRun],
  );

  const toggleSceneApproved = useCallback((sceneId: string) => {
    setPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scenes: prev.scenes.map((s) => (s.id === sceneId ? { ...s, approved: !s.approved } : s)),
      };
    });
  }, []);

  const approvePlanAndBeginStoryboard = useCallback(async () => {
    const key = requireApiKey();
    if (!key || !plan) return;
    const approvedPlan: VideoPlan = {
      ...plan,
      scenes: plan.scenes.map((s) => ({ ...s, approved: true })),
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
  }, [beginStoryboard, plan, requireApiKey]);

  const continueToProduct = useCallback(() => advance("product"), [advance]);

  const patchProductView = useCallback((viewId: ProductViewId, patch: Partial<ProductLockState["views"][number]>) => {
    setProductLock((prev) => ({
      ...prev,
      views: prev.views.map((v) => (v.id === viewId ? { ...v, ...patch } : v)),
    }));
  }, []);

  const generateProductViews = useCallback(
    async (viewIds?: ProductViewId[]) => {
      const key = requireApiKey();
      if (!key || !subjectPhotos.length) return;
      setError("");
      setBusy("Surveying the product in your photos");
      try {
        let spec = productLock.spec;
        if (!spec || !viewIds?.length) {
          const surveyed = await surveyProduct({ apiKey: key, briefPrompt: prompt, subjectPhotos });
          spec = productLock.spec?.revisionNotes?.length
            ? { ...surveyed, revisionNotes: productLock.spec.revisionNotes }
            : surveyed;
          setProductLock((prev) => ({ ...prev, spec }));
        }
        const targets = viewIds?.length ? productLock.views.filter((v) => viewIds.includes(v.id)) : productLock.views;
        const lockedSpec = spec;
        setBusy(`Rendering ${targets.length} product view${targets.length === 1 ? "" : "s"}`);

        let masterFrontDataUrl = productLock.views.find((v) => v.id === "front_elevation")?.imageDataUrl;
        const frontTarget = targets.find((v) => v.id === "front_elevation");
        const restTargets = targets.filter((v) => v.id !== "front_elevation");

        for (const v of targets) {
          patchProductView(v.id, { status: "generating", error: undefined, imageDataUrl: undefined });
        }

        if (frontTarget) {
          try {
            masterFrontDataUrl = await generateProductView({
              apiKey: key,
              imageModel,
              spec: lockedSpec,
              viewId: "front_elevation",
              aspectRatio: aspect,
              subjectPhotos,
              revisionNotes: frontTarget.revisionNotes,
            });
            patchProductView("front_elevation", { status: "done", imageDataUrl: masterFrontDataUrl });
          } catch (e) {
            patchProductView("front_elevation", { status: "failed", error: errorText(e) });
          }
        }

        await Promise.all(
          restTargets.map(async (view) => {
            try {
              const dataUrl = await generateProductView({
                apiKey: key,
                imageModel,
                spec: lockedSpec,
                viewId: view.id,
                aspectRatio: aspect,
                subjectPhotos,
                masterFrontDataUrl,
                revisionNotes: view.revisionNotes,
              });
              patchProductView(view.id, { status: "done", imageDataUrl: dataUrl });
            } catch (e) {
              patchProductView(view.id, {
                status: "failed",
                error: errorText(e),
              });
            }
          }),
        );
      } catch (e) {
        videoLogError("product", "generate failed", e);
        setError(errorText(e));
      } finally {
        setBusy(null);
      }
    },
    [aspect, imageModel, patchProductView, productLock.spec, productLock.views, prompt, requireApiKey, subjectPhotos],
  );

  const regenerateProductView = useCallback(
    (viewId: ProductViewId) => {
      void generateProductViews([viewId]);
    },
    [generateProductViews],
  );

  /** Applies a natural-language prompt to a single product view (or all 4 views when viewId is omitted) and redraws immediately. */
  const reviseProductView = useCallback(
    async (viewId: ProductViewId | "all", instruction: string) => {
      const key = requireApiKey();
      const text = instruction.trim();
      if (!key || !subjectPhotos.length || !text) return;
      setError("");
      try {
        let spec = productLock.spec;
        if (!spec) {
          setBusy("Surveying the product in your photos");
          spec = await surveyProduct({ apiKey: key, briefPrompt: prompt, subjectPhotos });
        }

        if (viewId === "all") {
          const nextSpec = {
            ...spec,
            revisionNotes: [...(spec.revisionNotes ?? []), text],
          };
          const previousUrls = new Map(
            productLock.views.filter((v) => v.imageDataUrl).map((v) => [v.id, v.imageDataUrl as string]),
          );
          const nextViews = productLock.views.map((v) => ({
            ...v,
            status: "generating" as const,
            error: undefined,
            revisionNotes: [...(v.revisionNotes ?? []), text],
          }));
          setProductLock({ spec: nextSpec, views: nextViews, locked: false });
          setBusy(`Updating all 4 product views ("${text}")`);

          let masterFrontDataUrl = previousUrls.get("front_elevation");
          const frontNotes = nextViews.find((v) => v.id === "front_elevation")?.revisionNotes;
          try {
            masterFrontDataUrl = await generateProductView({
              apiKey: key,
              imageModel,
              spec: nextSpec,
              viewId: "front_elevation",
              aspectRatio: aspect,
              subjectPhotos,
              currentViewDataUrl: previousUrls.get("front_elevation"),
              revisionNotes: frontNotes,
            });
            patchProductView("front_elevation", { status: "done", imageDataUrl: masterFrontDataUrl });
          } catch (e) {
            patchProductView("front_elevation", { status: "failed", error: errorText(e) });
          }

          await Promise.all(
            nextViews
              .filter((v) => v.id !== "front_elevation")
              .map(async (view) => {
                try {
                  const dataUrl = await generateProductView({
                    apiKey: key,
                    imageModel,
                    spec: nextSpec,
                    viewId: view.id,
                    aspectRatio: aspect,
                    subjectPhotos,
                    masterFrontDataUrl,
                    currentViewDataUrl: previousUrls.get(view.id),
                    revisionNotes: view.revisionNotes,
                  });
                  patchProductView(view.id, { status: "done", imageDataUrl: dataUrl });
                } catch (e) {
                  patchProductView(view.id, { status: "failed", error: errorText(e) });
                }
              }),
          );
          return;
        }

        const target = productLock.views.find((v) => v.id === viewId);
        if (!target) return;
        const currentViewDataUrl = target.imageDataUrl;
        const nextViewNotes = [...(target.revisionNotes ?? []), text];
        const nextSpec = {
          ...spec,
          revisionNotes: [...(spec.revisionNotes ?? []), `${target.label}: ${text}`],
        };
        setProductLock((prev) => ({
          spec: nextSpec,
          locked: false,
          views: prev.views.map((v) =>
            v.id === viewId
              ? { ...v, status: "generating", error: undefined, revisionNotes: nextViewNotes }
              : v,
          ),
        }));
        setBusy(`Updating ${target.label} ("${text}")`);
        const masterFrontDataUrl =
          viewId === "front_elevation"
            ? undefined
            : productLock.views.find((v) => v.id === "front_elevation")?.imageDataUrl;
        const dataUrl = await generateProductView({
          apiKey: key,
          imageModel,
          spec: nextSpec,
          viewId,
          aspectRatio: aspect,
          subjectPhotos,
          masterFrontDataUrl,
          currentViewDataUrl,
          revisionNotes: nextViewNotes,
        });
        patchProductView(viewId, { status: "done", imageDataUrl: dataUrl });
      } catch (e) {
        videoLogError("product", "revise view failed", e);
        if (viewId !== "all") {
          patchProductView(viewId, { status: "failed", error: errorText(e) });
        }
        setError(errorText(e));
      } finally {
        setBusy(null);
      }
    },
    [aspect, imageModel, patchProductView, productLock.spec, productLock.views, prompt, requireApiKey, subjectPhotos],
  );

  const productReadyToLock =
    productLock.views.length > 0 && productLock.views.every((v) => v.status === "done" && v.imageDataUrl);

  /** Clears every step after the Brief and asks the Director's questions for `currentBrief`. */
  const clarify = useCallback(
    async (key: string, currentBrief: VideoBrief) => {
      bumpRun("asking the Director's questions");
      setQuestions(null);
      setAnswers({});
      setPlan(null);
      setFrames([]);
      setRender(null);
      setSelectedSceneId(null);
      setError("");
      setBusy("Director is reading the brief");
      setStep("questions");
      setMaxStep("questions");
      try {
        const result = await runVideoDirectorClarify({ apiKey: key, brief: currentBrief });
        setQuestions(result.questions);
      } catch (e) {
        videoLogError("clarify", "failed", e);
        setError(errorText(e));
      } finally {
        setBusy(null);
      }
    },
    [bumpRun],
  );

  /** The four clean studio renders become the subject harness the Director and Storyboard receive (stripping snowy/multi-unit yard backgrounds); then the Director is asked. */
  const lockProduct = useCallback(async () => {
    const key = requireApiKey();
    if (!key || !productReadyToLock) return;
    setError("");
    setBusy("Building the locked 1:1 studio product harness");
    let locked: ManualImageReference;
    try {
      const renders = productLock.views.map((v, i) => ({
        fileName: `product-lock-${String(i + 1).padStart(2, "0")}-${v.id}.png`,
        dataUrl: v.imageDataUrl as string,
      }));
      const harnessDataUrl = await buildSubjectHarness({ apiKey: key, images: renders });
      locked = await manualReferenceFromDataUrl("subject-harness.png", harnessDataUrl);
      setSubject(locked);
      setProductLock((prev) => ({ ...prev, locked: true }));
      videoLog("product", "locked", { views: renders.map((r) => r.fileName) });
    } catch (e) {
      videoLogError("product", "lock failed", e);
      setError(errorText(e));
      setBusy(null);
      return;
    }
    await clarify(key, { ...brief, subject: locked });
  }, [brief, clarify, productLock.views, productReadyToLock, requireApiKey]);

  const draftPlan = useCallback(
    async (key: string, qs: VideoClarifyQuestion[], ans: Record<string, string>) => {
      bumpRun("drafting a new plan");
      setPlan(null);
      setPlanLive({ reasoning: "", content: "" });
      setFrames([]);
      setRender(null);
      setSelectedSceneId(null);
      setError("");
      setBusy("Director is writing the scene plan");
      setStep("plan");
      setMaxStep("plan");
      try {
        const next = await runVideoDirectorPlan({
          apiKey: key,
          brief,
          questions: qs,
          answers: ans,
          onDelta: (d) => setPlanLive((prev) => ({ reasoning: prev.reasoning + d.reasoning, content: prev.content + d.content })),
        });
        await startPlan(key, next);
      } catch (e) {
        videoLogError("plan", "draft failed", e);
        setError(errorText(e));
      } finally {
        setBusy(null);
      }
    },
    [brief, bumpRun, startPlan],
  );

  const askQuestions = useCallback(async () => {
    const key = requireApiKey();
    if (!key || !canStartStudio) return;
    await clarify(key, brief);
  }, [brief, canStartStudio, clarify, requireApiKey]);

  const answerQuestion = useCallback((id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  const allAnswered = Boolean(questions?.length) && (questions ?? []).every((q) => Boolean(answers[q.id]?.trim()));

  const submitAnswers = useCallback(async () => {
    const key = requireApiKey();
    if (!key || !questions || !allAnswered) return;
    await draftPlan(key, questions, answers);
  }, [allAnswered, answers, draftPlan, questions, requireApiKey]);

  const regeneratePlan = useCallback(async () => {
    const key = requireApiKey();
    if (!key) return;
    await draftPlan(key, questions ?? [], answers);
  }, [answers, draftPlan, questions, requireApiKey]);

  const regenerateFrame = useCallback(
    async (sceneId: string) => {
      const key = requireApiKey();
      if (!key || !plan) return;
      const run = runRef.current;
      const index = plan.scenes.findIndex((s) => s.id === sceneId);
      const existing = new Map(frames.filter((f) => f.imageDataUrl && f.sceneId !== sceneId).map((f) => [f.sceneId, f.imageDataUrl as string]));
      const existingEnv = new Map(frames.filter((f) => f.environmentDataUrl).map((f) => [f.sceneId, f.environmentDataUrl as string]));
      const next = plan.scenes[index + 1];
      setBusy(`Storyboard artist is redrawing scene ${plan.scenes[index]?.order ?? ""}`);
      await drawScenes(key, run, plan, [sceneId], next ? [sceneId, next.id] : [sceneId], existing, new Map(), existingEnv);
      setBusy(null);
    },
    [drawScenes, frames, plan, requireApiKey],
  );

  const regenerateEnvironmentPlate = useCallback(
    async (sceneId: string) => {
      const key = requireApiKey();
      if (!key || !plan) return;
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
    [drawScenes, frames, plan, requireApiKey],
  );

  const rerenderSceneClip = useCallback(
    async (sceneId: string) => {
      const key = requireApiKey();
      if (!key || !plan || !render) return;
      const scene = plan.scenes.find((s) => s.id === sceneId);
      const frame = frames.find((f) => f.sceneId === sceneId);
      if (!scene || !frame?.imageDataUrl || !frame.videoPrompt) {
        setError("Scene needs a finished storyboard frame and clip prompt before re-rendering.");
        return;
      }
      setError("");
      setBusy(`Re-rendering clip for scene ${scene.order}`);
      try {
        const snapshot = await rerenderVideoScene({
          apiKey: key,
          renderId: render.id,
          sceneId,
          dataUrl: frame.imageDataUrl,
          videoPrompt: frame.videoPrompt,
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
    [advance, frames, plan, render, requireApiKey],
  );

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
    [plan, render, requireApiKey],
  );

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
    [effectiveProjectName, normalizeTimelineScenes, plan, productLock.spec?.name, render, restitchVideo, selectedSceneId],
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
    [insertClipSceneIntoTimeline],
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
    [normalizeTimelineScenes, plan, render, restitchVideo],
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
    [normalizeTimelineScenes, plan, render, restitchVideo, selectedSceneId],
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
    [plan, render, restitchVideo],
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
    [plan, render, restitchVideo],
  );

  const updateScenePrompts = useCallback(
    async (
      sceneId: string,
      patch: {
        environmentPrompt?: string;
        storyboardPrompt?: string;
        motionPrompt?: string;
        videoPrompt?: string;
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
          const currentFrame = frames.find((f) => f.sceneId === sceneId)?.imageDataUrl;
          const currentEnvUrl = frames.find((f) => f.sceneId === sceneId)?.environmentDataUrl;
          const envChanged = patch.environmentPrompt !== undefined && patch.environmentPrompt !== before.environmentPrompt;
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
    [bumpRun, drawScenes, frames, plan, render, requireApiKey],
  );

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
          setBusy(`Director is revising scene ${before?.order ?? ""} ("${text}")`);
          const revised = await runVideoDirectorReviseScene({
            apiKey: key,
            brief,
            plan: planForRevise,
            sceneId,
            instruction: text,
          });
          const revisedWithApproval: VideoScenePlan = {
            ...revised,
            approved: before?.approved,
            postCutReferenceDataUrl: postCutReference?.dataUrl ?? before?.postCutReferenceDataUrl,
            postCutReferenceFileName: postCutReference?.fileName ?? before?.postCutReferenceFileName,
          };
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
          const current = postCutReference
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
          setFrames((prev) => prev.map((f) => (f.sceneId === sceneId ? { ...f, status: "waiting", videoPrompt: undefined } : f)));
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
    [advance, brief, bumpRun, drawScenes, frames, plan, render, requireApiKey, selectedSceneId],
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
      const scenes = plan.scenes.map((s) => {
        const frame = frames.find((f) => f.sceneId === s.id);
        if (!s.customClipFile && (!frame?.imageDataUrl || !frame.videoPrompt)) {
          throw new Error(`Scene ${s.order} has no frame or clip prompt.`);
        }
        return {
          id: s.id,
          order: s.order,
          durationSeconds: s.durationSeconds,
          videoPrompt: frame?.videoPrompt || "Uploaded video clip",
          narration: s.narration,
          transitionIn: s.transitionIn,
          customClipFile: s.customClipFile,
          frameDataUrl: frame?.imageDataUrl,
        };
      });
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
  }, [advance, aspect, frames, plan, readyToRender, requireApiKey, resolution, videoModel]);

  const renderActive = render !== null && (render.status === "rendering" || render.status === "stitching");
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;

  useEffect(() => {
    if (!renderActive || !render) return;
    const renderId = render.id;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await fetchVideoRender({ apiKey: apiKeyRef.current, renderId });
      if (next.status === "done" || next.status === "failed") {
          videoLog("render", `finished: ${next.status}`, { finalUrl: next.finalUrl, error: next.error });
        }
        if (!cancelled) setRender(next);
      } catch (e) {
        videoLogError("render", "poll failed", e);
        if (!cancelled) setError(errorText(e));
      }
    };
    const handle = window.setInterval(() => void tick(), RENDER_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [render, renderActive]);

  const buildProjectSnapshot = useCallback(
    (nameOverride?: string): VideoProjectSnapshot => ({
      version: 1,
      id: projectId,
      name: (nameOverride ?? effectiveProjectName).trim() || "Untitled Video Project",
      updatedAt: new Date().toISOString(),
      step,
      maxStep,
      videoModel,
      prompt,
      lengthSeconds,
      aspect,
      resolution,
      references,
      subjectPhotos,
      subject,
      environmentHarnessDataUrl,
      productLock,
      questions,
      answers,
      plan,
      frames,
      render,
      selectedSceneId,
    }),
    [
      answers,
      aspect,
      effectiveProjectName,
      environmentHarnessDataUrl,
      frames,
      lengthSeconds,
      maxStep,
      plan,
      productLock,
      projectId,
      prompt,
      questions,
      references,
      render,
      resolution,
      selectedSceneId,
      step,
      subject,
      subjectPhotos,
      videoModel,
    ],
  );

  const applyProjectSnapshot = useCallback(
    (snapshot: VideoProjectSnapshot) => {
      bumpRun(`loaded project "${snapshot.name}"`);
      setProjectId(snapshot.id);
      setProjectName(snapshot.name);
      setStep(snapshot.step);
      setMaxStep(snapshot.maxStep);
      if (snapshot.videoModel) {
        setVideoModelState(snapshot.videoModel);
      }
      setPrompt(snapshot.prompt);
      setLengthSeconds(snapshot.lengthSeconds);
      setAspect(snapshot.aspect);
      setResolution(snapshot.resolution);
      setReferences(snapshot.references ?? []);
      setSubjectPhotos(snapshot.subjectPhotos ?? []);
      setSubject(snapshot.subject ?? null);
      setEnvironmentHarnessDataUrl(snapshot.environmentHarnessDataUrl);
      setProductLock(snapshot.productLock ?? { spec: null, views: initialProductViews(), locked: false });
      setQuestions(snapshot.questions ?? null);
      setAnswers(snapshot.answers ?? {});
      setPlan(snapshot.plan ?? null);
      setFrames(snapshot.frames ?? []);
      setRender(snapshot.render ?? null);
      setSelectedSceneId(snapshot.selectedSceneId ?? snapshot.plan?.scenes[0]?.id ?? null);
      setError("");
    },
    [bumpRun],
  );

  const refreshProjectsAndRenders = useCallback(async () => {
    try {
      const { projects, renders } = await listVideoProjects({ apiKey: apiKeyRef.current });
      setSavedProjects(projects);
      setStoredRenders(renders);
    } catch (e) {
      videoLogError("render", "list projects failed", e);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    void refreshProjectsAndRenders();
  }, [refreshProjectsAndRenders, render?.status]);

  const exportProjectJson = useCallback(() => {
    const snap = buildProjectSnapshot();
    const json = serializeVideoProjectJson(snap);
    const slug =
      snap.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "video-project";
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.neopulse.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [buildProjectSnapshot]);

  const importProjectJson = useCallback(
    async (file: File) => {
      setError("");
      try {
        const text = await file.text();
        const parsed = parseVideoProjectJson(text);
        applyProjectSnapshot(parsed);
      } catch (e) {
        videoLogError("render", "import project JSON failed", e);
        setError(errorText(e));
      }
    },
    [applyProjectSnapshot],
  );

  const saveProjectToServer = useCallback(
    async (nameOverride?: string) => {
      setError("");
      setBusy("Saving project to local storage");
      try {
        const snap = buildProjectSnapshot(nameOverride);
        await saveVideoProject({ apiKey: apiKeyRef.current, project: snap });
        await refreshProjectsAndRenders();
      } catch (e) {
        videoLogError("render", "save project failed", e);
        setError(errorText(e));
      } finally {
        setBusy(null);
      }
    },
    [buildProjectSnapshot, refreshProjectsAndRenders],
  );

  const loadProjectFromServer = useCallback(
    async (id: string) => {
      setError("");
      setBusy("Loading saved project");
      try {
        const loaded = await loadVideoProject({ apiKey: apiKeyRef.current, projectId: id });
        applyProjectSnapshot(loaded);
      } catch (e) {
        videoLogError("render", "load project failed", e);
        setError(errorText(e));
      } finally {
        setBusy(null);
      }
    },
    [applyProjectSnapshot],
  );

  const deleteProjectFromServer = useCallback(
    async (id: string) => {
      setError("");
      try {
        await deleteVideoProject({ apiKey: apiKeyRef.current, projectId: id });
        await refreshProjectsAndRenders();
      } catch (e) {
        videoLogError("render", "delete project failed", e);
        setError(errorText(e));
      }
    },
    [refreshProjectsAndRenders],
  );

  const exportProjectZip = useCallback(async () => {
    setError("");
    setBusy("Packaging project ZIP (full video + scene clips + frames + JSON)");
    try {
      const snap = buildProjectSnapshot();
      const { zipUrl, fileName } = await exportVideoProjectZip({
        apiKey: apiKeyRef.current,
        project: snap,
      });
      const a = document.createElement("a");
      a.href = zipUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      videoLogError("render", "export zip failed", e);
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }, [buildProjectSnapshot]);

  const reset = useCallback(() => {
    bumpRun("new video");
    setProjectId(makeProjectId());
    setProjectName("");
    setStep("brainstorm");
    setMaxStep("brief");
    setQuestions(null);
    setAnswers({});
    setPlan(null);
    setFrames([]);
    setSelectedSceneId(null);
    setRender(null);
    setSubjectPhotos([]);
    setSubject(null);
    setEnvironmentHarnessDataUrl(undefined);
    setProductLock({ spec: null, views: initialProductViews(), locked: false });
    setError("");
  }, [bumpRun]);

  return {
    projectId,
    projectName: effectiveProjectName,
    setProjectName,
    savedProjects,
    storedRenders,
    refreshProjectsAndRenders,
    exportProjectJson,
    importProjectJson,
    saveProjectToServer,
    loadProjectFromServer,
    deleteProjectFromServer,
    exportProjectZip,
    step,
    maxStep,
    setStep,
    brief,
    setPrompt,
    setLengthSeconds,
    setAspect,
    setResolution,
    isPreparingReferences,
    addReferenceFiles,
    removeReference,
    subjectPhotos,
    isPreparingSubject,
    addSubjectFiles,
    removeSubjectPhoto,
    clearSubject,
    setBriefFromBrainstorm,
    questions,
    answers,
    answerQuestion,
    allAnswered,
    plan,
    planLive,
    frames,
    readyToRender,
    selectedSceneId,
    selectScene: setSelectedSceneId,
    render,
    renderActive,
    busy,
    error,
    videoModel,
    setVideoModel,
    estimatedCostUsd,
    askQuestions,
    submitAnswers,
    regeneratePlan,
    toggleSceneApproved,
    approvePlanAndBeginStoryboard,
    regenerateFrame,
    regenerateEnvironmentPlate,
    rerenderSceneClip,
    restitchVideo: () => void restitchVideo(),
    addVideoClipFilesToTimeline,
    addStoredClipToTimeline,
    moveSceneInTimeline,
    removeSceneFromTimeline,
    updateSceneTransition,
    updatePlanFades,
    updateScenePrompts,
    sendInstruction,
    renderVideo,
    reset,
    needsProductStep,
    canStartStudio,
    continueToProduct,
    productLock,
    productReadyToLock,
    generateProductViews,
    regenerateProductView,
    reviseProductView,
    lockProduct,
  };
}

export type VideoGeneratorController = ReturnType<typeof useVideoGenerator>;
