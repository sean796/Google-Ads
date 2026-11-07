import { useCallback, useEffect, useState } from "react";
import type { BulkGeneratorWorkspaceBindings } from "@/components/keyword-research/bulk/bulk-generator-workspace-bindings";
import type { PressReleaseWorkspaceBindings } from "@/components/press-release/press-release-workspace-bindings";
import type { StudioEditorModeId } from "@/components/keyword-research/bulk/studio-editor-modes";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import { type WordPressPostDestination } from "@/lib/bulk-auto-generate";
import { isBlogImportFileAccepted } from "@/lib/bulk/blog-import-parser";
import {
  buildImportCsvRowFromFile,
  buildRawImportCsvRowFromFile,
} from "@/lib/bulk/blog-import-direct";
import { readImportStudioRawToggle } from "@/lib/bulk/import-studio-prefs";
import { notify } from "@/lib/app-notifications";
import { notifyLoadedCsvX } from "@/lib/notify-messages";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import type { useVerticalBenchmarkController } from "@/hooks/vertical-benchmark/use-vertical-benchmark-controller";

type VerticalBenchmarkController = ReturnType<typeof useVerticalBenchmarkController>;

type UseBulkBlogImportArgs = {
  isVerticalBenchmark: boolean;
  studioEditorMode: StudioEditorModeId;
  vb: VerticalBenchmarkController;
  selectedModel?: string;
};

export function useBulkBlogImport({
  isVerticalBenchmark,
  studioEditorMode,
  vb,
  selectedModel,
}: UseBulkBlogImportArgs) {
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [focusKeyword, setFocusKeyword] = useState("");
  const [titleOverride, setTitleOverride] = useState("");
  const [isParsingImport, setIsParsingImport] = useState(false);
  const [bulkBindings, setBulkBindings] = useState<BulkGeneratorWorkspaceBindings | null>(null);
  const [pressReleaseBindings, setPressReleaseBindings] =
    useState<PressReleaseWorkspaceBindings | null>(null);

  const bulkHasGeneratedChecklist = bulkBindings?.hasGeneratedChecklist;
  const bulkNumberOfBlogs = bulkBindings?.numberOfBlogs;
  const bulkSetNumberOfBlogs = bulkBindings?.setNumberOfBlogs;

  useEffect(() => {
    if (!isVerticalBenchmark || !bulkSetNumberOfBlogs) return;
    if (!bulkHasGeneratedChecklist && bulkNumberOfBlogs !== vb.blogCount) {
      bulkSetNumberOfBlogs(vb.blogCount);
    }
  }, [
    isVerticalBenchmark,
    vb.blogCount,
    bulkHasGeneratedChecklist,
    bulkNumberOfBlogs,
    bulkSetNumberOfBlogs,
  ]);

  useEffect(() => {
    vb.setBlogCount(0);
    if (bulkBindings && !bulkBindings.hasGeneratedChecklist) bulkBindings.setNumberOfBlogs(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vb and bulkBindings are recreated on every render, so adding them would reset blog counts on every render; this effect must run only when studioEditorMode changes and both setters delegate to stable state setters
  }, [studioEditorMode]);

  const handlePickImportFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || !bulkBindings) return;
      const dest: WordPressPostDestination = bulkBindings.bulkPostDestination ?? "wordpress";
      const importRaw = readImportStudioRawToggle();
      const apiKey = (await resolveOpenRouterApiKeyForHarness()).trim();
      if (!importRaw && !apiKey) {
        notify.error("OpenRouter API key is required for import meta unless Raw is on");
        return;
      }
      setIsParsingImport(true);
      try {
        const accepted = files.filter((file) => isBlogImportFileAccepted(file));
        if (accepted.length === 0) {
          notify.error("Use .docx, .md, .html, or .txt");
          return;
        }
        if (accepted.length !== files.length) {
          notify.error("Skipped unsupported file types");
        }
        const featuredImageMode = bulkBindings.featuredImagePerBlog
          ? bulkBindings.featuredImageType === "google-maps"
            ? "google-maps"
            : "y"
          : "n";
        const form = {
          focusKeyword,
          titleOverride,
          featuredImageMode: featuredImageMode as "y" | "n" | "google-maps",
          entity: "",
        };
        const next: CSVRow[] = [];
        for (const file of accepted) {
          try {
            let importedRow: CSVRow & { decision_audit_json?: string };
            if (importRaw) {
              importedRow = await buildRawImportCsvRowFromFile(file, form, dest);
            } else {
              importedRow = await buildImportCsvRowFromFile(file, form, dest, apiKey, selectedModel);
            }
            if (!importRaw) {
              try {
                const { auditImportDraftWithDecisionTree } = await import("@/lib/decision-tree/studio-decision-auditor");
                const draftBody = importedRow.imported_markdown || importedRow.imported_html || "";
                const decisionState = await auditImportDraftWithDecisionTree({
                  title: importedRow.title,
                  keyword: importedRow.keyword,
                  content: draftBody,
                  apiKey,
                });
                importedRow.decision_audit_json = JSON.stringify(decisionState);
              } catch (auditErr) {
                console.warn("[Decision Agent] Import draft audit error:", auditErr);
              }
            }
            next.push(importedRow);
          } catch (error) {
            notify.error(error instanceof Error ? error.message : `Failed to read ${file.name}`);
          }
        }
        if (next.length === 0) return;
        setImportedFileName(
          next.length === 1
            ? next[0]?.import_file_name ?? accepted[0]?.name ?? "1 file"
            : `${next.length} files`,
        );
        bulkBindings.onLoadImportRows?.(next);
      } finally {
        setIsParsingImport(false);
      }
    },
    [bulkBindings, focusKeyword, titleOverride, selectedModel],
  );

  const onBulkGeneratorWorkspaceBindings = useCallback((bindings: BulkGeneratorWorkspaceBindings) => {
    setBulkBindings(bindings);
  }, []);

  const onPressReleaseWorkspaceBindings = useCallback((bindings: PressReleaseWorkspaceBindings) => {
    setPressReleaseBindings(bindings);
  }, []);

  const handleStudioClear = useCallback(() => {
    setImportedFileName(null);
    setFocusKeyword("");
    setTitleOverride("");
    bulkBindings?.onClearCsv();
    bulkBindings?.onClearPrompt();
  }, [bulkBindings]);

  const handleCsvPick = useCallback(
    async (file: File | null, importRaw = false) => {
      if (!file || !bulkBindings) return;
      try {
        setImportedFileName(null);
        await bulkBindings.onPickCsvFile(file, importRaw);
        notify.success(notifyLoadedCsvX(file.name));
      } catch (error) {
        notify.error(error instanceof Error ? error.message : "Failed to load CSV");
      }
    },
    [bulkBindings],
  );

  return {
    importedFileName,
    focusKeyword,
    setFocusKeyword,
    titleOverride,
    setTitleOverride,
    isParsingImport,
    bulkBindings,
    pressReleaseBindings,
    handlePickImportFiles,
    onBulkGeneratorWorkspaceBindings,
    onPressReleaseWorkspaceBindings,
    handleStudioClear,
    handleCsvPick,
  };
}
