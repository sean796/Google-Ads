import type { WordPressSite } from "@/components/integrations/types";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { EntityPageCreatorExecutionPayload } from "@/lib/tasks-types";
import {
  assertConfiguredEntityRowCount,
  configuredEntityPageTotal,
} from "@/lib/local-analysis/entity-ad-group-budget";
import { runEntityGridLocationClusterAgent, cycleItemsForRowCount } from "@/lib/local-analysis/entity-grid-location-wiki-agent";
import {
  hydratePreloadedEntitySapRows,
  keywordTargetsFromPreloadedSapRows,
} from "@/lib/local-analysis/entity-preload-clusters-hydrate";
import { finalizeEntitySapRowsForAdGroups } from "@/lib/local-analysis/sap-entity-ad-groups";
import {
  ensureEntitySiteWarmCache,
  gscAllQueriesFromWarmBundle,
} from "@/lib/local-analysis/entity-site-warm-cache";
import { buildBulkAutoGenerateTemplateCsvFromRows } from "@/lib/local-analysis-csv-export";
import { parseLocalDominatorCsv, wikipediaSearchAugmentFromGridRows, type LocalDominatorRow } from "@/lib/local-dominator-csv";
import { processParsedLocalDominatorRows } from "@/lib/process-local-dominator-upload";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { ensureEntityPageCreatorPayload } from "@/lib/entity-page-creator/entity-page-creator-defaults";
import { resolveEntityPageCreatorClusterContext } from "@/lib/entity-page-creator/entity-page-creator-cluster-context";
import { readPreviousEntities } from "@/lib/entity/read-previous";
import {
  fetchOriginOnlyAcfContextForServiceAreas,
  getOriginOnlyListFromAcfContext,
} from "@/lib/entity/read-existing-origins-api";
import type { AgentRun } from "@/lib/agent-runs-types";
import { commitAgentRunDeliverable } from "@/lib/agent-runs/commit-agent-run-deliverable";
import { fetchAppApiText, fetchUrlTextViaApi, isAppApiUrl } from "@/lib/proxy-fetch-text";
import type { WorkflowStepOutput } from "@/lib/workflow/workflow-types";

export type EntityGridRunArchiveContext = {
  run: AgentRun;
  workflowOutputs?: WorkflowStepOutput[];
  saveLocalArchive?: boolean;
};

export type EntityLocationGenerationResult = {
  rows: CSVRow[];
  clusterWikipedia?: Awaited<ReturnType<typeof runEntityGridLocationClusterAgent>>["clusterWikipedia"];
  gridLocations?: string[];
};

export type EntityPageCreatorProgress = {
  phase: string;
  completed?: number;
  total?: number;
};

async function loadExistingEntityLabelsForDedupe(site: WordPressSite): Promise<string[]> {
  const entitySitemapUrl = site.entitySitemapUrl?.trim();
  if (!entitySitemapUrl) return [];

  const readResult = await readPreviousEntities(site, entitySitemapUrl);
  let existingEntities: string[] = [];

  const existingAcfContext = await fetchOriginOnlyAcfContextForServiceAreas(site, entitySitemapUrl);
  if (existingAcfContext.length > 0) {
    existingEntities = getOriginOnlyListFromAcfContext(existingAcfContext);
  }
  if (existingEntities.length === 0 && readResult.existingEntities.length > 0) {
    existingEntities = [...readResult.existingEntities];
  }

  const merged = new Set<string>();
  for (const label of [...existingEntities, ...readResult.existingEntities]) {
    const trimmed = label.trim();
    if (trimmed) merged.add(trimmed);
  }
  return [...merged];
}

