import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  Archive,
  Box,
  ChevronLeft,
  Clapperboard,
  FolderOpen,
  Image as ImageIcon,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import { MY_SITES_FIELD } from "@/components/hosting/my-sites/my-sites-theme";
import { IMAGE_REFERENCE_ACCEPT, referenceUploadFiles } from "@/lib/image-generator/manual-reference-upload";
import type { ManualImageReference } from "@/lib/image-generator/manual-reference-upload";
import type { OpenRouterAppStreamDelta } from "@/lib/openrouter-app-api";
import type {
  ProductLockState,
  ProductViewId,
  StoryboardFrame,
  VideoBrief,
  VideoClarifyQuestion,
  VideoPlan,
  VideoProjectSummary,
  VideoRenderSnapshot,
  VideoStoredClip,
  VideoStoredRenderSummary,
  VideoTransition,
} from "@/lib/video-generator/video-generator-types";
import { VideoStartComposePanel } from "./VideoStartComposePanel";
import { VideoProductPanel } from "./VideoProductPanel";
import { VideoQuestionsPanel } from "./VideoQuestionsPanel";
import { VideoPlanPanel } from "./VideoPlanPanel";
import { VideoPostCutPanel } from "./VideoPostCutPanel";
import { VideoProjectsPanel } from "./VideoProjectsPanel";
import { cn } from "@/lib/utils";

export type StudioLeftTabId = "assets" | "brief" | "product" | "director" | "postcut" | "projects";
type AssetFilter = "all" | "product" | "references" | "video";

export type VideoStudioLeftDockProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: StudioLeftTabId;
  onTabChange: (tab: StudioLeftTabId) => void;
  working: boolean;
  brief: VideoBrief;
  onPromptChange: (v: string) => void;
  brainstormNotes: string;
  onBrainstormNotesChange: (v: string) => void;
  canBrainstorm: boolean;
  onBrainstorm: () => void;
  subjectPhotos: ManualImageReference[];
  isPreparingSubject: boolean;
  onAddSubjectFiles: (files: FileList | File[]) => void;
  onRemoveSubjectPhoto: (id: string) => void;
  onClearSubject: () => void;
  isPreparingReferences: boolean;
  onAddReferenceFiles: (files: FileList | File[]) => void;
  onRemoveReference: (id: string) => void;
  brainstormVideo: { file: File; previewUrl: string } | null;
  brainstormImages: ManualImageReference[];
  isPreparingBrainstorm: boolean;
  onAddBrainstormFiles: (files: FileList | File[]) => void;
  onRemoveBrainstormVideo: () => void;
  onRemoveBrainstormImage: (id: string) => void;
  productLock: ProductLockState;
  onRegenerateProductView: (viewId: ProductViewId) => void;
  onReviseProductView?: (viewId: ProductViewId | "all", instruction: string) => void;
  questions: VideoClarifyQuestion[] | null;
  answers: Record<string, string>;
  onAnswerQuestion: (id: string, value: string) => void;
  plan: VideoPlan | null;
  planLive: OpenRouterAppStreamDelta;
  frames: StoryboardFrame[];
  render: VideoRenderSnapshot | null;
  selectedSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  onSendSceneInstruction: (
    sceneId: string,
    instruction: string,
    postCutReference?: { dataUrl: string; fileName: string },
  ) => void;
  onRegenerateEnvironmentPlate: (sceneId: string) => void;
  onRegenerateFrame: (sceneId: string) => void;
  onRerenderSceneClip: (sceneId: string) => void;
  onUpdateSceneTransition: (sceneId: string, transition: VideoTransition, applyToAll?: boolean) => void;
  onUpdatePlanFades: (fadeInSeconds: number, fadeOutSeconds: number) => void;
  onUpdateScenePrompts: (
    sceneId: string,
    patch: {
      environmentPrompt?: string;
      storyboardPrompt?: string;
      motionPrompt?: string;
      videoPrompt?: string;
    },
    action?: "save" | "redraw" | "rerender",
  ) => void;
  onRestitch: () => void;
  projectId: string;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  savedProjects: VideoProjectSummary[];
  storedRenders: VideoStoredRenderSummary[];
  onSaveProject: (name?: string) => void;
  onLoadProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onExportZip: () => void;
  onAddVideoClipsToTimeline?: (files: FileList | File[]) => void;
  onAddStoredClipToTimeline?: (clip: VideoStoredClip, label?: string) => void;
  onRefreshProjects: () => void;
};

const RAIL_ITEMS: Array<{ id: StudioLeftTabId; label: string; icon: typeof Sparkles }> = [
  { id: "assets", label: "Assets", icon: FolderOpen },
  { id: "brief", label: "Brief", icon: Sparkles },
  { id: "product", label: "Product", icon: Box },
  { id: "director", label: "Director", icon: Clapperboard },
  { id: "postcut", label: "Post-Cut", icon: SlidersHorizontal },
  { id: "projects", label: "Projects", icon: Archive },
];

/**
 * Full-height vertical left docker rail + slide-out drawer panel for the Video Studio.
 * Mirrors the right-side PulseAssistSidebarShell / Agents docker architecture.
 */
