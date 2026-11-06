import { useEffect, useState, type DragEvent } from "react";
import { X } from "lucide-react";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import { referenceUploadFiles } from "@/lib/image-generator/manual-reference-upload";
import { VideoProductPanel } from "./VideoProductPanel";
import { VideoQuestionsPanel } from "./VideoQuestionsPanel";
import { VideoPlanPanel } from "./VideoPlanPanel";
import { VideoPostCutPanel } from "./VideoPostCutPanel";
import { VideoProjectsPanel } from "./VideoProjectsPanel";
import { cn } from "@/lib/utils";
import { Button, RailButton, TextareaField } from "@/ui";
import {
  RAIL_ITEMS,
  type AssetFilter,
  type StudioLeftTabId,
  type VideoStudioLeftDockProps,
} from "./video-studio-left-dock-types";
import { buildVideoStudioLibraryTiles } from "./video-studio-left-dock-library";
import { VideoStudioAssetsPanel } from "./VideoStudioAssetsPanel";

export function VideoStudioLeftDock(props: VideoStudioLeftDockProps) {
  const {
    apiKey,
    open,
    onOpenChange,
    activeTab,
    onTabChange,
    working,
    brief,
    onPromptChange,
    brainstormNotes,
    onBrainstormNotesChange,
    canBrainstorm,
    onBrainstorm,
    subjectPhotos,
    isPreparingSubject,
    onAddSubjectFiles,
    onRemoveSubjectPhoto,
    onClearSubject,
    isPreparingReferences,
    onAddReferenceFiles,
    onRemoveReference,
    isPreparingReferenceVideo,
    onUploadReferenceVideo,
    onRemoveReferenceVideo,
    brainstormVideo,
    brainstormImages,
    isPreparingBrainstorm,
    onAddBrainstormFiles,
    onRemoveBrainstormVideo,
    onRemoveBrainstormImage,
    productLock,
    onRegenerateProductView,
    onReviseProductView,
    questions,
    answers,
    onAnswerQuestion,
    plan,
    planLive,
    frames,
    render,
    selectedSceneId,
    onSelectScene,
    onSendSceneInstruction,
    onRegenerateEnvironmentPlate,
    onRegenerateFrame,
    onRestoreReferenceFrame,
    onRerenderSceneClip,
    onClearSceneRevisionNotes,
    onUpdateSceneTransition,
    onUpdatePlanFades,
    onUpdateScenePrompts,
    onRestitch,
    projectId,
    projectName,
    onProjectNameChange,
    savedProjects,
    storedRenders,
    onSaveProject,
    onLoadProject,
    onDeleteProject,
    onExportJson,
    onImportJson,
    onExportZip,
    onAddVideoClipsToTimeline,
    onAddStoredClipToTimeline,
    onRefreshProjects,
  } = props;

  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (working || isPreparingSubject || isPreparingReferences || isPreparingBrainstorm || isPreparingReferenceVideo) {
      return;
    }
    if (!e.dataTransfer.files.length) return;
    const files = Array.from(e.dataTransfer.files);
    const clip = files.find((f) => f.type.startsWith("video/"));
    if (clip) {
      onAddBrainstormFiles(files);
      void onUploadReferenceVideo(clip);
      return;
    }
    const images = referenceUploadFiles(files);
    if (!images.length) return;
    if (assetFilter === "product") {
      onAddSubjectFiles(images);
    } else {
      onAddReferenceFiles(images);
    }
  };

  const libraryTiles = buildVideoStudioLibraryTiles({
    brief,
    subjectPhotos,
    productLock,
    brainstormImages,
    brainstormVideo,
    onClearSubject,
    onRemoveSubjectPhoto,
    onRemoveReference,
    onRemoveBrainstormImage,
    onRemoveReferenceVideo,
    onRemoveBrainstormVideo,
  });

  const filteredTiles =
    assetFilter === "all"
      ? libraryTiles
      : libraryTiles.filter((t) => t.category === assetFilter);

  const isStreamingPlan = Boolean(!plan && (planLive.content || planLive.reasoning));

  const openPanelTab = (tab: StudioLeftTabId) => {
    if (open && activeTab === tab) {
      onOpenChange(false);
      return;
    }
    onTabChange(tab);
    onOpenChange(true);
  };

  return (
    <div className="relative flex h-full w-20 shrink-0 select-none text-base">
      {/* Full-Height Vertical Left Docker Rail (matches right-side Agents/Assist 5rem rail) */}
      <aside
        aria-label="Video studio sidebar shortcuts"
        className="z-20 flex h-full w-20 flex-col items-center justify-center gap-3 bg-primary"
      >
        {RAIL_ITEMS.map((item) => {
          const isCurrent = open && activeTab === item.id;
          return (
            <RailButton
              key={item.id}
              icon={item.icon}
              label={item.label}
              selected={Boolean(isCurrent)}
              onClick={() => openPanelTab(item.id)}
              aria-label={`Open ${item.label}`}
              aria-expanded={isCurrent}
            />
          );
        })}
      </aside>

      {/* Slide-Out Full-Height Drawer Panel (mirrors PulseAssistSidebarShell) */}
      <div
        role="dialog"
        aria-modal="false"
        aria-hidden={!open}
        aria-label="Video studio tools"
        className={cn(
          "absolute inset-y-0 left-0 z-40 flex w-[32rem] max-w-[88vw] flex-col bg-[hsl(0_0%_6%)] text-foreground shadow-[8px_0_32px_rgba(0,0,0,0.55)] transition-all duration-200 ease-out",
          open
            ? "visible translate-x-0 opacity-100 pointer-events-auto"
            : "invisible -translate-x-full opacity-0 pointer-events-none",
        )}
      >
        {/* Top WorkspacePill Tablist Header */}
        <div
          role="tablist"
          aria-label="Video studio sections"
          className="flex min-h-[3.25rem] shrink-0 items-center gap-1 overflow-hidden bg-black px-2.5 py-2.5"
        >
          {RAIL_ITEMS.map((item) => (
            <WorkspacePill
              key={item.id}
              label={item.label}
              active={activeTab === item.id}
              square
              onClick={() => onTabChange(item.id)}
              className="h-8 shrink-0 px-2"
            />
          ))}
          <div className="ml-auto">
            <Button
              size="icon" icon={X}
              variant="quiet"
              onClick={() => onOpenChange(false)}
              aria-label="Close sidebar"
            ></Button>
          </div>
        </div>

        {/* Slide-Out Drawer Content */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-5 py-5"
        >
          {activeTab === "assets" ? (
            <VideoStudioAssetsPanel
              brief={brief}
              working={working}
              assetFilter={assetFilter}
              onAssetFilterChange={setAssetFilter}
              filteredTiles={filteredTiles}
              subjectPhotos={subjectPhotos}
              isPreparingSubject={isPreparingSubject}
              isPreparingReferences={isPreparingReferences}
              isPreparingReferenceVideo={isPreparingReferenceVideo}
              isPreparingBrainstorm={isPreparingBrainstorm}
              onPromptChange={onPromptChange}
              onAddSubjectFiles={onAddSubjectFiles}
              onAddReferenceFiles={onAddReferenceFiles}
              onUploadReferenceVideo={onUploadReferenceVideo}
              onAddBrainstormFiles={onAddBrainstormFiles}
            />
          ) : null}

          {activeTab === "brief" ? (
            <div className="flex flex-col gap-4">
              <TextareaField
                value={brief.prompt}
                onChange={(e) => onPromptChange(e.target.value)}
                disabled={working}
                rows={8}
                aria-label="Video brief"
                placeholder="Video Brief: describe subject, story arc, mood, camera style, and where the video runs"
              />

              <TextareaField
                value={brainstormNotes}
                onChange={(e) => onBrainstormNotesChange(e.target.value)}
                disabled={working}
                rows={4}
                aria-label="Brainstorm notes"
                placeholder="Producer notes (optional): what to extract from uploaded reference media"
              />

              <Button
                type="button"
                disabled={working || !canBrainstorm}
                onClick={onBrainstorm}
              >
                Auto-Write Brief from Media
              </Button>
            </div>
          ) : null}

          {activeTab === "product" ? (
            <VideoProductPanel
              product={productLock}
              disabled={working}
              hasSubjectPhotos={subjectPhotos.length > 0}
              onRegenerateView={onRegenerateProductView}
              onReviseView={onReviseProductView}
            />
          ) : null}

          {activeTab === "director" ? (
            <div className="flex flex-col gap-4">
              {questions ? (
                <VideoQuestionsPanel
                  questions={questions}
                  answers={answers}
                  disabled={working}
                  collapsedByDefault={Boolean(plan)}
                  onAnswer={onAnswerQuestion}
                />
              ) : null}

              {plan ? (
                <VideoPlanPanel
                  plan={plan}
                  selectedSceneId={selectedSceneId}
                  onSelectScene={onSelectScene}
                  referenceNames={brief.references.map((r) => r.fileName)}
                />
              ) : isStreamingPlan ? (
                <div className="flex items-center gap-2.5 bg-ui-field p-4 text-muted-foreground">
                  <span
                    className="h-2 w-2 shrink-0 animate-video-product-splash-breathe bg-primary"
                    aria-hidden
                  />
                  <span>Director is streaming the scene plan on the Center Monitor…</span>
                </div>
              ) : !questions ? (
                <div className="bg-ui-field p-4 text-muted-foreground">
                  Add a brief, product photos, or references on the Assets tab or center monitor, then click{" "}
                  <span className="font-medium text-white">Ask the Director</span> in the top bar.
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === "postcut" ? (
            <VideoPostCutPanel
              apiKey={apiKey}
              plan={plan}
              frames={frames}
              render={render}
              selectedSceneId={selectedSceneId}
              disabled={Boolean(props.planDrafting || props.renderActive)}
              onSelectScene={onSelectScene}
              onSendSceneInstruction={onSendSceneInstruction}
              onRegenerateEnvironmentPlate={onRegenerateEnvironmentPlate}
              onRegenerateFrame={onRegenerateFrame ?? (() => {})}
              onRestoreReferenceFrame={onRestoreReferenceFrame}
              onRerenderSceneClip={onRerenderSceneClip}
              onClearSceneRevisionNotes={onClearSceneRevisionNotes}
              onUpdateSceneTransition={onUpdateSceneTransition}
              onUpdatePlanFades={onUpdatePlanFades}
              onUpdateScenePrompts={onUpdateScenePrompts}
              onRestitch={onRestitch}
            />
          ) : null}

          {activeTab === "projects" ? (
            <VideoProjectsPanel
              projectId={projectId}
              projectName={projectName}
              onProjectNameChange={onProjectNameChange}
              savedProjects={savedProjects}
              storedRenders={storedRenders}
              plan={plan}
              frames={frames}
              render={render}
              disabled={working}
              onSaveProject={onSaveProject}
              onLoadProject={onLoadProject}
              onDeleteProject={onDeleteProject}
              onExportJson={onExportJson}
              onImportJson={onImportJson}
              onExportZip={onExportZip}
              onAddVideoClipsToTimeline={onAddVideoClipsToTimeline}
              onAddStoredClipToTimeline={onAddStoredClipToTimeline}
              onRefresh={onRefreshProjects}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
