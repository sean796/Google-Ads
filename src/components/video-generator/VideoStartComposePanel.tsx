import { useRef } from "react";
import { Image as ImageIcon, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MY_SITES_FIELD } from "@/components/hosting/my-sites/my-sites-theme";
import { IMAGE_REFERENCE_ACCEPT } from "@/lib/image-generator/manual-reference-upload";
import { cn } from "@/lib/utils";

export type VideoStartComposePanelProps = {
  variant: "stage" | "drawer";
  prompt: string;
  onPromptChange: (v: string) => void;
  productCount: number;
  referenceCount: number;
  disabled?: boolean;
  isPreparingSubject?: boolean;
  isPreparingReferences?: boolean;
  onAddProductFiles: (files: FileList | File[]) => void;
  onAddReferenceFiles: (files: FileList | File[]) => void;
};

export function VideoStartComposePanel({
  variant,
  prompt,
  onPromptChange,
  productCount,
  referenceCount,
  disabled = false,
  isPreparingSubject = false,
  isPreparingReferences = false,
  onAddProductFiles,
  onAddReferenceFiles,
}: VideoStartComposePanelProps) {
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const isStage = variant === "stage";
  const controlsDisabled = disabled || isPreparingSubject || isPreparingReferences;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3",
        isStage ? "max-w-xl px-4" : "shrink-0",
      )}
    >
      {isStage ? (
        <p className="text-center font-semibold text-white">Start your video</p>
      ) : null}

      <Textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        disabled={disabled}
        rows={isStage ? 5 : 4}
        aria-label="Video brief"
        placeholder="Video brief (optional): subject, story, mood, camera style, where it runs"
        className={cn(
          MY_SITES_FIELD,
          "h-auto resize-y bg-zinc-900 p-3.5 text-base",
          isStage ? "min-h-[7.5rem]" : "min-h-[6rem]",
        )}
      />

      <div className={cn("grid gap-2.5", isStage ? "grid-cols-2" : "grid-cols-2")}>
        <Button
          type="button"
          variant="secondary"
          className="h-10 justify-center bg-zinc-900 px-3.5 text-base font-medium text-white hover:bg-zinc-800"
          disabled={controlsDisabled}
          onClick={() => subjectInputRef.current?.click()}
        >
          {isPreparingSubject ? (
            <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="truncate">+ Product</span>
        </Button>

        <Button
          type="button"
          variant="secondary"
          className="h-10 justify-center bg-zinc-900 px-3.5 text-base font-medium text-white hover:bg-zinc-800"
          disabled={controlsDisabled}
          onClick={() => refInputRef.current?.click()}
        >
          {isPreparingReferences ? (
            <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <ImageIcon className="mr-2 h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="truncate">+ References</span>
        </Button>
      </div>
      <input
        ref={subjectInputRef}
        type="file"
        accept={`${IMAGE_REFERENCE_ACCEPT},*/*`}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onAddProductFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={refInputRef}
        type="file"
        accept={`${IMAGE_REFERENCE_ACCEPT},*/*`}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onAddReferenceFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <p className="text-center text-base text-muted-foreground">
        {productCount > 0 || referenceCount > 0 ? (
          <>
            {productCount > 0 ? (
              <span className="tabular-nums">
                {productCount} product{productCount === 1 ? "" : " photos"}
              </span>
            ) : null}
            {productCount > 0 && referenceCount > 0 ? " · " : null}
            {referenceCount > 0 ? (
              <span className="tabular-nums">
                {referenceCount} reference{referenceCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </>
        ) : isStage ? (
          "Add a brief, product photos, or references, then use the primary action in the top bar."
        ) : (
          "Optional: combine brief text with uploads below."
        )}
      </p>
    </div>
  );
}
