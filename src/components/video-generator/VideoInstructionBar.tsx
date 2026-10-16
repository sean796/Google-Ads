import { Send, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MY_SITES_FIELD, MY_SITES_ICON_BTN, MY_SITES_POPOVER, MY_SITES_TOOL_BTN } from "@/components/hosting/my-sites/my-sites-theme";
import { PRODUCT_VIEW_DEFINITIONS } from "@/lib/video-generator/video-product-agent";
import type { ProductViewId } from "@/lib/video-generator/video-generator-types";
import { cn } from "@/lib/utils";
import type { InstructionScope } from "./useVideoGenerator";

type VideoInstructionBarProps = {
  /** Busy or no active mode available. */
  disabled: boolean;
  /** When true, the bar targets the 4 Product Lock turntable views (all 4 or an individual view). */
  productMode?: boolean;
  hasSelectedScene: boolean;
  selectedSceneOrder?: number;
  selectedSceneTitle?: string;
  onSend: (scope: InstructionScope, instruction: string) => void;
  onSendProductInstruction?: (target: ProductViewId | "all", instruction: string) => void;
  onOpenPostCut?: () => void;
};

const SCOPE_TRIGGER = `${MY_SITES_FIELD} w-48 whitespace-nowrap [&>span]:line-clamp-none [&>svg]:text-muted-foreground`;

/** Fixed-height row under the stage: scope select, instruction input, send, plus Post-Cut Studio toggle. */
export function VideoInstructionBar({
  disabled,
  productMode = false,
  hasSelectedScene,
  selectedSceneOrder,
  selectedSceneTitle,
  onSend,
  onSendProductInstruction,
  onOpenPostCut,
}: VideoInstructionBarProps) {
  const [scope, setScope] = useState<InstructionScope>("scene");
  const [productTarget, setProductTarget] = useState<ProductViewId | "all">("all");
  const [text, setText] = useState("");

  if (productMode && onSendProductInstruction) {
    const canSendProduct = !disabled && text.trim().length > 0;
    const submitProduct = () => {
      if (!canSendProduct) return;
      onSendProductInstruction(productTarget, text);
      setText("");
    };
    const targetDef = PRODUCT_VIEW_DEFINITIONS.find((d) => d.id === productTarget);
    const targetLabel = targetDef ? targetDef.shortLabel : "all 4 product views";
    return (
      <form
        className="flex h-10 shrink-0 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitProduct();
        }}
      >
        <Select
          value={productTarget}
          onValueChange={(v) => setProductTarget(v as ProductViewId | "all")}
          disabled={disabled}
        >
          <SelectTrigger className={SCOPE_TRIGGER} aria-label="Product view target">
            <SelectValue placeholder="Product target" />
          </SelectTrigger>
          <SelectContent className={MY_SITES_POPOVER}>
            <SelectItem value="all">All 4 product views</SelectItem>
            {PRODUCT_VIEW_DEFINITIONS.map((def) => (
              <SelectItem key={def.id} value={def.id}>
                {def.shortLabel} ({def.label})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          aria-label="Prompt AI to change the product"
          placeholder={`Prompt AI to change ${targetLabel} (e.g. "remove upper wall vent", "make glass mirrored")`}
          className={cn(MY_SITES_FIELD, "flex-1")}
        />
        <Button
          type="submit"
          variant="ghost"
          className={MY_SITES_ICON_BTN}
          disabled={!canSendProduct}
          aria-label="Send product prompt"
        >
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </form>
    );
  }

  const canSend = !disabled && text.trim().length > 0 && (scope === "video" || hasSelectedScene);
  const submit = () => {
    if (!canSend) return;
    onSend(scope, text);
    setText("");
  };
  const sceneLabel = selectedSceneOrder ? `Scene ${selectedSceneOrder}` : "This scene";
  return (
    <form
      className="flex h-10 shrink-0 items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Select value={scope} onValueChange={(v) => setScope(v as InstructionScope)} disabled={disabled}>
        <SelectTrigger className={SCOPE_TRIGGER} aria-label="Instruction scope">
          <SelectValue placeholder="Scope" />
        </SelectTrigger>
        <SelectContent className={MY_SITES_POPOVER}>
          <SelectItem value="scene">{sceneLabel}</SelectItem>
          <SelectItem value="video">Whole video</SelectItem>
        </SelectContent>
      </Select>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        aria-label="Instruction for the Director"
        placeholder={
          scope === "scene"
            ? `Prompt AI to persistently change ${sceneLabel}${selectedSceneTitle ? ` (${selectedSceneTitle})` : ""}: updates frame & clip`
            : "Tell the Director what to change across the whole video"
        }
        className={cn(MY_SITES_FIELD, "flex-1")}
      />
      <Button type="submit" variant="ghost" className={MY_SITES_ICON_BTN} disabled={!canSend} aria-label="Send instruction">
        <Send className="h-4 w-4" aria-hidden />
      </Button>
      {onOpenPostCut ? (
        <Button
          type="button"
          variant="ghost"
          className={cn(MY_SITES_TOOL_BTN, "shrink-0")}
          onClick={onOpenPostCut}
          aria-label="Open Post-Cut Scene AI Editor"
        >
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5 text-primary" aria-hidden />
          Post-Cut AI
        </Button>
      ) : null}
    </form>
  );
}
