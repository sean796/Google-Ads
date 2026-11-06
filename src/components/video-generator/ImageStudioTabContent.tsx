import { useEffect, useRef, useState, type DragEvent } from "react";
import { Copy, Download, Image as ImageIcon, Send } from "lucide-react";
import { BULK_TOOLBAR_GROUP_DIVIDER } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { useImageGenerator } from "@/components/generator/image/useImageGenerator";
import { IMAGE_MODEL_PRESETS } from "@/lib/image-model-defaults";
import type { ImageAspectRatio, ImageSourceMode } from "@/lib/image-generator/image-generator-options";
import { VideoStudioPlaceholderSplash } from "./VideoStudioPlaceholderSplash";
import { ImageStudioDrawer } from "./ImageStudioDrawer";
import { IMAGE_ASPECT_STAGE_CLASS, type ImageStudioLeftTabId, type ImageStudioTabContentProps } from "./ImageStudioTabContent-types";
import { cn } from "@/lib/utils";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Field, SelectField } from "@/ui";

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
      <ImageStudioDrawer
        g={g}
        leftTab={leftTab}
        setLeftTab={setLeftTab}
        leftOpen={leftOpen}
        setLeftOpen={setLeftOpen}
        openPanelTab={openPanelTab}
        fileInputRef={fileInputRef}
        handleDrop={handleDrop}
        working={working}
        isSolo={isSolo}
      />


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
