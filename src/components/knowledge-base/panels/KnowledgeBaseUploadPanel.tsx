import { Upload } from "lucide-react";
import { CONTENT_OPTIMIZER_ROW_SHELL_CLASS } from "@/components/overview/overview-tab/overview-tab-content-constants";
import { cn } from "@/lib/utils";
import { Button, FileInput } from "@/ui";

export type KnowledgeBaseUploadPanelProps = {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  isProcessing: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDropZoneClick: () => void;
};

export function KnowledgeBaseUploadPanel({
  fileInputRef,
  isDragging,
  isProcessing,
  onFileChange,
  onDragOver,
  onDragLeave,
  onDrop,
  onDropZoneClick,
}: KnowledgeBaseUploadPanelProps) {
  return (
    <div className={cn(CONTENT_OPTIMIZER_ROW_SHELL_CLASS, "flex min-h-[min(50vh,28rem)] items-center justify-center p-6")}>
      <label className="w-full cursor-pointer">
        <FileInput
          ref={fileInputRef}
          multiple
          onChange={onFileChange}
          accept=".txt,.md,.pdf,.json,.csv"
        />
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={isProcessing ? undefined : onDropZoneClick}
          className={cn(
            "relative rounded-lg p-12 transition-colors",
            isDragging || isProcessing
              ? "cursor-default border-2 border-dashed border-primary bg-primary/10"
              : "border-2 border-dashed border-white/[0.08] bg-black hover:border-primary/50",
            isProcessing && "opacity-60",
          )}
        >
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Upload className="h-8 w-8 text-primary" aria-hidden />
            </div>
            <div className="text-center">
              <p className="mb-1 text-base font-medium text-foreground">
                {isDragging ? "Drop files here" : "Upload files"}
              </p>
              <p className="text-base text-muted-foreground">
                Drag and drop or click to select
              </p>
            </div>
            <Button
              variant="run"
              type="button"
              disabled={isProcessing}
              onClick={(e) => {
                e.preventDefault();
                if (!isProcessing) onDropZoneClick();
              }}
            >
              Select files
            </Button>
          </div>
        </div>
      </label>
    </div>
  );
}
