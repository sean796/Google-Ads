import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchCompetitorResearchForTab,
  fetchManualCompetitorDomainForTab,
} from "@/lib/competitor-research/competitor-research-fetch";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import { filterMainCompetitorResearchResponse } from "@/lib/competitor-research/filter-main-competitor-rows";
import { runCompetitorTierAgent } from "@/lib/competitor-research/competitor-tier-agent";
import { parseCompetitorGridTopPlaces } from "@/lib/competitor-research/local-dominator-grid-parse";
import { fetchGridCompetitorHostnamesParallel } from "@/lib/competitor-research/competitor-grid-dfs-client";
import { mergeGridCompetitorsAsDirectTier } from "@/lib/competitor-research/competitor-grid-tier-merge";
import { isNonMainCompetitorDomain } from "@/lib/competitor-research/filter-main-competitor-rows";
import type { CompetitorResearchSemrushResponse, TieredCompetitorsResult } from "@/lib/competitor-research/types";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ADD_COMPETITORS, NOTIFY_ALL_LINES_WERE_ALREADY_IN_THE_LIST, NOTIFY_COULD_NOT_COPY, NOTIFY_ENTER_AT_LEAST_ONE_DOMAIN_OR_URL_ONE_PER, NOTIFY_ENTER_A_SEED_SITE_URL, NOTIFY_ENTER_A_SEED_SITE_URL_FIRST, NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM, NOTIFY_EVERY_OVERLAPPING_DOMAIN_WAS_A_MEGA_PLAT, NOTIFY_GENERATE_A_REPORT_FIRST, NOTIFY_GENERATE_REPORT_FIRST, NOTIFY_GRID_IMPORT_DONE, NOTIFY_NO_COMPETITORS_RETURNED, NOTIFY_NO_COMPETITOR_ROWS_RETURNED_FOR_THIS_DOM, NOTIFY_NO_NEW_COMPETITORS_FROM_GRID, NOTIFY_NO_NEW_COMPETITORS_WERE_ADDED, NOTIFY_REPORT_GENERATED, NOTIFY_RUN_ANALYZE_AGAIN, NOTIFY_RUN_ANALYZE_FIRST, NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR, NOTIFY_SELECT_A_CONNECTED_SITE, NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL, notifyAddedXFromGrid, notifyDfsSkipX, notifyDfsXXNoWebsite, notifyDfsXXX, notifyExcludedXNonCompetitorDomainSEGY, notifyFileTooLargeMaxXMb, notifyGridImportXUpdatedX, notifyGscRelevanceFilterRemovedXCompetito, notifyGscX, notifySeedMetricsReadyX, notifySkippedInvalidLineXx, notifyUpdatedXFromGrid, notifyXDuplicateLineSSkippedAlreadyQueue, notifyXLineSCouldNotBeParsedAsADomain, notifyXLineSSkippedAlreadyInTheTable, notifyXLineSSkippedPortfolioBlocklist, notifyXLineSSkippedSameAsYourSeedSite, notifyCompetitorDataSourceWarning, notifyXX2, notifyXXX2 } from "@/lib/notify-messages";
import { MAX_LOCAL_CSV_FILE_BYTES } from "@/lib/local-dominator-csv";
import {
  buildDomainOrganicCsvFromKeywordRows,
  DOMAIN_ORGANIC_CSV_TOP_ROWS,
} from "@/lib/competitor-research/competitor-domain-organic-csv";
import {
  fmtSeedMoney,
  fmtSeedNum,
  formatCompetitorReportTabProgressLine,
  formatOpenRouterPayloadBytes,  isPortfolioBlockedHost,
  REPORT_SUMMARIZE_WAIT_HINTS,
  REPORT_WRITE_WAIT_HINTS,
  safeDomainForFilename,  splitCompetitorInputLines,
  STRATEGIST_SECTION_LABELS,
  triggerDownloadCsv,
} from "@/components/research/competitor/competitor-research-tab-helpers";
import {
  GscStatusLabel,
  SeedMetricsStrip,
  SeedOverviewStrip,
} from "@/components/research/competitor/competitor-research-tab-components";
import type { CompetitorResearchState } from "@/components/research/competitor/use-competitor-research-state";

