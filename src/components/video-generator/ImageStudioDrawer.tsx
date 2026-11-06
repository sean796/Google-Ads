import { Bookmark, BookmarkPlus, Image as ImageIcon, Trash2, Upload, X } from "lucide-react";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import { ImageColorInputField } from "@/components/generator/image/ImageColorInputField";
import { ImageGeneratorChecklistPanel } from "@/components/generator/image/ImageGeneratorChecklistPanel";
import { IMAGE_REFERENCE_ACCEPT } from "@/lib/image-generator/manual-reference-upload";
import type { ImageColorScheme, ImageStyle } from "@/lib/image-generator/image-generator-options";
import { cn } from "@/lib/utils";
import { Button, Checkbox, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Field, FileInput, RailButton, RowButton, SelectField, TextareaField } from "@/ui";
import { RAIL_ITEMS, type ImageStudioDrawerProps } from "./ImageStudioTabContent-types";

export function ImageStudioDrawer({ g, leftTab, setLeftTab, leftOpen, setLeftOpen, openPanelTab, fileInputRef, handleDrop, working, isSolo }: ImageStudioDrawerProps) {
  return (
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
  );
}
