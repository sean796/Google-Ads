import { useCallback, useEffect, useMemo, useRef } from "react";
import { notify } from "@/lib/app-notifications";
import { hasMasterInstructions } from "@/lib/master-instructions-storage";
import { buildLocalAnalysisClientAudienceMarkdown, getPrimaryLabelForWikipediaAugment } from "@/lib/local-analysis-metro-context";
import { LOCAL_ANALYSIS_DEFAULT_SAP_PAGES as DEFAULT_SAP_PAGES } from "@/lib/local-analysis-target-constants";

import { LA_SESSION_KEY, PER_ROW_SAP_DEFAULT, newTargetRowId, type KeywordTargetRow, type LocalAnalysisWorkspaceControls, type SapGeneratorLocalWorkspaceMode, type WikiCellState } from "@/components/sap-generator/local-analysis-helpers";
import { localAnalysisInventoryStorageKey } from "@/lib/local-analysis-suggest-from-inventory";
import { clearEntityGridCsv } from "@/lib/local-analysis/entity-grid-csv-store";
import { revokeBulkSitemapInventoryLinks } from "@/lib/bulk/bulk-sitemap-inventory-session";
import { revokeBulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import { getPrimaryCityStateLabel } from "@/lib/primary-location-from-site";
import { canUseBlindMagicKeywordOption } from "@/lib/local-analysis/blind-magic-peer-gsc";
import { lookupEntityHintWikipedia } from "@/lib/wikipedia-api";
import { DEFAULT_ENTITY_GEOGRAPHIC_LEVEL, DEFAULT_ENTITY_TYPE_FOCUS, entityTypesForLevel } from "@/lib/entity-geographic-level";

export type {
  KeywordTargetRow,
  LocalAnalysisWorkspaceControls,
  SapGeneratorLocalWorkspaceMode,
} from "@/components/sap-generator/local-analysis-helpers";

/** Per-keyword SAP default for new rows (not the campaign total in DEFAULT_SAP_PAGES). */
import type { LocalAnalysisState } from "@/components/sap-generator/use-local-analysis-state";

export function useLocalAnalysisEffects(s: LocalAnalysisState) {
  const {
    site,
    workspace,
    portfolioSites,
    setUploadLabel,
    setGridSummaryMarkdown,
    setGridKeywordWeights,
    setGridPlaceWeaknessWeights,
    setCsvPlaceHints,
    gridCsvFullText,
    setGridCsvFullText,
    businessName,
    setBusinessName,
    keywordTargets,
    setKeywordTargets,
    setSapRows,
    setEntitySelectedRowIndices,
    sitemapLinksRef,
    gscLinkRef,
    setStrategyMarkdown,
    setQuestionsByKeyword,
    setSuggestLoading,
    setHeaderProgress,
    setPipelineErrorMessage,
    setSitePrepLoading,
    setEntityTotalCountInput,
    suggestFocusKeyword,
    setSuggestFocusKeyword,
    suggestFocusLocation,
    setSuggestFocusLocation,
    setUseBlindMagicKeywords,
    entityGeographicLevel,
    setEntityGeographicLevel,
    entityTypeFocus,
    setEntityTypeFocus,
    setWikiByTargetId,
    setWikiBySapRowIndex,
    wikiHintCacheRef,
    setPrimaryWikiAugmentLabel,
    granularPoolTitles,
    setGranularPoolTitles,
    isTempWorkspace,
    neighbourhoodPlanGenerationRef,
    placeWeaknessForSuggest,
    mergedWikipediaSearchAugment,
    loadSitePrep,
  } = s;

useEffect(() => {
  let cancelled = false;
  setSitePrepLoading(true);
  void loadSitePrep()
    .then(() => {
      if (!cancelled) setPipelineErrorMessage(null);
    })
    .catch((e) => {
      if (!cancelled) {
        setPipelineErrorMessage(e instanceof Error ? e.message : "Site prep failed");
      }
    })
    .finally(() => {
      if (!cancelled) setSitePrepLoading(false);
    });
  return () => {
    cancelled = true;
  };
}, [site.id, loadSitePrep, setPipelineErrorMessage, setSitePrepLoading]);

const clientAudienceContextMarkdown = useMemo(() => {
  let inv: { title: string; keyword: string }[] | undefined;
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(localAnalysisInventoryStorageKey(site.id));
      if (raw) {
        const trimmed = raw.trim();
        if (!trimmed) {
          /* empty */
        } else if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
          inv = trimmed
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 12)
            .map((keyword) => ({ title: keyword, keyword }));
        } else {
          const p = JSON.parse(raw) as
            | string[]
            | { posts?: Array<{ title?: string; fields?: { title?: string; keyword?: string } }> };
          if (Array.isArray(p) && p.length > 0 && typeof p[0] === "string") {
            inv = p.slice(0, 12).map((keyword) => ({
              title: keyword.trim(),
              keyword: keyword.trim(),
            }));
          } else if (!Array.isArray(p) && p.posts?.length) {
            inv = p.posts.slice(0, 12).map((post) => ({
              title: post.title ?? post.fields?.title ?? "",
              keyword: post.fields?.keyword ?? "",
            }));
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  const name = businessName.trim() || site.name?.trim();
  return buildLocalAnalysisClientAudienceMarkdown({
    ...(name ? { businessName: name } : {}),
    siteName: site.name,
    siteUrl: isTempWorkspace ? workspace.tempSeedUrl : site.siteUrl,
    focusKeyword: suggestFocusKeyword,
    focusLocation: suggestFocusLocation,
    entityGeographicLevel,
    ...(entityTypeFocus.length > 0 ? { entityTypeFocusLabels: entityTypeFocus } : {}),
    inventorySample: inv,
    themeMixGovernedByMasterRules: !isTempWorkspace && hasMasterInstructions(site.id),
  }).trim();
}, [
  businessName,
  site.name,
  site.siteUrl,
  site.id,
  isTempWorkspace,
  workspace.tempSeedUrl,
  suggestFocusKeyword,
  suggestFocusLocation,
  entityGeographicLevel,
  entityTypeFocus,
]);

const canOpenDetails = true;

useEffect(() => {
  return () => {
    revokeBulkSitemapInventoryLinks(sitemapLinksRef.current);
    sitemapLinksRef.current = [];
    revokeBulkGscKeywordsHostedLink(gscLinkRef.current);
    gscLinkRef.current = null;
  };
}, [site.id, gscLinkRef, sitemapLinksRef]);

const granularPoolTitlesKey = useMemo(() => granularPoolTitles.slice(0, 400).join("\t"), [granularPoolTitles]);

const localAnalysisWikiLookupOptions = useMemo(
  () => ({
    siteId: site.id,
    wikipediaSearchAugment: mergedWikipediaSearchAugment,
    ...(granularPoolTitles.length > 0 ? { preferredTitles: granularPoolTitles } : {}),
    ...(placeWeaknessForSuggest.length > 0 ? { gridPlaceWeights: placeWeaknessForSuggest } : {}),
  }),
  [site.id, mergedWikipediaSearchAugment, granularPoolTitles, placeWeaknessForSuggest]
);

useEffect(() => {
  let cancelled = false;
  void getPrimaryLabelForWikipediaAugment(site).then((label) => {
    if (cancelled || !label?.trim()) return;
    setPrimaryWikiAugmentLabel(label.trim());
  });
  return () => {
    cancelled = true;
  };
}, [site, setPrimaryWikiAugmentLabel]);

useEffect(() => {
  const fromProfile = getPrimaryCityStateLabel(site)?.trim() ?? "";
  setPrimaryWikiAugmentLabel(fromProfile || undefined);
  setGranularPoolTitles([]);
  setEntityTotalCountInput("");
  setSuggestFocusLocation("");
  setSuggestFocusKeyword("");
}, [site.id]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed by site id; full `site` would churn

useEffect(() => {
  setUseBlindMagicKeywords(canUseBlindMagicKeywordOption(portfolioSites, site));
}, [site.id, portfolioSites]); // eslint-disable-line react-hooks/exhaustive-deps -- availability keyed by site id + live portfolio list

useEffect(() => {
  const allowed = new Set(entityTypesForLevel(entityGeographicLevel));
  setEntityTypeFocus((prev) => {
    const next = prev.filter((t) => allowed.has(t));
    return next.length === prev.length ? prev : next;
  });
}, [entityGeographicLevel, setEntityTypeFocus]);

const keywordTargetsRef = useRef(keywordTargets);
keywordTargetsRef.current = keywordTargets;

useEffect(() => {
  wikiHintCacheRef.current.clear();
}, [site.id, gridCsvFullText, mergedWikipediaSearchAugment, granularPoolTitlesKey, wikiHintCacheRef]);

useEffect(() => {
  if (!isTempWorkspace && site.name?.trim()) {
    setBusinessName((prev) => (prev === "" ? site.name.trim() : prev));
  }
}, [isTempWorkspace, site.id, site.name, setBusinessName]);

const targetsWikiKey = useMemo(
  () =>
    JSON.stringify(
      keywordTargets
        .filter((r) => r.clusterRole !== "member")
        .map((r) => ({ id: r.id, h: r.entityHint }))
    ),
  [keywordTargets]
);

/* eslint-disable react-hooks/exhaustive-deps -- keywordTargets summarized in targetsWikiKey */
useEffect(() => {
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const row of keywordTargets) {
    if (row.clusterRole === "member") continue;
    const hint = row.entityHint.trim();
    const { id } = row;
    if (!hint) {
      setWikiByTargetId((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      continue;
    }
    const cacheKey = `${hint.toLowerCase()}\t${mergedWikipediaSearchAugment ?? ""}\t${granularPoolTitlesKey}`;
    const cached = wikiHintCacheRef.current.get(cacheKey);
    if (cached?.status === "done") {
      setWikiByTargetId((prev) => ({ ...prev, [id]: cached }));
      continue;
    }
    const t = setTimeout(() => {
      setWikiByTargetId((prev) => ({ ...prev, [id]: { status: "loading" } }));
      void lookupEntityHintWikipedia(hint, localAnalysisWikiLookupOptions)
        .then((lookup) => {
          const current = keywordTargetsRef.current.find((r) => r.id === id)?.entityHint.trim();
          if (current !== hint) return;
          const done: WikiCellState = { status: "done", lookup };
          wikiHintCacheRef.current.set(cacheKey, done);
          setWikiByTargetId((prev) => ({ ...prev, [id]: done }));
        })
        .catch(() => {
          const current = keywordTargetsRef.current.find((r) => r.id === id)?.entityHint.trim();
          if (current !== hint) return;
          setWikiByTargetId((prev) => ({ ...prev, [id]: { status: "error" } }));
        });
    }, 450);
    timers.push(t);
  }
  return () => {
    timers.forEach(clearTimeout);
  };
}, [targetsWikiKey, site.id, mergedWikipediaSearchAugment, granularPoolTitlesKey, localAnalysisWikiLookupOptions]);
/* eslint-enable react-hooks/exhaustive-deps */

/** Leaving Entity (Forge tab switch) must not restore clusters/grid on return — same as Prompt workspace state. */
useEffect(() => {
  return () => {
    try {
      sessionStorage.removeItem(LA_SESSION_KEY(site.id));
      sessionStorage.removeItem(localAnalysisInventoryStorageKey(site.id));
    } catch {
      /* ignore */
    }
    void clearEntityGridCsv(site.id);
  };
}, [site.id]);

const resetAnalysisOutput = useCallback(() => {
  neighbourhoodPlanGenerationRef.current += 1;
  setSuggestLoading(false);
  setHeaderProgress(null);
  setSapRows([]);
  setEntitySelectedRowIndices(new Set());
  setStrategyMarkdown("");
  setQuestionsByKeyword({});
  setWikiBySapRowIndex({});
}, [neighbourhoodPlanGenerationRef, setEntitySelectedRowIndices, setHeaderProgress, setQuestionsByKeyword, setSapRows, setStrategyMarkdown, setSuggestLoading, setWikiBySapRowIndex]);

/** Full reset: grid upload, targets, generated SAP, strategies, and saved session for this site. */
const clearLocalAnalysis = useCallback(() => {
  resetAnalysisOutput();
  setWikiByTargetId({});
  setGridSummaryMarkdown("");
  setGridKeywordWeights([]);
  setGridPlaceWeaknessWeights([]);
  setCsvPlaceHints([]);
  setGridCsvFullText("");
  if (isTempWorkspace) {
    setBusinessName("");
  }
  setUploadLabel("");
  void clearEntityGridCsv(site.id);
  setKeywordTargets(() => {
    const cid = newTargetRowId();
    return [{ id: newTargetRowId(), keyword: "", entityHint: "", sapPages: PER_ROW_SAP_DEFAULT, clusterRole: "seed", clusterId: cid }];
  });
  setEntityTotalCountInput("");
  setSuggestFocusKeyword("");
  setSuggestFocusLocation("");
  setEntityGeographicLevel(DEFAULT_ENTITY_GEOGRAPHIC_LEVEL);
  setEntityTypeFocus([...DEFAULT_ENTITY_TYPE_FOCUS]);
  setHeaderProgress(null);
  setPipelineErrorMessage(null);
  try {
    sessionStorage.removeItem(LA_SESSION_KEY(site.id));
    sessionStorage.removeItem(localAnalysisInventoryStorageKey(site.id));
  } catch {
    /* ignore */
  }
  notify.message(
    isTempWorkspace
      ? "Local analysis reset."
      : "Grid and keyword targets cleared (business name kept for this site).",
    { duration: 4_000 },
  );
}, [resetAnalysisOutput, site.id, isTempWorkspace, setBusinessName, setCsvPlaceHints, setEntityGeographicLevel, setEntityTotalCountInput, setEntityTypeFocus, setGridCsvFullText, setGridKeywordWeights, setGridPlaceWeaknessWeights, setGridSummaryMarkdown, setHeaderProgress, setKeywordTargets, setPipelineErrorMessage, setSuggestFocusKeyword, setSuggestFocusLocation, setUploadLabel, setWikiByTargetId]);
  return { resetAnalysisOutput, clearLocalAnalysis, clientAudienceContextMarkdown, canOpenDetails, localAnalysisWikiLookupOptions };
}

export type LocalAnalysisEffects = ReturnType<typeof useLocalAnalysisEffects>;
