import { VendorButton as Button, Checkbox, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/ui";








import { Bookmark, BookmarkPlus } from "lucide-react";
import { BULK_HEADER_FIELD, BULK_HEADER_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { ImageColorInputField } from "@/components/generator/image/ImageColorInputField";
import type { UseImageGeneratorResult } from "@/components/generator/image/image-generator-types";
import { cn } from "@/lib/utils";

type ImageGeneratorSettingsPanelProps = Pick<
  UseImageGeneratorResult,
  | "imageSourceMode"
  | "userPrompt"
  | "setUserPrompt"
  | "includeText"
  | "setIncludeText"
  | "includePeople"
  | "setIncludePeople"
  | "includeAnimals"
  | "setIncludeAnimals"
  | "includeCars"
  | "setIncludeCars"
  | "isInfographic"
  | "setIsInfographic"
  | "aspectRatio"
  | "setAspectRatio"
  | "style"
  | "setStyle"
  | "colorScheme"
  | "setColorScheme"
  | "colorForeground"
  | "setColorForeground"
  | "colorBackground"
  | "setColorBackground"
  | "imageModel"
  | "setImageModel"
  | "isCustomModel"
  | "isGenerating"
  | "isGeneratingChecklist"
  | "savedPrompts"
  | "saveDialogOpen"
  | "setSaveDialogOpen"
  | "saveDialogName"
  | "setSaveDialogName"
  | "handleInsertShortcut"
  | "handleSaveCurrent"
  | "handleConfirmSave"
>;

export function ImageGeneratorSettingsPanel(props: ImageGeneratorSettingsPanelProps) {
  const controlsDisabled = props.isGenerating || props.isGeneratingChecklist;
  const isSolo = props.imageSourceMode === "solo";

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="image-prompt" className="text-base text-foreground">
            {isSolo ? "Keyword" : "Optional Prompt"}
          </Label>
          {!isSolo ? (
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={BULK_HEADER_TOOL_BTN}
                    disabled={controlsDisabled || props.savedPrompts.length === 0}
                  >
                    <Bookmark className="h-4 w-4 shrink-0" aria-hidden />
                    Insert shortcut
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[12rem]">
                  {props.savedPrompts.map((p) => (
                    <DropdownMenuItem key={p.id} className="text-base" onSelect={() => props.handleInsertShortcut(p.content)}>
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
                disabled={controlsDisabled}
                onClick={props.handleSaveCurrent}
              >
                <BookmarkPlus className="h-4 w-4 shrink-0" aria-hidden />
                Save current
              </Button>
            </div>
          ) : null}
        </div>
        {isSolo ? (
          <Input
            id="image-prompt"
            placeholder="e.g. modern office desk, autumn forest path..."
            value={props.userPrompt}
            onChange={(e) => props.setUserPrompt(e.target.value)}
            className={cn(BULK_HEADER_FIELD, "text-base")}
            disabled={props.isGenerating}
          />
        ) : (
          <Textarea
            id="image-prompt"
            placeholder="Describe how you'd like the image to look (e.g., 'modern and professional', 'colorful and vibrant')..."
            value={props.userPrompt}
            onChange={(e) => props.setUserPrompt(e.target.value)}
            className={cn(BULK_HEADER_FIELD, "min-h-[5rem] text-base")}
            disabled={props.isGenerating}
          />
        )}
        {!isSolo ? (
          <Dialog open={props.saveDialogOpen} onOpenChange={props.setSaveDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save prompt as shortcut</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="shortcut-name" className="text-base">
                  Name
                </Label>
                <Input
                  id="shortcut-name"
                  placeholder="e.g. Neo Digital Style"
                  value={props.saveDialogName}
                  onChange={(e) => props.setSaveDialogName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && props.handleConfirmSave()}
                  className="text-base"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => props.setSaveDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={props.handleConfirmSave}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {!isSolo ? (
        <div className="space-y-2">
          <Label className="text-base text-foreground">Include in Image</Label>
          <div className="grid grid-cols-2 gap-2 bg-zinc-900/50 p-3">
            {[
              { id: "include-text", label: "Text elements", checked: props.includeText, onChange: props.setIncludeText },
              { id: "include-people", label: "People", checked: props.includePeople, onChange: props.setIncludePeople },
              { id: "include-animals", label: "Animals", checked: props.includeAnimals, onChange: props.setIncludeAnimals },
              { id: "include-cars", label: "Vehicles", checked: props.includeCars, onChange: props.setIncludeCars },
              { id: "is-infographic", label: "Infographic", checked: props.isInfographic, onChange: props.setIsInfographic },
            ].map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <Checkbox
                  id={item.id}
                  checked={item.checked}
                  onCheckedChange={(checked) => item.onChange(checked === true)}
                  disabled={controlsDisabled}
                />
                <Label htmlFor={item.id} className="cursor-pointer text-base font-normal text-foreground">
                  {item.label}
                </Label>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <Label className="text-base font-medium text-foreground">Image Settings</Label>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="aspect-ratio" className="text-base text-foreground">
              Aspect Ratio
            </Label>
            <Select value={props.aspectRatio} onValueChange={props.setAspectRatio} disabled={controlsDisabled}>
              <SelectTrigger id="aspect-ratio" className={cn(BULK_HEADER_FIELD, "text-base")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem className="text-base" value="1:1">1:1 (Square)</SelectItem>
                <SelectItem className="text-base" value="16:9">16:9 (Widescreen)</SelectItem>
                <SelectItem className="text-base" value="9:16">9:16 (Portrait)</SelectItem>
                <SelectItem className="text-base" value="9:19">9:19 (Tall Phone)</SelectItem>
                <SelectItem className="text-base" value="4:3">4:3 (Standard)</SelectItem>
                <SelectItem className="text-base" value="3:4">3:4 (Portrait Standard)</SelectItem>
                <SelectItem className="text-base" value="21:9">21:9 (Ultrawide)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="style" className="text-base text-foreground">
              Style
            </Label>
            <Select value={props.style} onValueChange={props.setStyle} disabled={controlsDisabled}>
              <SelectTrigger id="style" className={cn(BULK_HEADER_FIELD, "text-base")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem className="text-base" value="professional">Professional</SelectItem>
                <SelectItem className="text-base" value="minimalist">Minimalist</SelectItem>
                <SelectItem className="text-base" value="abstract">Abstract</SelectItem>
                <SelectItem className="text-base" value="modern">Modern</SelectItem>
                <SelectItem className="text-base" value="classic">Classic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="color-scheme" className="text-base text-foreground">
              Color Scheme
            </Label>
            <Select value={props.colorScheme} onValueChange={props.setColorScheme} disabled={controlsDisabled}>
              <SelectTrigger id="color-scheme" className={cn(BULK_HEADER_FIELD, "text-base")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem className="text-base" value="vibrant">Vibrant</SelectItem>
                <SelectItem className="text-base" value="muted">Muted</SelectItem>
                <SelectItem className="text-base" value="monochrome">Monochrome</SelectItem>
                <SelectItem className="text-base" value="warm">Warm</SelectItem>
                <SelectItem className="text-base" value="cool">Cool</SelectItem>
                <SelectItem className="text-base" value="natural">Natural</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-2">
          <ImageColorInputField
            label="Color Foreground"
            value={props.colorForeground}
            onChange={props.setColorForeground}
            disabled={controlsDisabled}
          />
          <ImageColorInputField
            label="Color Background"
            value={props.colorBackground}
            onChange={props.setColorBackground}
            disabled={controlsDisabled}
          />
        </div>

        {props.isCustomModel ? (
          <div className="space-y-2 pt-2">
            <Label htmlFor="image-model-custom" className="text-base text-foreground">
              Custom model ID
            </Label>
            <Input
              id="image-model-custom"
              value={props.imageModel}
              onChange={(e) => props.setImageModel(e.target.value)}
              placeholder="e.g., black-forest-labs/flux.2-klein-4b"
              className={cn(BULK_HEADER_FIELD, "text-base")}
              disabled={controlsDisabled}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
