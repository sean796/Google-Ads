import React, { useCallback, useEffect, useRef, useState } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ENABLE_THIS_WORDPRESS_SITE_TO_ADD_MASTER, NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_SET_IT_IN, notifyAddedXFileSAsNestedTriples, notifyExtractingNestedTriplesFromX, notifyXDocIsNotSupportedSaveAsDocxOrT, notifyXHadNoExtractableText, notifyXSummaryWasEmptyTryAgainOrUseAD, notifyXUseTxtMdDocxOrPdf, notifyXX } from "@/lib/notify-messages";
import { FileText, Trash2, Upload, ChevronDown, ChevronUp, Download } from "lucide-react";
import {
  setMasterInstructions,
  loadMasterInstructionsFromCloud,
  invalidateMasterInstructionsCache,
  type MasterInstructionSource,
} from "@/lib/master-instructions-storage";
import { NEO_PULSE_MASTER_INSTRUCTIONS_CHANGED_EVENT, GBP_ADDRESS_MASTER_RULES_FILENAME } from "@/lib/master-rules-gbp-address-import";
import {
  extractTextFromInstructionFile,
  isInstructionFileAccepted,
} from "@/lib/master-instructions-file-parser";
import {
  deriveInstructionDocumentName,
  isGenericInstructionFilename,
  shouldStoreInstructionVerbatim,
  summarizeInstructionDocumentForMasterPrompt,
} from "@/lib/master-instructions-openrouter-summarize";
import { loadApiKey } from "@/lib/api";
import { Progress } from "@/components/ui/progress";
import { Button, FileInput, RowButton } from "@/ui";

const COPY = "font-sans text-base text-white";

function isGbpAddressJsonKind(kind: MasterInstructionSource["kind"]): boolean {
  return kind === "gbp-address-json";
}

