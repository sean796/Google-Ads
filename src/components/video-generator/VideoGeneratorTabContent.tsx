import { useEffect, useState } from "react";
import { formatEstimateUsd } from "@/lib/agent-pipeline-cost-estimates";
import { notifyHeaderError } from "@/lib/app-notifications";
import { VIDEO_MODEL_PRESETS } from "@/lib/video-generator/video-model-defaults";
import { useVideoBrainstorm } from "./useVideoBrainstorm";
import { useVideoGenerator } from "./useVideoGenerator";
import { VideoInstructionBar } from "./VideoInstructionBar";
import { VideoStagePanel } from "./VideoStagePanel";
import { VideoStudioLeftDock, type StudioLeftTabId } from "./VideoStudioLeftDock";
import { VideoTimelineDock } from "./VideoTimelineDock";
import { VideoWorkspaceHeader } from "./VideoWorkspaceHeader";
import type { VideoGeneratorStep } from "./video-generator-steps";

/**
 * 4-Zone AI Video Studio (Runway Gen-4 / Luma Scenes / NLE layout):
 * 1. Left: VideoStudioLeftDock (Full-height 5rem vertical docker rail + slide-out drawer mirroring right-side Agents docker)
 * 2. Top: VideoWorkspaceHeader (Single sleek NLE studio top bar)
 * 3. Center: VideoStagePanel (Persistent Stage Monitor + Transport Bar) + Docked VideoInstructionBar
 * 4. Bottom: VideoTimelineDock (Multi-Track VIDEO 1 Filmstrip with interactive transition junctions + VOICE 1 Timeline)
 */
