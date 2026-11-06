import { makeProjectId } from "@/components/video-generator/video-generator-helpers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ManualImageReference } from "@/lib/image-generator/manual-reference-upload";
import { getImageModel, getVideoModel } from "@/lib/optimization-settings-storage";
import { writeGlobalVideoAgentModel } from "@/lib/global-agent-models";
import type { OpenRouterAppStreamDelta } from "@/lib/openrouter-app-api";
import type { ProductLockState, ProductViewId, StoryboardFrame, VideoBrief, VideoBriefReferenceClip, VideoClarifyQuestion, VideoPlan, VideoProjectSummary, VideoRenderSnapshot, VideoStoredRenderSummary } from "@/lib/video-generator/video-generator-types";
import { initialProductViews } from "@/lib/video-generator/video-product-agent";
import { DEFAULT_VIDEO_MODEL, VIDEO_LENGTH_OPTIONS, defaultResolutionForVideoModel, estimateVideoCostUsd, resolutionsForVideoModel, type VideoAspect, type VideoLengthSeconds, type VideoResolution } from "@/lib/video-generator/video-model-defaults";
import { videoLog, videoLogError } from "@/lib/video-generator/video-log";
import { stepIndex, type VideoGeneratorStep } from "./video-generator-steps";

export function useVideoGeneratorState(apiKey: string) {
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
const [referenceVideo, setReferenceVideo] = useState<VideoBriefReferenceClip | null>(null);
const [isPreparingReferences, setIsPreparingReferences] = useState(false);
const [isPreparingReferenceVideo, setIsPreparingReferenceVideo] = useState(false);
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
/** True from "Draft scene plan" until the parsed plan lands (stage leaves Start compose immediately). */
const [planDrafting, setPlanDrafting] = useState(false);
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
const apiKeyRef = useRef(apiKey);
apiKeyRef.current = apiKey;

const effectiveProjectName =
  projectName.trim() ||
  plan?.title?.trim() ||
  productLock.spec?.name?.trim() ||
  "Untitled Video Project";

const needsProductStep = subjectPhotos.length > 0;

const canStartStudio = Boolean(
  prompt.trim() || subjectPhotos.length > 0 || references.length > 0 || referenceVideo,
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
    referenceVideo,
    subject,
    productSpec: productLock.spec,
    productViews: productViewsMap,
    environmentHarnessDataUrl,
  }),
  [
    prompt,
    lengthSeconds,
    aspect,
    resolution,
    references,
    referenceVideo,
    subject,
    productLock.spec,
    productViewsMap,
    environmentHarnessDataUrl,
  ],
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

  return {
    projectId,
    setProjectId,
    projectName,
    setProjectName,
    savedProjects,
    setSavedProjects,
    storedRenders,
    setStoredRenders,
    videoModel,
    setVideoModelState,
    setVideoModel,
    imageModel,
    step,
    setStep,
    maxStep,
    setMaxStep,
    prompt,
    setPrompt,
    lengthSeconds,
    setLengthSeconds,
    aspect,
    setAspect,
    resolution,
    setResolution,
    references,
    setReferences,
    referenceVideo,
    setReferenceVideo,
    isPreparingReferences,
    setIsPreparingReferences,
    isPreparingReferenceVideo,
    setIsPreparingReferenceVideo,
    subjectPhotos,
    setSubjectPhotos,
    subject,
    setSubject,
    isPreparingSubject,
    setIsPreparingSubject,
    environmentHarnessDataUrl,
    setEnvironmentHarnessDataUrl,
    questions,
    setQuestions,
    answers,
    setAnswers,
    plan,
    setPlan,
    planLive,
    setPlanLive,
    planDrafting,
    setPlanDrafting,
    frames,
    setFrames,
    selectedSceneId,
    setSelectedSceneId,
    render,
    setRender,
    busy,
    setBusy,
    error,
    setError,
    productLock,
    setProductLock,
    runRef,
    apiKeyRef,
    effectiveProjectName,
    needsProductStep,
    canStartStudio,
    productViewsMap,
    brief,
    estimatedCostUsd,
    bumpRun,
    advance,
    requireApiKey,
  };
}

export type VideoGeneratorState = ReturnType<typeof useVideoGeneratorState>;