export async function generateEntityLocationsGrid(args: {
  site: WordPressSite;
  payload: EntityPageCreatorExecutionPayload;
  apiKey: string;
  gridCsvText: string;
  gridKeyword?: string;
  archiveContext?: EntityGridRunArchiveContext;
  onProgress?: (p: EntityPageCreatorProgress) => void;
}): Promise<EntityLocationGenerationResult> {
  const payload = ensureEntityPageCreatorPayload(args.payload);
  const gridKeyword =
    args.gridKeyword?.trim() ||
    payload.focusKeyword?.trim() ||
    "";
  const parsed = parseLocalDominatorCsv(args.gridCsvText, { defaultKeyword: gridKeyword });
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  if (parsed.rows.length === 0) {
    throw new Error("Grid CSV has no data rows.");
  }

  const processed = await processParsedLocalDominatorRows(parsed.rows);
  if (processed.ok === false) {
    throw new Error(processed.error);
  }

  const wikipediaSearchAugment = wikipediaSearchAugmentFromGridRows(parsed.rows);

  if (args.archiveContext) {
    const { run, workflowOutputs, saveLocalArchive } = args.archiveContext;
    await commitAgentRunDeliverable({
      run,
      stepKey: "grid_csv_input",
      stepLabel: "Grid CSV input",
      files: [
        {
          fileName: "grid-input.csv",
          mime: "text/csv",
          content: args.gridCsvText,
        },
      ],
      textPreview: `Grid CSV (${parsed.rows.length} rows)`,
      saveLocalArchive,
      workflowOutputs,
    });
    await commitAgentRunDeliverable({
      run,
      stepKey: "grid_summary_md",
      stepLabel: "Grid summary",
      files: [
        {
          fileName: "grid-summary.md",
          mime: "text/markdown",
          content: processed.gridSummaryMarkdown,
        },
      ],
      textPreview: "Grid scan summary for entity pick",
      saveLocalArchive,
      workflowOutputs,
    });
  }

  const total = configuredEntityPageTotal(payload.entityAdGroupCount!, payload.entityAdsPerGroup!);
  const clusterContext = resolveEntityPageCreatorClusterContext({
    site: args.site,
    payload,
    gridPlaceHints: processed.placeHints,
    focusKeyword: gridKeyword,
  });

  args.onProgress?.({ phase: "Reading entity sitemap for dedupe", total });
  const entitiesAlreadyUsedFromSitemap = await loadExistingEntityLabelsForDedupe(args.site);

  args.onProgress?.({ phase: "Clustering grid locations", total });
  const clusterResult = await runEntityGridLocationClusterAgent({
    apiKey: args.apiKey,
    siteId: args.site.id,
    buckets: [],
    gridRows: parsed.rows,
    gridKeywordWeights: processed.gridKeywordWeights,
    gridLocations: processed.placeHints,
    gridSummaryMarkdown: processed.gridSummaryMarkdown,
    wikipediaSearchAugment,
    totalSapBudget: total,
    entityAdGroupCount: payload.entityAdGroupCount,
    entityAdsPerGroup: payload.entityAdsPerGroup,
    entityTypeFocus: [...clusterContext.entityTypeFocus],
    businessName: clusterContext.businessName,
    siteName: args.site.name?.trim() || clusterContext.businessName,
    entitiesAlreadyUsedFromSitemap,
    ...(clusterContext.clientAudienceContextMarkdown
      ? { clientAudienceContextMarkdown: clusterContext.clientAudienceContextMarkdown }
      : {}),
    onClusterProgress: (_done, _clusterTotal, placeLabel, cumulativeSapRows) => {
      args.onProgress?.({
        phase: `Clustering ${placeLabel}`,
        completed: cumulativeSapRows,
        total,
      });
    },
  });

  if (args.archiveContext && clusterResult.clusterWikipedia.length > 0) {
    const wikiPickLines = [
      "entity,wikipedia_title,wikipedia_url,grid_place_label",
      ...clusterResult.clusterWikipedia.map((w) =>
        [
          `"${(clusterResult.sapRows.find((r) => r.wikipedia_title === w.title)?.entity ?? "").replace(/"/g, '""')}"`,
          `"${w.title.replace(/"/g, '""')}"`,
          `"${w.url.replace(/"/g, '""')}"`,
          `"${w.gridPlaceLabel.replace(/"/g, '""')}"`,
        ].join(","),
      ),
    ];
    await commitAgentRunDeliverable({
      run: args.archiveContext.run,
      stepKey: "entity_wiki_picks",
      stepLabel: "Entity wiki picks",
      files: [
        {
          fileName: "entity-wiki-picks.csv",
          mime: "text/csv",
          content: wikiPickLines.join("\n"),
        },
      ],
      textPreview: `${clusterResult.clusterWikipedia.length} Wikipedia picks from grid`,
      saveLocalArchive: args.archiveContext.saveLocalArchive,
      workflowOutputs: args.archiveContext.workflowOutputs,
    });
  }

  const rows = finalizeEntitySapRowsForAdGroups(
    (clusterResult.sapRows.length === total
      ? clusterResult.sapRows
      : cycleItemsForRowCount(clusterResult.sapRows, total)
    ).map((row) => ({
      ...row,
      sitemap_type: "entity" as const,
      featuredImage: row.featuredImage ?? "google-maps",
    })),
  );

  assertConfiguredEntityRowCount(rows.length, total, "Grid clustering");

  if (!rows.some((r) => r.entity?.trim())) {
    throw new Error("Grid clustering produced no entity rows.");
  }

  return { rows, clusterWikipedia: clusterResult.clusterWikipedia, gridLocations: processed.placeHints };
}

