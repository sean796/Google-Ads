import { useCallback } from "react";
import { notify } from "@/lib/app-notifications";
import { ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import { NOTIFY_ADD_AT_LEAST_ONE_TARGET_KEYWORD, NOTIFY_ADD_SAP_BUDGET_ON_MEMBER_ROWS_OR_A_SINGL, NOTIFY_DERIVING_KEYWORDS_FROM_POSTS, NOTIFY_GENERATING_SAP_ROWS, NOTIFY_LOADING_WORDPRESS_POST_LIBRARY, NOTIFY_OPENROUTER_IN_SETTINGS, NOTIFY_PREPARING_SAP, NOTIFY_READING_MASTER_RULES, NOTIFY_SEED_SITE_URL_EXAMPLE, notifyCheckXEntityRowSVsCsv, notifySapScaledToXMaxX, notifyWikipediaXX } from "@/lib/notify-messages";
import { defaultSeedEntityHintFromGrid, entityMatchesCsvPlaceHints } from "@/lib/local-dominator-csv";
import { fetchLocalSeoStrategyFromGrid } from "@/lib/local-seo-strategy-from-grid";
import { applySapOriginFromTitleToRows } from "@/lib/sap-origin-from-title";
import { LOCAL_ANALYSIS_DEFAULT_SAP_PAGES as DEFAULT_SAP_PAGES, LOCAL_ANALYSIS_SAP_MAX, LOCAL_ANALYSIS_SAP_MIN } from "@/lib/local-analysis-target-constants";

import { enrichSapRowsWithWikiLinks, keywordTargetsForApi, mergeRepairedSapBearingIntoTargets, normalizeKeywordTargets, sapBearingTargetsForAllocation, type KeywordTargetRow, type LocalAnalysisWorkspaceControls, type NormalizedKeywordTarget, type SapGeneratorLocalWorkspaceMode } from "@/components/sap-generator/local-analysis-helpers";
import { finalizeEntitySapRowsForAdGroups } from "@/lib/local-analysis/sap-entity-ad-groups";
import { keywordTargetsInGenerationOrder } from "@/lib/local-analysis-keyword-cluster";
import { applySapTargetSlugsFromKeywordEntity } from "@/lib/sap-slug-from-keyword-entity";
import { repairSapPageAllocation } from "@/lib/local-analysis-suggest-keyword-targets";
import { fillKeywordsFromWpInventoryPosts } from "@/lib/local-analysis-fill-keywords-from-wp-inventory";
import { ensureBulkGenerationWpInventory } from "@/lib/bulk/bulk-generation-wp-inventory";
import { allRowIndicesSet } from "@/lib/bulk-processing-order";
import { fillSapRowMetaFromOpenRouter } from "@/lib/local-analysis/entity-sap-meta-agent";
import { fillSapRowTitlesFromOpenRouter } from "@/lib/local-analysis/entity-sap-title-agent";
import { mapEntityGeneratorKeywordInventoryPayload, pickEntityGeneratorKeywordInventoryRows } from "@/lib/local-analysis/entity-generator-keyword-inventory";
import { buildEntityTitleClusterJobs, buildEntityTitleClusterJobsFromTargets } from "@/lib/local-analysis/entity-sap-title-cluster-jobs";
import { buildEntityTitleHarnessGroupsFromTargets, hydrateEntityTitleHarnessFromSapRows, mergeEntityGenerateProgress } from "@/lib/local-analysis/entity-title-harness-state";
import { getPrimaryCityStateLabel, resolvePrimaryLocationLabel } from "@/lib/primary-location-from-site";

export type {
  KeywordTargetRow,
  LocalAnalysisWorkspaceControls,
  SapGeneratorLocalWorkspaceMode,
} from "@/components/sap-generator/local-analysis-helpers";

/** Per-keyword SAP default for new rows (not the campaign total in DEFAULT_SAP_PAGES). */
import type { LocalAnalysisState } from "@/components/sap-generator/use-local-analysis-state";
import type { LocalAnalysisEffects } from "@/components/sap-generator/use-local-analysis-effects";
import type { useLocalAnalysisCsvPipeline } from "@/components/sap-generator/use-local-analysis-csv-pipeline";

export function useLocalAnalysisRun(
  s: LocalAnalysisState,
  fx: LocalAnalysisEffects,
  assignUniqueEntitySapKeywords: ReturnType<typeof useLocalAnalysisCsvPipeline>["assignUniqueEntitySapKeywords"],
) {
  const {
    site,
    apiKey,
    temperature,
    maxTokens,
    topP,
    gridSummaryMarkdown,
    csvPlaceHints,
    businessName,
    keywordTargets,
    setKeywordTargets,
    sapRows,
    setSapRows,
    setEntitySelectedRowIndices,
    strategyMarkdown,
    setStrategyMarkdown,
    questionsByKeyword,
    setQuestionsByKeyword,
    setIsAnalyzing,
    setHeaderProgress,
    suggestFocusLocation,
    entityGeographicLevel,
    entityTypeFocus,
    setWikiBySapRowIndex,
    granularPoolTitles,
    isTempWorkspace,
    researchModel,
    openRouterKey,
    maxSapBudget,
    placeWeaknessForSuggest,
    gridLocations,
    mergedWikipediaSearchAugment,
  } = s;

  const { clientAudienceContextMarkdown, localAnalysisWikiLookupOptions } = fx;
const runAnalysis = useCallback(async (targetsOverride?: KeywordTargetRow[]) => {
  if (!openRouterKey) {
    notify.error(NOTIFY_OPENROUTER_IN_SETTINGS);
    return;
  }
  if (isTempWorkspace && !site.siteUrl?.trim()) {
    notify.error(NOTIFY_SEED_SITE_URL_EXAMPLE);
    return;
  }
  const FILL_KW_LOADING_ID = "local-analysis-fill-kw";
  /** Reuse one WordPress post library fetch when keyword fill and strategy both need it. */
  let sharedWpPostInventory: Awaited<ReturnType<typeof ensureBulkGenerationWpInventory>> | null = null;

  let rowsForRun = targetsOverride ?? keywordTargets;
  let { targets, total } = normalizeKeywordTargets(rowsForRun);

  if (targets.length === 0) {
    const seedUrl = site.siteUrl?.trim() ?? "";
    const hasWpCreds =
      !isTempWorkspace &&
      Boolean(site.username?.trim() && site.appPassword?.trim() && seedUrl);
    if (!hasWpCreds) {
      notify.error(
        "Add at least one target keyword, or connect WordPress (username + app password) to load your post library.",
      );
      return;
    }
    const emptyRows = rowsForRun.filter((r) => !r.keyword.trim());
    if (emptyRows.length === 0) {
      notify.error(NOTIFY_ADD_AT_LEAST_ONE_TARGET_KEYWORD);
      return;
    }
    try {
      notify.loading(NOTIFY_LOADING_WORDPRESS_POST_LIBRARY, { id: FILL_KW_LOADING_ID });
      setHeaderProgress({
        kind: "generate",
        phase: "Loading WordPress post library…",
        completed: 0,
        total: 0,
      });
      const inv = await ensureBulkGenerationWpInventory(site);
      const inventoryRows = pickEntityGeneratorKeywordInventoryRows(site, inv.rows ?? []);
      if (inv.error) {
        notify.error(inv.error);
        return;
      }
      if (!inventoryRows.length) {
        notify.error(
          "WordPress entity sitemap and post library are empty. Add keywords manually or ensure published entity or post URLs exist.",
        );
        return;
      }
      sharedWpPostInventory = inv;
      notify.loading(NOTIFY_DERIVING_KEYWORDS_FROM_POSTS, { id: FILL_KW_LOADING_ID });
      setHeaderProgress({
        kind: "generate",
        phase: "Deriving keywords from inventory…",
        completed: 0,
        total: emptyRows.length,
      });
      const fills = await fillKeywordsFromWpInventoryPosts({
        apiKey: openRouterKey,
        model: researchModel,
        siteId: site.id,
        siteName: site.name,
        siteUrl: site.siteUrl ?? "",
        posts: inventoryRows,
        rowsToFill: emptyRows.map((r) => ({
          id: r.id,
          entityHint: r.entityHint ?? "",
          sapPages: r.sapPages,
          ...(r.clusterRole ? { clusterRole: r.clusterRole } : {}),
          ...(r.clusterId ? { clusterId: r.clusterId } : {}),
        })),
        temperature,
        topP,
      });
      rowsForRun = rowsForRun.map((r) => {
        const kw = fills.get(r.id);
        return kw ? { ...r, keyword: kw } : r;
      });
      setKeywordTargets(rowsForRun);
      const norm2 = normalizeKeywordTargets(rowsForRun);
      targets = norm2.targets;
      total = norm2.total;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify.error(msg || "Could not load post library or derive keywords.");
      return;
    } finally {
      notify.dismiss(FILL_KW_LOADING_ID);
    }
  }

  if (targets.length === 0) {
    notify.error(NOTIFY_ADD_AT_LEAST_ONE_TARGET_KEYWORD);
    return;
  }
  const sapBearing = sapBearingTargetsForAllocation(targets);
  if (sapBearing.length === 0) {
    notify.error(NOTIFY_ADD_SAP_BUDGET_ON_MEMBER_ROWS_OR_A_SINGL);
    return;
  }
  let apiTargets = targets;
  let targetSapCount = Math.min(total, maxSapBudget);
  if (total !== maxSapBudget) {
    const repairedSapBearing = repairSapPageAllocation(
      sapBearing.map((t) => ({
        keyword: t.keyword,
        sapPages: t.sapPages,
        ...(t.entityHint ? { entityHint: t.entityHint } : {}),
        ...(t.clusterId ? { clusterId: t.clusterId } : {}),
        ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
      })),
      maxSapBudget,
      LOCAL_ANALYSIS_SAP_MIN,
      LOCAL_ANALYSIS_SAP_MAX,
    );
    apiTargets = mergeRepairedSapBearingIntoTargets(targets, sapBearing, repairedSapBearing);
    targetSapCount = maxSapBudget;
    if (total > maxSapBudget) {
      notify.message(notifySapScaledToXMaxX(targetSapCount, maxSapBudget), { duration: 8_000 });
    }
  }
  const generationTargets = keywordTargetsInGenerationOrder(
    apiTargets.map((t) => ({
      id: t.id,
      keyword: t.keyword,
      entityHint: t.entityHint ?? "",
      sapPages: t.sapPages,
      clusterId: t.clusterId,
      clusterRole: t.clusterRole,
    }))
  );
  const titleTargets = apiTargets.map((t) => ({
    id: t.id,
    keyword: t.keyword,
    entityHint: t.entityHint ?? "",
    sapPages: t.sapPages,
    ...(t.clusterId ? { clusterId: t.clusterId } : {}),
    ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
  }));
  let titleHarnessGroups = buildEntityTitleHarnessGroupsFromTargets(titleTargets, maxSapBudget);
  const plannedEntityCount = titleHarnessGroups.reduce((n, g) => n + g.entities.length, 0);
  let titleClusterJobs = buildEntityTitleClusterJobsFromTargets(titleTargets, maxSapBudget);

  setIsAnalyzing(true);
  setHeaderProgress({
    kind: "generate",
    phase: "Reading master rules…",
    completed: 0,
    total: plannedEntityCount,
    titleHarnessGroups,
    harnessPlannedSectionCount: plannedEntityCount,
  });
  try {
    const needsWpInventory =
      !isTempWorkspace &&
      Boolean(
        site.siteUrl?.trim() &&
          site.username?.trim() &&
          site.appPassword?.trim(),
      );

    notify.loading(NOTIFY_READING_MASTER_RULES, { id: "local-analysis-generate" });
    setHeaderProgress((prev) =>
      mergeEntityGenerateProgress(prev, {
        kind: "generate",
        phase: "Reading master rules…",
        completed: 0,
        total: plannedEntityCount,
      }),
    );
    const [, resolved, invFromParallel] = await Promise.all([
      ensureMasterInstructionsInMemory(isTempWorkspace ? undefined : site.id),
      resolvePrimaryLocationLabel(site).catch(() => null),
      needsWpInventory && !sharedWpPostInventory
        ? ensureBulkGenerationWpInventory(site).catch(() => null)
        : Promise.resolve(sharedWpPostInventory),
    ]);
    if (invFromParallel && !sharedWpPostInventory) {
      sharedWpPostInventory = invFromParallel;
    }

    const resolvedLabel = resolved?.trim();
    const gridMd = gridSummaryMarkdown.trim();
    let entityMarket: string | undefined;
    if (gridMd.length > 0) {
      const fromGrid = defaultSeedEntityHintFromGrid(csvPlaceHints, null).trim();
      entityMarket = fromGrid.length > 0 ? fromGrid : undefined;
    } else {
      entityMarket =
        getPrimaryCityStateLabel(site)?.trim() ||
        resolvedLabel ||
        undefined;
    }
    const focusLocationForSap = suggestFocusLocation.trim();

    let wordpressPostInventory: { title: string; keyword: string }[] | undefined;
    if (sharedWpPostInventory && !sharedWpPostInventory.error) {
      const picked = pickEntityGeneratorKeywordInventoryRows(
        site,
        sharedWpPostInventory.rows ?? [],
      );
      if (picked.length) {
        wordpressPostInventory = mapEntityGeneratorKeywordInventoryPayload(picked);
      }
    }

    notify.loading(NOTIFY_PREPARING_SAP, { id: "local-analysis-generate" });
    setHeaderProgress((prev) =>
      mergeEntityGenerateProgress(prev, {
        kind: "generate",
        phase: "Preparing SAP…",
        completed: 0,
        total: plannedEntityCount,
      }),
    );
    const result = await fetchLocalSeoStrategyFromGrid({
      apiKey: openRouterKey,
      model: researchModel,
      temperature,
      maxTokens,
      topP,
      targetSapCount,
      keywordTargets: keywordTargetsForApi(generationTargets as NormalizedKeywordTarget[]),
      gridSummaryMarkdown: gridSummaryMarkdown.trim() || "",
      manualTargetsOnly: !gridSummaryMarkdown.trim(),
      siteName: site.name,
      siteUrl: site.siteUrl,
      entityLocation: focusLocationForSap || entityMarket,
      siteId: site.id,
      wikipediaSearchAugment: mergedWikipediaSearchAugment,
      /** First OpenRouter completion only — no second pass rewriting keywords/titles. */
      refineSapRowKeywordsWithRag: false,
      // Never treat "one seed row holding all SAP pages" as single-seed mode: that forced the same
      // target keyword onto every row and skipped per-cluster / per-location keyword variation. Cluster
      // prompts + per-row model keywords handle both multi-member clusters and seed-only multi-page runs.
      localAnalysisSingleSeed: false,
      entityGeographicLevel,
      ...(entityTypeFocus.length > 0 ? { entityTypeFocus } : {}),
      ...(wordpressPostInventory?.length ? { wordpressPostInventory } : {}),
      ...(clientAudienceContextMarkdown.length > 0 ? { clientAudienceContextMarkdown } : {}),
      ...(granularPoolTitles.length > 0 ? { wikipediaPreferredTitles: granularPoolTitles } : {}),
      ...(placeWeaknessForSuggest.length > 0 ? { gridPlaceWeightsForWiki: placeWeaknessForSuggest } : {}),
      onWikiProgress: (done, total) => {
        notify.loading(notifyWikipediaXX(done, total), { id: "local-analysis-generate" });
        setHeaderProgress((prev) =>
          mergeEntityGenerateProgress(prev, {
            kind: "generate",
            phase: `Wikipedia ${done}/${total}…`,
            completed: done,
            total: plannedEntityCount,
          }),
        );
      },
      onSapGenerateStart: () => {
        notify.loading(NOTIFY_GENERATING_SAP_ROWS, { id: "local-analysis-generate" });
        setHeaderProgress((prev) =>
          mergeEntityGenerateProgress(prev, {
            kind: "generate",
            phase: "Generating SAP rows…",
            completed: 0,
            total: plannedEntityCount,
          }),
        );
      },
    });
    const sapRowsWithOrigin = applySapOriginFromTitleToRows(result.sapRows);
    titleClusterJobs = buildEntityTitleClusterJobs(titleTargets, sapRowsWithOrigin, maxSapBudget);
    titleHarnessGroups = hydrateEntityTitleHarnessFromSapRows(
      titleHarnessGroups,
      titleClusterJobs,
      sapRowsWithOrigin,
    );
    setHeaderProgress((prev) =>
      mergeEntityGenerateProgress(prev, {
        kind: "generate",
        phase: "Generating SAP rows…",
        completed: 0,
        total: plannedEntityCount,
        titleHarnessGroups: [...titleHarnessGroups],
      }),
    );
    const { enriched: sapRowsLinked, wikiByIndex } = await enrichSapRowsWithWikiLinks(
      sapRowsWithOrigin,
      localAnalysisWikiLookupOptions,
      (done, total) => {
        setHeaderProgress((prev) =>
          mergeEntityGenerateProgress(prev, {
            kind: "generate",
            phase: `Generating SAP rows… (${done}/${total} linked)`,
            completed: done,
            total: plannedEntityCount,
          }),
        );
      },
    ).catch((err: unknown) => {
      throw err instanceof Error ? err : new Error(String(err));
    });
    const sapRowsWithPerEntityWiki = sapRowsLinked;
    titleClusterJobs = buildEntityTitleClusterJobs(
      titleTargets,
      sapRowsWithPerEntityWiki,
      maxSapBudget,
    );
    titleHarnessGroups = hydrateEntityTitleHarnessFromSapRows(
      titleHarnessGroups,
      titleClusterJobs,
      sapRowsWithPerEntityWiki,
    );
    setHeaderProgress((prev) =>
      mergeEntityGenerateProgress(prev, {
        kind: "generate",
        phase: "Assigning unique keywords from GSC",
        completed: 0,
        total: plannedEntityCount,
        titleHarnessGroups: [...titleHarnessGroups],
      }),
    );
    const sapRowsWithSlugs = applySapTargetSlugsFromKeywordEntity(sapRowsWithPerEntityWiki);
    const sapRowsWithKeywords = await assignUniqueEntitySapKeywords(sapRowsWithSlugs, titleTargets);
    setHeaderProgress((prev) =>
      mergeEntityGenerateProgress(prev, {
        kind: "generate",
        phase: "Writing titles",
        completed: 0,
        total: plannedEntityCount,
        titleHarnessGroups: [...titleHarnessGroups],
        harnessPlannedSectionCount: plannedEntityCount,
      }),
    );
    const sapRowsTitled = await fillSapRowTitlesFromOpenRouter(sapRowsWithKeywords, {
      apiKey: openRouterKey,
      model: researchModel,
      siteId: isTempWorkspace ? undefined : site.id,
      siteName: site.name,
      gridLocations,
      ...(entityTypeFocus.length > 0 ? { entityTypeFocus } : {}),
      onProgress: (done, total) => {
        setHeaderProgress((prev) =>
          mergeEntityGenerateProgress(prev, {
            kind: "generate",
            phase: `Writing titles (${done}/${total})`,
            completed: done,
            total: plannedEntityCount,
            titleHarnessGroups: [...titleHarnessGroups],
            harnessPlannedSectionCount: plannedEntityCount,
          }),
        );
      },
    });
    const sapRowsWithMeta = await fillSapRowMetaFromOpenRouter(sapRowsTitled, {
      apiKey: openRouterKey,
      model: researchModel,
      siteId: isTempWorkspace ? undefined : site.id,
      siteName: businessName.trim() || site.name?.trim() || "Site",
    });
    const committedRows = applySapOriginFromTitleToRows(sapRowsWithMeta);
    if (committedRows.length > 0) {
      setSapRows(finalizeEntitySapRowsForAdGroups(committedRows));
      setEntitySelectedRowIndices(allRowIndicesSet(committedRows.length));
      setWikiBySapRowIndex({ ...wikiByIndex });
      setStrategyMarkdown(result.strategyMarkdown);
      setQuestionsByKeyword(result.questionsByKeyword);
    }
    if (total !== maxSapBudget) {
      setKeywordTargets(
        apiTargets.map((t) => ({
          id: t.id,
          keyword: t.keyword,
          entityHint: t.clusterRole === "member" ? "" : (t.entityHint ?? ""),
          sapPages: t.sapPages,
          ...(t.clusterId ? { clusterId: t.clusterId } : {}),
          ...(t.clusterRole ? { clusterRole: t.clusterRole } : {}),
        }))
      );
    }
    const suspicious =
      csvPlaceHints.length > 0
        ? sapRowsLinked.filter((r) => !entityMatchesCsvPlaceHints(r.entity, csvPlaceHints))
        : [];
    if (suspicious.length > 0) {
      notify.message(notifyCheckXEntityRowSVsCsv(suspicious.length), { duration: 10_000 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    notify.error(msg || "SAP generation failed");
  } finally {
    notify.dismiss("local-analysis-generate");
    setIsAnalyzing(false);
    setHeaderProgress(null);
  }
}, [
  gridSummaryMarkdown,
  openRouterKey,
  researchModel,
  temperature,
  maxTokens,
  topP,
  keywordTargets,
  csvPlaceHints,
  site,
  maxSapBudget,
  isTempWorkspace,
  suggestFocusLocation,
  entityGeographicLevel,
  entityTypeFocus,
  mergedWikipediaSearchAugment,
  granularPoolTitles,
  clientAudienceContextMarkdown,
  placeWeaknessForSuggest,
  localAnalysisWikiLookupOptions,
  assignUniqueEntitySapKeywords,
businessName, gridLocations, setEntitySelectedRowIndices, setHeaderProgress, setIsAnalyzing, setKeywordTargets, setQuestionsByKeyword, setSapRows, setStrategyMarkdown, setWikiBySapRowIndex]);
  return { runAnalysis };
}
