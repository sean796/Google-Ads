import { useCallback, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  FileUp,
  Loader2,
  Newspaper,
  Play,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MY_SITES_FIELD } from "@/components/hosting/my-sites/my-sites-theme";
import { BULK_HEADER_RUN_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { StudioEditorModeId } from "@/components/keyword-research/bulk/studio-editor-modes";
import {
  BULK_AUTO_GENERATE_TEMPLATE_FILENAME,
  BULK_AUTO_GENERATE_TEMPLATE_HREF,
} from "@/lib/bulk/bulk-auto-generate-template-columns";
import { BLOG_IMPORT_FILE_ACCEPT } from "@/lib/bulk/blog-import-parser";
import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_COULD_NOT_COPY_TO_CLIPBOARD,
  NOTIFY_MARKDOWN_COPIED,
} from "@/lib/notify-messages";
import { cn } from "@/lib/utils";

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
  isGeneratingChecklist: boolean;
  hasGeneratedChecklist: boolean;
  promptSiteContextBlocked?: boolean;
  onGenerateChecklist: () => void;
  onApprove: () => void;
  csvFileName?: string | null;
  onPickCsvFile?: (file: File | null) => void;
  csvParsing?: boolean;
  csvEnrichingTitlesUrls?: boolean;
  canStartCsvProcessing?: boolean;
  onStartCsvProcessing?: () => void;
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
  isGeneratingChecklist,
  hasGeneratedChecklist,
  onGenerateChecklist,
  onApprove,
  csvFileName,
  onPickCsvFile,
  csvParsing = false,
  csvEnrichingTitlesUrls = false,
  canStartCsvProcessing = false,
  onStartCsvProcessing,
  importParsing = false,
  importedFileName,
  focusKeyword = "",
  onFocusKeywordChange,
  titleOverride = "",
  onTitleOverrideChange,
  onPickImportFiles,
  pressRelease,
}: BulkPromptComposePanelProps) {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [csvDragActive, setCsvDragActive] = useState(false);

  const [importDragActive, setImportDragActive] = useState(false);

  const pickCsvFile = useCallback(
    (file: File | null | undefined) => {
      if (!file || workspaceBusy || csvParsing) return;
      const name = file.name.toLowerCase();
      if (!name.endsWith(".csv") && file.type !== "text/csv") {
        notify.error("Use a .csv file");
        return;
      }
      onPickCsvFile?.(file);
    },
    [workspaceBusy, csvParsing, onPickCsvFile],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto overscroll-y-contain bg-zinc-950 px-4 py-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {/* MODE 1: Blog Ideas Studio */}
        {studioMode === "prompt" ? (
          <section className="flex flex-col gap-4 border border-white/10 bg-zinc-900/60 px-6 py-7 sm:px-10 sm:py-8">
            {/* Slot 1: Header */}
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-base font-semibold text-white">
                <Wand2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>Generate Blog Ideas</span>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {hasGeneratedChecklist ? "Select ideas on the left, then Approve" : "Batch Content Ideation"}
              </span>
            </div>

            {/* Slot 2: Primary Surface */}
            <Textarea
              value={generalIntent}
              onChange={(e) => onGeneralIntentChange(e.target.value)}
              disabled={workspaceBusy}
              rows={3}
              aria-label="General intent or content topic"
              placeholder="General intent / topic: what should this batch cover?"
              className={cn(
                MY_SITES_FIELD,
                "min-h-[7.5rem] h-[7.5rem] w-full resize-y bg-zinc-900 p-3.5 text-sm",
              )}
            />

            {/* Slot 3: Secondary Parameters Grid */}
            <div className="grid w-full grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                type="text"
                placeholder="Tone, audience, or angle (optional)"
                value={optionalPrompt}
                onChange={(e) => onOptionalPromptChange(e.target.value)}
                disabled={workspaceBusy}
                autoComplete="off"
                aria-label="Tone and audience"
                className={cn(MY_SITES_FIELD, "h-10 bg-zinc-900 text-sm")}
              />
              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
                <div className="flex h-10 items-center rounded-none border border-white/10 bg-zinc-900/50 px-3 text-xs text-muted-foreground">
                  <span>Articles in batch:</span>
                </div>
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
                  placeholder="Count"
                  className={cn(MY_SITES_FIELD, "h-10 bg-zinc-900 text-center text-sm tabular-nums")}
                />
              </div>
            </div>

            {/* Slot 4: Action Footer */}
            <div className="flex items-center justify-start gap-2">
              <Button
                type="button"
                size="sm"
                className={cn(BULK_HEADER_RUN_BTN, "h-10 min-w-[8.5rem] px-4")}
                disabled={workspaceBusy}
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
                  ? "Generating"
                  : hasGeneratedChecklist
                    ? "Approve"
                    : "Ideas"}
              </Button>
            </div>
          </section>
        ) : null}

        {/* MODE 2: Import Draft Articles Studio */}
        {studioMode === "blog-import" ? (
          <section className="flex flex-col gap-4 border border-white/10 bg-zinc-900/60 px-6 py-7 sm:px-10 sm:py-8">
            {/* Slot 1: Header */}
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-base font-semibold text-white">
                <FileUp className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>Import Draft Articles</span>
              </div>
              <span className="text-xs font-mono text-muted-foreground truncate max-w-[20rem]">
                {importedFileName || "Supports .docx, .md, .html, .txt"}
              </span>
            </div>

            {/* Slot 2: Primary Surface (Drag & Drop Zone matching universal height) */}
            <button
              type="button"
              disabled={workspaceBusy || importParsing}
              onClick={() => importInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!workspaceBusy && !importParsing) setImportDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setImportDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setImportDragActive(false);
                onPickImportFiles?.(Array.from(e.dataTransfer.files ?? []));
              }}
              className={cn(
                "flex min-h-[7.5rem] h-[7.5rem] w-full flex-col items-center justify-center gap-1.5 rounded-none border border-dashed px-4 py-3 text-center transition-colors",
                importDragActive
                  ? "border-primary bg-primary/10"
                  : "border-zinc-700 bg-zinc-900/80 hover:border-zinc-500 hover:bg-zinc-900",
                (workspaceBusy || importParsing) && "cursor-not-allowed opacity-60",
              )}
            >
              {importParsing ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
                  <span className="text-sm text-white">Parsing draft articles…</span>
                </>
              ) : (
                <>
                  <FileUp className="h-6 w-6 text-primary" aria-hidden />
                  <span className="text-sm font-medium text-white">
                    Drop draft files here or click to browse
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {importedFileName || "Files appear in the left list immediately"}
                  </span>
                </>
              )}
            </button>

            {/* Slot 3: Secondary Parameters Grid */}
            <div className="grid w-full grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                type="text"
                placeholder="Focus keyword (optional)"
                value={focusKeyword}
                onChange={(e) => onFocusKeywordChange?.(e.target.value)}
                disabled={workspaceBusy || importParsing}
                autoComplete="off"
                aria-label="Focus keyword"
                className={cn(MY_SITES_FIELD, "h-10 bg-zinc-900 text-sm")}
              />
              <Input
                type="text"
                placeholder="Title override (optional)"
                value={titleOverride}
                onChange={(e) => onTitleOverrideChange?.(e.target.value)}
                disabled={workspaceBusy || importParsing}
                autoComplete="off"
                aria-label="Title override"
                className={cn(MY_SITES_FIELD, "h-10 bg-zinc-900 text-sm")}
              />
            </div>

            {/* Slot 4: Action Footer */}
            <div className="flex items-center justify-start gap-2">
              <input
                ref={importInputRef}
                type="file"
                multiple
                accept={BLOG_IMPORT_FILE_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  onPickImportFiles?.(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                size="sm"
                disabled={workspaceBusy || importParsing}
                onClick={() => importInputRef.current?.click()}
                className={cn(BULK_HEADER_RUN_BTN, "h-10 min-w-[8.5rem] px-4")}
              >
                {importParsing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Upload className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
                )}
                Import Files
              </Button>
            </div>
          </section>
        ) : null}

        {/* MODE 3: Bulk CSV Schedule Studio */}
        {studioMode === "csv" ? (
          <section className="flex flex-col gap-4 border border-white/10 bg-zinc-900/60 px-6 py-7 sm:px-10 sm:py-8">
            {/* Slot 1: Header */}
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-base font-semibold text-white">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>Bulk CSV Schedule</span>
              </div>
              <span className="text-xs font-mono text-muted-foreground truncate max-w-[20rem]">
                {csvFileName || "Upload scheduled posts & keywords"}
              </span>
            </div>

            {/* Slot 2: Primary Surface (CSV Dropzone matching universal height) */}
            <button
              type="button"
              disabled={workspaceBusy || csvParsing}
              onClick={() => csvInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!workspaceBusy && !csvParsing) setCsvDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setCsvDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCsvDragActive(false);
                pickCsvFile(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                "flex min-h-[7.5rem] h-[7.5rem] w-full flex-col items-center justify-center gap-1.5 rounded-none border border-dashed px-4 py-3 text-center transition-colors",
                csvDragActive
                  ? "border-primary bg-primary/10"
                  : "border-zinc-700 bg-zinc-900/80 hover:border-zinc-500 hover:bg-zinc-900",
                (workspaceBusy || csvParsing || csvEnrichingTitlesUrls) &&
                  "cursor-not-allowed opacity-60",
              )}
            >
              {csvEnrichingTitlesUrls ? (
                <>
                  <Sparkles className="h-6 w-6 animate-pulse text-primary" aria-hidden />
                  <span className="text-sm text-white">Optimizing titles & URLs in the list…</span>
                </>
              ) : csvParsing ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
                  <span className="text-sm text-white">Reading CSV…</span>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-primary" aria-hidden />
                  <span className="text-sm font-medium text-white">
                    Drop CSV here or click to browse
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {csvFileName || "Rows appear in the left list right after upload"}
                  </span>
                </>
              )}
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                pickCsvFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />

            {/* Slot 3: Secondary Parameters Grid */}
            <div className="grid w-full grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex h-10 items-center rounded-none border border-white/10 bg-zinc-900 px-3 text-xs text-muted-foreground">
                <FileSpreadsheet className="mr-2 h-4 w-4 text-primary shrink-0" aria-hidden />
                <span className="truncate">Auto-maps titles, slugs & publication schedule</span>
              </div>
              <a
                href={BULK_AUTO_GENERATE_TEMPLATE_HREF}
                download={BULK_AUTO_GENERATE_TEMPLATE_FILENAME}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-none border border-white/10 bg-zinc-900 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-800 hover:text-primary"
              >
                <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>Download Template CSV</span>
              </a>
            </div>

            {csvFileName ? (
              <div className="flex items-center justify-start gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={workspaceBusy || csvParsing || !canStartCsvProcessing}
                  onClick={onStartCsvProcessing}
                  className={cn(BULK_HEADER_RUN_BTN, "h-10 min-w-[8.5rem] px-4")}
                >
                  {workspaceBusy ? (
                    <Loader2 className="mr-1.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <Play className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
                  )}
                  Generate
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* MODE 4: Press Release Studio */}
        {studioMode === "press-release" && pressRelease ? (
          <section className="flex flex-col gap-4 border border-white/10 bg-zinc-900/60 px-6 py-7 sm:px-10 sm:py-8">
            {/* Slot 1: Header */}
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-base font-semibold text-white">
                <Newspaper className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>Press Release Studio</span>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {pressRelease.resultMarkdown ? "Press Release generated" : "Newswire distribution format"}
              </span>
            </div>

            {/* Slot 2: Primary Surface (Topic/Angle compose or preview matching universal height) */}
            {pressRelease.resultMarkdown ? (
              <div className="flex min-h-[7.5rem] h-[7.5rem] w-full flex-col overflow-y-auto rounded-none border border-white/10 bg-zinc-900 p-3 font-sans text-xs text-zinc-300">
                <pre className="whitespace-pre-wrap font-sans text-xs text-white">
                  {pressRelease.resultMarkdown}
                </pre>
              </div>
            ) : (
              <Textarea
                value={pressRelease.keyword}
                onChange={(e) => pressRelease.onKeywordChange(e.target.value)}
                disabled={pressRelease.isProcessing}
                rows={3}
                aria-label="Press release topic or announcement focus"
                placeholder="Press release topic, news angle, company milestone, or product announcement..."
                className={cn(
                  MY_SITES_FIELD,
                  "min-h-[7.5rem] h-[7.5rem] w-full resize-y bg-zinc-900 p-3.5 text-sm",
                )}
              />
            )}

            {/* Slot 3: Secondary Parameters Grid */}
            <div className="grid w-full grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                type="text"
                placeholder="Headline override (optional)"
                value={pressRelease.title}
                onChange={(e) => pressRelease.onTitleChange(e.target.value)}
                disabled={pressRelease.isProcessing}
                autoComplete="off"
                aria-label="Press release headline override"
                className={cn(MY_SITES_FIELD, "h-10 bg-zinc-900 text-sm")}
              />
              <div className="flex h-10 items-center justify-between rounded-none border border-white/10 bg-zinc-900 px-3 text-xs text-muted-foreground">
                <span className="truncate">Newswire Distribution Format</span>
                <span className="font-mono text-[11px] text-primary">AP Wire</span>
              </div>
            </div>

            {/* Slot 4: Action Footer */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!pressRelease.canRun || pressRelease.isProcessing}
                onClick={pressRelease.onRun}
                className={cn(BULK_HEADER_RUN_BTN, "h-10 min-w-[8.5rem] px-4")}
              >
                {pressRelease.isProcessing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Play className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
                )}
                {pressRelease.isProcessing ? "Generating" : "Generate PR"}
              </Button>
              {pressRelease.resultMarkdown ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(pressRelease.resultMarkdown!);
                        notify.success(NOTIFY_MARKDOWN_COPIED);
                      } catch {
                        notify.error(NOTIFY_COULD_NOT_COPY_TO_CLIPBOARD);
                      }
                    }}
                    className="h-10 rounded-none border border-white/10 bg-zinc-900 px-3 text-xs text-white hover:bg-zinc-800"
                  >
                    <Copy className="mr-1.5 h-4 w-4" aria-hidden />
                    Copy Markdown
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      downloadPrMarkdown(
                        `press-release_${sanitizePrFilename(pressRelease.keyword.trim() || "release")}.md`,
                        pressRelease.resultMarkdown!,
                      )
                    }
                    className="h-10 rounded-none border border-white/10 bg-zinc-900 px-3 text-xs text-white hover:bg-zinc-800"
                  >
                    <Download className="mr-1.5 h-4 w-4" aria-hidden />
                    Download .md
                  </Button>
                </>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