export function useCompetitorManualAdds(s: CompetitorResearchState) {
  const {
    competitorWorkspaceMode,
    site,
    workspaceKey,
    activeWorkspaceKeyRef,
    effectiveSeedUrl,
    effectivePortfolioHosts,
    neutralResearchWire,
    semrushData,
    setSemrushData,
    gscQueries,
    gscDateRange,
    setTiers,
    setPhase,
    error,
    setError,
    manualDomainInput,
    setManualDomainInput,
    pendingManualDomains,
    setPendingManualDomains,
    analyzeMode,
    semrushEnhanced,
    setGridCsvBusy,
    setGridCsvProgress,
    gridCsvFileRef,
  } = s;
const addManualCompetitor = useCallback(async () => {
  if (competitorWorkspaceMode === "connected") {
    if (!site?.siteUrl?.trim()) {
      notify.error(NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL);
      return;
    }
  } else if (!effectiveSeedUrl) {
    notify.error(NOTIFY_ENTER_A_SEED_SITE_URL_FIRST);
    return;
  }
  const runKeySnapshot = workspaceKey;
  const seedForApi = effectiveSeedUrl;
  const tierSiteId = neutralResearchWire ? undefined : site?.id;
  const tierSiteName = neutralResearchWire ? undefined : site?.name;
  const lines = splitCompetitorInputLines(manualDomainInput);
  if (lines.length === 0) {
    notify.error(NOTIFY_ENTER_AT_LEAST_ONE_DOMAIN_OR_URL_ONE_PER);
    return;
  }

  if (analyzeMode === "manual" && !semrushData) {
    const seedKey = normalizeCompetitorDomainKey(seedForApi);
    const seen = new Set(pendingManualDomains.map((p) => normalizeCompetitorDomainKey(p)));
    const next: string[] = [...pendingManualDomains];
    let added = 0;
    let skippedDup = 0;
    let skippedSeed = 0;
    let skippedPortfolio = 0;
    let skippedInvalid = 0;

    for (const raw of lines) {
      const dk = normalizeCompetitorDomainKey(raw);
      if (!dk) {
        skippedInvalid++;
        continue;
      }
      if (dk === seedKey) {
        skippedSeed++;
        continue;
      }
      if (isPortfolioBlockedHost(dk, effectivePortfolioHosts)) {
        skippedPortfolio++;
        continue;
      }
      if (seen.has(dk)) {
        skippedDup++;
        continue;
      }
      seen.add(dk);
      next.push(raw);
      added++;
    }

    setPendingManualDomains(next);
    setManualDomainInput("");
    if (added > 0) {
      notify.success(
        added === 1
          ? `Queued ${normalizeCompetitorDomainKey(lines[0]) || lines[0]}`
          : `Queued ${added} competitor(s).`,
      );
    }
    if (skippedInvalid > 0) {
      notify.warning(notifyXLineSCouldNotBeParsedAsADomain(skippedInvalid));
    }
    if (skippedSeed > 0) {
      notify.info(notifyXLineSSkippedSameAsYourSeedSite(skippedSeed));
    }
    if (skippedPortfolio > 0) {
      notify.info(notifyXLineSSkippedPortfolioBlocklist(skippedPortfolio));
    }
    if (skippedDup > 0) {
      notify.info(notifyXDuplicateLineSSkippedAlreadyQueue(skippedDup));
    }
    return;
  }

  if (!semrushData) {
    notify.error(NOTIFY_RUN_ANALYZE_FIRST);
    return;
  }

  setError(null);
  try {
    setPhase("manual");
    let merged: CompetitorResearchSemrushResponse = semrushData;
    let fetchOk = 0;
    let skippedInTable = 0;

    for (const raw of lines) {
      const dk = normalizeCompetitorDomainKey(raw);
      if (!dk) {
        notify.warning(notifySkippedInvalidLineXx(raw.slice(0, 64), raw.length > 64 ? "…" : ""));
        continue;
      }
      if (merged.rows.some((r) => normalizeCompetitorDomainKey(r.domain) === dk)) {
        skippedInTable++;
        continue;
      }
      try {
        const { row, enrichment, domainOrganicCsv, errors: manualErrors } = await fetchManualCompetitorDomainForTab({
          semrushEnhanced,
          domain: raw,
          siteUrl: seedForApi,
        });
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          setPhase("idle");
          return;
        }
        if (manualErrors?.length) {
          notify.warning(manualErrors.map((e) => e.message).join("; "));
        }
        const csvForRow =
          domainOrganicCsv.trim() ||
          buildDomainOrganicCsvFromKeywordRows(enrichment.topKeywords, DOMAIN_ORGANIC_CSV_TOP_ROWS);
        merged = {
          ...merged,
          rows: [...merged.rows, row],
          enrichmentByDomain: {
            ...(merged.enrichmentByDomain ?? {}),
            [dk]: enrichment,
          },
          domainOrganicCsvByDomain: {
            ...(merged.domainOrganicCsvByDomain ?? {}),
            [dk]: csvForRow,
          },
        };
        fetchOk++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        notify.error(notifyXX2(dk, msg));
      }
    }

    if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
      setPhase("idle");
      return;
    }

    setSemrushData(merged);
    setManualDomainInput("");

    if (skippedInTable > 0) {
      notify.info(notifyXLineSSkippedAlreadyInTheTable(skippedInTable));
    }

    if (fetchOk > 0) {
      const tiered = await runCompetitorTierAgent(merged, {
        siteId: tierSiteId,
        siteName: tierSiteName,
        seedSiteUrl: seedForApi,
        semrushDatabase: merged.database,
        gscSiteQueries: gscQueries.length > 0 ? gscQueries : undefined,
        gscDateRange: gscDateRange ?? null,
      });
      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        return;
      }
      setTiers(tiered);
      notify.success(fetchOk === 1 ? `Added ${normalizeCompetitorDomainKey(lines[0]) || lines[0]}` : `Added ${fetchOk} competitor(s).`);
    } else if (skippedInTable === lines.length) {
      notify.info(NOTIFY_ALL_LINES_WERE_ALREADY_IN_THE_LIST);
    } else if (lines.length > 0 && fetchOk === 0) {
      notify.warning(NOTIFY_NO_NEW_COMPETITORS_WERE_ADDED);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setError(msg);
  } finally {
    setPhase("idle");
  }
}, [
  semrushData,
  site,
  manualDomainInput,
  gscQueries,
  gscDateRange,
  semrushEnhanced,
  analyzeMode,
  pendingManualDomains,
  effectivePortfolioHosts,
  competitorWorkspaceMode,
  effectiveSeedUrl,
  neutralResearchWire,
  workspaceKey,
activeWorkspaceKeyRef, setError, setManualDomainInput, setPendingManualDomains, setPhase, setSemrushData, setTiers]);

