import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  Bookmark,
  BookmarkPlus,
  CheckSquare,
  ChevronLeft,
  Copy,
  Download,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
          className="z-20 flex h-full w-20 flex-col items-center justify-center gap-3 border-r border-white/10 bg-black px-2 py-4"
        >
          {RAIL_ITEMS.map((item) => {
            const Icon = item.icon;
            const isCurrent = leftOpen && leftTab === item.id;
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

        <button
          type="button"
          aria-label="Close image studio sidebar"
          tabIndex={leftOpen ? 0 : -1}
          onClick={() => setLeftOpen(false)}
          className={cn(
            "fixed inset-0 z-30 bg-black/40 transition-opacity duration-200",
            leftOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          )}
        />

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
          {leftOpen ? (
            <button
              type="button"
              onClick={() => setLeftOpen(false)}
              aria-label="Collapse studio sidebar"
              className="absolute right-0 top-1/2 z-20 flex min-h-[72px] w-9 translate-x-full -translate-y-1/2 items-center justify-center border-l-[3px] border-transparent bg-black px-2 py-3 text-white shadow-[0_4px_24px_rgba(0,0,0,0.45)] transition-all hover:border-primary hover:text-primary"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
          ) : null}

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
            <button
              type="button"
              onClick={() => setLeftOpen(false)}
              aria-label="Close sidebar"
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-zinc-900 hover:text-white"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-5 py-5"
          >
            {leftTab === "assets" ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={IMAGE_REFERENCE_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      void g.addManualReferences(e.target.files);
                    }
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={working}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-10 w-full rounded-none border-0 bg-zinc-900 px-4 text-base text-primary hover:bg-zinc-800"
                >
                  <Upload className="mr-2 h-4 w-4" aria-hidden />
                  Upload Reference Images
                </Button>

                {g.manualReferences.length === 0 ? (
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex min-h-[10rem] w-full flex-col items-center justify-center gap-2.5 bg-zinc-900 px-5 py-6 text-center text-muted-foreground transition-colors hover:bg-zinc-800/80 disabled:opacity-50"
                  >
                    <ImageIcon className="h-6 w-6 text-primary/80" aria-hidden />
                    <p>Drop reference photos here or click to browse.</p>
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {g.manualReferences.map((ref, idx) => (
                      <div key={ref.id} className="group flex flex-col bg-zinc-900">
                        <div className="relative aspect-square w-full overflow-hidden bg-black">
                          <img
                            src={ref.dataUrl}
                            alt={ref.fileName}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                          <span className="absolute bottom-1.5 left-1.5 bg-black/85 px-2 py-0.5 text-base text-white">
                            Ref {idx + 1}
                          </span>
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => g.removeManualReference(ref.id)}
                            aria-label={`Remove ${ref.fileName}`}
                            className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center bg-black/85 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                        <p className="truncate px-2.5 py-1.5 text-base text-foreground" title={ref.fileName}>
                          {ref.fileName}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {g.referenceResearch?.references.length ? (
                  <div className="flex flex-col gap-2 bg-zinc-900 p-3.5">
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
                          <span className="truncate text-base text-foreground">{ref.query}</span>
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
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={BULK_HEADER_TOOL_BTN}
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
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={BULK_HEADER_TOOL_BTN}
                      disabled={working}
                      onClick={g.handleSaveCurrent}
                    >
                      <BookmarkPlus className="h-4 w-4 shrink-0" aria-hidden />
                      Save prompt
                    </Button>
                  </div>
                ) : null}

                <Textarea
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
                  className={cn(MY_SITES_FIELD, "h-auto min-h-[8rem] resize-y bg-zinc-900 p-3.5 text-base")}
                />

                <div className="grid grid-cols-2 gap-2.5">
                  <Select
                    value={g.style}
                    onValueChange={(v) => g.setStyle(v as ImageStyle)}
                    disabled={working}
                  >
                    <SelectTrigger aria-label="Style" className={cn(MY_SITES_FIELD, "h-9 bg-zinc-900 text-base")}>
                      <SelectValue placeholder="Style" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem className="text-base" value="professional">Style: Professional</SelectItem>
                      <SelectItem className="text-base" value="minimalist">Style: Minimalist</SelectItem>
                      <SelectItem className="text-base" value="modern">Style: Modern</SelectItem>
                      <SelectItem className="text-base" value="classic">Style: Classic</SelectItem>
                      <SelectItem className="text-base" value="abstract">Style: Abstract</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={g.colorScheme}
                    onValueChange={(v) => g.setColorScheme(v as ImageColorScheme)}
                    disabled={working}
                  >
                    <SelectTrigger aria-label="Color scheme" className={cn(MY_SITES_FIELD, "h-9 bg-zinc-900 text-base")}>
                      <SelectValue placeholder="Colors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem className="text-base" value="vibrant">Color: Vibrant</SelectItem>
                      <SelectItem className="text-base" value="natural">Color: Natural</SelectItem>
                      <SelectItem className="text-base" value="warm">Color: Warm</SelectItem>
                      <SelectItem className="text-base" value="cool">Color: Cool</SelectItem>
                      <SelectItem className="text-base" value="muted">Color: Muted</SelectItem>
                      <SelectItem className="text-base" value="monochrome">Color: Monochrome</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <div className="grid grid-cols-2 gap-2.5 bg-zinc-900 p-3">
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
                  <Input
                    value={g.imageModel}
                    onChange={(e) => g.setImageModel(e.target.value)}
                    placeholder="Custom OpenRouter image model ID…"
                    disabled={working}
                    aria-label="Custom image model ID"
                    className={cn(MY_SITES_FIELD, "h-9 bg-zinc-900 text-base")}
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
                  <div className="flex flex-col gap-3 bg-zinc-900 p-4 text-muted-foreground">
                    <p>
                      {isSolo
                        ? "Solo mode generates directly from your keyword and grounded references without a blueprint checklist."
                        : "Generate a scene checklist to verify physical plausibility and composition before rendering."}
                    </p>
                    {!isSolo ? (
                      <Button
                        type="button"
                        onClick={() => void g.handleGenerateChecklist()}
                        disabled={working || !g.hasApiKey}
                        className={cn(BULK_HEADER_RUN_BTN, "h-9 w-fit px-4")}
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
        <header className="flex h-12 w-full shrink-0 items-center gap-2 bg-zinc-950 px-3 text-base">
          <div className="flex shrink-0 items-center gap-2 pr-1">
            <ImageIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="font-semibold tracking-tight text-white">Image Studio</span>
          </div>

          <div className={BULK_TOOLBAR_GROUP_DIVIDER} aria-hidden />

          <Select
            value={g.imageSourceMode}
            onValueChange={(v) => g.setImageSourceMode(v as ImageSourceMode)}
            disabled={working}
          >
            <SelectTrigger className={cn(BULK_HEADER_SELECT_TRIGGER, "h-8 w-auto min-w-[7.5rem]")} aria-label="Image source mode">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem className="text-base" value="featured">Featured</SelectItem>
              <SelectItem className="text-base" value="section">Section</SelectItem>
              <SelectItem className="text-base" value="solo">Solo</SelectItem>
            </SelectContent>
          </Select>

          {g.imageSourceMode === "section" ? (
            <Select
              value={g.selectedSection ?? ""}
              onValueChange={(v) => g.setSelectedSection(v || null)}
              disabled={working || g.availableSections.length === 0}
            >
              <SelectTrigger className={cn(BULK_HEADER_SELECT_TRIGGER, "h-8 w-auto min-w-[9rem]")} aria-label="Blueprint section">
                <SelectValue placeholder={g.availableSections.length === 0 ? "No sections" : "Section"} />
              </SelectTrigger>
              <SelectContent position="popper">
                {g.availableSections.map((sec, idx) => (
                  <SelectItem key={idx} className="text-base" value={sec.header}>
                    {sec.header}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Select
            value={g.isCustomModel ? "custom" : g.imageModel}
            onValueChange={(val) => {
              if (val === "custom") {
                g.setIsCustomModel(true);
                setLeftTab("brief");
                setLeftOpen(true);
              } else {
                g.setIsCustomModel(false);
                g.setImageModel(val);
              }
            }}
            disabled={working}
          >
            <SelectTrigger className={cn(BULK_HEADER_SELECT_TRIGGER, "h-8 w-auto min-w-[9.5rem]")} aria-label="Image model">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent position="popper">
              {IMAGE_MODEL_PRESETS.map((preset) => (
                <SelectItem key={preset.value} className="text-base" value={preset.value}>
                  {preset.label}
                </SelectItem>
              ))}
              <SelectItem className="text-base" value="custom">Custom model</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={g.aspectRatio}
            onValueChange={(v) => g.setAspectRatio(v as ImageAspectRatio)}
            disabled={working}
          >
            <SelectTrigger className={cn(BULK_HEADER_SELECT_TRIGGER, "h-8 w-auto min-w-[6.5rem]")} aria-label="Aspect ratio">
              <SelectValue placeholder="Aspect" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem className="text-base" value="1:1">1:1</SelectItem>
              <SelectItem className="text-base" value="16:9">16:9</SelectItem>
              <SelectItem className="text-base" value="9:16">9:16</SelectItem>
              <SelectItem className="text-base" value="4:3">4:3</SelectItem>
              <SelectItem className="text-base" value="3:4">3:4</SelectItem>
              <SelectItem className="text-base" value="21:9">21:9</SelectItem>
              <SelectItem className="text-base" value="9:19">9:19</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={BULK_HEADER_ICON_TOOL_BTN}
              disabled={!resolvedImageSrc || working}
              onClick={() => void g.handleCopy()}
              aria-label="Copy image"
              title="Copy image"
            >
              <Copy className="h-4 w-4 shrink-0" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={BULK_HEADER_ICON_TOOL_BTN}
              disabled={!resolvedImageSrc || working}
              onClick={() => void g.handleDownload()}
              aria-label="Download image"
              title="Download image"
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden />
            </Button>

            <Button
              type="button"
              className={cn(BULK_HEADER_RUN_BTN, "ml-1 shrink-0 font-semibold")}
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
            >
              {working ? <Loader2 className="mr-1.5 h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
              <span className="truncate">{primaryAction.label}</span>
            </Button>
          </div>
        </header>

        {/* Center Stage Monitor + Bottom Prompt Bar */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950 p-2">
          <div className="flex min-h-0 flex-1 flex-col bg-zinc-950">
            <div className="flex h-10 shrink-0 items-center justify-between bg-zinc-900 px-4">
              <span className="truncate font-semibold text-white">
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
                <div className="max-w-lg bg-red-950/60 px-4 py-3 text-base text-red-300">
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
                <div className={cn("relative flex flex-col items-center justify-center gap-3 bg-zinc-900/40 p-6 text-center", IMAGE_ASPECT_STAGE_CLASS[g.aspectRatio])}>
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
            className="mt-2 flex h-11 shrink-0 items-center gap-2 bg-zinc-900 px-3"
          >
            <Input
              value={g.userPrompt}
              onChange={(e) => g.setUserPrompt(e.target.value)}
              disabled={working}
              aria-label={isSolo ? "Solo image keyword" : "Image prompt"}
              placeholder={
                isSolo
                  ? "Enter solo keyword or subject and press Enter to generate…"
                  : "Describe the image scene, style, or lighting and press Enter…"
              }
              className={cn(MY_SITES_FIELD, "h-8 flex-1 bg-zinc-950 px-3 text-base")}
            />
            <Button
              type="submit"
              variant="ghost"
              className={MY_SITES_ICON_BTN}
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
            <Input
              id="shortcut-name"
              placeholder="Shortcut name (e.g. Neo Digital Style)"
              value={g.saveDialogName}
              onChange={(e) => g.setSaveDialogName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && g.handleConfirmSave()}
              className="text-base"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => g.setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={g.handleConfirmSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
