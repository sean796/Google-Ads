import { useCallback, useRef, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import { loadApiKey } from "@/lib/api";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { restCollectionsFromSelectedKeys } from "@/lib/sitemap-optimizer/collection-options";
import type { SitemapOptimizerCollectionOption } from "@/lib/sitemap-optimizer/collection-options";
import { SITEMAP_OPTIMIZER_MERGE_CONCURRENCY } from "@/lib/sitemap-optimizer/constants";
import { enrichSitemapOptimizerRowsWithGsc } from "@/lib/sitemap-optimizer/enrich-sitemap-optimizer-gsc";
import { fetchSitemapOptimizerCatalog } from "@/lib/sitemap-optimizer/fetch-sitemap-optimizer-catalog";
import { runSitemapOptimizerMergeAgentForImport } from "@/lib/sitemap-optimizer/sitemap-optimizer-merge-agent";
import {
  assembleRedirectCsvRunResult,
  buildClustersFromRedirectCsvGroups,
  formatRedirectCsvImportErrors,
  groupRedirectsByDestination,
  lockedDestinationsByClusterId,
  matchSourcesToInventory,
  parseRedirectCsvRedirectCsv,
  resolveMatchedGroupDestinations,
} from "@/lib/sitemap-optimizer/sitemap-optimizer-redirect-csv-import";
import { parseGridRedirectCsvExportCsv } from "@/lib/sitemap-optimizer/parse-grid-redirect-export-csv";
import { runGridCsvHarness } from "@/lib/sitemap-optimizer/run-grid-csv-harness";
import type {
  SitemapOptimizerCollectionKey,
  SitemapOptimizerGscDateRange,
  SitemapOptimizerProgress,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";

export function useSitemapOptimizerRedirectCsvImport() {
  const [phase, setPhase] = useState<SitemapOptimizerProgress["phase"]>("idle");
  const [progress, setProgress] = useState<SitemapOptimizerProgress>({
    phase: "idle",
    completed: 0,
    total: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{
    destinationCount: number;
    matchedSourceCount: number;
    unmatchedCount: number;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setProgress({ phase: "idle", completed: 0, total: 0 });
  }, []);

  const importRedirectCsvPlan = useCallback(
    async (args: {
      site: WordPressSite | null;
      file: File;
      collectionOptions: SitemapOptimizerCollectionOption[];
      selectedCollections: Set<SitemapOptimizerCollectionKey>;
      dateRange: SitemapOptimizerGscDateRange;
      setResult: (result: SitemapOptimizerRunResult | null) => void;
    }) => {
      const { site, file, collectionOptions, selectedCollections, dateRange, setResult } = args;
      setError(null);
      setImportSummary(null);

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const signal = ac.signal;

      try {
        const csvText = await file.text();
        const gridExport = parseGridRedirectCsvExportCsv(csvText);
        if (gridExport.rows.length > 0) {
          const apiKey = loadApiKey()?.trim();
          if (!apiKey) {
            setError("OpenRouter API key required.");
            setPhase("error");
            return { ok: false as const, error: "OpenRouter API key required." };
          }

          setPhase("ingest_csv");
          setProgress({
            phase: "ingest_csv",
            completed: 0,
            total: gridExport.rows.length,
            runMode: "grid_csv",
            uploadRowCount: gridExport.rows.length,
            detail: "Loading grid redirect export",
          });

          const gridRes = await runGridCsvHarness({
            gscPagesUpload: gridExport.rows,
            dateRange,
            apiKey,
            site,
            callbacks: {
              setPhase,
              setProgress: (p) => setProgress({ ...p, runMode: "grid_csv" }),
              signal,
            },
          });

          if (gridRes.ok === false) {
            if (gridRes.error !== "Cancelled") setError(gridRes.error);
            setPhase(gridRes.error === "Cancelled" ? "idle" : "error");
            return { ok: false as const, error: gridRes.error };
          }

          setResult(gridRes.result);
          setImportSummary({
            destinationCount: gridRes.result.contentSheet.length,
            matchedSourceCount: gridRes.result.rows.length,
            unmatchedCount: 0,
          });
          setPhase("done");
          abortRef.current = null;
          return { ok: true as const, result: gridRes.result };
        }
        if (gridExport.error) {
          setError(gridExport.error);
          setPhase("error");
          return { ok: false as const, error: gridExport.error };
        }

        const apiKey = loadApiKey()?.trim();
        if (!apiKey) {
          setError("OpenRouter API key required.");
          return { ok: false as const, error: "OpenRouter API key required." };
        }

        if (!site) {
          setError("Connect a WordPress site for NEO Pulse redirect merge import.");
          return { ok: false as const, error: "Connect a WordPress site for NEO Pulse redirect merge import." };
        }

        const collections = restCollectionsFromSelectedKeys(collectionOptions, selectedCollections);
        if (!collections.length) {
          setError("Select at least one collection.");
          return { ok: false as const, error: "Select at least one collection." };
        }

        setPhase("inventory");
        setProgress({ phase: "inventory", completed: 0, total: 1, detail: "Loading inventory" });

        const catalogRes = await fetchSitemapOptimizerCatalog(site, collections);
        if (catalogRes.ok === false) {
          setError(catalogRes.error);
          setPhase("error");
          return { ok: false as const, error: catalogRes.error };
        }

        const parsed = parseRedirectCsvRedirectCsv(csvText);
        if (parsed.error || parsed.rows.length === 0) {
          const msg = parsed.error ?? "No redirect rows in CSV.";
          setError(msg);
          setPhase("error");
          return { ok: false as const, error: msg };
        }

        const groups = groupRedirectsByDestination(parsed.rows);
        if (groups.length === 0) {
          setError("No destination groups found in CSV.");
          setPhase("error");
          return { ok: false as const, error: "No destination groups found in CSV." };
        }

        let inventory = catalogRes.rows;
        const match = matchSourcesToInventory(groups, inventory);
        if (match.groups.length === 0) {
          const msg =
            formatRedirectCsvImportErrors(match) ??
            "No merge groups with at least two matched source posts.";
          setError(msg);
          setPhase("error");
          return { ok: false as const, error: msg };
        }

        resolveMatchedGroupDestinations(match.groups);

        setProgress({
          phase: "inventory",
          completed: 1,
          total: 1,
          detail: `Matched ${match.groups.length} destination(s)`,
          inventoryCount: inventory.length,
        });

        if (signal.aborted) return { ok: false as const, error: "Cancelled" };

        const matchedIds = new Set<string>();
        for (const g of match.groups) {
          for (const r of g.memberRows) matchedIds.add(r.postId);
        }
        const rowsToEnrich = inventory.filter((r) => matchedIds.has(r.postId));

        const gscSiteUrl = getPublicSiteUrl(site).trim() || site.siteUrl.trim();
        setPhase("gsc");
        setProgress({
          phase: "gsc",
          completed: 0,
          total: rowsToEnrich.length,
          detail: "Fetching GSC for matched sources",
          inventoryCount: inventory.length,
        });

        const { rows: gscRows, missCount } = await enrichSitemapOptimizerRowsWithGsc(
          gscSiteUrl,
          rowsToEnrich,
          dateRange,
          (completed, total) => {
            setProgress({
              phase: "gsc",
              completed,
              total,
              detail: "Fetching GSC for matched sources",
              inventoryCount: inventory.length,
            });
          },
          signal,
        );

        const gscById = new Map(gscRows.map((r) => [r.postId, r]));
        inventory = inventory.map((r) => gscById.get(r.postId) ?? r);

        for (const g of match.groups) {
          g.memberRows = g.memberRows.map((r) => gscById.get(r.postId) ?? r);
        }

        if (signal.aborted) return { ok: false as const, error: "Cancelled" };

        const clusters = buildClustersFromRedirectCsvGroups(match.groups);
        const lockedMap = lockedDestinationsByClusterId(match.groups);
        const mergeTotal = clusters.length;

        setPhase("merge");
        setProgress({
          phase: "merge",
          completed: 0,
          total: mergeTotal,
          detail: "Building content plan from sources",
          inventoryCount: inventory.length,
        });

        const allMemberRows = match.groups.flatMap((g) => g.memberRows);
        const merges = await runSitemapOptimizerMergeAgentForImport(
          clusters,
          allMemberRows,
          lockedMap,
          apiKey,
          SITEMAP_OPTIMIZER_MERGE_CONCURRENCY,
          signal,
          (completed, total) => {
            setProgress({
              phase: "merge",
              completed,
              total,
              detail: "Building content plan from sources",
              inventoryCount: inventory.length,
            });
          },
        );

        if (merges.length === 0) {
          setError("Merge agent returned no recommendations.");
          setPhase("error");
          return { ok: false as const, error: "Merge agent returned no recommendations." };
        }

        const runResult = assembleRedirectCsvRunResult({
          inventory,
          matched: match.groups,
          clusters,
          merges,
          dateRange,
          gscMissCount: missCount,
        });

        setResult(runResult);
        const matchedSourceCount = match.groups.reduce((n, g) => n + g.memberRows.length, 0);
        setImportSummary({
          destinationCount: match.groups.length,
          matchedSourceCount,
          unmatchedCount: match.unmatchedSources.length,
        });

        setPhase("done");
        setProgress({
          phase: "done",
          completed: merges.length,
          total: merges.length,
          detail: "NEO Pulse redirect plan loaded",
        });
        abortRef.current = null;

        return { ok: true as const, result: runResult };
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          setPhase("idle");
          setProgress({ phase: "idle", completed: 0, total: 0 });
          return { ok: false as const, error: "Cancelled" };
        }
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setPhase("error");
        return { ok: false as const, error: msg };
      }
    },
    [],
  );

  const running =
    phase !== "idle" && phase !== "done" && phase !== "error";

  return {
    phase,
    progress,
    error,
    running,
    importRedirectCsvPlan,
    cancel,
    importSummary,
    setError,
  };
}
