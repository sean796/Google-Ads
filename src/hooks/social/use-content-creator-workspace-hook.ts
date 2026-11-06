import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { overviewGridPageSlice } from "@/components/overview/overview-grid-pagination-helpers";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import { contentCreatorGridRowCount, CONTENT_CREATOR_PLACEHOLDER_ROW_COUNT } from "@/components/social/content-creator/content-creator-row-constants";
import { buildContentCalendarExportCsv, contentCalendarExportFilename, importRowToCalendarPatch, parseContentCalendarCsv, triggerContentCalendarCsvDownload } from "@/lib/social/content-calendar-csv";
import { readContentCreatorGenerateConfig, writeContentCreatorGenerateConfig } from "@/lib/social/content-creator-field-limits";
import { getContentCreatorSessionCache, setContentCreatorSessionCache, clearContentCreatorSessionCache } from "@/lib/social/content-creator-session-cache";
import type { ContentGenerateProgressState } from "@/lib/social/content-creator-progress-types";
import { clampContentPostCount, CONTENT_POST_COUNT_MIN, contentRowHasGenerateInput, createIdleContentCalendarRow, normalizeContentCalendarRow, cellString, hasCell, type ContentCalendarRow, type ContentCreatorGenerateConfig } from "@/lib/social/content-creator-types";
import { syncContentCalendarRowsToCount } from "@/lib/social/sync-content-calendar-rows";
import { applyManualContentCalendarTools, assignContentCalendarLandingPages } from "@/lib/social/content-creator-manual-tools";
import { runContentCreatorGenerate } from "@/lib/social/run-content-creator-generate";
import { runContentCreatorGenerateBatch } from "@/lib/social/run-content-creator-generate-batch";
import { createPpcPageBucketHostedLink, loadContentCreatorLandingPages, revokePpcPageBucketHostedLink, type PpcPageBucketHostedLink } from "@/lib/social/content-creator-landing-pages";
import type { PpcWpPageContext } from "@/lib/ppc/google-ads-types";
import type { ContentCreatorSortColumn, UseContentCreatorWorkspaceOptions } from "./use-content-creator-workspace-types";
export function useContentCreatorWorkspace({
  site,
  apiKey,
  selectedModel,
}: UseContentCreatorWorkspaceOptions) {
  const [rows, setRows] = useState<ContentCalendarRow[]>(() => {
    const config = readContentCreatorGenerateConfig(site.id);
    return syncContentCalendarRowsToCount(
      getContentCreatorSessionCache(site.id) ?? [],
      clampContentPostCount(config.postCount),
    );
  });
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [gridPageIndex, setGridPageIndex] = useState(0);
  const [sortColumn, setSortColumn] = useState<ContentCreatorSortColumn>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [generateConfig, setGenerateConfig] = useState<ContentCreatorGenerateConfig>(() =>
    readContentCreatorGenerateConfig(site.id),
  );
  const [generateProgress, setGenerateProgress] = useState<ContentGenerateProgressState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [wpPages, setWpPages] = useState<PpcWpPageContext[]>([]);
  const [wpPagesLoading, setWpPagesLoading] = useState(false);
  const [pageBucketHostedLink, setPageBucketHostedLink] = useState<PpcPageBucketHostedLink | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pageBucketLinkRef = useRef<string | null>(null);

  const syncRowsToCount = useCallback(
    (current: ContentCalendarRow[], targetCount: number) =>
      syncContentCalendarRowsToCount(current, targetCount),
    [],
  );

  useEffect(() => {
    const config = readContentCreatorGenerateConfig(site.id);
    setRows(
      syncRowsToCount(getContentCreatorSessionCache(site.id) ?? [], clampContentPostCount(config.postCount)),
    );
    setExpandedRowId(null);
    setGridPageIndex(0);
    setGenerateProgress(null);
    setIsGenerating(false);
    setGenerateConfig(config);
  }, [site.id, syncRowsToCount]);

  useEffect(() => {
    let cancelled = false;
    setWpPages([]);
    setWpPagesLoading(true);
    revokePpcPageBucketHostedLink(pageBucketLinkRef.current);
    pageBucketLinkRef.current = null;
    setPageBucketHostedLink(null);

    loadContentCreatorLandingPages(site, generateConfig.landingPageSource)
      .then((pages) => {
        if (cancelled) return;
        setWpPages(pages);
        const link = createPpcPageBucketHostedLink(site.siteUrl, pages);
        pageBucketLinkRef.current = link.href;
        setPageBucketHostedLink(link);
      })
      .catch(() => {
        if (!cancelled) setWpPages([]);
      })
      .finally(() => {
        if (!cancelled) setWpPagesLoading(false);
      });

    return () => {
      cancelled = true;
      revokePpcPageBucketHostedLink(pageBucketLinkRef.current);
      pageBucketLinkRef.current = null;
    };
  }, [site, generateConfig.landingPageSource]);

  useEffect(() => {
    if (!wpPages.length) return;
    setRows((prev) =>
      assignContentCalendarLandingPages(prev, wpPages, generateConfig.landingPageSource).map(
        normalizeContentCalendarRow,
      ),
    );
  }, [wpPages, generateConfig.landingPageSource]);

  useEffect(() => {
    writeContentCreatorGenerateConfig(site.id, generateConfig);
  }, [generateConfig, site.id]);

  useEffect(() => {
    const target = clampContentPostCount(generateConfig.postCount);
    setRows((prev) => syncRowsToCount(prev, target));
  }, [generateConfig.postCount, syncRowsToCount]);

  useEffect(() => {
    if (rows.length) {
      setContentCreatorSessionCache(site.id, rows);
    } else {
      clearContentCreatorSessionCache(site.id);
    }
  }, [rows, site.id]);

  useEffect(() => {
    setGridPageIndex(0);
  }, [sortColumn, sortDir, rows.length]);

  const displayRows = useMemo(() => {
    const batchSize = clampContentPostCount(generateConfig.postCount);
    const sorted = [...rows.slice(0, batchSize)];
    if (sortColumn === "title") {
      sorted.sort((a, b) => {
        const av = (a.keyword || "").toLowerCase();
        const bv = (b.keyword || "").toLowerCase();
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    } else if (sortColumn === "date") {
      sorted.sort((a, b) => {
        const av = a.date || "";
        const bv = b.date || "";
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return sorted;
  }, [rows, sortColumn, sortDir, generateConfig.postCount]);

  const toggleExpandedRowId = useCallback((id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  }, []);

  const updateRow = useCallback((id: string, patch: Partial<ContentCalendarRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? normalizeContentCalendarRow({ ...row, ...patch }) : row)),
    );
  }, []);

  const handleDeleteRow = useCallback(
    (id: string) => {
      if (isGenerating) return;

      if (rows.length <= CONTENT_POST_COUNT_MIN) {
        setRows((prev) =>
          prev.map((row) => (row.id === id ? createIdleContentCalendarRow() : row)),
        );
      } else {
        const remaining = rows.filter((row) => row.id !== id);
        const newCount = clampContentPostCount(remaining.length);
        setGenerateConfig((prev) => ({ ...prev, postCount: newCount }));
        setRows(syncRowsToCount(remaining, newCount));
      }

      setExpandedRowId((prev) => (prev === id ? null : prev));
      setGenerateProgress(null);
    },
    [isGenerating, rows, syncRowsToCount],
  );

  const handleClearAllRows = useCallback(() => {
    if (isGenerating) return;
    const count = clampContentPostCount(generateConfig.postCount);
    setRows(Array.from({ length: count }, () => createIdleContentCalendarRow()));
    setExpandedRowId(null);
    setGenerateProgress(null);
    clearContentCreatorSessionCache(site.id);
  }, [generateConfig.postCount, isGenerating, site.id]);

  const applyGeneratedResult = useCallback(
    (rowId: string, result: Awaited<ReturnType<typeof runContentCreatorGenerate>>) => {
      updateRow(rowId, {
        status: "ready",
        createdAt: new Date().toISOString(),
        events: result.events,
        keyword: result.keyword,
        dayOfWeek: result.dayOfWeek,
        date: result.date,
        fbInstagramContent: result.fbInstagramContent,
        linkedinContent: result.linkedinContent,
        landingPageUrl: result.landingPageUrl,
        promptModifier: result.promptModifier,
        researchSections: result.researchSections,
        errorMessage: undefined,
      });
    },
    [updateRow],
  );

  const runGenerateJobs = useCallback(
    async (targetRows: ContentCalendarRow[], controller: AbortController) => {
      const config: ContentCreatorGenerateConfig = {
        postCount: clampContentPostCount(generateConfig.postCount),
        landingPageSource: generateConfig.landingPageSource,
      };

      const scheduledRows = applyManualContentCalendarTools(targetRows, {
        landingPages: wpPages,
        landingPageSource: config.landingPageSource,
      });

      const rowIds = targetRows.map((row) => row.id);
      setRows((prev) =>
        prev.map((row, index) => {
          const jobIndex = rowIds.indexOf(row.id);
          if (jobIndex < 0) return row;
          const scheduled = scheduledRows[jobIndex];
          return normalizeContentCalendarRow({
            ...row,
            ...scheduled,
            status: "generating",
            errorMessage: undefined,
          });
        }),
      );

      const jobs = targetRows.map((sourceRow, index) => ({
        rowId: sourceRow.id,
        sourceRow: scheduledRows[index] ?? sourceRow,
        config,
      }));

      if (jobs.length === 1) {
        const result = await runContentCreatorGenerate({
          site,
          apiKey,
          model: selectedModel,
          config,
          sourceRow: jobs[0]!.sourceRow,
          landingPages: wpPages,
          onProgress: setGenerateProgress,
          onResearchSections: (sections) => updateRow(jobs[0]!.rowId, { researchSections: sections }),
          onPartialUpdate: (patch) => updateRow(jobs[0]!.rowId, patch),
          signal: controller.signal,
        });
        applyGeneratedResult(jobs[0]!.rowId, result);
        return;
      }

      const results = await runContentCreatorGenerateBatch({
        site,
        apiKey,
        model: selectedModel,
        landingPages: wpPages,
        jobs,
        onProgress: setGenerateProgress,
        onResearchSections: (rowId, sections) => updateRow(rowId, { researchSections: sections }),
        onPartialUpdate: (rowId, patch) => updateRow(rowId, patch),
        signal: controller.signal,
      });

      for (const outcome of results) {
        if (outcome.ok === true) {
          applyGeneratedResult(outcome.rowId, outcome.result);
        } else {
          updateRow(outcome.rowId, {
            status: "error",
            errorMessage: outcome.errorMessage,
          });
        }
      }
    },
    [apiKey, applyGeneratedResult, generateConfig, selectedModel, site, updateRow, wpPages],
  );

  const handleGenerateRows = useCallback(async () => {
    if (isGenerating || typeof apiKey !== "string" || apiKey.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const config = {
      postCount: clampContentPostCount(generateConfig.postCount),
      landingPageSource: generateConfig.landingPageSource,
    };
    const targetRows = rows.slice(0, config.postCount);

    const missingInput = targetRows.some((row) => !contentRowHasGenerateInput(row) && !wpPages.length);
    if (missingInput) {
      setRows((prev) =>
        prev.map((row, index) =>
          index < config.postCount && !contentRowHasGenerateInput(row) && !wpPages.length
            ? {
                ...row,
                status: "error" as const,
                errorMessage: "Add a keyword, landing page, or connect WordPress for page inventory.",
              }
            : row,
        ),
      );
      return;
    }

    setIsGenerating(true);
    try {
      await runGenerateJobs(targetRows, controller);
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Content generation failed";
      const rowIds = targetRows.map((row) => row.id);
      setRows((prev) =>
        prev.map((row) =>
          rowIds.includes(row.id) && row.status === "generating"
            ? { ...row, status: "error", errorMessage: message }
            : row,
        ),
      );
    } finally {
      setIsGenerating(false);
    }
  }, [apiKey, generateConfig, isGenerating, rows, runGenerateJobs, wpPages.length]);

  const handleGenerateRow = useCallback(
    async (rowId: string) => {
      if (isGenerating || typeof apiKey !== "string" || apiKey.length === 0) return;
      const sourceRow = rows.find((row) => row.id === rowId);
      if (!sourceRow) return;

      if (!contentRowHasGenerateInput(sourceRow) && !wpPages.length) {
        updateRow(rowId, {
          status: "error",
          errorMessage: "Add a keyword, landing page, or connect WordPress for page inventory.",
        });
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsGenerating(true);

      try {
        await runGenerateJobs([sourceRow], controller);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Content generation failed";
        updateRow(rowId, { status: "error", errorMessage: message });
      } finally {
        setIsGenerating(false);
      }
    },
    [apiKey, isGenerating, rows, runGenerateJobs, updateRow, wpPages.length],
  );

  const handleCancelGenerate = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
    setRows((prev) =>
      prev.map((row) =>
        row.status === "generating" ? { ...row, status: "idle", errorMessage: undefined } : row,
      ),
    );
  }, []);

  const handleImportCsv = useCallback(
    async (file: File) => {
      if (isGenerating) return;
      const importedRows = parseContentCalendarCsv(await file.text());
      if (!importedRows.length) {
        setRows((prev) => {
          if (!prev.length) return prev;
          const [first, ...rest] = prev;
          return [
            { ...first!, status: "error" as const, errorMessage: "No content rows found in CSV." },
            ...rest,
          ];
        });
        return;
      }

      const postCount = clampContentPostCount(importedRows.length);
      setGenerateConfig((prev) => ({ ...prev, postCount }));
      setRows((prev) =>
        syncRowsToCount(prev, postCount).map((row, index) => {
          const imported = importedRows[index];
          if (!imported) return row;
          return normalizeContentCalendarRow({ ...row, ...importRowToCalendarPatch(imported) });
        }),
      );
    },
    [isGenerating, syncRowsToCount],
  );

  const handleExportCsv = useCallback(() => {
    const csv = buildContentCalendarExportCsv(rows);
    triggerContentCalendarCsvDownload(contentCalendarExportFilename(site.name), csv);
  }, [rows, site.name]);

  const canExportCsv = useMemo(
    () =>
      rows.some(
        (row) =>
          hasCell(row.fbInstagramContent) ||
          hasCell(row.linkedinContent) ||
          hasCell(row.keyword),
      ),
    [rows],
  );

  const bulkMicroSnapshot = useMemo((): MetaBulkMicroSnapshot | null => {
    if (!isGenerating || !generateProgress) return null;
    const active = generateProgress.steps.find((step) => step.status === "running");
    return {
      label: active?.label ?? generateProgress.label,
      completed: generateProgress.completed,
      total: generateProgress.total,
      statusMessage: generateProgress.statusMessage,
      progressPct:
        generateProgress.total > 0
          ? Math.round((generateProgress.completed / generateProgress.total) * 100)
          : 0,
    };
  }, [generateProgress, isGenerating]);

  const workspaceBusy = isGenerating;

  const gridPaginationTotal = useMemo(
    () => contentCreatorGridRowCount(displayRows.length),
    [displayRows.length],
  );

  const paginationLayoutTotal = CONTENT_CREATOR_PLACEHOLDER_ROW_COUNT;

  return {
    site,
    rows,
    displayRows,
    expandedRowId,
    toggleExpandedRowId,
    gridPageIndex,
    setGridPageIndex,
    sortColumn,
    setSortColumn,
    sortDir,
    setSortDir,
    generateConfig,
    setGenerateConfig,
    generateProgress,
    isGenerating,
    wpPages,
    wpPagesLoading,
    pageBucketHostedLink,
    handleGenerateRows,
    handleGenerateRow,
    handleCancelGenerate,
    handleImportCsv,
    handleDeleteRow,
    handleClearAllRows,
    handleExportCsv,
    canExportCsv,
    updateRow,
    bulkMicroSnapshot,
    workspaceBusy,
    gridPaginationTotal,
    paginationLayoutTotal,
  };
}

export type ContentCreatorWorkspaceController = ReturnType<typeof useContentCreatorWorkspace>;
