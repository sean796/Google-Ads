import { useEffect, useRef, useState } from "react";
import { ImagePlus, Layers, Play, ShieldCheck, Sparkles, Undo2, Video, X } from "lucide-react";
import { IMAGE_REFERENCE_ACCEPT, prepareVideoStudioReference } from "@/lib/image-generator/manual-reference-upload";
import type { PostCutSceneReference, VideoScenePlan } from "@/lib/video-generator/video-generator-types";


import { MY_SITES_FIELD } from "@/components/hosting/my-sites/my-sites-theme";
import {
  VIDEO_FADE_DURATIONS,
  VIDEO_TRANSITION_DURATIONS,
  VIDEO_TRANSITION_OPTIONS,
  type StoryboardFrame,
  type VideoPlan,
  type VideoRenderSnapshot,
  type VideoTransition,
  type VideoTransitionType,
} from "@/lib/video-generator/video-generator-types";
import { reviseScenePromptWithAi } from "@/lib/video-generator/video-prompt-remaker-agent";
import { Button, FileInput, SelectField, TextareaField, Accordion, AccordionContent, AccordionItem, AccordionTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/ui";

export type VideoPostCutPanelProps = {
  apiKey?: string;
  plan: VideoPlan | null;
  frames: StoryboardFrame[];
  render: VideoRenderSnapshot | null;
  selectedSceneId: string | null;
  disabled: boolean;
  onSelectScene: (sceneId: string) => void;
  onSendSceneInstruction: (sceneId: string, instruction: string, postCutReference?: PostCutSceneReference) => void;
  onRegenerateEnvironmentPlate: (sceneId: string) => void;
  onRegenerateFrame: (sceneId: string, customInstruction?: string) => void;
  onRestoreReferenceFrame?: (sceneId: string) => void;
  onRerenderSceneClip: (sceneId: string, customPrompt?: string) => void;
  onClearSceneRevisionNotes?: (sceneId: string) => void;
  onUpdateSceneTransition: (sceneId: string, transition: VideoTransition, applyToAll?: boolean) => void;
  onUpdatePlanFades: (fadeInSeconds: number, fadeOutSeconds: number) => void;
  onUpdateScenePrompts?: (
    sceneId: string,
    patch: {
      environmentPrompt?: string;
      storyboardPrompt?: string;
      motionPrompt?: string;
      videoPrompt?: string;
      postCutReferenceDataUrl?: string;
      postCutReferenceFileName?: string;
      customClipFile?: string | null;
      customClipUrl?: string | null;
    },
    action?: "save" | "redraw" | "rerender",
  ) => void;
  onRestitch: () => void;
};

function getInitialScenePrompt(
  frame?: StoryboardFrame,
  activeScene?: VideoScenePlan | null,
): string {
  return (frame?.videoPrompt || activeScene?.motionPrompt || "").trim();
}

function getInitialInstructionText(activeScene?: VideoScenePlan | null): string {
  if (activeScene?.revisionNotes?.length) {
    return activeScene.revisionNotes[activeScene.revisionNotes.length - 1] ?? "";
  }
  return "";
}

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

  const transition = activeScene.transitionIn ?? { type: "dissolve" as const, seconds: 0.7 };
  const transitionMeta =
    VIDEO_TRANSITION_OPTIONS.find((o) => o.value === transition.type) ?? VIDEO_TRANSITION_OPTIONS[0];
  const fadeIn = plan.fadeInSeconds ?? 0.6;
  const fadeOut = plan.fadeOutSeconds ?? 0.8;

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

        {/* Collapsible Accordion for Prompts - Closed by default */}
        <Accordion type="multiple" defaultValue={[]} className="flex flex-col gap-2">
          {/* Accordion Item 1: Desired Changes */}
          <AccordionItem value="instruction" className="border-0 bg-ui-field px-3 py-1">
            <AccordionTrigger className="py-2 text-sm font-semibold text-white hover:no-underline">
              <div className="flex flex-1 items-center justify-between pr-2">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                  <span>Desired Changes</span>
                </span>
                {instructionText.trim() ? (
                  <span className="rounded bg-primary/20 px-2 py-0.5 text-base font-normal text-primary">
                    Drafted
                  </span>
                ) : null}
              </div>
            </AccordionTrigger>
            <AccordionContent forceMount className="pt-2 pb-2 flex flex-col gap-2">
              <FileInput
                ref={referenceInputRef}
                accept={IMAGE_REFERENCE_ACCEPT}
                aria-label="Client reference photo for this scene"
                onChange={(e) => void onReferenceFiles(e.target.files)}
              />
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon" icon={ImagePlus}
                      variant="run"
                      onClick={() => referenceInputRef.current?.click()}
                      aria-label="Upload reference photo"
                    ></Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Upload Reference Photo</TooltipContent>
                </Tooltip>

                {sceneReference ? (
                  <div className="relative group/ref flex items-center">
                    <img
                      src={sceneReference.dataUrl}
                      alt="Scene reference"
                      className="h-8 w-12 object-cover border border-white/10"
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon" icon={X}
                          variant="danger"
                          onClick={handleRemoveReference}
                          aria-label="Remove reference photo"
                        ></Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Remove photo</TooltipContent>
                    </Tooltip>
                  </div>
                ) : null}
              </div>

              <TextareaField
                value={instructionText}
                onChange={(e) => setInstructionText(e.target.value)}
                rows={2}
                aria-label={`Input prompt for Scene ${activeScene.order}`}
                placeholder={`Type changes here (e.g. no people, pan left to desk)...`}
              />

              <div className="flex items-center justify-end">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      onClick={() => void applyInstructionToMainPrompt(instructionText)}
                      disabled={!instructionText.trim() || isRemakingPrompt}
                    >
                      {isRemakingPrompt ? (
                        <>
                          <Sparkles className="mr-1 h-3 w-3 text-primary" aria-hidden />
                          Harmonizing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-1 h-3 w-3" aria-hidden />
                          Apply to Prompt
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">AI remakes prompt to eliminate conflicts and prioritize changes</TooltipContent>
                </Tooltip>
              </div>

              {remakeNotice ? (
                <div className="flex items-start gap-1.5 rounded border border-primary/40 bg-primary/40 p-2 text-xs text-primary">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  <span>
                    <strong>AI Harmonized:</strong> {remakeNotice}
                  </span>
                </div>
              ) : null}
            </AccordionContent>
          </AccordionItem>

          {/* Accordion Item 2: Main Video Motion Prompt */}
          <AccordionItem value="main-prompt" className="border-0 bg-ui-field px-3 py-1">
            <AccordionTrigger className="py-2 text-sm font-semibold text-white hover:no-underline">
              <div className="flex flex-1 items-center justify-between pr-2">
                <span className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-primary" aria-hidden />
                  <span>Main Motion Prompt</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {promptText.trim().split(/\s+/).filter(Boolean).length}w
                  </span>
                  <span className="inline-flex items-center gap-1 bg-primary/60 px-1.5 py-0.5 text-base font-medium text-primary border border-primary/30">
                    <ShieldCheck className="h-3 w-3" aria-hidden />
                    d1.1
                  </span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent forceMount className="pt-2 pb-2 flex flex-col gap-2">
              <TextareaField
                value={promptText}
                onChange={(e) => handleMainPromptChange(e.target.value)}
                rows={4}
                aria-label={`Main Prompt for Scene ${activeScene.order}`}
                placeholder={`Full cinematic video motion prompt...`}
              />
              <div className="flex items-center justify-between text-base text-muted-foreground">
                <span>{promptText.trim().split(/\s+/).filter(Boolean).length} words</span>
                <span>Grok & Decision Model input</span>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

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

        {/* Scene Transition & Global Fade Controls */}
        <div className="flex flex-col gap-2.5 bg-ui-field p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm text-white">Transitions & Fades</span>
            {render ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="run"
                    disabled={disabled}
                    onClick={onRestitch}
                  >
                    Re-stitch MP4
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Re-stitch all finished scene clips into final MP4</TooltipContent>
              </Tooltip>
            ) : null}
          </div>

          {activeScene.order > 1 ? (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <SelectField placeholder="Transition style" value={transition.type} disabled={disabled} onValueChange={(val) => {
                    const nextType = val as VideoTransitionType;
                    const meta = VIDEO_TRANSITION_OPTIONS.find((o) => o.value === nextType);
                    onUpdateSceneTransition(activeScene.id, {
                      type: nextType,
                      seconds: meta?.hasDuration ? (transition.seconds > 0 ? transition.seconds : meta.defaultSeconds) : 0,
                    });
                  }} options={VIDEO_TRANSITION_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))} />

                <SelectField
                  placeholder="Transition duration"
                  value={String(transitionMeta.hasDuration ? (transition.seconds || transitionMeta.defaultSeconds) : 0)}
                  disabled={disabled || !transitionMeta.hasDuration}
                  onValueChange={(val) =>
                    onUpdateSceneTransition(activeScene.id, {
                      type: transition.type,
                      seconds: Number(val),
                    })
                  }
                  options={
                    transitionMeta.hasDuration
                      ? VIDEO_TRANSITION_DURATIONS.map((sec) => ({ value: String(sec), label: `${sec}s transition` }))
                      : [{ value: "0", label: "0s instant" }]
                  }
                  width="full"
                />
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onUpdateSceneTransition(
                        activeScene.id,
                        {
                          type: transition.type,
                          seconds: transitionMeta.hasDuration ? (transition.seconds || transitionMeta.defaultSeconds) : 0,
                        },
                        true,
                      )
                    }
                  >
                    <Layers className="mr-1.5 h-3 w-3" aria-hidden />
                    Apply {transitionMeta.shortLabel} to all cuts
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Apply {transitionMeta.shortLabel} ({transition.seconds}s) to all scene cuts</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <p className="bg-black px-2.5 py-1.5 text-xs text-muted-foreground">
              Scene 1 opens the video (use Fade In below). Select Scene 2+ for cuts.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <SelectField
              placeholder="Fade in"
              value={String(fadeIn)}
              disabled={disabled}
              onValueChange={(val) => onUpdatePlanFades(Number(val), fadeOut)}
              options={VIDEO_FADE_DURATIONS.map((sec) => ({ value: String(sec), label: `Fade in: ${sec === 0 ? "Off" : `${sec}s`}` }))}
              width="full"
            />

            <SelectField
              placeholder="Fade out"
              value={String(fadeOut)}
              disabled={disabled}
              onValueChange={(val) => onUpdatePlanFades(fadeIn, Number(val))}
              options={VIDEO_FADE_DURATIONS.map((sec) => ({ value: String(sec), label: `Fade out: ${sec === 0 ? "Off" : `${sec}s`}` }))}
              width="full"
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