function summaryDownloadFilename(
  sourceName: string,
  kind?: MasterInstructionSource["kind"]
): string {
  const base = sourceName
    .replace(/\.[^/.]+$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
  const suffix =
    kind === "semantic-triples" ? "master-rules-nested-triples" : "master-rules-summary";
  return `${base || "instructions"}-${suffix}.txt`;
}

function downloadStoredText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface MasterInstructionsSectionProps {
  siteId: string;
  siteUrl?: string;
  siteName?: string;
  disabled?: boolean;
}

export const MasterInstructionsSection: React.FC<MasterInstructionsSectionProps> = ({
  siteId,
  siteUrl = "",
  siteName = "",
  disabled = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [sources, setSources] = useState<MasterInstructionSource[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summarizingPhase, setSummarizingPhase] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  /** 0 = idle; 1–99 = in progress; 100 = complete flash */
  const [progressValue, setProgressValue] = useState(0);

  useEffect(() => {
    let cancelled = false;
    invalidateMasterInstructionsCache(siteId);
    void (async () => {
      try {
        const payload = await loadMasterInstructionsFromCloud(siteId);
        if (!cancelled) setSources(payload.sources);
      } catch (e) {
        if (!cancelled) {
          notify.error(e instanceof Error ? e.message : "Could not load master instructions");
          setSources([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId, siteName, siteUrl]);

  useEffect(() => {
    const reload = (e: Event) => {
      const detail = (e as CustomEvent<{ siteId?: string }>).detail;
      if (detail?.siteId && detail.siteId !== siteId) return;
      invalidateMasterInstructionsCache(siteId);
      void loadMasterInstructionsFromCloud(siteId).then((payload) => {
        setSources(payload.sources);
      });
    };
    window.addEventListener(NEO_PULSE_MASTER_INSTRUCTIONS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(NEO_PULSE_MASTER_INSTRUCTIONS_CHANGED_EVENT, reload);
  }, [siteId]);

  const persist = useCallback(
    async (next: MasterInstructionSource[]) => {
      setSources(next);
      try {
        await setMasterInstructions(siteId, { sources: next });
        const { notifyMasterInstructionsChanged } = await import("@/lib/master-rules-gbp-address-import");
        notifyMasterInstructionsChanged(siteId);
      } catch (e) {
        notify.error(e instanceof Error ? e.message : "Could not save master instructions");
        try {
          const p = await loadMasterInstructionsFromCloud(siteId);
          setSources(p.sources);
        } catch {
          /* ignore */
        }
      }
    },
    [siteId],
  );

  const processInstructionFiles = useCallback(
    async (files: File[]) => {
      
      if (!files.length || disabled) return;

      if (!loadApiKey()?.trim()) {
                notify.error(NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_SET_IT_IN);
        return;
      }

      const total = files.length;
      setBusy(true);
      setSummarizingPhase(false);
      setProgressValue(5);
      try {
        const added: MasterInstructionSource[] = [];
        for (let fi = 0; fi < files.length; fi++) {
          const file = files[fi]!;
          const sliceBase = total > 0 ? (fi / total) * 100 : 0;
          const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
          if (ext === "doc") {
            notify.error(notifyXDocIsNotSupportedSaveAsDocxOrT(file.name));
            continue;
          }
          if (!isInstructionFileAccepted(file)) {
                        notify.error(notifyXUseTxtMdDocxOrPdf(file.name));
            continue;
          }
          try {
            setSummarizingPhase(false);
            setProgressValue(Math.min(99, sliceBase + 15));
            const text = await extractTextFromInstructionFile(file);
                        if (!text.trim()) {
              notify.warning(notifyXHadNoExtractableText(file.name));
              continue;
            }
            setSummarizingPhase(true);
            setProgressValue(Math.min(99, sliceBase + 40));
            const verbatim = shouldStoreInstructionVerbatim(text);
            const shouldDeriveName = isGenericInstructionFilename(file.name);

            let content: string;
            let derivedName: string | null = null;

            if (verbatim) {
              content = text.trim();
              if (shouldDeriveName) {
                derivedName = await deriveInstructionDocumentName(text, { siteId, fileName: file.name });
              }
            } else {
              notify.info(notifyExtractingNestedTriplesFromX(file.name), { duration: 6_000 });
              const [summary, name] = await Promise.all([
                summarizeInstructionDocumentForMasterPrompt(text, {
                  siteId,
                  fileName: file.name,
                }),
                shouldDeriveName
                  ? deriveInstructionDocumentName(text, { siteId, fileName: file.name })
                  : Promise.resolve(null),
              ]);
              content = summary;
              derivedName = name;
            }

            setSummarizingPhase(false);
            setProgressValue(Math.min(99, sliceBase + 90));
            if (!content.trim()) {
              notify.error(notifyXSummaryWasEmptyTryAgainOrUseAD(file.name));
              continue;
            }
            added.push({
              name: derivedName ?? file.name,
              content,
              uploadedAt: Date.now(),
              ...(verbatim ? {} : { kind: "semantic-triples" as const, originalExtractedChars: text.length }),
            });
          } catch (err) {
            setSummarizingPhase(false);
                        notify.error(
              `${file.name}: ${err instanceof Error ? err.message : "Could not read or summarize file"}`
            );
          }
        }
        if (added.length) {
          setSources((prev) => {
            const next = [...prev, ...added];
            void persist(next);
            return next;
          });
          notify.success(notifyAddedXFileSAsNestedTriples(added.length));
          setProgressValue(100);
        }
      } finally {
        setSummarizingPhase(false);
        setBusy(false);
        setProgressValue(0);
      }
    },
    [disabled, siteId]
  );

  const onPickFiles = () => {
    if (disabled || busy) return;
    inputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    e.target.value = "";
    if (!list?.length) return;
    await processInstructionFiles(Array.from(list));
  };

  const onDropZoneDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || busy) return;
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const onDropZoneDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };

  const onDropZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || busy) return;
    e.dataTransfer.dropEffect = "copy";
  };

  const onDropZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    const list = e.dataTransfer.files;
    const types = [...e.dataTransfer.types];
        if (disabled) {
      notify.error(NOTIFY_ENABLE_THIS_WORDPRESS_SITE_TO_ADD_MASTER);
      return;
    }
    if (busy) return;
    void processInstructionFiles(Array.from(list));
  };

  const removeAt = (index: number) => {
    const next = sources.filter((_, i) => i !== index);
    void persist(next);
  };

  const combinedPreview = sources
    .map((s) => `=== FILE: ${s.name} ===\n${s.content}`)
    .join("\n\n");

  return (
    <div className={`space-y-4 ${COPY}`}>
      <FileInput
        ref={inputRef}
        accept=".txt,.md,.markdown,.docx,.pdf,application/pdf"
        multiple
        onChange={onFileChange}
        disabled={disabled || busy}
        tabIndex={-1}
      />

      <div
        role="button"
        tabIndex={disabled || busy ? -1 : 0}
        aria-label="Drop instruction files here or click to browse"
        aria-disabled={disabled || busy}
        aria-busy={busy}
        onClick={() => onPickFiles()}
        onKeyDown={(e) => {
          if (disabled || busy) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPickFiles();
          }
        }}
        onDragEnter={onDropZoneDragEnter}
        onDragLeave={onDropZoneDragLeave}
        onDragOver={onDropZoneDragOver}
        onDrop={onDropZoneDrop}
        className={`flex min-h-[9rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-ui-field/50 px-4 py-8 text-center ${COPY} ${disabled || busy ? "cursor-not-allowed" : ""}`}
      >
        <Upload className="h-8 w-8 text-white" aria-hidden />
        <div className="font-semibold text-white">
          {busy
            ? summarizingPhase
              ? "Extracting nested triples…"
              : "Reading files…"
            : isDragging
              ? "Drop to add"
              : "Drop files here or click to browse"}
        </div>
        <p className="text-white">.txt, .md, .docx, .pdf</p>
        {busy && (
          <div className="mt-2 w-full max-w-md px-1">
            <Progress value={progressValue} className="h-2 w-full bg-white/10" />
            <p className="mt-1 text-white">
              {summarizingPhase ? "Extracting nested triples…" : "Reading file…"}
            </p>
          </div>
        )}
      </div>

      {sources.length > 0 && (
        <ul className="space-y-2">
          {sources.map((s, i) => (
            <li
              key={`${s.name}-${s.uploadedAt}-${i}`}
              className={`flex items-center justify-between gap-3 rounded-md bg-black px-3 py-2 ${COPY}`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-white" />
                  <span className="break-words font-medium text-white">{s.name}</span>
                  <span className="shrink-0 text-white">({s.content.length.toLocaleString()} chars)</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {s.content.trim() ? (
                  <Button
                    variant="quiet"
                    type="button"
                    disabled={disabled || busy}
                    onClick={() =>
                      downloadStoredText(
                        s.name === GBP_ADDRESS_MASTER_RULES_FILENAME || isGbpAddressJsonKind(s.kind)
                          ? s.name
                          : summaryDownloadFilename(s.name, s.kind),
                        s.content,
                      )
                    }
                  >
                    <Download className="h-4 w-4" />
                    <span className="ml-1 hidden sm:inline">Download</span>
                  </Button>
                ) : null}
                <Button
                  size="icon" icon={Trash2} aria-label="Remove file"
                  variant="quiet"
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => removeAt(i)}
                  title="Remove file"
                ></Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {sources.length > 0 && (
        <div className="pt-3">
          <RowButton
            type="button"
            onClick={() => setPreviewOpen((o) => !o)}
          >
            Combined text preview
            {previewOpen ? <ChevronUp className="h-4 w-4 text-white" /> : <ChevronDown className="h-4 w-4 text-white" />}
          </RowButton>
          {previewOpen && (
            <pre className={`mt-2 max-h-64 overflow-auto rounded-md bg-black p-3 leading-snug whitespace-pre-wrap break-words ${COPY}`}>
              {combinedPreview}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
