import { useCallback, useRef, useState } from "react";
import {
  Copy,
  Download,
  Upload,
} from "lucide-react";
import type { StudioEditorModeId } from "@/components/keyword-research/bulk/studio-editor-modes";
import {
  BULK_AUTO_GENERATE_TEMPLATE_FILENAME,
  BULK_AUTO_GENERATE_TEMPLATE_HREF,
} from "@/lib/bulk/bulk-auto-generate-template-columns";
import { BLOG_IMPORT_FILE_ACCEPT, isBlogImportFileAccepted } from "@/lib/bulk/blog-import-parser";
import {
  IMPORT_STUDIO_RAW_STORAGE_KEY,
  readImportStudioRawToggle,
} from "@/lib/bulk/import-studio-prefs";
import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_COULD_NOT_COPY_TO_CLIPBOARD,
  NOTIFY_MARKDOWN_COPIED,
} from "@/lib/notify-messages";
import {
  VerticalBenchmarkStudioComposeSection,
  type VerticalBenchmarkStudioComposeProps,
} from "@/components/vertical-benchmark/VerticalBenchmarkStudioComposeSection";
import { cn } from "@/lib/utils";
import { Button, Field, SwitchField, TextareaField } from "@/ui";

function sanitizePrFilename(s: string): string {
  return s.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60) || "press-release";
}

function downloadPrMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type BulkPromptComposePanelProps = {
  studioMode?: StudioEditorModeId;
  generalIntent: string;
  onGeneralIntentChange: (v: string) => void;
  numberOfBlogs: number;
  onNumberOfBlogsChange: (v: number) => void;
  optionalPrompt: string;
  onOptionalPromptChange: (v: string) => void;
  workspaceBusy: boolean;
  hasGeneratedChecklist: boolean;
  promptSiteContextBlocked?: boolean;
  csvFileName?: string | null;
  onPickCsvFile?: (file: File | null, importRaw?: boolean) => void;
  csvParsing?: boolean;
  csvEnrichingTitlesUrls?: boolean;
  importParsing?: boolean;
  importedFileName?: string | null;
  focusKeyword?: string;
  onFocusKeywordChange?: (v: string) => void;
  titleOverride?: string;
  onTitleOverrideChange?: (v: string) => void;
  onPickImportFiles?: (files: File[]) => void;
  pressRelease?: {
    keyword: string;
    onKeywordChange: (v: string) => void;
    title: string;
    onTitleChange: (v: string) => void;
    isProcessing: boolean;
    canRun: boolean;
    onRun: () => void;
    onClear: () => void;
    resultMarkdown: string | null;
  };
  verticalBenchmark?: VerticalBenchmarkStudioComposeProps;
};

