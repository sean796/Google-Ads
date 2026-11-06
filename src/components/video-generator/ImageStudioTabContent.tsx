import { useEffect, useRef, useState, type DragEvent } from "react";
import { Bookmark, BookmarkPlus, CheckSquare, Copy, Download, FolderOpen, Image as ImageIcon, Send, Sparkles, Trash2, Upload, X } from "lucide-react";



import { WorkspacePill } from "@/components/shared/WorkspacePill";
import { MY_SITES_FIELD, MY_SITES_ICON_BTN } from "@/components/hosting/my-sites/my-sites-theme";
import {
  BULK_HEADER_ICON_TOOL_BTN,
  BULK_HEADER_RUN_BTN,
  BULK_HEADER_SELECT_TRIGGER,
  BULK_HEADER_TOOL_BTN,
  BULK_TOOLBAR_GROUP_DIVIDER,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { ImageColorInputField } from "@/components/generator/image/ImageColorInputField";
import { ImageGeneratorChecklistPanel } from "@/components/generator/image/ImageGeneratorChecklistPanel";
import { useImageGenerator } from "@/components/generator/image/useImageGenerator";
import type { GeneratorFreeFlowBindings } from "@/components/generator/generator-free-flow-bindings";
import { IMAGE_MODEL_PRESETS } from "@/lib/image-model-defaults";
import { IMAGE_REFERENCE_ACCEPT } from "@/lib/image-generator/manual-reference-upload";
import type {
  ImageAspectRatio,
  ImageColorScheme,
  ImageSourceMode,
  ImageStyle,
} from "@/lib/image-generator/image-generator-options";
import { VideoStudioPlaceholderSplash } from "./VideoStudioPlaceholderSplash";
import { cn } from "@/lib/utils";
import { Button, Field, FileInput, RailButton, RowButton, SelectField, TextareaField, Checkbox, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/ui";

type ImageStudioLeftTabId = "assets" | "brief" | "checklist";

const RAIL_ITEMS: Array<{ id: ImageStudioLeftTabId; label: string; icon: typeof Sparkles }> = [
  { id: "assets", label: "Assets", icon: FolderOpen },
  { id: "brief", label: "Brief", icon: Sparkles },
  { id: "checklist", label: "Checklist", icon: CheckSquare },
];

const IMAGE_ASPECT_STAGE_CLASS: Record<ImageAspectRatio, string> = {
  "1:1": "aspect-square h-full max-h-full w-auto max-w-full",
  "16:9": "aspect-video w-full max-w-full max-h-full",
  "9:16": "aspect-[9/16] h-full max-h-full w-auto max-w-full",
  "9:19": "aspect-[9/19] h-full max-h-full w-auto max-w-full",
  "4:3": "aspect-[4/3] w-full max-w-full max-h-full",
  "3:4": "aspect-[3/4] h-full max-h-full w-auto max-w-full",
  "21:9": "aspect-[21/9] w-full max-w-full max-h-full",
};

export interface ImageStudioTabContentProps {
  apiKey: string;
  bindings?: GeneratorFreeFlowBindings;
}

export function ImageStudioTabContent({ apiKey, bindings }: ImageStudioTabContentProps) {
  const g = useImageGenerator({
    apiKey: bindings?.apiKey ?? apiKey,
    flowTitle: bindings?.flowTitle ?? "",
    flowPurpose: "",
    agents: bindings?.agents ?? [],
    finalOutput: bindings?.generationResult.final ?? "",
    selectedModel: bindings?.selectedModel,
    temperature: bindings?.temperature,
    maxTokens: bindings?.maxTokens,
    topP: bindings?.topP,
  });

  const [leftTab, setLeftTab] = useState<ImageStudioLeftTabId>("brief");
  const [leftOpen, setLeftOpen] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const working = g.isGenerating || g.isGeneratingChecklist || g.isPreparingReferences;
  const isSolo = g.imageSourceMode === "solo";

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && leftOpen) setLeftOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [leftOpen]);

  const openPanelTab = (tab: ImageStudioLeftTabId) => {
    if (leftOpen && leftTab === tab) {
      setLeftOpen(false);
      return;
    }
    setLeftTab(tab);
    setLeftOpen(true);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (working || !e.dataTransfer.files.length) return;
    void g.addManualReferences(e.dataTransfer.files);
  };

  const primaryAction = (() => {
    if (g.isGeneratingChecklist) {
      return {
        label: "Building checklist…",
        onClick: () => {},
        disabled: true,
      };
    }
    if (g.isGenerating) {
      return {
        label: "Generating image…",
        onClick: () => {},
        disabled: true,
      };
    }
    if (!isSolo && !g.hasGeneratedChecklist) {
      return {
        label: "Generate checklist",
        onClick: () => {
          setLeftTab("checklist");
          void g.handleGenerateChecklist();
        },
        disabled: working || !g.hasApiKey,
      };
    }
    return {
      label: "Generate image",
      onClick: () => void g.handleGenerateImage(),
      disabled: working || !g.hasApiKey || (isSolo && !g.userPrompt.trim()),
    };
  })();

  const resolvedImageSrc = g.imageDisplayUrl
    ? g.imageDisplayUrl.startsWith("data:") || g.imageDisplayUrl.startsWith("http") || g.imageDisplayUrl.startsWith("blob:")
      ? g.imageDisplayUrl
      : `data:image/png;base64,${g.imageDisplayUrl}`
    : null;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden bg-black font-sans text-base">
      {/* Zone 1: Full-Height Left Vertical Docker Rail + Slide-Out Drawer */}
      <div className="relative flex h-full w-20 shrink-0 select-none text-base">
        <aside
          aria-label="Image studio sidebar shortcuts"
          className="z-20 flex h-full w-20 flex-col items-center justify-center gap-3 bg-primary"
        >
          {RAIL_ITEMS.map((item) => {
            const isCurrent = leftOpen && leftTab === item.id;
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

        <div
          role="dialog"
          aria-modal="false"
          aria-hidden={!leftOpen}
          aria-label="Image studio tools"
          className={cn(
            "absolute inset-y-0 left-0 z-40 flex w-[30rem] max-w-[88vw] flex-col bg-[hsl(0_0%_6%)] text-foreground shadow-[8px_0_32px_rgba(0,0,0,0.55)] transition-all duration-200 ease-out",
            leftOpen
              ? "pointer-events-auto visible translate-x-0 opacity-100"
              : "pointer-events-none invisible -translate-x-full opacity-0",
          )}
        >
          <div
            role="tablist"
            aria-label="Image studio sections"
            className="flex min-h-[3.25rem] shrink-0 items-center gap-1 overflow-hidden bg-black px-2.5 py-2.5"
          >
            {RAIL_ITEMS.map((item) => (
              <WorkspacePill
                key={item.id}
                label={item.label}
                active={leftTab === item.id}
                square
                onClick={() => setLeftTab(item.id)}
                className="h-8 shrink-0 px-2"
              />
            ))}
            <div className="ml-auto">
              <Button
                size="icon" icon={X}
                variant="quiet"
                onClick={() => setLeftOpen(false)}
                aria-label="Close sidebar"
              ></Button>
            </div>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-5 py-5"
          >
            {leftTab === "assets" ? (
              <>
                <FileInput
                  ref={fileInputRef}
                  accept={IMAGE_REFERENCE_ACCEPT}
                  multiple
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      void g.addManualReferences(e.target.files);
                    }
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="quiet"
                  type="button"
                  disabled={working}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" aria-hidden />
                  Upload Reference Images
                </Button>

                {g.manualReferences.length === 0 ? (
                  <RowButton
                    type="button"
                    disabled={working}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon className="h-6 w-6 text-primary/80" aria-hidden />
                    <p>Drop reference photos here or click to browse.</p>
                  </RowButton>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {g.manualReferences.map((ref, idx) => (
                      <div key={ref.id} className="group flex flex-col bg-ui-field">
                        <div className="relative aspect-square w-full overflow-hidden bg-black">
                          <img
                            src={ref.dataUrl}
                            alt={ref.fileName}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                          <span className="absolute bottom-1.5 left-1.5 bg-black/85 px-2 py-0.5 text-base text-white">
                            Ref {idx + 1}
                          </span>
                          <Button
                            size="icon" icon={Trash2}
                            variant="danger"
                            disabled={working}
                            onClick={() => g.removeManualReference(ref.id)}
                            aria-label={`Remove ${ref.fileName}`}
                          ></Button>
                        </div>
                        <p className="break-words px-2.5 py-1.5 text-base text-foreground" title={ref.fileName}>
                          {ref.fileName}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {g.referenceResearch?.references.length ? (
                  <div className="flex flex-col gap-2 bg-ui-field p-3.5">
                    <span className="font-semibold text-white">
                      Grounded References ({g.referenceResearch.references.length})
                    </span>
                    <div className="grid grid-cols-2 gap-2.5">
                      {g.referenceResearch.references.map((ref, idx) => (
                        <div key={`${ref.query}-${idx}`} className="flex flex-col gap-1 bg-black p-2">
                          {ref.previewDataUrl || ref.imageUrl ? (
                            <img
                              src={ref.previewDataUrl || ref.imageUrl}
                              alt={ref.query}
                              className="h-24 w-full object-contain"
                            />
                          ) : null}
                          <span className="break-words text-base text-foreground">{ref.query}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {leftTab === "brief" ? (
              <div className="flex flex-col gap-4">
                {!isSolo ? (
                  <div className="flex items-center justify-end gap-1.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="quiet"
                          type="button"
                          disabled={working || g.savedPrompts.length === 0}
                        >
                          <Bookmark className="h-4 w-4 shrink-0" aria-hidden />
                          Shortcuts
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[12rem]">
                        {g.savedPrompts.map((p) => (
                          <DropdownMenuItem
                            key={p.id}
                            className="text-base"
                            onSelect={() => g.handleInsertShortcut(p.content)}
                          >
                            {p.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      variant="quiet"
                      type="button"
                      disabled={working}
                      onClick={g.handleSaveCurrent}
                    >
                      <BookmarkPlus className="h-4 w-4 shrink-0" aria-hidden />
                      Save prompt
                    </Button>
                  </div>
                ) : null}

                <TextareaField
                  value={g.userPrompt}
                  onChange={(e) => g.setUserPrompt(e.target.value)}
                  disabled={working}
                  rows={5}
                  aria-label="Image prompt"
                  placeholder={
                    isSolo
                      ? "Solo keyword or subject (e.g. motorized roller shades in modern living room)…"
                      : "Image brief: describe subject, lighting, mood, and composition…"
                  }
                />

                <div className="grid grid-cols-2 gap-2.5">
                  <SelectField placeholder="Style" value={g.style} onValueChange={(v) => g.setStyle(v as ImageStyle)} disabled={working} options={[{ value: "professional", label: "Style: Professional" }, { value: "minimalist", label: "Style: Minimalist" }, { value: "modern", label: "Style: Modern" }, { value: "classic", label: "Style: Classic" }, { value: "abstract", label: "Style: Abstract" }]} />

                  <SelectField placeholder="Colors" value={g.colorScheme} onValueChange={(v) => g.setColorScheme(v as ImageColorScheme)} disabled={working} options={[{ value: "vibrant", label: "Color: Vibrant" }, { value: "natural", label: "Color: Natural" }, { value: "warm", label: "Color: Warm" }, { value: "cool", label: "Color: Cool" }, { value: "muted", label: "Color: Muted" }, { value: "monochrome", label: "Color: Monochrome" }]} />
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <ImageColorInputField
                    label="Foreground hex"
                    value={g.colorForeground}
                    onChange={g.setColorForeground}
                    disabled={working}
                  />
                  <ImageColorInputField
                    label="Background hex"
                    value={g.colorBackground}
                    onChange={g.setColorBackground}
                    disabled={working}
                  />
                </div>

                {!isSolo ? (
                  <div className="grid grid-cols-2 gap-2.5 bg-ui-field p-3">
                    {[
                      { id: "inc-text", label: "Text elements", checked: g.includeText, onChange: g.setIncludeText },
                      { id: "inc-people", label: "People", checked: g.includePeople, onChange: g.setIncludePeople },
                      { id: "inc-animals", label: "Animals", checked: g.includeAnimals, onChange: g.setIncludeAnimals },
                      { id: "inc-cars", label: "Vehicles", checked: g.includeCars, onChange: g.setIncludeCars },
                      { id: "inc-info", label: "Infographic", checked: g.isInfographic, onChange: g.setIsInfographic },
                    ].map((item) => (
                      <label
                        key={item.id}
                        htmlFor={item.id}
                        className="flex cursor-pointer items-center gap-2 text-base text-white"
                      >
                        <Checkbox
                          id={item.id}
                          checked={item.checked}
                          onCheckedChange={(checked) => item.onChange(checked === true)}
                          disabled={working}
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                ) : null}

                {g.isCustomModel ? (
                  <Field
                    value={g.imageModel}
                    onChange={(e) => g.setImageModel(e.target.value)}
                    placeholder="Custom OpenRouter image model ID…"
                    disabled={working}
                    aria-label="Custom image model ID"
                  />
                ) : null}
              </div>
            ) : null}

            {leftTab === "checklist" ? (
              <div className="flex flex-col gap-4">
                {g.hasGeneratedChecklist && g.imageChecklist.length > 0 ? (
                  <ImageGeneratorChecklistPanel
                    hasGeneratedChecklist={g.hasGeneratedChecklist}
                    imageChecklist={g.imageChecklist}
                    isGeneratingChecklist={g.isGeneratingChecklist}
                    hasApiKey={g.hasApiKey}
                    onRegenerateChecklist={() => void g.handleGenerateChecklist()}
                  />
                ) : (
                  <div className="flex flex-col gap-3 bg-ui-field p-4 text-muted-foreground">
                    <p>
                      {isSolo
                        ? "Solo mode generates directly from your keyword and grounded references without a blueprint checklist."
                        : "Generate a scene checklist to verify physical plausibility and composition before rendering."}
                    </p>
                    {!isSolo ? (
                      <Button
                        variant="run"
                        type="button"
                        onClick={() => void g.handleGenerateChecklist()}
                        disabled={working || !g.hasApiKey}
                      >
                        Generate checklist
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Zone 2 & 3: Main Studio Column (Sleek Top Bar + Center Stage Monitor + Bottom Prompt Bar) */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 w-full shrink-0 items-center gap-2 bg-black px-3 text-base">
          <div className="flex shrink-0 items-center gap-2 pr-1">
            <ImageIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="font-semibold tracking-tight text-white">Image Studio</span>
          </div>

          <div className={BULK_TOOLBAR_GROUP_DIVIDER} aria-hidden />

          <SelectField placeholder="Source" value={g.imageSourceMode} onValueChange={(v) => g.setImageSourceMode(v as ImageSourceMode)} disabled={working} options={[{ value: "featured", label: "Featured" }, { value: "section", label: "Section" }, { value: "solo", label: "Solo" }]} />

          {g.imageSourceMode === "section" ? (
            <SelectField placeholder="Blueprint section" value={g.selectedSection ?? ""} onValueChange={(v) => g.setSelectedSection(v || null)} disabled={working || g.availableSections.length === 0} options={g.availableSections.map((sec, idx) => ({ value: sec.header, label: sec.header }))} />
          ) : null}

          <SelectField placeholder="Model" value={g.isCustomModel ? "custom" : g.imageModel} onValueChange={(val) => {
              if (val === "custom") {
                g.setIsCustomModel(true);
                setLeftTab("brief");
                setLeftOpen(true);
              } else {
                g.setIsCustomModel(false);
                g.setImageModel(val);
              }
            }} disabled={working} options={[{ value: "custom", label: "Custom model" }, ...IMAGE_MODEL_PRESETS.map((preset) => ({ value: preset.value, label: preset.label }))]} />

          <SelectField placeholder="Aspect" value={g.aspectRatio} onValueChange={(v) => g.setAspectRatio(v as ImageAspectRatio)} disabled={working} options={[{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "4:3", label: "4:3" }, { value: "3:4", label: "3:4" }, { value: "21:9", label: "21:9" }, { value: "9:19", label: "9:19" }]} />

          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            <Button
              variant="quiet"
              type="button"
              disabled={!resolvedImageSrc || working}
              onClick={() => void g.handleCopy()}
              aria-label="Copy image"
              title="Copy image"
            >
              <Copy className="h-4 w-4 shrink-0" aria-hidden />
            </Button>
            <Button
              variant="quiet"
              type="button"
              disabled={!resolvedImageSrc || working}
              onClick={() => void g.handleDownload()}
              aria-label="Download image"
              title="Download image"
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden />
            </Button>

            <Button
              variant="run"
              type="button"
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
            >
              {working ? null : null}
              <span className="break-words">{primaryAction.label}</span>
            </Button>
          </div>
        </header>

        {/* Center Stage Monitor + Bottom Prompt Bar */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black p-2">
          <div className="flex min-h-0 flex-1 flex-col bg-black">
            <div className="flex h-10 shrink-0 items-center justify-between bg-ui-field px-4">
              <span className="break-words font-semibold text-white">
                {g.isGenerating
                  ? "Image Studio · Rendering Frame"
                  : g.isGeneratingChecklist
                    ? "Image Studio · Building Scene Checklist"
                    : "Image Monitor"}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {g.aspectRatio} · {g.style} · {g.manualReferences.length} ref{g.manualReferences.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black p-4">
              {g.error ? (
                <div className="max-w-lg bg-ui-danger-surface/60 px-4 py-3 text-base text-ui-danger-hover">
                  {g.error}
                </div>
              ) : resolvedImageSrc ? (
                <div className={cn("relative flex items-center justify-center bg-black", IMAGE_ASPECT_STAGE_CLASS[g.aspectRatio])}>
                  <img
                    src={resolvedImageSrc}
                    alt="Generated studio output"
                    onError={g.handlePreviewError}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : working ? (
                <div className={cn("relative bg-black", IMAGE_ASPECT_STAGE_CLASS[g.aspectRatio])}>
                  <VideoStudioPlaceholderSplash
                    title="Image Studio"
                    subtitle={g.isGeneratingChecklist ? "Building scene checklist" : "Rendering image"}
                    breathing
                    variant="stage"
                  />
                </div>
              ) : (
                <div className={cn("relative flex flex-col items-center justify-center gap-3 bg-ui-field/40 p-6 text-center", IMAGE_ASPECT_STAGE_CLASS[g.aspectRatio])}>
                  <ImageIcon className="h-10 w-10 text-primary/80" aria-hidden />
                  <p className="font-semibold text-white">Ready to Render</p>
                  <p className="max-w-md text-muted-foreground">
                    Enter your image prompt in the bar below or open Brief & Assets on the left rail.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Docked Bottom Prompt Bar (matches VideoInstructionBar) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!primaryAction.disabled) {
                primaryAction.onClick();
              }
            }}
            className="mt-2 flex h-11 shrink-0 items-center gap-2 bg-ui-field px-3"
          >
            <Field
              value={g.userPrompt}
              onChange={(e) => g.setUserPrompt(e.target.value)}
              disabled={working}
              aria-label={isSolo ? "Solo image keyword" : "Image prompt"}
              placeholder={
                isSolo
                  ? "Enter solo keyword or subject and press Enter to generate…"
                  : "Describe the image scene, style, or lighting and press Enter…"
              }
            />
            <Button
              variant="quiet"
              type="submit"
              disabled={primaryAction.disabled}
              aria-label={primaryAction.label}
              title={primaryAction.label}
            >
              <Send className="h-4 w-4" aria-hidden />
            </Button>
          </form>
        </div>
      </div>

      <Dialog open={g.saveDialogOpen} onOpenChange={g.setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save prompt as shortcut</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Field
              id="shortcut-name"
              placeholder="Shortcut name (e.g. Neo Digital Style)"
              value={g.saveDialogName}
              onChange={(e) => g.setSaveDialogName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && g.handleConfirmSave()}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => g.setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="run" onClick={g.handleConfirmSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
