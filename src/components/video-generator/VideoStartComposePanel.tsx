import { useRef } from "react";
import { Image as ImageIcon, Upload, Video as VideoIcon } from "lucide-react";
import { MY_SITES_FIELD } from "@/components/hosting/my-sites/my-sites-theme";
import { IMAGE_REFERENCE_ACCEPT } from "@/lib/image-generator/manual-reference-upload";
import { cn } from "@/lib/utils";
import { Button, FileInput, TextareaField } from "@/ui";

export type VideoStartComposePanelProps = {
  variant: "stage" | "drawer";
  prompt: string;
  onPromptChange: (v: string) => void;
  productCount: number;
  referenceCount: number;
  hasReferenceVideo?: boolean;
  disabled?: boolean;
  isPreparingSubject?: boolean;
  isPreparingReferences?: boolean;
  isPreparingReferenceVideo?: boolean;
  onAddProductFiles: (files: FileList | File[]) => void;
  onAddReferenceFiles: (files: FileList | File[]) => void;
  onAddVideoFile: (file: File) => void;
};

export function VideoStartComposePanel({
  variant,
  prompt,
  onPromptChange,
  productCount,
  referenceCount,
  hasReferenceVideo = false,
  disabled = false,
  isPreparingSubject = false,
  isPreparingReferences = false,
  isPreparingReferenceVideo = false,
  onAddProductFiles,
  onAddReferenceFiles,
  onAddVideoFile,
}: VideoStartComposePanelProps) {
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const isStage = variant === "stage";
  const controlsDisabled =
    disabled || isPreparingSubject || isPreparingReferences || isPreparingReferenceVideo;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3",
        isStage ? "max-w-xl px-4" : "shrink-0",
      )}
    >
      <TextareaField
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        disabled={disabled}
        rows={isStage ? 5 : 4}
        aria-label="Video brief"
        placeholder="Video brief (optional): subject, story, mood, camera style, where it runs"
      />

      <div className="grid grid-cols-3 gap-2.5">
        <Button
          type="button"
          disabled={controlsDisabled}
          onClick={() => subjectInputRef.current?.click()}
        >
          <Upload className="mr-1.5 h-4 w-4 shrink-0 text-primary" />
          <span className="break-words">
            {productCount > 0 ? `Product (${productCount})` : "Product"}
          </span>
        </Button>

        <Button
          type="button"
          disabled={controlsDisabled}
          onClick={() => refInputRef.current?.click()}
        >
          <ImageIcon className="mr-1.5 h-4 w-4 shrink-0 text-primary" />
          <span className="break-words">
            {referenceCount > 0 ? `References (${referenceCount})` : "References"}
          </span>
        </Button>

        <Button
          type="button"
          disabled={controlsDisabled}
          onClick={() => videoInputRef.current?.click()}
        >
          <VideoIcon className="mr-1.5 h-4 w-4 shrink-0 text-primary" />
          <span className="break-words">
            {hasReferenceVideo ? "Video (1)" : "Video"}
          </span>
        </Button>
      </div>

      <FileInput
        ref={subjectInputRef}
        accept={`${IMAGE_REFERENCE_ACCEPT},*/*`}
        multiple
        onChange={(e) => {
          if (e.target.files?.length) onAddProductFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <FileInput
        ref={refInputRef}
        accept={`${IMAGE_REFERENCE_ACCEPT},*/*`}
        multiple
        onChange={(e) => {
          if (e.target.files?.length) onAddReferenceFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <FileInput
        ref={videoInputRef}
        accept="video/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onAddVideoFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