export function BulkPromptComposePanel({
  studioMode = "prompt",
  generalIntent,
  onGeneralIntentChange,
  numberOfBlogs,
  onNumberOfBlogsChange,
  optionalPrompt,
  onOptionalPromptChange,
  workspaceBusy,
  hasGeneratedChecklist,
  csvFileName,
  onPickCsvFile,
  csvParsing = false,
  csvEnrichingTitlesUrls = false,
  importParsing = false,
  importedFileName,
  focusKeyword = "",
  onFocusKeywordChange,
  titleOverride = "",
  onTitleOverrideChange,
  onPickImportFiles,
  pressRelease,
  verticalBenchmark,
}: BulkPromptComposePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [importRaw, setImportRaw] = useState(readImportStudioRawToggle);
  const fileZoneBusy = workspaceBusy || csvParsing || importParsing;

  const routeFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const isCsv = (file: File) => file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
      const csvFiles = files.filter(isCsv);
      const drafts = files.filter((file) => !isCsv(file) && isBlogImportFileAccepted(file));
      const other = files.filter((f) => !isCsv(f) && !isBlogImportFileAccepted(f));
      if (other.length > 0) {
        notify.error("Unsupported file type. Use CSV, DOCX, MD, HTML, or TXT");
      }
      if (csvFiles.length > 0 && drafts.length > 0) {
        notify.error("Import one kind at a time: CSV or document files");
        return;
      }
      if (csvFiles.length > 0) {
        onPickCsvFile?.(csvFiles[0], importRaw);
        return;
      }
      onPickImportFiles?.(drafts);
    },
    [importRaw, onPickCsvFile, onPickImportFiles],
  );
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto overscroll-y-contain bg-black px-4 py-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        {/* MODE 1: Blog Ideas Studio */}
        {studioMode === "prompt" ? (
          <section className="flex flex-col gap-3">
            <TextareaField
              value={generalIntent}
              onChange={(e) => onGeneralIntentChange(e.target.value)}
              disabled={workspaceBusy}
              rows={5}
              aria-label="General intent or content topic"
              placeholder="General intent / topic: what should this batch cover?"
            />

            {/* Slot 3: Secondary Parameters Grid */}
            <div className="grid w-full grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                type="text"
                placeholder="Tone, audience, or angle (optional)"
                value={optionalPrompt}
                onChange={(e) => onOptionalPromptChange(e.target.value)}
                disabled={workspaceBusy}
                autoComplete="off"
                aria-label="Tone and audience"
              />
              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
                <div className="flex h-8 items-center rounded-none bg-ui-field px-2 text-base text-muted-foreground">
                  <span>Articles in batch:</span>
                </div>
                <Field
                  type="number"
                  min={0}
                  step={1}
                  value={numberOfBlogs || ""}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    onNumberOfBlogsChange(Number.isNaN(n) ? 0 : n);
                  }}
                  disabled={workspaceBusy}
                  aria-label="Number of blogs"
                  title="Number of blogs"
                  placeholder=""
                />
              </div>
            </div>
          </section>
        ) : null}

        {/* MODE 1B: Industry Verticals Studio */}
        {studioMode === "vertical-benchmarks" && verticalBenchmark ? (
          <VerticalBenchmarkStudioComposeSection {...verticalBenchmark} />
        ) : null}

        {/* MODE 2: Bulk CSV + Import Drafts Studio */}
        {studioMode === "csv" ? (
          <section className="flex flex-col gap-3">
            <SwitchField
              label="Raw"
              title="Skip AI title and meta extraction for imports. Upload file content straight through."
              checked={importRaw}
              disabled={fileZoneBusy}
              onCheckedChange={(v) => {
                setImportRaw(v);
                try {
                  sessionStorage.setItem(IMPORT_STUDIO_RAW_STORAGE_KEY, v ? "1" : "0");
                } catch {
                  /* ignore */
                }
              }}
            />
            <div
              role="button"
              tabIndex={0}
              className={cn(
                "flex min-h-[7.5rem] w-full flex-col items-center justify-center gap-1.5 rounded-none border border-dashed border-zinc-700 bg-ui-field px-4 py-3 text-center transition-colors hover:border-zinc-500 hover:bg-ui-field-hover aria-disabled:opacity-50 cursor-pointer select-none",
                dragActive && "border-primary bg-primary/10 ring-2 ring-primary",
              )}
              aria-disabled={fileZoneBusy}
              onClick={() => !fileZoneBusy && fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !fileZoneBusy) {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!fileZoneBusy) setDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
                if (!fileZoneBusy) setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                if (!fileZoneBusy) routeFiles(Array.from(e.dataTransfer?.files ?? []));
              }}
            >
              <div className="pointer-events-none flex flex-col items-center justify-center gap-1.5">
                <Upload className="h-6 w-6 text-primary" aria-hidden />
                <span className="text-base font-medium text-white">
                  {csvEnrichingTitlesUrls
                    ? "Optimizing titles & URLs in the list"
                    : csvParsing
                      ? "Reading CSV"
                      : importParsing
                        ? "Parsing draft articles"
                        : "Drop CSV, DOCX, MD, or other draft files here or click to browse"}
                </span>
                {importedFileName || csvFileName ? (
                  <span className="text-base text-muted-foreground">{importedFileName || csvFileName}</span>
                ) : null}
              </div>
            </div>
            <input
              id="bulk-csv-upload-input"
              ref={fileInputRef}
              type="file"
              multiple
              accept={`.csv,.txt,text/csv,text/plain,${BLOG_IMPORT_FILE_ACCEPT}`}
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                routeFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />

            {/* Slot 3: Secondary Parameters Grid */}
            <div className="grid w-full grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                type="text"
                placeholder="Focus keyword (optional)"
                value={focusKeyword}
                onChange={(e) => onFocusKeywordChange?.(e.target.value)}
                disabled={workspaceBusy || importParsing}
                autoComplete="off"
                aria-label="Focus keyword"
              />
              <Field
                type="text"
                placeholder="Title override (optional)"
                value={titleOverride}
                onChange={(e) => onTitleOverrideChange?.(e.target.value)}
                disabled={workspaceBusy || importParsing}
                autoComplete="off"
                aria-label="Title override"
              />
            </div>
            <a
              href={BULK_AUTO_GENERATE_TEMPLATE_HREF}
              download={BULK_AUTO_GENERATE_TEMPLATE_FILENAME}
              className="flex h-8 w-full items-center justify-center gap-2 rounded-none bg-ui-field px-2 text-base font-medium text-white transition-colors hover:bg-ui-field-hover hover:text-primary"
            >
              <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>Download Template CSV</span>
            </a>
          </section>
        ) : null}

        {/* MODE 4: Press Release Studio */}
        {studioMode === "press-release" && pressRelease ? (
          <section className="flex flex-col gap-3">
            {pressRelease.resultMarkdown ? (
              <div className="flex min-h-[7.5rem] w-full flex-col overflow-y-auto rounded-none bg-ui-field p-3 font-sans text-base text-foreground">
                <pre className="whitespace-pre-wrap font-sans text-base text-white">
                  {pressRelease.resultMarkdown}
                </pre>
              </div>
            ) : (
              <TextareaField
                value={pressRelease.keyword}
                onChange={(e) => pressRelease.onKeywordChange(e.target.value)}
                disabled={pressRelease.isProcessing}
                rows={5}
                aria-label="Press release topic or announcement focus"
                placeholder="Press release topic, news angle, company milestone, or product announcement..."
              />
            )}

            {/* Slot 3: Secondary Parameters Grid */}
            <Field
              type="text"
              placeholder="Headline override (optional)"
              value={pressRelease.title}
              onChange={(e) => pressRelease.onTitleChange(e.target.value)}
              disabled={pressRelease.isProcessing}
              autoComplete="off"
              aria-label="Press release headline override"
            />

            {/* Slot 4: Action Footer */}
            {pressRelease.resultMarkdown ? (
              <div className="flex flex-wrap items-center gap-2">
                <>
                  <Button
                    variant="quiet"
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(pressRelease.resultMarkdown!);
                        notify.success(NOTIFY_MARKDOWN_COPIED);
                      } catch {
                        notify.error(NOTIFY_COULD_NOT_COPY_TO_CLIPBOARD);
                      }
                    }}
                  >
                    <Copy className="mr-1.5 h-4 w-4" aria-hidden />
                    Copy Markdown
                  </Button>
                  <Button
                    variant="quiet"
                    type="button"
                    onClick={() =>
                      downloadPrMarkdown(
                        `press-release_${sanitizePrFilename(pressRelease.keyword.trim() || "release")}.md`,
                        pressRelease.resultMarkdown!,
                      )
                    }
                  >
                    <Download className="mr-1.5 h-4 w-4" aria-hidden />
                    Download .md
                  </Button>
                </>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