export function VideoGeneratorTabContent({ apiKey }: { apiKey: string }) {
  const g = useVideoGenerator(apiKey);
  const b = useVideoBrainstorm(apiKey, g.setBriefFromBrainstorm, g.brief.subject?.dataUrl);
  const [leftTab, setLeftTab] = useState<StudioLeftTabId>("assets");
  const [leftOpen, setLeftOpen] = useState<boolean>(false);

  const working = g.busy !== null || b.busy !== null;
  const modelLabel = VIDEO_MODEL_PRESETS.find((p) => p.value === g.videoModel)?.label ?? g.videoModel;
  const costLabel =
    g.estimatedCostUsd == null
      ? "Pricing unavailable"
      : `~${formatEstimateUsd(g.estimatedCostUsd)} for ${g.brief.lengthSeconds} s at ${g.brief.resolution}`;
  const status = g.busy || b.busy || "";

  const selectedScene =
    g.plan?.scenes.find((s) => s.id === g.selectedSceneId) ?? g.plan?.scenes[0] ?? null;

  useEffect(() => {
    if (g.error) notifyHeaderError("Video Studio", g.error, { duration: 12000 });
  }, [g.error]);
  useEffect(() => {
    if (b.error) notifyHeaderError("Video Studio", b.error, { duration: 12000 });
  }, [b.error]);

  // Automatically sync the Left Dock tab (and slide out when Q&A questions need answers)
  useEffect(() => {
    if (g.step === "product") {
      setLeftTab("product");
    } else if (g.step === "questions") {
      setLeftTab("director");
      setLeftOpen(true);
    } else if (g.step === "plan") {
      setLeftTab("director");
    } else if (g.step === "render") {
      setLeftTab("postcut");
    } else if (g.step === "brief" && !g.brief.prompt.trim()) {
      setLeftTab("brief");
    }
  }, [g.step, g.brief.prompt]);

  const handleHeaderStepClick = (nextStep: VideoGeneratorStep) => {
    g.setStep(nextStep);
    if (nextStep === "brainstorm") setLeftTab("assets");
    else if (nextStep === "brief") setLeftTab("brief");
    else if (nextStep === "product") setLeftTab("product");
    else if (nextStep === "questions" || nextStep === "plan") setLeftTab("director");
    else if (nextStep === "storyboard" || nextStep === "render") setLeftTab("postcut");
  };

  const openPostCutForScene = (sceneId?: string) => {
    if (sceneId) g.selectScene(sceneId);
    setLeftTab("postcut");
    setLeftOpen(true);
  };

  const primaryAction = (() => {
    if (g.step === "brainstorm" && b.canBrainstorm && !g.brief.prompt.trim()) {
      return {
        label: "Brainstorm brief",
        onClick: () => void b.brainstorm(),
        disabled: working || !b.canBrainstorm,
      };
    }
    if (g.needsProductStep && !g.productLock.locked) {
      return g.productReadyToLock
        ? {
            label: "Lock product & ask Director",
            onClick: () => void g.lockProduct(),
            disabled: working,
          }
        : {
            label: "Generate product views",
            onClick: () => {
              setLeftTab("product");
              void g.generateProductViews();
            },
            disabled: working,
          };
    }
    if (g.questions === null) {
      return {
        label: "Ask the Director",
        onClick: () => {
          setLeftTab("director");
          setLeftOpen(true);
          void g.askQuestions();
        },
        disabled: working || !g.brief.prompt.trim(),
      };
    }
    if (g.plan === null) {
      return {
        label: "Draft scene plan",
        onClick: () => {
          setLeftTab("director");
          setLeftOpen(false);
          void g.submitAnswers();
        },
        disabled: working || !g.allAnswered,
      };
    }
    if (g.frames.length === 0) {
      return {
        label: "Approve & generate storyboard",
        onClick: () => void g.approvePlanAndBeginStoryboard(),
        disabled: working,
      };
    }
    return {
      label: "Render video",
      onClick: () => void g.renderVideo(),
      disabled: working || !g.readyToRender || g.renderActive,
    };
  })();

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden bg-black font-sans text-base">
      {/* Zone 1: Full-Height Left Vertical Docker Rail + Slide-Out Drawer (mirrors right-side Agents docker) */}
      <VideoStudioLeftDock
        open={leftOpen}
        onOpenChange={setLeftOpen}
        activeTab={leftTab}
        onTabChange={setLeftTab}
        working={working}
        brief={g.brief}
        onPromptChange={g.setPrompt}
        brainstormNotes={b.notes}
        onBrainstormNotesChange={b.setNotes}
        canBrainstorm={b.canBrainstorm}
        onBrainstorm={() => void b.brainstorm()}
        subjectPhotos={g.subjectPhotos}
        isPreparingSubject={g.isPreparingSubject}
        onAddSubjectFiles={(files) => void g.addSubjectFiles(files)}
        onRemoveSubjectPhoto={g.removeSubjectPhoto}
        onClearSubject={g.clearSubject}
        isPreparingReferences={g.isPreparingReferences}
        onAddReferenceFiles={(files) => void g.addReferenceFiles(files)}
        onRemoveReference={g.removeReference}
        brainstormVideo={b.video}
        brainstormImages={b.images}
        isPreparingBrainstorm={b.isPreparing}
        onAddBrainstormFiles={(files) => void b.addFiles(files)}
        onRemoveBrainstormVideo={b.removeVideo}
        onRemoveBrainstormImage={b.removeImage}
        productLock={g.productLock}
        onRegenerateProductView={(viewId) => g.regenerateProductView(viewId)}
        onReviseProductView={(viewId, instruction) => void g.reviseProductView(viewId, instruction)}
        questions={g.questions}
        answers={g.answers}
        onAnswerQuestion={g.answerQuestion}
        plan={g.plan}
        planLive={g.planLive}
        frames={g.frames}
        render={g.render}
        selectedSceneId={g.selectedSceneId}
        onSelectScene={g.selectScene}
        onSendSceneInstruction={(sceneId, instruction) => void g.sendInstruction("scene", instruction, sceneId)}
        onRegenerateEnvironmentPlate={(sceneId) => void g.regenerateEnvironmentPlate(sceneId)}
        onRegenerateFrame={(sceneId) => void g.regenerateFrame(sceneId)}
        onRerenderSceneClip={(sceneId) => void g.rerenderSceneClip(sceneId)}
        onUpdateSceneTransition={g.updateSceneTransition}
        onUpdatePlanFades={g.updatePlanFades}
        onUpdateScenePrompts={(sceneId, patch, action) => void g.updateScenePrompts(sceneId, patch, action)}
        onRestitch={g.restitchVideo}
        projectId={g.projectId}
        projectName={g.projectName}
        onProjectNameChange={g.setProjectName}
        savedProjects={g.savedProjects}
        storedRenders={g.storedRenders}
        onSaveProject={(name) => void g.saveProjectToServer(name)}
        onLoadProject={(id) => void g.loadProjectFromServer(id)}
        onDeleteProject={(id) => void g.deleteProjectFromServer(id)}
        onExportJson={g.exportProjectJson}
        onImportJson={(file) => void g.importProjectJson(file)}
        onExportZip={() => void g.exportProjectZip()}
        onAddVideoClipsToTimeline={(files) => void g.addVideoClipFilesToTimeline(files)}
        onAddStoredClipToTimeline={g.addStoredClipToTimeline}
        onRefreshProjects={() => void g.refreshProjectsAndRenders()}
      />

      {/* Zone 2, 3, 4: Main Studio Column (Header + Center Stage Monitor + Bottom Multi-Track Timeline) */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <VideoWorkspaceHeader
          step={g.step}
          maxStep={g.maxStep}
          onStepChange={handleHeaderStepClick}
          brief={g.brief}
          videoModel={g.videoModel}
          onVideoModelChange={g.setVideoModel}
          modelLabel={modelLabel}
          costLabel={costLabel}
          working={working}
          status={status}
          plan={g.plan}
          frames={g.frames}
          render={g.render}
          renderActive={g.renderActive}
          primaryAction={primaryAction}
          onLengthChange={g.setLengthSeconds}
          onAspectChange={g.setAspect}
          onResolutionChange={g.setResolution}
          onRegenerateProductViews={
            g.productReadyToLock && !g.productLock.locked
              ? () => {
                  setLeftTab("product");
                  void g.generateProductViews();
                }
              : undefined
          }
          onRegeneratePlan={() => void g.regeneratePlan()}
          onRestitch={g.restitchVideo}
          onExportJson={g.exportProjectJson}
          onImportJson={(file) => void g.importProjectJson(file)}
          onExportZip={() => void g.exportProjectZip()}
          onReset={g.reset}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950 p-2">
          <VideoStagePanel
            activeTab={leftTab}
            plan={g.plan}
            planLive={g.planLive}
            brief={g.brief}
            productLock={g.productLock}
            hasSubjectPhotos={g.subjectPhotos.length > 0}
            aspect={g.brief.aspect}
            frames={g.frames}
            selectedSceneId={g.selectedSceneId}
            onSelectScene={g.selectScene}
            render={g.render}
            disabled={working}
            onRegenerateProductView={(viewId) => g.regenerateProductView(viewId)}
            onReviseProductView={(viewId, instruction) => void g.reviseProductView(viewId, instruction)}
            onToggleSceneApproved={g.toggleSceneApproved}
            onApprovePlanAndBeginStoryboard={() => void g.approvePlanAndBeginStoryboard()}
            onSendSceneInstruction={(sceneId, instruction) => void g.sendInstruction("scene", instruction, sceneId)}
            onRegenerateEnvironmentPlate={(sceneId) => void g.regenerateEnvironmentPlate(sceneId)}
            onRegenerateFrame={(sceneId) => void g.regenerateFrame(sceneId)}
            onRerenderSceneClip={(sceneId) => void g.rerenderSceneClip(sceneId)}
          />
          <div className="mt-2 shrink-0">
            <VideoInstructionBar
              disabled={
                working ||
                g.renderActive ||
                (g.plan === null && (!g.needsProductStep || g.subjectPhotos.length === 0))
              }
              productMode={
                g.subjectPhotos.length > 0 &&
                (leftTab === "product" || g.plan === null)
              }
              hasSelectedScene={g.selectedSceneId !== null || Boolean(selectedScene)}
              selectedSceneOrder={selectedScene?.order}
              selectedSceneTitle={selectedScene?.title}
              onSend={(scope, text) => void g.sendInstruction(scope, text)}
              onSendProductInstruction={(target, text) => void g.reviseProductView(target, text)}
              onOpenPostCut={g.plan ? () => openPostCutForScene(selectedScene?.id) : undefined}
            />
          </div>
        </div>

        <VideoTimelineDock
          plan={g.plan}
          totalSeconds={g.brief.lengthSeconds}
          frames={g.frames}
          renderScenes={g.render?.scenes ?? null}
          selectedSceneId={g.selectedSceneId}
          disabled={working}
          onSelectScene={g.selectScene}
          onRegenerateFrame={(sceneId) => void g.regenerateFrame(sceneId)}
          onRerenderSceneClip={g.render ? (sceneId) => void g.rerenderSceneClip(sceneId) : undefined}
          onUpdateSceneTransition={g.updateSceneTransition}
          onOpenPostCutForScene={(sceneId) => openPostCutForScene(sceneId)}
          onAddVideoClips={(files) => void g.addVideoClipFilesToTimeline(files)}
          onMoveScene={g.moveSceneInTimeline}
          onRemoveScene={g.removeSceneFromTimeline}
        />
      </div>
    </div>
  );
}
