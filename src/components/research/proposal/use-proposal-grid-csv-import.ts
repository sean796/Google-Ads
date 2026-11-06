import { type ChangeEvent, type Dispatch, type SetStateAction, useCallback, useRef, useState } from "react";
import { fetchCompetitorResearchForTab, fetchManualCompetitorDomainForTab } from "@/lib/competitor-research/competitor-research-fetch";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import { filterMainCompetitorResearchResponse, isNonMainCompetitorDomain } from "@/lib/competitor-research/filter-main-competitor-rows";
import { runCompetitorTierAgent } from "@/lib/competitor-research/competitor-tier-agent";
import { parseCompetitorGridTopPlaces } from "@/lib/competitor-research/local-dominator-grid-parse";
import { fetchGridCompetitorHostnamesParallel } from "@/lib/competitor-research/competitor-grid-dfs-client";
import { mergeGridCompetitorsAsDirectTier } from "@/lib/competitor-research/competitor-grid-tier-merge";
import { buildDomainOrganicCsvFromKeywordRows, DOMAIN_ORGANIC_CSV_TOP_ROWS } from "@/lib/competitor-research/competitor-domain-organic-csv";
import { MAX_LOCAL_CSV_FILE_BYTES, type LocalDominatorRow } from "@/lib/local-dominator-csv";
import { LOCAL_CSV_WORKER_FILE_BYTES_THRESHOLD, processLocalDominatorCsvText, type GridKeywordWeight } from "@/lib/process-local-dominator-upload";
import type { CompetitorResearchSemrushResponse, GscCompetitorDateRange, GscSiteQueryRow, TieredCompetitorsResult } from "@/lib/competitor-research/types";
import type { WordPressSite } from "@/components/integrations/types";
import type { ManagerSeedWorkspaceContextValue } from "@/contexts/manager-seed-workspace-context";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ANALYZE_DONE, NOTIFY_CLIENT_MEETING_SCRIPT_IS_NOT_READY_YET, NOTIFY_COULD_NOT_COPY, NOTIFY_DOWNLOADED_CLIENT_MEETING_SCRIPT_MD, NOTIFY_DOWNLOADED_STRATEGY_MD, NOTIFY_ENTER_A_SEED_SITE_URL_FIRST, NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM, NOTIFY_ENTITY_SAP_CSV_IS_NOT_READY_YET, NOTIFY_GENERATE_A_PROPOSAL_FIRST, NOTIFY_GRID_CSV_DOWNLOADED, NOTIFY_GRID_IMPORT_DONE, NOTIFY_LOCAL_ANALYSIS_DID_NOT_RETURN_COMPETITOR, NOTIFY_NO_NEW_COMPETITORS_FROM_GRID, NOTIFY_POSTS_CSV_IS_NOT_READY_YET, NOTIFY_PROPOSAL_COPIED, NOTIFY_PROPOSAL_INCOMPLETE_BLOG_ROWS_SAVED, NOTIFY_PROPOSAL_INCOMPLETE_SAP_AND_BLOG_ROWS_SA, NOTIFY_PROPOSAL_INCOMPLETE_SAP_ROWS_SAVED, NOTIFY_RUN_ANALYZE_FIRST_OR_IMPORT_A_GRID_CSV, NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR, NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL, NOTIFY_STRATEGY_MARKDOWN_IS_NOT_READY_YET, notifyAddedXCompetitorSFromGridCsv, notifyFileTooLargeMaxXMb, notifyGridCsvSapScanX, notifyGridSkipX, notifyGridXXNoWebsite, notifyGridXXX, notifyGscX2, notifyPresenterTalkScriptFailedX, notifyResearchXX, notifySiteAuditSkippedX, notifySiteAuditSkippedX2, notifyUpdatedXCompetitorSFromGridCsvWer } from "@/lib/notify-messages";
import { buildLocalStrategyGridExportCsv } from "@/lib/local-strategy-research/local-strategy-grid-export-csv";
import { LOCAL_ORGANIC_SOURCE, isPortfolioBlockedHost, triggerDownloadCsv } from "@/components/research/proposal/proposal-research-helpers";

