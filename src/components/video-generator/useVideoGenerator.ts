import { useVideoGeneratorState } from "@/components/video-generator/use-video-generator-state";
import { useVideoReferences } from "@/components/video-generator/use-video-references";
import { useVideoFrameRunners } from "@/components/video-generator/use-video-frame-runners";
import { useVideoDrawScenes } from "@/components/video-generator/use-video-draw-scenes";
import { useVideoStoryboard } from "@/components/video-generator/use-video-storyboard";
import { useVideoProduct } from "@/components/video-generator/use-video-product";
import { useVideoPlanDraft } from "@/components/video-generator/use-video-plan-draft";
import { useVideoFrameRegen } from "@/components/video-generator/use-video-frame-regen";
import { useVideoTimeline } from "@/components/video-generator/use-video-timeline";
import { useVideoRender } from "@/components/video-generator/use-video-render";
import { useVideoProjects } from "@/components/video-generator/use-video-projects";

export {
  extractAndApplyReferenceVideoBeats,
  extractReferenceVideoBeatsTimes,
} from "@/components/video-generator/video-generator-helpers";
export type {
  BrainstormBrief,
  InstructionScope,
} from "@/components/video-generator/video-generator-helpers";

export function useVideoGenerator(apiKey: string) {
  const s = useVideoGeneratorState(apiKey);
  const refs = useVideoReferences(s);
  const runners = useVideoFrameRunners(s);
  const scenes = useVideoDrawScenes(s, runners);
  const storyboard = useVideoStoryboard(s, scenes);
  const product = useVideoProduct(s);
  const planDraft = useVideoPlanDraft(s, storyboard, product);
  const frameRegen = useVideoFrameRegen(s, scenes, planDraft);
  const timeline = useVideoTimeline(s, scenes, frameRegen);
  const renderCtl = useVideoRender(s, scenes);
  const projects = useVideoProjects(s, apiKey, renderCtl.renderActive);
  const {
    projectId,
    effectiveProjectName,
    setProjectName,
    savedProjects,
    storedRenders,
    step,
    maxStep,
    setStep,
    brief,
    setPrompt,
    setLengthSeconds,
    setAspect,
    setResolution,
    isPreparingReferences,
    isPreparingReferenceVideo,
    referenceVideo,
    subjectPhotos,
    isPreparingSubject,
    questions,
    answers,
    plan,
    planLive,
    planDrafting,
    frames,
    selectedSceneId,
    setSelectedSceneId,
    render,
    busy,
    error,
    videoModel,
    setVideoModel,
    estimatedCostUsd,
    needsProductStep,
    canStartStudio,
    productLock,
  } = s;
  const {
    addReferenceFiles,
    removeReference,
    uploadReferenceVideo,
    removeReferenceVideo,
    addSubjectFiles,
    removeSubjectPhoto,
    clearSubject,
    setBriefFromBrainstorm,
  } = refs;
  const {
    refreshProjectsAndRenders,
    exportProjectJson,
    importProjectJson,
    saveProjectToServer,
    loadProjectFromServer,
    deleteProjectFromServer,
    exportProjectZip,
    reset,
  } = projects;
  const { askQuestions, answerQuestion, allAnswered, submitAnswers, regeneratePlan, restoreReferenceFrame } = planDraft;
  const { readyToRender, renderActive, sendInstruction, renderVideo } = renderCtl;
  const { toggleSceneApproved, approveAllScenes, approvePlanAndBeginStoryboard, continueToProduct } = storyboard;
  const {
    regenerateFrame,
    syncAllFramesFromReferenceVideo,
    regenerateEnvironmentPlate,
    rerenderSceneClip,
    clearSceneRevisionNotes,
    restitchVideo,
  } = frameRegen;
  const {
    addVideoClipFilesToTimeline,
    addStoredClipToTimeline,
    moveSceneInTimeline,
    removeSceneFromTimeline,
    updateSceneTransition,
    updatePlanFades,
    updateScenePrompts,
  } = timeline;
  const { generateProductViews, regenerateProductView, reviseProductView, lockProduct, productReadyToLock } = product;

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
    isPreparingReferenceVideo,
    addReferenceFiles,
    removeReference,
    referenceVideo,
    uploadReferenceVideo,
    removeReferenceVideo,
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
    planDrafting,
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
    approveAllScenes,
    approvePlanAndBeginStoryboard,
    regenerateFrame,
    restoreReferenceFrame,
    syncAllFramesFromReferenceVideo,
    regenerateEnvironmentPlate,
    rerenderSceneClip,
    clearSceneRevisionNotes,
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
