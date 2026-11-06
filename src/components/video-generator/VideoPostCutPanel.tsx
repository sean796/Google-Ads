import { useEffect, useRef, useState } from "react";
import { Play, Sparkles, Undo2, Video } from "lucide-react";
import { prepareVideoStudioReference } from "@/lib/image-generator/manual-reference-upload";
import type { PostCutSceneReference } from "@/lib/video-generator/video-generator-types";
import { reviseScenePromptWithAi } from "@/lib/video-generator/video-prompt-remaker-agent";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/ui";
import type { VideoPostCutPanelProps } from "./video-post-cut-panel-types";
import { getInitialInstructionText, getInitialScenePrompt } from "./video-post-cut-panel-helpers";
import { VideoPostCutPromptAccordion } from "./VideoPostCutPromptAccordion";
import { VideoPostCutTransitions } from "./VideoPostCutTransitions";

export function VideoPostCutPanel({
  apiKey,
  plan,
  frames,
  render,
  selectedSceneId,
  disabled,
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
}: VideoPostCutPanelProps) {
  const scenes = plan?.scenes ?? [];
  const activeScene = scenes.find((s) => s.id === selectedSceneId) ?? scenes[0] ?? null;
  const frame = activeScene ? frames.find((f) => f.sceneId === activeScene.id) : undefined;
  const clip = activeScene && render ? render.scenes.find((s) => s.sceneId === activeScene.id) : undefined;

  const isFrameGenerating = frame?.status === "generating";
  const isClipRendering = clip?.status === "generating";
  const isRenderActive = render?.status === "rendering" || render?.status === "stitching";

  const [promptText, setPromptText] = useState(() => getInitialScenePrompt(frame, activeScene));
  const [instructionText, setInstructionText] = useState(() => getInitialInstructionText(activeScene));
  const [pendingReference, setPendingReference] = useState<PostCutSceneReference | null>(null);
  const [isRemakingPrompt, setIsRemakingPrompt] = useState(false);
  const [remakeNotice, setRemakeNotice] = useState<string | null>(null);

  useEffect(() => {
    setPromptText(getInitialScenePrompt(frame, activeScene));
    setInstructionText(getInitialInstructionText(activeScene));
    setRemakeNotice(null);
  }, [frame?.videoPrompt, activeScene?.id, activeScene?.revisionNotes, activeScene, frame]);

  const referenceInputRef = useRef<HTMLInputElement>(null);
  const sceneReference: PostCutSceneReference | null =
    pendingReference ??
    (activeScene?.postCutReferenceDataUrl
      ? {
          dataUrl: activeScene.postCutReferenceDataUrl,
          fileName: activeScene.postCutReferenceFileName ?? "Client reference",
        }
      : null);

  useEffect(() => {
    setPendingReference(null);
  }, [activeScene?.id]);

  const applyInstructionToMainPrompt = async (instructionVal: string) => {
    const clean = instructionVal.trim();
    if (!clean || !activeScene || isRemakingPrompt) return;
    setIsRemakingPrompt(true);
    setRemakeNotice(null);
    const refToUse = pendingReference ?? sceneReference;
    try {
      const result = await reviseScenePromptWithAi({
        apiKey,
        currentPrompt: promptText,
        instruction: clean,
        sceneTitle: activeScene.title,
        sceneOrder: activeScene.order,
        referencePhotoDataUrl: refToUse?.dataUrl,
        referenceFileName: refToUse?.fileName,
      });
      setPromptText(result.revisedPrompt);
      setRemakeNotice(result.changesSummary);
      if (onUpdateScenePrompts) {
        onUpdateScenePrompts(
          activeScene.id,
          {
            videoPrompt: result.revisedPrompt,
            motionPrompt: result.revisedPrompt,
            storyboardPrompt: clean,
            ...(refToUse
              ? {
                  postCutReferenceDataUrl: refToUse.dataUrl,
                  postCutReferenceFileName: refToUse.fileName,
                }
              : {}),
          },
          "save",
        );
      }
    } catch {
      // Fallback handled within reviseScenePromptWithAi
    } finally {
      setIsRemakingPrompt(false);
    }
  };

  const handleMainPromptChange = (nextText: string) => {
    setPromptText(nextText);
    setRemakeNotice(null);
    if (activeScene && onUpdateScenePrompts) {
      onUpdateScenePrompts(
        activeScene.id,
        { videoPrompt: nextText, motionPrompt: nextText },
        "save",
      );
    }
  };

  const handleRedrawWithAi = async () => {
    if (!activeScene) return;
    const cleanInstruction = instructionText.trim();
    let currentVideoPrompt = promptText;
    let storyboardInstruction = cleanInstruction || promptText.trim();
    const refToUse = pendingReference ?? sceneReference;

    if (cleanInstruction || refToUse) {
      setIsRemakingPrompt(true);
      try {
        const result = await reviseScenePromptWithAi({
          apiKey,
          currentPrompt: promptText,
          instruction: cleanInstruction || "Match the reference photo wall and architecture behind the stationary display board.",
          sceneTitle: activeScene.title,
          sceneOrder: activeScene.order,
          referencePhotoDataUrl: refToUse?.dataUrl,
          referenceFileName: refToUse?.fileName,
        });
        currentVideoPrompt = result.revisedPrompt;
        storyboardInstruction = cleanInstruction || result.revisedPrompt;
        setPromptText(result.revisedPrompt);
        setRemakeNotice(result.changesSummary);
      } finally {
        setIsRemakingPrompt(false);
      }
    }

    if (refToUse && pendingReference) {
      onSendSceneInstruction(activeScene.id, storyboardInstruction, refToUse);
      setPendingReference(null);
    } else {
      if (onUpdateScenePrompts) {
        onUpdateScenePrompts(
          activeScene.id,
          {
            videoPrompt: currentVideoPrompt,
            motionPrompt: currentVideoPrompt,
            storyboardPrompt: storyboardInstruction,
            ...(refToUse ? { postCutReferenceDataUrl: refToUse.dataUrl, postCutReferenceFileName: refToUse.fileName } : {}),
          },
          "save",
        );
      }
      onRegenerateFrame(activeScene.id, storyboardInstruction);
    }
  };

  if (!plan || !activeScene) {
    return (
      <div className="bg-ui-field p-4 text-base text-muted-foreground">
        Select any scene once the plan is ready to type changes or adjust transitions.
      </div>
    );
  }

  const onReferenceFiles = async (files: FileList | null) => {
    if (!files?.length || !activeScene) return;
    const file = files[0];
    try {
      const prepared = await prepareVideoStudioReference(file);
      setPendingReference({ dataUrl: prepared.dataUrl, fileName: prepared.fileName });
      if (onUpdateScenePrompts) {
        onUpdateScenePrompts(
          activeScene.id,
          {
            postCutReferenceDataUrl: prepared.dataUrl,
            postCutReferenceFileName: prepared.fileName,
          },
          "save",
        );
      }
    } finally {
      if (referenceInputRef.current) referenceInputRef.current.value = "";
    }
  };

  const handleRemoveReference = () => {
    setPendingReference(null);
    if (activeScene && onUpdateScenePrompts) {
      onUpdateScenePrompts(
        activeScene.id,
        {
          postCutReferenceDataUrl: undefined,
          postCutReferenceFileName: undefined,
        },
        "save",
      );
    }
  };

  const handleRerender = () => {
    const text = promptText.trim();
    if (!text || !activeScene) return;
    const refToUse = pendingReference ?? sceneReference;
    if (pendingReference && refToUse) {
      onSendSceneInstruction(activeScene.id, text, refToUse);
      setPendingReference(null);
      return;
    }
    if (onUpdateScenePrompts) {
      onUpdateScenePrompts(activeScene.id, { videoPrompt: text, motionPrompt: text }, "save");
    }
    onRerenderSceneClip(activeScene.id, text);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col gap-3 text-base">
        {/* Scene Switcher Strip */}
        <div className="flex flex-col gap-2 bg-ui-field p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-white">Post-Cut Scene Studio</span>
            {activeScene.environmentId ? (
              <span className="bg-black px-2 py-0.5 text-xs text-primary">
                Loc: {activeScene.environmentId}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {scenes.map((s) => {
              const isCurrent = s.id === activeScene.id;
              return (
                <Button
                  pressed={Boolean(isCurrent)}
                  key={s.id}
                  onClick={() => onSelectScene(s.id)}
                >
                  S{s.order}
                </Button>
              );
            })}
          </div>
          <p className="break-words text-xs font-medium text-white">
            Scene {activeScene.order}: {activeScene.title} ({activeScene.durationSeconds}s)
          </p>
        </div>

        <VideoPostCutPromptAccordion
          activeScene={activeScene}
          instructionText={instructionText}
          setInstructionText={setInstructionText}
          promptText={promptText}
          handleMainPromptChange={handleMainPromptChange}
          isRemakingPrompt={isRemakingPrompt}
          remakeNotice={remakeNotice}
          sceneReference={sceneReference}
          referenceInputRef={referenceInputRef}
          onReferenceFiles={onReferenceFiles}
          applyInstructionToMainPrompt={applyInstructionToMainPrompt}
          handleRemoveReference={handleRemoveReference}
        />

        {/* Sliced Reference Video Clip (Zero-Hallucination Ground Truth) */}
        {(activeScene.referenceClipUrl || activeScene.customClipUrl) ? (
          <div className="flex flex-col gap-2 bg-ui-field p-3 border border-primary/20">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-primary flex items-center gap-1.5">
                <Video className="h-3.5 w-3.5" aria-hidden />
                Reference Video Clip ({activeScene.referenceClipStartSeconds !== undefined ? `${activeScene.referenceClipStartSeconds}s` : `${(activeScene.order - 1) * 6}s`} - {activeScene.referenceClipStartSeconds !== undefined ? `${activeScene.referenceClipStartSeconds + (activeScene.referenceClipDurationSeconds ?? activeScene.durationSeconds)}s` : `${activeScene.order * 6}s`})
              </span>
              <span className="text-base text-muted-foreground bg-black px-1.5 py-0.5 border border-border">
                Chopped to {activeScene.durationSeconds}s
              </span>
            </div>
            <div className="relative aspect-video w-full overflow-hidden bg-black rounded border border-border">
              <video
                src={activeScene.referenceClipUrl || activeScene.customClipUrl}
                controls
                preload="metadata"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={isRenderActive}
                onClick={() => {
                  if (!onUpdateScenePrompts) return;
                  const refFile = activeScene.referenceClipFile || activeScene.customClipFile;
                  const refUrl = activeScene.referenceClipUrl || activeScene.customClipUrl;
                  const isCurrentlyUsing = Boolean(activeScene.customClipFile);
                  onUpdateScenePrompts(
                    activeScene.id,
                    {
                      customClipFile: isCurrentlyUsing ? null : refFile,
                      customClipUrl: isCurrentlyUsing ? null : refUrl,
                    },
                    "save",
                  );
                }}
              >
                {activeScene.customClipFile
                  ? "✓ Real Footage Active (0 Inversion)"
                  : "Use Real Footage (Zero Inversion)"}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Scene Keyframe & Clip Action Buttons */}
        <div className="flex flex-col gap-2 bg-ui-field p-3">
          <div className="relative aspect-video w-full overflow-hidden bg-black">
            {frame?.imageDataUrl ? (
              <img
                src={frame.imageDataUrl}
                alt={`Scene ${activeScene.order} keyframe`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Keyframe
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  disabled={isFrameGenerating || isRemakingPrompt || isRenderActive}
                  onClick={() => void handleRedrawWithAi()}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {isRemakingPrompt ? "Harmonizing..." : "Redraw Keyframe"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Redraw frame with AI fusing prompt & reference image</TooltipContent>
            </Tooltip>

            {onRestoreReferenceFrame && (plan.referenceStillsFlythrough || activeScene.postCutReferenceDataUrl || activeScene.referenceClipUrl || (activeScene.referenceIndexes && activeScene.referenceIndexes.length > 0)) ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    disabled={isFrameGenerating || isRenderActive}
                    onClick={() => onRestoreReferenceFrame(activeScene.id)}
                  >
                    <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Restore Real Still
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Restore the 100% real photographic still (uploaded photo or raw video frame)</TooltipContent>
              </Tooltip>
            ) : null}
          </div>

          {render ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="run"
                  type="button"
                  disabled={!frame?.imageDataUrl || !promptText.trim() || isClipRendering || isRenderActive}
                  onClick={handleRerender}
                >
                  <Play className="mr-1.5 h-3.5 w-3.5 fill-current" aria-hidden />
                  Re-render Scene {activeScene.order} Video Clip
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Render 100% video clip for Scene {activeScene.order}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        <VideoPostCutTransitions
          activeScene={activeScene}
          plan={plan}
          render={render}
          disabled={disabled}
          onRestitch={onRestitch}
          onUpdateSceneTransition={onUpdateSceneTransition}
          onUpdatePlanFades={onUpdatePlanFades}
        />
      </div>
    </TooltipProvider>
  );
}