export type UseProposalGridCsvImportArgs = {
  workspaceMode: ManagerSeedWorkspaceContextValue["mode"]; site: WordPressSite | null;
  effectiveSeedUrl: string; workspaceKey: string; neutralResearchWire: boolean;
  effectivePortfolioHosts: string[]; semrushData: CompetitorResearchSemrushResponse | null;
  tiers: TieredCompetitorsResult | null; gscQueries: GscSiteQueryRow[];
  gscDateRange: GscCompetitorDateRange | null; reportDownloadSlug: string;
  activeWorkspaceKeyRef: { current: string };
  setError: Dispatch<SetStateAction<string | null>>;
  setSemrushData: Dispatch<SetStateAction<CompetitorResearchSemrushResponse | null>>;
  setTiers: Dispatch<SetStateAction<TieredCompetitorsResult | null>>;
};

export function useProposalGridCsvImport(args: UseProposalGridCsvImportArgs) {
  const { workspaceMode, site, effectiveSeedUrl, workspaceKey, neutralResearchWire, effectivePortfolioHosts, semrushData, tiers, gscQueries, gscDateRange, reportDownloadSlug, activeWorkspaceKeyRef, setError, setSemrushData, setTiers } = args;
  const [gridCsvBusy, setGridCsvBusy] = useState(false);
  const [gridCsvProgress, setGridCsvProgress] = useState<string | null>(null);
  const [gridSapSummaryMarkdown, setGridSapSummaryMarkdown] = useState("");
  const [gridSapPlaceHints, setGridSapPlaceHints] = useState<string[]>([]);
  const [gridSapKeywordWeights, setGridSapKeywordWeights] = useState<GridKeywordWeight[]>([]);
  /** Parsed grid pins for direct SAP (no OpenRouter-generated SAP rows). */
  const [gridSapParsedRows, setGridSapParsedRows] = useState<LocalDominatorRow[]>([]);
  const gridCsvFileRef = useRef<HTMLInputElement>(null);

  const downloadGridCsv = useCallback(() => {
    if (!semrushData?.rows?.length) {
      notify.error(NOTIFY_RUN_ANALYZE_FIRST_OR_IMPORT_A_GRID_CSV);
      return;
    }
    const csv = buildLocalStrategyGridExportCsv({ semrush: semrushData, tiers });
    triggerDownloadCsv(`local-strategy-grid-${reportDownloadSlug}-${Date.now()}.csv`, csv);
    notify.success(NOTIFY_GRID_CSV_DOWNLOADED);
  }, [semrushData, tiers, reportDownloadSlug]);

  const importDominatorGridCsv = useCallback(
    async (file: File) => {
      if (workspaceMode === "connected") {
        if (!site?.siteUrl?.trim()) {
          notify.error(NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL);
          return;
        }
      } else if (!effectiveSeedUrl) {
        notify.error(NOTIFY_ENTER_A_SEED_SITE_URL_FIRST);
        return;
      }
      if (file.size > MAX_LOCAL_CSV_FILE_BYTES) {
        notify.error(notifyFileTooLargeMaxXMb(Math.round(MAX_LOCAL_CSV_FILE_BYTES / 1024 / 1024)));
        return;
      }
      const runKeySnapshot = workspaceKey;
      const seedForApi = effectiveSeedUrl;
      const tierSiteId = neutralResearchWire ? undefined : site?.id;
      const tierSiteName = neutralResearchWire ? undefined : site?.name;
      setError(null);
      setGridCsvBusy(true);
      setGridCsvProgress("Parsing CSV…");
      try {
        const csvText = await file.text();
        setGridCsvProgress("Parsing grid for SAP (rank evidence)…");
        const useWorker = file.size >= LOCAL_CSV_WORKER_FILE_BYTES_THRESHOLD;
        const gridSapRes = await processLocalDominatorCsvText(csvText, useWorker);
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          return;
        }
        if (gridSapRes.ok === true) {
          setGridSapSummaryMarkdown(gridSapRes.gridSummaryMarkdown);
          setGridSapPlaceHints(gridSapRes.placeHints);
          setGridSapKeywordWeights(gridSapRes.gridKeywordWeights);
          setGridSapParsedRows(gridSapRes.gridRowsForDirectSap);
        } else {
          setGridSapSummaryMarkdown("");
          setGridSapPlaceHints([]);
          setGridSapKeywordWeights([]);
          setGridSapParsedRows([]);
          notify.warning(notifyGridCsvSapScanX(gridSapRes.error));
        }

        const parsed = parseCompetitorGridTopPlaces(csvText);
        if (parsed.error) {
          throw new Error(parsed.error);
        }

        let baseSemrush: CompetitorResearchSemrushResponse;
        if (semrushData) {
          baseSemrush = semrushData;
        } else {
          const srRaw = await fetchCompetitorResearchForTab({
            semrushEnhanced: LOCAL_ORGANIC_SOURCE,
            siteUrl: seedForApi,
            portfolioBlockedHosts: effectivePortfolioHosts,
            displayLimit: 50,
          });
          if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
            return;
          }
          if (srRaw.errors?.length) {
            notify.warning(srRaw.errors.map((e) => e.message).join("; "));
          }
          const sr = filterMainCompetitorResearchResponse(srRaw);
          baseSemrush = {
            ...sr,
            rows: [],
            enrichmentByDomain: {},
            domainOrganicCsvByDomain: {},
          };
          setSemrushData(baseSemrush);
        }
        const seedKey = normalizeCompetitorDomainKey(seedForApi);
        const seen = new Set<string>();
        const toFetch: string[] = [];

        setGridCsvProgress(`Researching ${parsed.places.length} place(s) from the grid…`);
        const dfsResults = await fetchGridCompetitorHostnamesParallel(parsed.places);
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          return;
        }
        for (const { place, host, error } of dfsResults) {
          if (error) {
            notify.error(notifyGridXXX(place.businessName, place.idLabel, error));
            continue;
          }
          if (!host) {
            notify.error(notifyGridXXNoWebsite(place.businessName, place.idLabel));
            continue;
          }
          if (isNonMainCompetitorDomain(host)) {
            notify.warning(notifyGridSkipX(host));
            continue;
          }
          const dk = normalizeCompetitorDomainKey(host);
          if (!dk || dk === seedKey) {
            continue;
          }
          if (isPortfolioBlockedHost(dk, effectivePortfolioHosts)) {
            continue;
          }
          if (seen.has(dk)) {
            continue;
          }
          seen.add(dk);
          toFetch.push(host);
        }

        if (toFetch.length === 0) {
          notify.warning(NOTIFY_NO_NEW_COMPETITORS_FROM_GRID);
          return;
        }

        let merged: CompetitorResearchSemrushResponse = {
          ...baseSemrush,
          rows: [...baseSemrush.rows],
          enrichmentByDomain: { ...(baseSemrush.enrichmentByDomain ?? {}) },
          domainOrganicCsvByDomain: { ...(baseSemrush.domainOrganicCsvByDomain ?? {}) },
        };
        const gridImportedDomainKeys: string[] = [];
        let semrushNewRows = 0;
        let semrushRefreshedRows = 0;

        type GridRowResult =
          | {
              ok: true;
              domainForApi: string;
              row: Awaited<ReturnType<typeof fetchManualCompetitorDomainForTab>>["row"];
              enrichment: Awaited<ReturnType<typeof fetchManualCompetitorDomainForTab>>["enrichment"];
              domainOrganicCsv: string;
              manualErrors?: Awaited<ReturnType<typeof fetchManualCompetitorDomainForTab>>["errors"];
            }
          | { ok: false; domainForApi: string; message: string };

        const rowResults: GridRowResult[] = [];
        for (let i = 0; i < toFetch.length; i++) {
          const domainForApi = toFetch[i]!;
          setGridCsvProgress(`Research ${i + 1}/${toFetch.length} (${domainForApi})…`);
          try {
            const { row, enrichment, domainOrganicCsv, errors: manualErrors } = await fetchManualCompetitorDomainForTab({
              semrushEnhanced: LOCAL_ORGANIC_SOURCE,
              domain: domainForApi,
              siteUrl: seedForApi,
            });
            rowResults.push({ ok: true, domainForApi, row, enrichment, domainOrganicCsv, manualErrors });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            rowResults.push({ ok: false, domainForApi, message: msg });
          }
        }
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          return;
        }
        let mergedRows = [...merged.rows];
        let enrichmentByDomain = { ...(merged.enrichmentByDomain ?? {}) };
        let domainOrganicCsvByDomain = { ...(merged.domainOrganicCsvByDomain ?? {}) };
        for (const r of rowResults) {
          if (r.ok === false) {
            notify.error(notifyResearchXX(r.domainForApi, r.message));
            continue;
          }
          if (r.manualErrors?.length) {
            notify.warning(r.manualErrors.map((e) => e.message).join("; "));
          }
          const dk = normalizeCompetitorDomainKey(r.row.domain);
          gridImportedDomainKeys.push(dk);
          const csvRow =
            r.domainOrganicCsv.trim() ||
            buildDomainOrganicCsvFromKeywordRows(r.enrichment.topKeywords, DOMAIN_ORGANIC_CSV_TOP_ROWS);
          const existingIdx = mergedRows.findIndex((row) => normalizeCompetitorDomainKey(row.domain) === dk);
          if (existingIdx >= 0) {
            mergedRows = mergedRows.map((row, i) => (i === existingIdx ? r.row : row));
            semrushRefreshedRows++;
          } else {
            mergedRows = [...mergedRows, r.row];
            semrushNewRows++;
          }
          enrichmentByDomain = { ...enrichmentByDomain, [dk]: r.enrichment };
          domainOrganicCsvByDomain = { ...domainOrganicCsvByDomain, [dk]: csvRow };
        }
        merged = {
          ...merged,
          rows: mergedRows,
          enrichmentByDomain,
          domainOrganicCsvByDomain,
        };
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          return;
        }
        setSemrushData(merged);
        const tieredRaw = await runCompetitorTierAgent(merged, {
          siteId: tierSiteId,
          siteName: tierSiteName,
          seedSiteUrl: seedForApi,
          semrushDatabase: merged.database,
          gscSiteQueries: gscQueries.length > 0 ? gscQueries : undefined,
          gscDateRange: gscDateRange ?? null,
        });
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          return;
        }
        const tiered = mergeGridCompetitorsAsDirectTier(tieredRaw, gridImportedDomainKeys, merged.rows);
        setTiers(tiered);
        if (semrushNewRows > 0 && semrushRefreshedRows > 0) {
          notify.success(
            `Added ${semrushNewRows} competitor(s) from grid CSV; updated ${semrushRefreshedRows} already listed.`,
          );
        } else if (semrushNewRows > 0) {
          notify.success(notifyAddedXCompetitorSFromGridCsv(semrushNewRows));
        } else if (semrushRefreshedRows > 0) {
          notify.success(notifyUpdatedXCompetitorSFromGridCsvWer(semrushRefreshedRows));
        } else {
          notify.success(NOTIFY_GRID_IMPORT_DONE);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setGridCsvBusy(false);
        setGridCsvProgress(null);
        if (gridCsvFileRef.current) gridCsvFileRef.current.value = "";
      }
    },
    [
      semrushData,
      site,
      effectivePortfolioHosts,
      gscQueries,
      gscDateRange,
      workspaceMode,
      effectiveSeedUrl,
      neutralResearchWire,
      workspaceKey,
      activeWorkspaceKeyRef, setError, setSemrushData, setTiers,
    ],
  );

  const onGridCsvFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      void importDominatorGridCsv(f);
    },
    [importDominatorGridCsv],
  );

  return { gridCsvBusy, gridCsvProgress, gridSapSummaryMarkdown, setGridSapSummaryMarkdown, gridSapPlaceHints, setGridSapPlaceHints, gridSapKeywordWeights, setGridSapKeywordWeights, gridSapParsedRows, setGridSapParsedRows, gridCsvFileRef, onGridCsvFileChange, downloadGridCsv };
}
