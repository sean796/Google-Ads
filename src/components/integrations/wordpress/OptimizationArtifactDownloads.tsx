import React from "react";
import { Download } from "lucide-react";
import {
  OptimizationFileManager,
  type OptimizationFile,
} from "@/lib/optimization-file-manager";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

function findArtifact(files: OptimizationFile[], prefix: string): OptimizationFile | undefined {
  return files.find((f) => f.name.toLowerCase().startsWith(`${prefix}-`));
}

function downloadOptimizationFile(file: OptimizationFile): void {
  const manager = new OptimizationFileManager();
  manager.downloadFile(file);
}

interface OptimizationArtifactDownloadsProps {
  files: OptimizationFile[];
  className?: string;
  /** Details drawer: white text on dark rows. */
  variant?: "default" | "details";
}

/**
 * Checklist + blueprint download buttons shown as soon as those files exist (during or after a run).
 */
export function OptimizationArtifactDownloads({
  files,
  className,
  variant = "default",
}: OptimizationArtifactDownloadsProps) {
  if (!files.length) return null;

  const checklist = findArtifact(files, "checklist");
  const blueprint = findArtifact(files, "blueprint");
  const contentMd = findArtifact(files, "content");
  const contentHtml = files.find(
    (f) => f.name.toLowerCase().startsWith("content-") && f.name.toLowerCase().endsWith(".html"),
  );

  const hasPrimary = checklist || blueprint;
  if (!hasPrimary && !contentMd && !contentHtml) return null;

  const btnClass =
    variant === "details"
      ? "h-8 px-2 text-base text-white hover:bg-white/10 hover:text-white"
      : "h-8 text-base";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {checklist ? (
        <Button
          pressed={variant === "details"}
          type="button"
          onClick={() => downloadOptimizationFile(checklist)}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Checklist
        </Button>
      ) : null}
      {blueprint ? (
        <Button
          pressed={variant === "details"}
          type="button"
          onClick={() => downloadOptimizationFile(blueprint)}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Blueprint
        </Button>
      ) : null}
      {contentMd ? (
        <Button
          pressed={variant === "details"}
          type="button"
          onClick={() => downloadOptimizationFile(contentMd)}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Content (.md)
        </Button>
      ) : null}
      {contentHtml && !contentMd ? (
        <Button
          pressed={variant === "details"}
          type="button"
          onClick={() => downloadOptimizationFile(contentHtml)}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Content (.html)
        </Button>
      ) : null}
    </div>
  );
}