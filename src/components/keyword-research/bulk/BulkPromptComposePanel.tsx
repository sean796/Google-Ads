import { CheckCircle2, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MY_SITES_FIELD } from "@/components/hosting/my-sites/my-sites-theme";
import { BULK_HEADER_RUN_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { cn } from "@/lib/utils";

export type BulkPromptComposePanelProps = {
  generalIntent: string;
  onGeneralIntentChange: (v: string) => void;
  numberOfBlogs: number;
  onNumberOfBlogsChange: (v: number) => void;
  optionalPrompt: string;
  onOptionalPromptChange: (v: string) => void;
  workspaceBusy: boolean;
  isGeneratingChecklist: boolean;
  hasGeneratedChecklist: boolean;
  promptSiteContextBlocked?: boolean;
  onGenerateChecklist: () => void;
  onApprove: () => void;
};

export function BulkPromptComposePanel({
  generalIntent,
  onGeneralIntentChange,
  numberOfBlogs,
  onNumberOfBlogsChange,
  optionalPrompt,
  onOptionalPromptChange,
  workspaceBusy,
  isGeneratingChecklist,
  hasGeneratedChecklist,
  promptSiteContextBlocked = false,
  onGenerateChecklist,
  onApprove,
}: BulkPromptComposePanelProps) {
  const primaryDisabled =
    workspaceBusy ||
    promptSiteContextBlocked ||
    isGeneratingChecklist ||
    (hasGeneratedChecklist && workspaceBusy);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto overscroll-y-contain bg-zinc-900/40 px-4 py-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
        <p className="text-center font-semibold text-white">Start your blog batch</p>

        <Textarea
          value={generalIntent}
          onChange={(e) => onGeneralIntentChange(e.target.value)}
          disabled={workspaceBusy}
          rows={5}
          aria-label="General intent or content topic"
          placeholder="General intent / topic: what should this batch cover?"
          className={cn(MY_SITES_FIELD, "min-h-[7.5rem] h-auto resize-y bg-zinc-900 p-3.5 text-base")}
        />

        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2.5">
          <Input
            type="text"
            placeholder="Tone, audience"
            value={optionalPrompt}
            onChange={(e) => onOptionalPromptChange(e.target.value)}
            disabled={workspaceBusy}
            autoComplete="off"
            aria-label="Tone and audience"
            className={cn(MY_SITES_FIELD, "h-10 bg-zinc-900 text-base")}
          />
          <Input
            type="number"
            min={1}
            step={1}
            value={numberOfBlogs}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!Number.isNaN(n) && n >= 1) onNumberOfBlogsChange(n);
            }}
            disabled={workspaceBusy}
            aria-label="Number of blogs"
            title="Number of blogs"
            className={cn(MY_SITES_FIELD, "h-10 bg-zinc-900 text-base tabular-nums")}
          />
        </div>

        <Button
          type="button"
          size="sm"
          className={cn(BULK_HEADER_RUN_BTN, "mx-auto h-10 min-w-[10rem] px-4")}
          disabled={primaryDisabled}
          aria-label={hasGeneratedChecklist ? "Approve selected ideas" : "Generate blog ideas"}
          onClick={hasGeneratedChecklist ? onApprove : onGenerateChecklist}
        >
          {isGeneratingChecklist ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          ) : hasGeneratedChecklist ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Wand2 className="h-4 w-4 shrink-0" aria-hidden />
          )}
          {isGeneratingChecklist
            ? "Generating ideas"
            : hasGeneratedChecklist
              ? "Approve"
              : "Ideas"}
        </Button>

        {hasGeneratedChecklist ? (
          <p className="text-center text-base text-muted-foreground">
            Select ideas in the left list, then Approve to write.
          </p>
        ) : null}
      </div>
    </div>
  );
}
