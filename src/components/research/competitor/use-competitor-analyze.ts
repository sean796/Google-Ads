import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchCompetitorResearchForTab,
  fetchManualCompetitorDomainForTab,
} from "@/lib/competitor-research/competitor-research-fetch";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import {
  fetchCompetitorGscQueries,
  getDefaultGscCompetitorDateRange,
  isGscSiteNotInListFailure,
  type FetchCompetitorGscQueriesResult,
} from "@/lib/competitor-research/competitor-gsc-queries";
import { buildDemandQueriesFromSeedKeywords } from "@/lib/competitor-research/competitor-seed-demand-as-gq";
import { filterMainCompetitorResearchResponse } from "@/lib/competitor-research/filter-main-competitor-rows";
import { filterCompetitorsByGscRelevance } from "@/lib/competitor-research/filter-competitors-by-gsc-relevance";
import { runCompetitorTierAgent } from "@/lib/competitor-research/competitor-tier-agent";
import type { CompetitorResearchSemrushResponse, TieredCompetitorsResult } from "@/lib/competitor-research/types";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ADD_COMPETITORS, NOTIFY_ALL_LINES_WERE_ALREADY_IN_THE_LIST, NOTIFY_COULD_NOT_COPY, NOTIFY_ENTER_AT_LEAST_ONE_DOMAIN_OR_URL_ONE_PER, NOTIFY_ENTER_A_SEED_SITE_URL, NOTIFY_ENTER_A_SEED_SITE_URL_FIRST, NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM, NOTIFY_EVERY_OVERLAPPING_DOMAIN_WAS_A_MEGA_PLAT, NOTIFY_GENERATE_A_REPORT_FIRST, NOTIFY_GENERATE_REPORT_FIRST, NOTIFY_GRID_IMPORT_DONE, NOTIFY_NO_COMPETITORS_RETURNED, NOTIFY_NO_COMPETITOR_ROWS_RETURNED_FOR_THIS_DOM, NOTIFY_NO_NEW_COMPETITORS_FROM_GRID, NOTIFY_NO_NEW_COMPETITORS_WERE_ADDED, NOTIFY_REPORT_GENERATED, NOTIFY_RUN_ANALYZE_AGAIN, NOTIFY_RUN_ANALYZE_FIRST, NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR, NOTIFY_SELECT_A_CONNECTED_SITE, NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL, notifyAddedXFromGrid, notifyDfsSkipX, notifyDfsXXNoWebsite, notifyDfsXXX, notifyExcludedXNonCompetitorDomainSEGY, notifyFileTooLargeMaxXMb, notifyGridImportXUpdatedX, notifyGscRelevanceFilterRemovedXCompetito, notifyGscX, notifySeedMetricsReadyX, notifySkippedInvalidLineXx, notifyUpdatedXFromGrid, notifyXDuplicateLineSSkippedAlreadyQueue, notifyXLineSCouldNotBeParsedAsADomain, notifyXLineSSkippedAlreadyInTheTable, notifyXLineSSkippedPortfolioBlocklist, notifyXLineSSkippedSameAsYourSeedSite, notifyCompetitorDataSourceWarning, notifyXX2, notifyXXX2 } from "@/lib/notify-messages";
import {
  buildDomainOrganicCsvFromKeywordRows,
  DOMAIN_ORGANIC_CSV_TOP_ROWS,
} from "@/lib/competitor-research/competitor-domain-organic-csv";
import type { CompetitorResearchState } from "@/components/research/competitor/use-competitor-research-state";

export function useCompetitorAnalyze(s: CompetitorResearchState) {
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
    setGscQueries,
    gscDateRange,
    setGscDateRange,
    setGscError,
    setGscSkippedNotInList,
    tiers,
    setTiers,
    setReportMd,
    setPhase,
    error,
    setError,
    setSelectedCompetitorKeys,
    pendingManualDomains,
    setPendingManualDomains,
    analyzeMode,
    semrushEnhanced,
  } = s;
