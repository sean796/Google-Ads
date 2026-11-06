import { useCallback, useEffect, useMemo, useState } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_NO_TAGGED_CLIENTS_SELECTED_SET_BENCHMARK, NOTIFY_OPENROUTER_API_KEY_REQUIRED_FOR_GSC_EXPO, NOTIFY_UPLOAD_A_CSV_FILE_LOCAL_DOMINATOR_GRID_E, notifyBulkCsvTemplateReadyXXRowsX, notifyBulkTemplateCouldNotFinishX, notifyGridLoadedXRowsDominantKeywordX, notifyGscTop10CsvXRowsXClients, notifyGscTop10CsvXRowsXClientsXHadNo, notifyNoClientsSelectedInCategoryXAddTa } from "@/lib/notify-messages";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import {
  revokeCsvDownloadArtifact,
  triggerCsvDownloadArtifact,
  type CsvDownloadArtifact,
} from "@/lib/backlink-research/backlink-bulk-csv-export";
import { exportVerticalBenchmarkGscCsv } from "@/lib/vertical-benchmark/vertical-benchmark-api";
import { downloadGscTop10Csv } from "@/lib/vertical-benchmark/vertical-benchmark-csv-export";
import {
  revokeBenchmarkInventoryHostedLinks,
  runBenchmarkBulkTemplateDownload,
  type BenchmarkBulkTemplateDownloadResult,
} from "@/lib/vertical-benchmark/vertical-benchmark-bulk-template";
import type {
  BenchmarkInventoryHostedLink,
  BenchmarkPipelineProgress,
  BenchmarkPipelineStep,
} from "@/lib/vertical-benchmark/vertical-benchmark-pipeline-types";
import {
  applyCustomTagsFromSites,
  readSiteBenchmarkCustomTag,
} from "@/lib/vertical-benchmark/client-tag-from-site";
import {
  benchmarkContentKindLabel,
  resolveBenchmarkContentKinds,
  type VerticalBenchmarkContentKind,
} from "@/lib/vertical-benchmark/vertical-benchmark-types";
import {
  parseBenchmarkGridCsv,
  type BenchmarkGridCsvContext,
} from "@/lib/vertical-benchmark/vertical-benchmark-grid-entity";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { orderBenchmarkSitesConnectedFirst, resolveBenchmarkCurateSites } from "@/lib/vertical-benchmark/vertical-benchmark-roster-order";
import {
  clampBenchmarkBlogCount,
} from "@/lib/vertical-benchmark/vertical-benchmark-peer-gsc";

export type ContentTypeFilter = "" | VerticalBenchmarkContentKind;

export type ClientTagSortDir = "asc" | "desc";

