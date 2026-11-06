import { errorText, makeProjectId, sortReferencesByFileName, RENDER_POLL_MS } from "@/components/video-generator/video-generator-helpers";
import { useCallback, useEffect, useRef } from "react";
import type { VideoProjectSnapshot } from "@/lib/video-generator/video-generator-types";
import { initialProductViews } from "@/lib/video-generator/video-product-agent";
import { deleteVideoProject, exportVideoProjectZip, fetchVideoRender, listVideoProjects, loadVideoProject, parseVideoProjectJson, saveVideoProject, serializeVideoProjectJson } from "@/lib/video-generator/video-render-api";
import { videoLog, videoLogError } from "@/lib/video-generator/video-log";
import type { VideoGeneratorState } from "@/components/video-generator/use-video-generator-state";

export function useVideoProjects(
  s: VideoGeneratorState,
  apiKey: string,
  renderActive: boolean,
) {
  const {
    projectId,
    setProjectId,
    setProjectName,
    setSavedProjects,
    setStoredRenders,
    videoModel,
    setVideoModelState,
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
    subjectPhotos,
    setSubjectPhotos,
    subject,
    setSubject,
    environmentHarnessDataUrl,
    setEnvironmentHarnessDataUrl,
    questions,
    setQuestions,
    answers,
    setAnswers,
    plan,
    setPlan,
    frames,
    setFrames,
    selectedSceneId,
    setSelectedSceneId,
    render,
    setRender,
    setBusy,
    error,
    setError,
    productLock,
    setProductLock,
    effectiveProjectName,
    brief,
    bumpRun,
    apiKeyRef,
  } = s;


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
}, [render, renderActive, apiKeyRef, setError, setRender]);

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
    referenceVideo: referenceVideo
      ? {
          ...referenceVideo,
          previewUrl: undefined,
        }
      : null,
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
    referenceVideo,
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
    setReferences(sortReferencesByFileName(snapshot.references ?? []));
    setReferenceVideo(snapshot.referenceVideo ?? null);
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
  [bumpRun, setAnswers, setAspect, setEnvironmentHarnessDataUrl, setError, setFrames, setLengthSeconds, setMaxStep, setPlan, setProductLock, setProjectId, setProjectName, setPrompt, setQuestions, setReferenceVideo, setReferences, setRender, setResolution, setSelectedSceneId, setStep, setSubject, setSubjectPhotos, setVideoModelState],
);

const refreshProjectsAndRenders = useCallback(async () => {
  try {
    const { projects, renders } = await listVideoProjects({ apiKey: apiKeyRef.current });
    setSavedProjects(projects);
    setStoredRenders(renders);
  } catch (e) {
    videoLogError("render", "list projects failed", e);
  }
}, [apiKeyRef, setSavedProjects, setStoredRenders]);

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
  [applyProjectSnapshot, setError],
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
  [buildProjectSnapshot, refreshProjectsAndRenders, apiKeyRef, setBusy, setError],
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
  [applyProjectSnapshot, apiKeyRef, setBusy, setError],
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
  [refreshProjectsAndRenders, apiKeyRef, setError],
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
}, [buildProjectSnapshot, apiKeyRef, setBusy, setError]);

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
}, [bumpRun, setAnswers, setEnvironmentHarnessDataUrl, setError, setFrames, setMaxStep, setPlan, setProductLock, setProjectId, setProjectName, setQuestions, setRender, setSelectedSceneId, setStep, setSubject, setSubjectPhotos]);

  return {
    buildProjectSnapshot,
    applyProjectSnapshot,
    refreshProjectsAndRenders,
    exportProjectJson,
    importProjectJson,
    saveProjectToServer,
    loadProjectFromServer,
    deleteProjectFromServer,
    exportProjectZip,
    reset,
  };
}