export function VideoStudioLeftDock(props: VideoStudioLeftDockProps) {
  const {
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
    onRerenderSceneClip,
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
  const mediaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (working || isPreparingSubject || isPreparingReferences || isPreparingBrainstorm) return;
    if (!e.dataTransfer.files.length) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.some((f) => f.type.startsWith("video/"))) {
      onAddBrainstormFiles(files);
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

  type LibraryTile = {
    id: string;
    name: string;
    badge: string;
    category: "product" | "references" | "video";
    kind: "image" | "video";
    src: string;
    onRemove?: () => void;
  };

  const libraryTiles: LibraryTile[] = [
    ...(brief.subject
      ? [
          {
            id: `harness-${brief.subject.id}`,
            name: brief.subject.fileName,
            badge: "Product Harness",
            category: "product" as const,
            kind: "image" as const,
            src: brief.subject.dataUrl,
            onRemove: onClearSubject,
          },
        ]
      : []),
    ...(brief.environmentHarnessDataUrl
      ? [
          {
            id: "env-harness-sheet",
            name: "environment-harness.png",
            badge: "Env Harness",
            category: "references" as const,
            kind: "image" as const,
            src: brief.environmentHarnessDataUrl,
          },
        ]
      : []),
    ...subjectPhotos.map((p) => ({
      id: `subj-${p.id}`,
      name: p.fileName,
      badge: "Product",
      category: "product" as const,
      kind: "image" as const,
      src: p.dataUrl,
      onRemove: () => onRemoveSubjectPhoto(p.id),
    })),
    ...productLock.views
      .filter((v) => v.imageDataUrl)
      .map((v) => ({
        id: `view-${v.id}`,
        name: v.label,
        badge: "3D View",
        category: "product" as const,
        kind: "image" as const,
        src: v.imageDataUrl as string,
      })),
    ...brief.references.map((r, i) => ({
      id: `ref-${r.id}`,
      name: r.fileName,
      badge: `Image ${i + 1}`,
      category: "references" as const,
      kind: "image" as const,
      src: r.dataUrl,
      onRemove: () => onRemoveReference(r.id),
    })),
    ...brainstormImages.map((r) => ({
      id: `bimg-${r.id}`,
      name: r.fileName,
      badge: "Beat ref",
      category: "references" as const,
      kind: "image" as const,
      src: r.dataUrl,
      onRemove: () => onRemoveBrainstormImage(r.id),
    })),
    ...(brainstormVideo
      ? [
          {
            id: "bvideo-source",
            name: brainstormVideo.file.name,
            badge: "Video",
            category: "video" as const,
            kind: "video" as const,
            src: brainstormVideo.previewUrl,
            onRemove: onRemoveBrainstormVideo,
          },
        ]
      : []),
  ];

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
        className="z-20 flex h-full w-20 flex-col items-center justify-center gap-3 border-r border-white/10 bg-black px-2 py-4"
      >
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const isCurrent = open && activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => openPanelTab(item.id)}
              aria-label={`Open ${item.label}`}
              aria-expanded={isCurrent}
              className={cn(
                "group flex min-h-[4.25rem] w-full flex-col items-center justify-center gap-2 px-1.5 py-2.5 text-base transition-colors",
                isCurrent
                  ? "bg-zinc-900 font-semibold text-primary"
                  : "bg-transparent text-white hover:bg-zinc-900/70 hover:text-primary",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0 text-primary transition-transform",
                  "drop-shadow-[0_0_6px_hsl(var(--primary)/0.55)] group-hover:drop-shadow-[0_0_10px_hsl(var(--primary)/0.85)]",
                )}
                aria-hidden
              />
              <span className="leading-none tracking-wide">{item.label}</span>
            </button>
          );
        })}
      </aside>

      {/* Backdrop when slide-out drawer is open */}
      <button
        type="button"
        aria-label="Close studio sidebar"
        tabIndex={open ? 0 : -1}
        onClick={() => onOpenChange(false)}
        className={cn(
          "fixed inset-0 z-30 bg-black/40 transition-opacity duration-200",
          open ? " opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
      />

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
        {open ? (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Collapse studio sidebar"
            className="
              absolute right-0 top-1/2 z-20 flex min-h-[72px] w-9 translate-x-full -translate-y-1/2
              items-center justify-center border-l-[3px] border-transparent bg-black px-2 py-3 text-white
              shadow-[0_4px_24px_rgba(0,0,0,0.45)] transition-all
              hover:border-primary hover:text-primary
            "
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
        ) : null}

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
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close sidebar"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-zinc-900 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Slide-Out Drawer Content */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-5 py-5"
        >
          {activeTab === "assets" ? (
            <>
              <VideoStartComposePanel
                variant="drawer"
                prompt={brief.prompt}
                onPromptChange={onPromptChange}
                productCount={subjectPhotos.length}
                referenceCount={brief.references.length}
                disabled={working}
                isPreparingSubject={isPreparingSubject}
                isPreparingReferences={isPreparingReferences}
                onAddProductFiles={onAddSubjectFiles}
                onAddReferenceFiles={onAddReferenceFiles}
              />
              <input
                ref={mediaInputRef}
                type="file"
                accept={`${IMAGE_REFERENCE_ACCEPT},video/*`}
                multiple
                className="hidden"
                onChange={(e) => {
                  const list = e.target.files ? Array.from(e.target.files) : [];
                  if (list.length) {
                    if (list.some((f) => f.type.startsWith("video/"))) {
                      onAddBrainstormFiles(list);
                    } else if (assetFilter === "product") {
                      onAddSubjectFiles(referenceUploadFiles(list));
                    } else {
                      onAddReferenceFiles(referenceUploadFiles(list));
                    }
                  }
                  e.target.value = "";
                }}
              />

              <div className="flex gap-1.5 bg-zinc-900 p-1.5">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "product", label: "Product" },
                    { id: "references", label: "Refs" },
                    { id: "video", label: "Video" },
                  ] as const
                ).map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setAssetFilter(pill.id)}
                    className={cn(
                      "flex-1 px-2.5 py-1.5 text-base transition-colors",
                      assetFilter === pill.id
                        ? "bg-primary font-semibold text-black"
                        : "text-muted-foreground hover:text-white",
                    )}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {filteredTiles.length === 0 ? (
                <button
                  type="button"
                  disabled={working || isPreparingSubject || isPreparingReferences || isPreparingBrainstorm}
                  onClick={() => mediaInputRef.current?.click()}
                  className="flex min-h-[10rem] w-full flex-col items-center justify-center gap-2.5 bg-zinc-900 px-5 py-6 text-center text-muted-foreground transition-colors hover:bg-zinc-800/80 disabled:opacity-50"
                >
                  <ImageIcon className="h-6 w-6 text-primary/80" aria-hidden />
                  <p>Drop product photos, story beats, or reference video here, or click to browse.</p>
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredTiles.map((tile) => (
                    <div key={tile.id} className="group flex flex-col bg-zinc-900">
                      <div className="relative aspect-video w-full overflow-hidden bg-black">
                        {tile.kind === "video" ? (
                          <video
                            src={tile.src}
                            muted
                            playsInline
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <img
                            src={tile.src}
                            alt={tile.name}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        )}
                        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 bg-black/85 px-2 py-0.5 text-base text-white">
                          {tile.kind === "video" ? (
                            <VideoIcon className="h-3.5 w-3.5 text-primary" aria-hidden />
                          ) : (
                            <ImageIcon className="h-3.5 w-3.5 text-primary" aria-hidden />
                          )}
                          {tile.badge}
                        </span>
                        {tile.onRemove ? (
                          <button
                            type="button"
                            disabled={working}
                            onClick={tile.onRemove}
                            aria-label={`Remove ${tile.name}`}
                            className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center bg-black/85 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                      <p className="truncate px-2.5 py-1.5 text-base text-foreground" title={tile.name}>
                        {tile.name}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {activeTab === "brief" ? (
            <div className="flex flex-col gap-4">
              <Textarea
                value={brief.prompt}
                onChange={(e) => onPromptChange(e.target.value)}
                disabled={working}
                rows={8}
                aria-label="Video brief"
                placeholder="Video Brief: describe subject, story arc, mood, camera style, and where the video runs"
                className={cn(MY_SITES_FIELD, "h-auto min-h-[12rem] resize-y bg-zinc-900 p-3.5 text-base")}
              />

              <Textarea
                value={brainstormNotes}
                onChange={(e) => onBrainstormNotesChange(e.target.value)}
                disabled={working}
                rows={4}
                aria-label="Brainstorm notes"
                placeholder="Producer notes (optional): what to extract from uploaded reference media"
                className={cn(MY_SITES_FIELD, "h-auto min-h-[6.5rem] resize-y bg-zinc-900 p-3.5 text-base")}
              />

              <Button
                type="button"
                variant="secondary"
                disabled={working || !canBrainstorm}
                onClick={onBrainstorm}
                className="h-10 w-full bg-zinc-900 px-4 text-base font-medium text-white hover:bg-zinc-800"
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
                <div className="flex items-center gap-2.5 bg-zinc-900 p-4 text-muted-foreground">
                  <span
                    className="h-2 w-2 shrink-0 animate-video-product-splash-breathe bg-primary"
                    aria-hidden
                  />
                  <span>Director is streaming the scene plan on the Center Monitor…</span>
                </div>
              ) : !questions ? (
                <div className="bg-zinc-900 p-4 text-muted-foreground">
                  Add a brief, product photos, or references on the Assets tab or center monitor, then click{" "}
                  <span className="font-medium text-white">Ask the Director</span> in the top bar.
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === "postcut" ? (
            <VideoPostCutPanel
              plan={plan}
              frames={frames}
              render={render}
              selectedSceneId={selectedSceneId}
              disabled={working}
              onSelectScene={onSelectScene}
              onSendSceneInstruction={onSendSceneInstruction}
              onRegenerateEnvironmentPlate={onRegenerateEnvironmentPlate}
              onRegenerateFrame={onRegenerateFrame}
              onRerenderSceneClip={onRerenderSceneClip}
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