const analyze = useCallback(async () => {
  if (competitorWorkspaceMode === "connected") {
    if (!site?.siteUrl?.trim()) {
      notify.error(NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL);
      return;
    }
  } else if (!effectiveSeedUrl) {
    notify.error(NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM);
    return;
  }
  const runKeySnapshot = workspaceKey;
  const seedForApi = effectiveSeedUrl;
  const pendingForThisRun = [...pendingManualDomains];
  const tierSiteId = neutralResearchWire ? undefined : site?.id;
  const tierSiteName = neutralResearchWire ? undefined : site?.name;
  setError(null);
  setReportMd(null);
  setTiers(null);
  setSemrushData(null);
  setGscQueries([]);
  setGscDateRange(null);
  setGscError(null);
  setGscSkippedNotInList(false);
  try {
    setPhase("semrush");
    let srRaw: Awaited<ReturnType<typeof fetchCompetitorResearchForTab>>;
    let gscRes: FetchCompetitorGscQueriesResult;

    if (neutralResearchWire) {
      srRaw = await fetchCompetitorResearchForTab({
        semrushEnhanced,
        siteUrl: seedForApi,
        portfolioBlockedHosts: effectivePortfolioHosts,
        displayLimit: 50,
      });
    } else {
      const [srR, gscR] = await Promise.all([
        fetchCompetitorResearchForTab({
          semrushEnhanced,
          siteUrl: seedForApi,
          portfolioBlockedHosts: effectivePortfolioHosts,
          displayLimit: 50,
        }),
        fetchCompetitorGscQueries({ siteUrl: seedForApi }),
      ]);
      srRaw = srR;
      gscRes = gscR;
    }

    if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
      setPhase("idle");
      return;
    }

    if (!neutralResearchWire) {
      setGscDateRange(gscRes.dateRange);
      if (gscRes.ok === false) {
        setGscQueries([]);
        if (isGscSiteNotInListFailure(gscRes)) {
          setGscError(null);
          setGscSkippedNotInList(true);
        } else {
          setGscError(gscRes.error);
          setGscSkippedNotInList(false);
          notify.warning(notifyGscX(gscRes.error));
        }
      } else {
        setGscQueries(gscRes.queries);
        setGscError(null);
        setGscSkippedNotInList(false);
      }
    }

    let sr = filterMainCompetitorResearchResponse(srRaw);

    if (neutralResearchWire) {
      const dr = getDefaultGscCompetitorDateRange();
      const demandGq = buildDemandQueriesFromSeedKeywords(sr.seedTopKeywords ?? []);
      gscRes = { ok: true, queries: demandGq, dateRange: dr };
      setGscDateRange(dr);
      setGscQueries(demandGq);
      setGscError(null);
      setGscSkippedNotInList(false);
    }
    if (sr.errors?.length) {
      const msg = sr.errors.map((e) => e.message).join("; ");
      notify.warning(notifyCompetitorDataSourceWarning(semrushEnhanced ? "Semrush" : "DataForSEO", msg));
    }
    if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
      setPhase("idle");
      return;
    }
    if (analyzeMode === "manual") {
      const seedOnly: typeof sr = {
        ...sr,
        rows: [],
        enrichmentByDomain: {},
        domainOrganicCsvByDomain: {},
      };
      setSemrushData(seedOnly);
      setTiers({
        summary: "Manual mode - add competitor domains below.",
        tiers: [],
      });

      const gscQueriesForTier =
        gscRes.ok && gscRes.queries.length > 0 ? gscRes.queries : undefined;
      const gscDateForTier = gscRes.ok ? gscRes.dateRange : null;

      if (pendingForThisRun.length === 0) {
        setPhase("idle");
        notify.success(NOTIFY_ADD_COMPETITORS);
        return;
      }

      setPhase("manual");
      let merged: CompetitorResearchSemrushResponse = seedOnly;
      for (let i = 0; i < pendingForThisRun.length; i++) {
        const raw = pendingForThisRun[i];
        if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
          setPhase("idle");
          return;
        }
        try {
          const { row, enrichment, domainOrganicCsv, errors: manualErrors } =
            await fetchManualCompetitorDomainForTab({
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
          const dk = normalizeCompetitorDomainKey(row.domain);
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
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          notify.error(
            `${semrushEnhanced ? "Semrush" : "DataForSEO"} (${normalizeCompetitorDomainKey(raw) || raw}): ${msg}`,
          );
        }
      }

      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        return;
      }

      setSemrushData(merged);
      setPendingManualDomains([]);
      const tiered = await runCompetitorTierAgent(merged, {
        siteId: tierSiteId,
        siteName: tierSiteName,
        seedSiteUrl: seedForApi,
        semrushDatabase: merged.database,
        gscSiteQueries: gscQueriesForTier,
        gscDateRange: gscDateForTier,
      });
      if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
        setPhase("idle");
        return;
      }
      setTiers(tiered);
      setPhase("idle");
      const added = merged.rows.length;
      if (added > 0) {
        notify.success(notifySeedMetricsReadyX(added));
      } else {
        notify.warning(NOTIFY_NO_COMPETITORS_RETURNED);
      }
      return;
    }
    if (srRaw.rows.length > 0 && sr.rows.length === 0) {
      setSemrushData(sr);
      setPhase("idle");
      notify.warning(
        "Every overlapping domain was a mega-platform (social, search, marketplaces, etc.). No main competitors left after filtering.",
      );
      return;
    }
    if (sr.rows.length < srRaw.rows.length) {
      notify.info(
        `Excluded ${srRaw.rows.length - sr.rows.length} non-competitor domain(s) (e.g. YouTube, Facebook, Reddit).`,
      );
    }
    if (gscRes.ok && gscRes.queries.length > 0) {
      const beforeGsc = sr.rows.length;
      sr = filterCompetitorsByGscRelevance(sr, gscRes.queries);
      if (sr.rows.length < beforeGsc) {
        notify.info(notifyGscRelevanceFilterRemovedXCompetito(beforeGsc - sr.rows.length));
      }
    }
    if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
      setPhase("idle");
      return;
    }
    setSemrushData(sr);
    if (!sr.rows.length) {
      setPhase("idle");
      notify.info(NOTIFY_NO_COMPETITOR_ROWS_RETURNED_FOR_THIS_DOM);
      return;
    }
    setPhase("tiers");
    const tiered = await runCompetitorTierAgent(sr, {
      siteId: tierSiteId,
      siteName: tierSiteName,
      seedSiteUrl: seedForApi,
      semrushDatabase: sr.database,
      gscSiteQueries: gscRes.ok && gscRes.queries.length > 0 ? gscRes.queries : undefined,
      gscDateRange: gscRes.ok ? gscRes.dateRange : null,
    });
    if (activeWorkspaceKeyRef.current !== runKeySnapshot) {
      setPhase("idle");
      return;
    }
    setTiers(tiered);
    setPhase("idle");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setError(msg);
    setPhase("idle");
  }
}, [
  competitorWorkspaceMode,
  effectiveSeedUrl,
  effectivePortfolioHosts,
  neutralResearchWire,
  site,
  workspaceKey,
  analyzeMode,
  semrushEnhanced,
  pendingManualDomains,
activeWorkspaceKeyRef, setError, setGscDateRange, setGscError, setGscQueries, setGscSkippedNotInList, setPendingManualDomains, setPhase, setReportMd, setSemrushData, setTiers]);

const toggleCompetitorSelection = useCallback((domainKey: string, selected: boolean) => {
  setSelectedCompetitorKeys((prev) => {
    const next = new Set(prev);
    if (selected) next.add(domainKey);
    else next.delete(domainKey);
    return next;
  });
}, [setSelectedCompetitorKeys]);

const toggleAllCompetitors = useCallback(
  (selected: boolean) => {
    if (!semrushData?.rows?.length) return;
    if (selected) {
      setSelectedCompetitorKeys(new Set(semrushData.rows.map((r) => normalizeCompetitorDomainKey(r.domain))));
    } else {
      setSelectedCompetitorKeys(new Set());
    }
  },
  [semrushData, setSelectedCompetitorKeys],
);
  return { analyze, toggleCompetitorSelection, toggleAllCompetitors };
}
