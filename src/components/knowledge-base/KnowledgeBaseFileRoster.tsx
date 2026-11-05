import { Download, FileText, FolderOpen, Globe2, Star, StarOff, Trash2 } from "lucide-react";
import {
  KB_ROSTER_LIST_INSET_CLASS,
  KB_ROSTER_ROW_GRID_CLASS,
  KB_ROSTER_SHELL_INSET_CLASS,
} from "@/components/knowledge-base/knowledge-base-roster-layout";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_SHELL_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import type { StoredFile } from "@/lib/knowledge-base/types";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

export type KnowledgeBaseFileRosterProps = {
  files: StoredFile[];
  formatSize: (bytes: number) => string;
  onToggleStar: (fileName: string) => void;
  onDownload: (file: StoredFile) => void;
  onDelete: (fileName: string) => void;
  className?: string;
};

function isFileProcessing(file: StoredFile): boolean {
  return (
    Boolean(file.isProcessing) ||
    file.content.includes("[AI SUMMARIZATION IN PROGRESS]") ||
    file.content.includes("[SUMMARIZATION IN PROGRESS]")
  );
}

function FileRosterRow({
  file,
  formatSize,
  onToggleStar,
  onDownload,
  onDelete,
}: {
  file: StoredFile;
  formatSize: (bytes: number) => string;
  onToggleStar: (fileName: string) => void;
  onDownload: (file: StoredFile) => void;
  onDelete: (fileName: string) => void;
}) {
  const processing = isFileProcessing(file);

  return (
    <div className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
      <div
        className={cn(
          CONTENT_OPTIMIZER_MULTI_SITE_ROW_SHELL_CLASS,
          processing && "bg-primary/[0.07]",
        )}
      >
        <div className={cn(KB_ROSTER_ROW_GRID_CLASS, KB_ROSTER_SHELL_INSET_CLASS)}>
          <div className="flex items-center justify-center">
            {processing ? (
              null
            ) : (
              <FileText className="h-5 w-5 text-primary" aria-hidden />
            )}
          </div>

          <div className="min-w-0">
            <div className={cn("break-words text-base", processing && "font-medium text-primary")}>
              {file.name}
            </div>
            {file.sourceUrl ? (
              <div className="break-words text-base text-muted-foreground">{file.sourceUrl}</div>
            ) : null}
            {processing ? (
              <span className="text-base text-primary/70">Processing for RAG...</span>
            ) : null}
          </div>

          <span className="whitespace-nowrap text-base text-muted-foreground">
            {formatSize(file.size)}
          </span>

          <Button
            variant="quiet"
            type="button"
            onClick={() => onToggleStar(file.name)}
            aria-label={file.starred ? "Unstar file" : "Star file"}
          >
            {file.starred ? (
              <Star className="h-4 w-4 fill-primary text-primary" />
            ) : (
              <StarOff className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>

          <Button
            variant="quiet"
            type="button"
            onClick={() => onDownload(file)}
            aria-label="Download file"
          >
            <Download className="h-4 w-4" />
          </Button>

          <Button
            variant="quiet"
            type="button"
            onClick={() => onDelete(file.name)}
            disabled={file.starred || processing}
            aria-label="Delete file"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function KnowledgeBaseFileRoster({
  files,
  formatSize,
  onToggleStar,
  onDownload,
  onDelete,
  className,
}: KnowledgeBaseFileRosterProps) {
  if (files.length === 0) {
    return (
      <div className={cn("py-12 text-center text-muted-foreground", className)}>
        <FolderOpen className="mx-auto mb-3 h-12 w-12 opacity-50" aria-hidden />
        <p className="text-base">No files uploaded yet</p>
      </div>
    );
  }

  const grouped: Record<string, StoredFile[]> = {};
  const ungrouped: StoredFile[] = [];
  for (const file of files) {
    if (file.sourceDomain) {
      if (!grouped[file.sourceDomain]) grouped[file.sourceDomain] = [];
      grouped[file.sourceDomain].push(file);
    } else {
      ungrouped.push(file);
    }
  }
  const domainKeys = Object.keys(grouped).sort();

  return (
    <div className={cn(KB_ROSTER_LIST_INSET_CLASS, CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS, className)}>
      {domainKeys.map((domain) => {
        const domainFiles = grouped[domain];
        const domainSize = domainFiles.reduce((s, f) => s + f.size, 0);
        return (
          <div key={domain} className="overflow-hidden">
            <div className="mb-1 flex items-center gap-2 rounded-md border border-white/[0.08] bg-ui-field-hover px-3 py-2">
              <Globe2 className="h-4 w-4 text-primary" aria-hidden />
              <span className="text-base font-medium text-foreground">{domain}</span>
              <span className="ml-auto text-base text-muted-foreground">
                {domainFiles.length} page{domainFiles.length !== 1 ? "s" : ""} · {formatSize(domainSize)}
              </span>
            </div>
            {domainFiles.map((file) => (
              <FileRosterRow
                key={file.timestamp}
                file={file}
                formatSize={formatSize}
                onToggleStar={onToggleStar}
                onDownload={onDownload}
                onDelete={onDelete}
              />
            ))}
          </div>
        );
      })}

      {ungrouped.length > 0 && domainKeys.length > 0 ? (
        <p className="px-1 pt-2 text-base text-muted-foreground">Other files</p>
      ) : null}

      {ungrouped.map((file) => (
        <FileRosterRow
          key={file.timestamp}
          file={file}
          formatSize={formatSize}
          onToggleStar={onToggleStar}
          onDownload={onDownload}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
