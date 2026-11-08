import { errorText, extractAndApplyReferenceVideoBeats } from "@/components/video-generator/video-generator-helpers";
import { useCallback } from "react";
import { assertReferenceStillsSceneCount } from "@/lib/video-generator/video-client-location-reference";
import { buildSubjectHarness } from "@/lib/video-generator/video-brainstorm-api";
import type { VideoPlan, VideoScenePlan } from "@/lib/video-generator/video-generator-types";
import { videoLog, videoLogError } from "@/lib/video-generator/video-log";
import type { VideoGeneratorState } from "@/components/video-generator/use-video-generator-state";
import type { useVideoFrameRunners } from "@/components/video-generator/use-video-frame-runners";

export function useVideoDrawScenes(
  s: VideoGeneratorState,
  runners: ReturnType<typeof useVideoFrameRunners>,
) {
  const { runEnvironment, runFrame, runPassthroughFrame, writePrompt } = runners;
  const {
    prompt,
    references,
    referenceVideo,
    setEnvironmentHarnessDataUrl,
    plan,
    frames,
    setFrames,
    setBusy,
    error,
    runRef,
    productViewsMap,
    brief,
  } = s;

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
    const refStillsFlythrough =
      currentPlan.referenceStillsFlythrough === true || Boolean(brief.referenceVideo?.serverId);
    if (refStillsFlythrough && !brief.referenceVideo?.serverId) {
      assertReferenceStillsSceneCount(currentPlan, references.length);
    }
    videoLog("storyboard", `run ${run}: draw ${drawIds.length} frames, write ${promptIds.length} prompts`, {
      draw: drawIds,
      prompts: promptIds,
      hasLockedProductViews,
      refStillsFlythrough,
      hasReferenceVideo: Boolean(brief.referenceVideo?.serverId),
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

    if (!refStillsFlythrough && needsEnvIds.length > 0) {
      setBusy("Rendering shared Environment Plates for location & season consistency");
    }

    if (refStillsFlythrough) {
      for (const s of currentPlan.scenes) {
        if (drawIds.includes(s.id)) {
          setFrames((prev) =>
            prev.map((f) =>
              f.sceneId === s.id
                ? { ...f, environmentStatus: "done" as const, environmentDataUrl: s.postCutReferenceDataUrl }
                : f,
            ),
          );
        }
      }
    }

    for (const s of currentPlan.scenes) {
      if (refStillsFlythrough) {
        envPromises.set(s.id, Promise.resolve(s.postCutReferenceDataUrl));
        continue;
      }
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
    if (refStillsFlythrough) {
      if (drawIds.length) {
        setBusy(
          drawIds.length === 1
            ? "Setting scene keyframe from your reference still"
            : `Setting ${drawIds.length} keyframes from your reference video`,
        );
      }
      for (const s of currentPlan.scenes) {
        if (!drawIds.includes(s.id)) {
          framePromises.set(s.id, Promise.resolve(existing.get(s.id)));
          continue;
        }
        if (runRef.current !== run) break;
        let directRefUrl = s.postCutReferenceDataUrl ?? (s.referenceIndexes[0] ? references[s.referenceIndexes[0] - 1]?.dataUrl : undefined);
        if (!directRefUrl?.startsWith("data:image/") && s.order === 1 && references.length > 0) {
          directRefUrl = references[0]?.dataUrl;
        }
        if (!directRefUrl?.startsWith("data:image/") && brief.referenceVideo?.serverId) {
          setBusy(`Extracting still for scene ${s.order} from reference video`);
          try {
            const { plan: enrichedPlan } = await extractAndApplyReferenceVideoBeats({
              apiKey: key,
              serverId: brief.referenceVideo.serverId,
              plan: currentPlan,
              durationSeconds: brief.referenceVideo.durationSeconds,
            });
            const enrichedScene = enrichedPlan.scenes.find((sc) => sc.id === s.id);
            if (enrichedScene?.postCutReferenceDataUrl) {
              s.postCutReferenceDataUrl = enrichedScene.postCutReferenceDataUrl;
              directRefUrl = enrichedScene.postCutReferenceDataUrl;
            }
          } catch (err) {
            videoLogError("storyboard", `failed to extract beat for scene ${s.order}`, err);
          }
        }

        // ZERO HALLUCINATION MANDATE:
        // When reference photos or cut video stills exist, ALWAYS use the real photographic still
        // directly via runPassthroughFrame! Never invoke AI text-to-image diffusion automatically,
        // which invents fake details, fake chairs/rooms, and corrupts/misspells brand signs.
        // Only an explicit manual redraw for a specific scene (current.has(s.id)) uses AI image generation.
        const isExplicitSceneRedraw = current.has(s.id);

        if (isExplicitSceneRedraw) {
          setBusy(`AI Storyboard Artist is redrawing scene ${s.order} keyframe`);
          const url = await runFrame(key, run, currentPlan, s.id, {
            currentFrameDataUrl: current.get(s.id),
          });
          framePromises.set(s.id, Promise.resolve(url));
        } else if (directRefUrl?.startsWith("data:image/")) {
          setBusy(`Setting keyframe ${s.order} of ${currentPlan.scenes.length} from real photographic still`);
          const url = await runPassthroughFrame(run, currentPlan, s.id);
          framePromises.set(s.id, Promise.resolve(url));
        } else {
          setBusy(`Drawing keyframe ${s.order} of ${currentPlan.scenes.length}`);
          const url = await runFrame(key, run, currentPlan, s.id, {
            currentFrameDataUrl: current.get(s.id),
          });
          framePromises.set(s.id, Promise.resolve(url));
        }
      }
    } else if (hasLockedProductViews) {
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
    const collectPrompt = async (s: VideoScenePlan, i: number) => {
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
    };
    try {
      if (refStillsFlythrough) {
        for (let i = 0; i < currentPlan.scenes.length; i += 1) {
          const s = currentPlan.scenes[i];
          if (promptIds.includes(s.id)) {
            setBusy(`Writing motion prompt for scene ${s.order} of ${currentPlan.scenes.length}`);
          }
          await collectPrompt(s, i);
        }
      } else {
        await Promise.all(currentPlan.scenes.map((s, i) => collectPrompt(s, i)));
      }
    } finally {
      setBusy(null);
    }
    return { framesById, promptsById };
  },
  [runEnvironment, runFrame, runPassthroughFrame, writePrompt, brief.referenceVideo, references, runRef, setBusy, setEnvironmentHarnessDataUrl, setFrames],
);

  return {
    drawScenes,
  };
}