export async function hydrateEntityPageRows(args: {
  site: WordPressSite;
  payload: EntityPageCreatorExecutionPayload;
  apiKey: string;
  rows: CSVRow[];
  clusterWikipedia?: EntityLocationGenerationResult["clusterWikipedia"];
  gridLocations?: string[];
  onProgress?: (p: EntityPageCreatorProgress) => void;
  onRowsUpdate?: (rows: CSVRow[]) => void;
}): Promise<CSVRow[]> {
  const payload = ensureEntityPageCreatorPayload(args.payload);
  const clusterContext = resolveEntityPageCreatorClusterContext({
    site: args.site,
    payload,
    gridPlaceHints: args.gridLocations,
    focusKeyword: payload.focusKeyword,
  });
  const model = getResearchModel(args.site.id);
  const siteUrl = args.site.siteUrl?.trim() ?? "";
  if (!siteUrl) {
    throw new Error("WordPress site URL is required.");
  }

  args.onProgress?.({ phase: "Loading site inventory and GSC cache" });
  const warm = await ensureEntitySiteWarmCache(args.site, { requireGsc: true });
  if (warm.error) {
    throw new Error(warm.error);
  }
  const gscQueries = gscAllQueriesFromWarmBundle(warm);
  if (gscQueries.length === 0) {
    throw new Error("Google Search Console returned no keywords for this site.");
  }

  const configuredTotal = configuredEntityPageTotal(payload.entityAdGroupCount!, payload.entityAdsPerGroup!);
  const grouped = finalizeEntitySapRowsForAdGroups(args.rows.map((row) => ({ ...row })));
  assertConfiguredEntityRowCount(grouped.length, configuredTotal, "Entity location generation");

  const targets = keywordTargetsFromPreloadedSapRows(grouped, () => crypto.randomUUID());

  const result = await hydratePreloadedEntitySapRows({
    apiKey: args.apiKey,
    model,
    siteId: args.site.id,
    site: args.site,
    siteName: args.site.name?.trim() || siteUrl,
    siteUrl,
    rows: grouped,
    targets,
    keywordSources: {
      buckets: warm.inventory.buckets,
      gscQueries,
    },
    gridLocations: args.gridLocations ?? [],
    entityTypeFocus: [...clusterContext.entityTypeFocus],
    ...(clusterContext.clientAudienceContextMarkdown
      ? { clientAudienceContextMarkdown: clusterContext.clientAudienceContextMarkdown }
      : {}),
    clusterWikipedia: args.clusterWikipedia,
    onPhase: (phase, completed) => {
      args.onProgress?.({
        phase,
        completed,
        total: grouped.length,
      });
    },
    onRowsUpdate: args.onRowsUpdate,
  });

  const hydrated = finalizeEntitySapRowsForAdGroups(
    result.rows.map((row) => ({
      ...row,
      sitemap_type: "entity" as const,
      featuredImage: row.featuredImage ?? "google-maps",
    })),
  );
  assertConfiguredEntityRowCount(hydrated.length, configuredTotal, "Keyword hydrate");
  return hydrated;
}

export function buildEntityBulkCsvContent(rows: CSVRow[]): string {
  return buildBulkAutoGenerateTemplateCsvFromRows(rows, {
    requireLinkedWikipedia: false,
    defaultSitemapType: "entity",
  });
}

export async function resolveGridCsvText(args: {
  payload: EntityPageCreatorExecutionPayload;
  teamId?: number;
  workflowId?: number;
  workflowRunId?: number;
}): Promise<string> {
  const payload = ensureEntityPageCreatorPayload(args.payload);

  const { resolveUpstreamGridCsvFromWorkflow } = await import(
    "@/lib/entity-page-creator/resolve-upstream-grid-csv"
  );
  return resolveUpstreamGridCsvFromWorkflow({
    teamId: args.teamId,
    workflowId: args.workflowId,
    workflowRunId: args.workflowRunId,
    ragInputKeys: payload.ragInputKeys,
  });
}

export async function resolveEntityCsvText(args: {
  payload: EntityPageCreatorExecutionPayload;
  teamId?: number;
  workflowId?: number;
  workflowRunId?: number;
}): Promise<string> {
  const payload = ensureEntityPageCreatorPayload(args.payload);

  if (payload.entityCsvBase64?.trim()) {
    return atob(payload.entityCsvBase64.trim());
  }

  if (payload.entityCsvInputSource === "workflow") {
    const { resolveUpstreamEntityCsvFromWorkflow } = await import(
      "@/lib/entity-page-creator/resolve-upstream-entity-csv"
    );
    return resolveUpstreamEntityCsvFromWorkflow({
      teamId: args.teamId,
      workflowId: args.workflowId,
      workflowRunId: args.workflowRunId,
      ragInputKeys: payload.ragInputKeys,
    });
  }

  const url = payload.entityCsvUrl?.trim();
  if (url) {
    const text = isAppApiUrl(url) ? await fetchAppApiText(url) : await fetchUrlTextViaApi(url);
    if (!text.trim()) {
      throw new Error("Entity CSV is empty.");
    }
    return text;
  }

  throw new Error("SAP generator requires an entity CSV (upload, URL, or upstream workflow export).");
}

export function parseGridRowsFromText(text: string, defaultKeyword?: string): LocalDominatorRow[] {
  const parsed = parseLocalDominatorCsv(text, { defaultKeyword });
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  if (parsed.rows.length === 0) {
    throw new Error("Grid CSV has no data rows.");
  }
  return parsed.rows;
}
