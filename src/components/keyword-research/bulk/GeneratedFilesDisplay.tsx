


import { Download } from 'lucide-react';
import { ImageThumbnail } from '@/components/OutputManager/ImageThumbnail';
import type { BulkGeneratedFile } from '@/lib/bulk-file-manager';
import type { CSVRow } from '@/lib/bulk-auto-generate';
import { getFileIcon, getStatusIcon, isImageWithPreview } from './bulk-utils';
import { cn } from '@/lib/utils';
import { Button, Badge, ScrollArea } from "@/ui";

interface GeneratedFilesDisplayProps {
  filesByRow: Map<number, BulkGeneratedFile[]>;
  displayRows: CSVRow[];
  stats: {
    total: number;
    completed: number;
    error: number;
  };
  downloadFile: (file: BulkGeneratedFile) => void;
  downloadRowFiles: (rowIndex: number) => void;
  downloadAllFiles: () => void;
  /** Single CSV of all post bodies + metadata (after run; manual upload failsafe). */
  downloadRunContentCsv: () => void;
  runContentCsvAvailable: boolean;
  /** When true, show the panel even before the first file exists (live production). */
  isProcessing?: boolean;
  /** Current pipeline status line (e.g. keyword research, blueprint). */
  processingStatus?: string;
}

export function GeneratedFilesDisplay({
  filesByRow,
  displayRows,
  stats,
  downloadFile,
  downloadRowFiles,
  downloadAllFiles,
  downloadRunContentCsv,
  runContentCsvAvailable,
  isProcessing = false,
  processingStatus = '',
}: GeneratedFilesDisplayProps) {
  const showLivePanel = isProcessing || filesByRow.size > 0;
  if (!showLivePanel) {
    return null;
  }

  const hasRows = filesByRow.size > 0;

  return (
    <section className="space-y-4 pt-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight text-primary">Generated files (live)</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Order is: DataForSEO research JSON first (as soon as research finishes), then Semrush, checklist, blueprint, markdown, and any WordPress files - each appears the moment it is written.
          </p>
        </div>
        {stats.completed > 0 && (
          <Button
            onClick={downloadAllFiles}
          >
            <Download className="mr-2 h-4 w-4" />
            Download all ({stats.completed})
          </Button>
        )}
      </div>

      {isProcessing && !hasRows && (
        <div className="rounded-lg bg-muted/30 px-4 py-3 text-sm">
          <div className="font-medium text-foreground">Waiting for the first file…</div>
          <div className="mt-1 text-muted-foreground">
            The DataForSEO export appears as soon as keyword research completes (often within a minute). Wikipedia fetch for the knowledge base can run in parallel after that. Current step:
            {' '}
            <span className="font-medium text-foreground">{processingStatus || 'Starting…'}</span>
          </div>
        </div>
      )}

      {hasRows && (
        <ScrollArea className="h-[min(480px,55vh)] pr-3">
          <div className="space-y-3">
            {Array.from(filesByRow.entries())
              .sort(([a], [b]) => a - b)
              .map(([rowIndex, files]) => {
                const row = displayRows[rowIndex];
                if (!row) return null;
                const rowCompleted = files.filter((f) => f.status === 'completed').length;
                return (
                  <div
                    key={rowIndex}
                    className="overflow-hidden rounded-lg bg-muted/25"
                  >
                    <div className="flex flex-col gap-2 bg-muted/15 px-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Badge variant="secondary" className="shrink-0 border-0 font-normal shadow-none">
                            Row {rowIndex + 1}
                          </Badge>
                          <span className="text-sm font-medium leading-snug text-foreground">{row.title}</span>
                        </div>
                        <div className="space-y-0.5 text-xs text-muted-foreground">
                          <div>Keyword: {row.keyword}</div>
                          {row.entity && <div>Entity: {row.entity}</div>}
                          {row.modifier && <div>Modifier: {row.modifier}</div>}
                        </div>
                      </div>
                      <Button
                        size="icon" icon={Download}
                        variant="quiet"
                        onClick={() => downloadRowFiles(rowIndex)}
                        disabled={rowCompleted === 0}
                        title={`Download all ${rowCompleted} file(s) for this row`}
                        aria-label={`Download all files for row ${rowIndex + 1}`}
                      ></Button>
                    </div>

                    <div className="bg-background/20">
                      {files.map((file, fileIdx) => {
                        const showImagePreview = isImageWithPreview(file);

                        return (
                          <div
                            key={file.id}
                            className={cn(
                              'flex min-h-[2.75rem] items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/40 sm:gap-3 sm:py-2.5',
                              fileIdx % 2 === 1 && 'bg-muted/10',
                            )}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                              <span className="shrink-0">{getStatusIcon(file)}</span>
                              {showImagePreview ? (
                                <ImageThumbnail src={file.content} alt={file.fileName} size={52} />
                              ) : (
                                <span className="shrink-0 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
                                  {getFileIcon(file.fileName)}
                                </span>
                              )}
                              <span
                                className="min-w-0 flex-1 break-words font-mono text-base text-foreground/90 sm:text-xs"
                                title={file.fileName}
                              >
                                {file.fileName}
                              </span>
                              {file.status === 'error' && file.error && (
                                <span className="shrink-0 break-words text-xs text-destructive" title={file.error}>
                                  {file.error}
                                </span>
                              )}
                            </div>
                            {file.status === 'completed' && (
                              <Button
                                size="icon" icon={Download}
                                variant="quiet"
                                onClick={() => downloadFile(file)}
                                title={showImagePreview ? 'Download image' : 'Download file'}
                                aria-label={`Download ${file.fileName}`}
                              ></Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
              .filter(Boolean)}
          </div>
        </ScrollArea>
      )}

      {runContentCsvAvailable && (
        <div className="rounded-lg bg-muted/20 px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-base font-medium text-foreground">Combined run export (CSV)</p>
              <p className="text-base text-muted-foreground">
                All post bodies from this run in one file—use if WordPress upload failed or you want to import elsewhere.
                No extra confirmation; downloads immediately when you click.
              </p>
            </div>
            <Button
              variant="run"
              type="button"
              onClick={downloadRunContentCsv}
            >
              <Download className="mr-2 h-4 w-4" />
              Download combined CSV
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
