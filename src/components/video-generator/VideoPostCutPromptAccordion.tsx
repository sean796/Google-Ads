import { ImagePlus, ShieldCheck, Sparkles, Video, X } from "lucide-react";
import { IMAGE_REFERENCE_ACCEPT } from "@/lib/image-generator/manual-reference-upload";
import { Button, FileInput, TextareaField, Accordion, AccordionContent, AccordionItem, AccordionTrigger, Tooltip, TooltipContent, TooltipTrigger } from "@/ui";
import type { VideoPostCutPromptAccordionProps } from "./video-post-cut-panel-types";

export function VideoPostCutPromptAccordion(props: VideoPostCutPromptAccordionProps) {
  const {
    activeScene,
    instructionText,
    setInstructionText,
    promptText,
    handleMainPromptChange,
    isRemakingPrompt,
    remakeNotice,
    sceneReference,
    referenceInputRef,
    onReferenceFiles,
    applyInstructionToMainPrompt,
    handleRemoveReference,
  } = props;

  return (
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

  );
}