export function useVerticalBenchmarkController(openRouterApiKey: string) {
  const { sites } = useWordPressSites();
  const { activeWordPressSiteId } = useWordPressOptimization();
  const [selectedSiteIds, setSelectedSiteIds] = useState<Set<string>>(() => new Set());
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentTypeFilter>("post");
  const [exporting, setExporting] = useState(false);
  const [generatingBulkTemplate, setGeneratingBulkTemplate] = useState(false);
  const [bulkTemplateProgress, setBulkTemplateProgress] = useState<BenchmarkPipelineProgress | null>(
    null,
  );
  const [bulkInventoryLinks, setBulkInventoryLinks] = useState<BenchmarkInventoryHostedLink[]>([]);
  const [gridCsvContext, setGridCsvContext] = useState<BenchmarkGridCsvContext | null>(null);
  const [gridCsvFileName, setGridCsvFileName] = useState<string | null>(null);
  const [gridCsvParsing, setGridCsvParsing] = useState(false);
  const [tagFilter, setTagFilter] = useState<string>("");
  const [blogCount, setBlogCount] = useState(0);
  const [tagSortDir, setTagSortDir] = useState<ClientTagSortDir>("asc");
  const [exportProgress, setExportProgress] = useState<BenchmarkPipelineProgress | null>(null);
  const [gscDownloadArtifact, setGscDownloadArtifact] = useState<CsvDownloadArtifact | null>(null);
  const [bulkTemplateDownloadArtifact, setBulkTemplateDownloadArtifact] =
    useState<CsvDownloadArtifact | null>(null);

  useEffect(() => {
    return () => {
      revokeCsvDownloadArtifact(gscDownloadArtifact);
      revokeCsvDownloadArtifact(bulkTemplateDownloadArtifact);
    };
  }, [gscDownloadArtifact, bulkTemplateDownloadArtifact]);

  const sitesKey = useMemo(
    () =>
      sites
        .map((s) => `${s.id}:${readSiteBenchmarkCustomTag(s)}`)
        .sort()
        .join("|"),
    [sites],
  );

  const tagPreset = useMemo(() => applyCustomTagsFromSites(sites), [sites]);
  const clientTagBySiteId = tagPreset.tagBySiteId;
  const clientTagLabelBySiteId = tagPreset.labelBySiteId;

  const labeledSites = useMemo(
    () => sites.filter((s) => Boolean(readSiteBenchmarkCustomTag(s))),
    [sites],
  );

  const tagFilterOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const site of labeledSites) {
      const label = clientTagLabelBySiteId[site.id];
      if (label) labels.add(label);
    }
    return [...labels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [labeledSites, clientTagLabelBySiteId]);

  const connectedTagLabel = useMemo(() => {
    if (!activeWordPressSiteId) return "";
    return clientTagLabelBySiteId[activeWordPressSiteId] ?? "";
  }, [activeWordPressSiteId, clientTagLabelBySiteId]);

  useEffect(() => {
    if (connectedTagLabel) {
      setTagFilter((prev) => (prev === connectedTagLabel ? prev : connectedTagLabel));
    }
  }, [activeWordPressSiteId, connectedTagLabel]);

  useEffect(() => {
    if (!tagFilterOptions.length) return;
    setTagFilter((current) => {
      if (current && tagFilterOptions.includes(current)) return current;
      if (connectedTagLabel && tagFilterOptions.includes(connectedTagLabel)) {
        return connectedTagLabel;
      }
      return tagFilterOptions[0]!;
    });
  }, [tagFilterOptions, connectedTagLabel]);

  const rosterSites = useMemo(() => {
    const list = tagFilter
      ? labeledSites.filter((s) => clientTagLabelBySiteId[s.id] === tagFilter)
      : [];
    list.sort((a, b) => {
      const ta = clientTagLabelBySiteId[a.id] ?? "";
      const tb = clientTagLabelBySiteId[b.id] ?? "";
      const cmp = ta.localeCompare(tb, undefined, { sensitivity: "base" });
      if (cmp !== 0) return tagSortDir === "asc" ? cmp : -cmp;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    return list;
  }, [labeledSites, tagFilter, clientTagLabelBySiteId, tagSortDir]);

  useEffect(() => {
    const desiredIds = rosterSites.length
      ? rosterSites.map((s) => s.id)
      : activeWordPressSiteId
        ? [activeWordPressSiteId]
        : [];
    setSelectedSiteIds((prev) => {
      if (prev.size === desiredIds.length && desiredIds.every((id) => prev.has(id))) {
        return prev;
      }
      return new Set(desiredIds);
    });
  }, [tagFilter, sitesKey, rosterSites, activeWordPressSiteId]);

  const selectedSiteIdList = useMemo(() => [...selectedSiteIds], [selectedSiteIds]);

  const loadAllClients = useCallback(() => {
    setSelectedSiteIds(new Set(rosterSites.map((s) => s.id)));
  }, [rosterSites]);

  const selectNoClients = useCallback(() => {
    setSelectedSiteIds(new Set());
  }, []);

  const toggleSiteSelected = useCallback((siteId: string, checked: boolean) => {
    setSelectedSiteIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(siteId);
      else next.delete(siteId);
      return next;
    });
  }, []);

  const toggleTagSort = useCallback(() => {
    setTagSortDir((d) => (d === "asc" ? "desc" : "asc"));
  }, []);

  const handleExportGscCsv = useCallback(async () => {
    if (!openRouterApiKey.trim()) {
      notify.error(NOTIFY_OPENROUTER_API_KEY_REQUIRED_FOR_GSC_EXPO);
      return;
    }
    const toExport = orderBenchmarkSitesConnectedFirst(
      rosterSites.filter((s) => selectedSiteIds.has(s.id)),
      activeWordPressSiteId,
    );
    if (!toExport.length) {
      if (tagFilter) {
        notify.error(notifyNoClientsSelectedInCategoryXAddTa(tagFilter));
      } else {
        notify.error(NOTIFY_NO_TAGGED_CLIENTS_SELECTED_SET_BENCHMARK);
      }
      return;
    }
    const contentKinds = resolveBenchmarkContentKinds(contentTypeFilter);
    const contentLabel = benchmarkContentKindLabel(contentKinds);

    let gscSteps: BenchmarkPipelineStep[] = toExport.map((s) => ({
      id: `gsc-${s.id}`,
      label: `GSC top 10 — ${s.name}`,
      status: "waiting" as const,
    }));

    setExporting(true);
    setExportProgress({
      phase: "gsc",
      message: "Starting GSC export…",
      percent: 0,
      busy: true,
      steps: gscSteps,
    });

    try {
      const { rows, results } = await exportVerticalBenchmarkGscCsv({
        sites: toExport,
        siteIds: toExport.map((s) => s.id),
        contentKinds,
        clientTagBySiteId,
        clientTagLabelBySiteId,
        openRouterApiKey,
        onProgress: (done, total, siteId) => {
          if (siteId) {
            gscSteps = gscSteps.map((st) =>
              st.id === `gsc-${siteId}`
                ? { ...st, status: "active" as const, detail: contentLabel }
                : st,
            );
          }
          for (let i = 0; i < done; i++) {
            const s = toExport[i];
            if (!s) continue;
            gscSteps = gscSteps.map((st) =>
              st.id === `gsc-${s.id}` ? { ...st, status: "done" as const, detail: "complete" } : st,
            );
          }
          const pct = Math.min(100, Math.round((done / Math.max(total, 1)) * 100));
          setExportProgress({
            phase: "gsc",
            message: `GSC export ${done} / ${total} clients (${contentLabel})`,
            percent: pct,
            busy: true,
            steps: [...gscSteps],
          });
        },
      });

      for (const s of toExport) {
        const result = results.find((r) => r.siteId === s.id);
        const hadRows = (result?.rowCount ?? 0) > 0;
        gscSteps = gscSteps.map((st) =>
          st.id === `gsc-${s.id}`
            ? {
                ...st,
                status: (result?.skipped && !hadRows ? "error" : "done") as "done" | "error",
                detail: result?.reason ?? (hadRows ? `${result?.rowCount ?? 0} rows` : "no data"),
              }
            : st,
        );
      }
      const okCount = results.filter((r) => (r.rowCount ?? 0) > 0).length;
      const failCount = results.length - okCount;

      if (!rows.length) {
        const hint = results.find((r) => r.reason)?.reason;
        const failMsg = hint ? `No GSC rows exported (${hint})` : "No GSC rows exported for any client";
        setExportProgress({
          phase: "gsc",
          message: failMsg,
          percent: 100,
          busy: false,
          steps: gscSteps,
        });
        notify.error(failMsg);
        return;
      }

      setExportProgress({
        phase: "done",
        message: `Downloading GSC CSV (${rows.length} rows)…`,
        percent: 100,
        busy: false,
        steps: gscSteps,
      });

      revokeCsvDownloadArtifact(gscDownloadArtifact);
      const artifact = downloadGscTop10Csv(rows);
      if (artifact) setGscDownloadArtifact(artifact);
      if (failCount > 0) {
        notify.success(
          `GSC top 10 CSV — ${rows.length} rows (${okCount} clients, ${failCount} had no data).`,
        );
      } else {
        notify.success(notifyGscTop10CsvXRowsXClients(rows.length, okCount));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      notify.error(
        msg.includes("404")
          ? "Benchmark API not found. Restart the NEO Pulse API server (port 3001)."
          : `Export could not finish: ${msg}`,
      );
    } finally {
      setExporting(false);
    }
  }, [
    openRouterApiKey,
    rosterSites,
    selectedSiteIds,
    contentTypeFilter,
    clientTagBySiteId,
    clientTagLabelBySiteId,
    tagFilter,
    gscDownloadArtifact,
    activeWordPressSiteId,
  ]);

  const handleCreateBulkTemplate = useCallback(
    async (opts?: {
      skipAutoDownload?: boolean;
      blogCountOverride?: number;
    }): Promise<BenchmarkBulkTemplateDownloadResult | null> => {
      if (generatingBulkTemplate) return null;
      const { curateSites, connectedSite } = resolveBenchmarkCurateSites({
        allSites: sites,
        rosterSites,
        selectedSiteIds,
        connectedSiteId: activeWordPressSiteId,
      });
      if (!curateSites.length) {
        if (tagFilter) {
          notify.error(notifyNoClientsSelectedInCategoryXAddTa(tagFilter));
        } else {
          notify.error(NOTIFY_NO_TAGGED_CLIENTS_SELECTED_SET_BENCHMARK);
        }
        return null;
      }

      setGeneratingBulkTemplate(true);
      revokeBenchmarkInventoryHostedLinks(bulkInventoryLinks);
      setBulkInventoryLinks([]);
      setBulkTemplateProgress({
        phase: "start",
        message: "Starting…",
        percent: 0,
        busy: true,
        indeterminate: true,
        steps: [],
      });
      const contentKinds = resolveBenchmarkContentKinds(contentTypeFilter);
      const effectiveBlogCount = opts?.blogCountOverride ?? blogCount;
      try {
        const apiKey = (openRouterApiKey.trim() || (await resolveOpenRouterApiKeyForHarness())).trim();
        revokeCsvDownloadArtifact(bulkTemplateDownloadArtifact);
        const result = await runBenchmarkBulkTemplateDownload({
          sites: curateSites,
          connectedSite,
          contentKinds,
          gridContext: gridCsvContext,
          blogCount: effectiveBlogCount,
          skipAutoDownload: opts?.skipAutoDownload,
          openRouterApiKey: apiKey,
          clientTagBySiteId,
          clientTagLabelBySiteId,
          onProgress: (p) => {
            setBulkTemplateProgress(p);
            if (p.inventoryLinks?.length) {
              setBulkInventoryLinks(p.inventoryLinks);
            }
          },
        });
        if (result) {
          setBulkTemplateDownloadArtifact(result.artifact);
          if (result.inventoryLinks.length) {
            setBulkInventoryLinks(result.inventoryLinks);
          }
          const invTotal = Object.values(result.inventoryTitlesByClient).reduce((a, n) => a + n, 0);
          const invNote =
            invTotal > 0 ?
              ` Inventory sent to AI: ${invTotal} published title(s).`
            : "";
          notify.success(
            opts?.skipAutoDownload
              ? `Curated ${result.rows.length} idea(s) (${benchmarkContentKindLabel(contentKinds)}).${invNote}`
              : `Bulk CSV template ready (${benchmarkContentKindLabel(contentKinds)}) - ${result.artifact.rowCount} rows.${invNote}`,
          );
          return result;
        }
        return null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Bulk template failed";
        notify.error(notifyBulkTemplateCouldNotFinishX(msg));
        return null;
      } finally {
        setGeneratingBulkTemplate(false);
      }
    },
    [
      openRouterApiKey,
      sites,
      rosterSites,
      selectedSiteIds,
      contentTypeFilter,
      clientTagBySiteId,
      clientTagLabelBySiteId,
      tagFilter,
      bulkTemplateDownloadArtifact,
      generatingBulkTemplate,
      gridCsvContext,
      blogCount,
      activeWordPressSiteId,
      bulkInventoryLinks,
    ],
  );

  const handleGridCsvFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".csv")) {
        notify.error(NOTIFY_UPLOAD_A_CSV_FILE_LOCAL_DOMINATOR_GRID_E);
        return;
      }
      setGridCsvParsing(true);
      try {
        const text = await file.text();
        const result = await parseBenchmarkGridCsv(text, file.size);
        if (result.ok === false) {
          notify.error(result.error);
          return;
        }
        setGridCsvContext(result);
        setGridCsvFileName(file.name);
        notify.success(
          `Grid loaded — ${result.matchedRowCount} rows, dominant keyword “${result.dominantKeyword}”.`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Grid CSV could not be read";
        notify.error(msg);
      } finally {
        setGridCsvParsing(false);
      }
    },
    [],
  );

  const clearGridCsv = useCallback(() => {
    setGridCsvContext(null);
    setGridCsvFileName(null);
  }, []);

  const handleDownloadBulkTemplate = useCallback(() => {
    if (!bulkTemplateDownloadArtifact) return;
    triggerCsvDownloadArtifact(bulkTemplateDownloadArtifact);
  }, [bulkTemplateDownloadArtifact]);

  const busy = exporting || generatingBulkTemplate;

  return {
    labeledCount: labeledSites.length,
    rosterSites,
    selectedSiteIds,
    selectedSiteIdList,
    contentTypeFilter,
    setContentTypeFilter,
    loadAllClients,
    selectNoClients,
    toggleSiteSelected,
    exporting,
    generatingBulkTemplate,
    bulkTemplateProgress,
    bulkInventoryLinks,
    busy,
    clientTagLabelBySiteId,
    tagFilter,
    setTagFilter,
    tagFilterOptions,
    tagSortDir,
    toggleTagSort,
    exportProgress,
    gscDownloadArtifact,
    bulkTemplateDownloadArtifact,
    handleExportGscCsv,
    handleCreateBulkTemplate,
    handleDownloadBulkTemplate,
    canDownloadBulkTemplate: Boolean(bulkTemplateDownloadArtifact),
    blogCount,
    setBlogCount: (n: number) => setBlogCount(clampBenchmarkBlogCount(n)),
    gridCsvContext,
    gridCsvFileName,
    gridCsvParsing,
    handleGridCsvFile,
    clearGridCsv,
  };
}