const importDominatorGridCsv = useCallback(
  async (file: File) => {
    if (competitorWorkspaceMode === "connected") {
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
      const parsed = parseCompetitorGridTopPlaces(csvText);
      if (parsed.error) {
        throw new Error(parsed.error);
      }

      let baseSemrush: CompetitorResearchSemrushResponse;
      if (semrushData) {
        baseSemrush = semrushData;
      } else {
        const srRaw = await fetchCompetitorResearchForTab({
          semrushEnhanced,
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

      setGridCsvProgress(`DataForSEO: resolving ${parsed.places.length} place(s) in parallel…`);
      const dfsResults = await fetchGridCompetitorHostnamesParallel(parsed.places);
      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        return;
      }
      for (const { place, host, error } of dfsResults) {
        if (error) {
          notify.error(notifyDfsXXX(place.businessName, place.idLabel, error));
          continue;
        }
        if (!host) {
          notify.error(notifyDfsXXNoWebsite(place.businessName, place.idLabel));
          continue;
        }
        if (isNonMainCompetitorDomain(host)) {
          notify.warning(notifyDfsSkipX(host));
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
      setPhase("manual");
      let merged: CompetitorResearchSemrushResponse = {
        ...baseSemrush,
        rows: [...baseSemrush.rows],
        enrichmentByDomain: { ...(baseSemrush.enrichmentByDomain ?? {}) },
        domainOrganicCsvByDomain: { ...(baseSemrush.domainOrganicCsvByDomain ?? {}) },
      };
      const gridImportedDomainKeys: string[] = [];
      let semrushNewRows = 0;
      let semrushRefreshedRows = 0;
      type SemrushGridRowResult =
        | {
            ok: true;
            domainForApi: string;
            row: Awaited<ReturnType<typeof fetchManualCompetitorDomainForTab>>["row"];
            enrichment: Awaited<ReturnType<typeof fetchManualCompetitorDomainForTab>>["enrichment"];
            domainOrganicCsv: string;
            manualErrors?: Awaited<ReturnType<typeof fetchManualCompetitorDomainForTab>>["errors"];
          }
        | { ok: false; domainForApi: string; message: string };
      const semrushResults: SemrushGridRowResult[] = [];
      for (let i = 0; i < toFetch.length; i++) {
        const domainForApi = toFetch[i];
        setGridCsvProgress(
        `${semrushEnhanced ? "Semrush" : "DataForSEO"}: ${i + 1}/${toFetch.length} (${domainForApi})…`,
      );
        try {
          const { row, enrichment, domainOrganicCsv, errors: manualErrors } = await fetchManualCompetitorDomainForTab({
            semrushEnhanced,
            domain: domainForApi,
            siteUrl: seedForApi,
          });
          semrushResults.push({ ok: true, domainForApi, row, enrichment, domainOrganicCsv, manualErrors });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          semrushResults.push({ ok: false, domainForApi, message: msg });
        }
      }
      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        return;
      }
      let mergedRows = [...merged.rows];
      let enrichmentByDomain = { ...(merged.enrichmentByDomain ?? {}) };
      let domainOrganicCsvByDomain = { ...(merged.domainOrganicCsvByDomain ?? {}) };
      for (const r of semrushResults) {
        if (r.ok === false) {
          notify.error(notifyXXX2(semrushEnhanced ? "Semrush" : "DataForSEO", r.domainForApi, r.message));
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
        setPhase("idle");
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
        setPhase("idle");
        return;
      }
      const tiered = mergeGridCompetitorsAsDirectTier(tieredRaw, gridImportedDomainKeys, merged.rows);
      setTiers(tiered);
      if (semrushNewRows > 0 && semrushRefreshedRows > 0) {
        notify.success(notifyGridImportXUpdatedX(semrushNewRows, semrushRefreshedRows));
      } else if (semrushNewRows > 0) {
        notify.success(notifyAddedXFromGrid(semrushNewRows));
      } else if (semrushRefreshedRows > 0) {
        notify.success(notifyUpdatedXFromGrid(semrushRefreshedRows));
      } else {
        notify.success(NOTIFY_GRID_IMPORT_DONE);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setPhase("idle");
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
    semrushEnhanced,
    competitorWorkspaceMode,
    effectiveSeedUrl,
    neutralResearchWire,
    workspaceKey,
    activeWorkspaceKeyRef,
    gridCsvFileRef,
    setError,
    setGridCsvBusy,
    setGridCsvProgress,
    setPhase,
    setSemrushData,
    setTiers,
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
  return { addManualCompetitor, importDominatorGridCsv, onGridCsvFileChange };
}
