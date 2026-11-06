import { notify } from "@/lib/app-notifications";
import { logger } from "@/lib/logger";
import { NOTIFY_NO_BULK_ROWS_FROM_POSTS_OR_GRID_ENTITY_S, NOTIFY_NO_BULK_ROWS_TO_EXPORT, NOTIFY_NO_CLIENTS_SELECTED_SELECT_AT_LEAST_ONE_, NOTIFY_NO_CLIENTS_WITH_SITE_CONTEXT_FOR_GRID_EN, NOTIFY_NO_ROWS_TO_DOWNLOAD, NOTIFY_OPENROUTER_API_KEY_REQUIRED_FOR_BULK_CSV, notifyGridEntityPackageStepFailedX, notifyNoBulkRowsToCurateX, notifyXClientSSkippedX } from "@/lib/notify-messages";
import type { WordPressSite } from "@/components/integrations/types";
import {
  createBulkTemplateDownloadArtifact,
  triggerCsvDownloadArtifact,
  type CsvDownloadArtifact,
} from "@/lib/backlink-research/backlink-bulk-csv-export";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { compactInventoryKeywordsForJson } from "@/lib/bulk/inventory-json-slim";
import type { BacklinkBlogPitchOption } from "@/lib/backlink-research/backlink-tile-enriched";
import { createPressReleaseInventoryHostedLink } from "@/lib/press-release/press-release-site-inventory";
import { fillBlogRowMetaFromOpenRouter } from "@/lib/local-analysis/entity-sap-meta-agent";
import { fillBlogRowSlugFromOpenRouter } from "@/lib/local-analysis/blog-slug-agent";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import {
  buildBenchmarkEntityRowsOnceForPackage,
  buildBenchmarkGridRagBlock,
  gscPlanContentKindsForBulkCurate,
  hasBenchmarkGridContext,
  type BenchmarkGridCsvContext,
} from "@/lib/vertical-benchmark/vertical-benchmark-grid-entity";
import { benchmarkInventoryStepDetail } from "@/lib/vertical-benchmark/vertical-benchmark-inventory-fetch";
import {
  benchmarkSiteInventoryStepLabel,
  buildBenchmarkInventorySiteQueue,
} from "@/lib/vertical-benchmark/vertical-benchmark-roster-order";
import { clampBenchmarkBlogCount } from "@/lib/vertical-benchmark/vertical-benchmark-peer-gsc";
import {
  enrichBenchmarkClientContext,
  fetchBenchmarkGmbRaw,
} from "@/lib/vertical-benchmark/vertical-benchmark-site-context";
import {
  benchmarkContentKindLabel,
  type VerticalBenchmarkContentKind,
} from "@/lib/vertical-benchmark/vertical-benchmark-types";
import type {
  BenchmarkInventoryHostedLink,
  BenchmarkPipelineProgressCallback,
  BenchmarkPipelineStep,
} from "@/lib/vertical-benchmark/vertical-benchmark-pipeline-types";
import { finalReviewStep, geminiPlanStepId, gridEntityPackageStep, initGeminiSteps, type BenchmarkClientPlan } from "@/lib/vertical-benchmark/vertical-benchmark-bulk-prompt";
import {
  BENCHMARK_BULK_QUARTER_POST_ROW_CAP,
  bulkRowToCsvExport,
  callGeminiBulkRowsForPlans,
  type BulkRowWithClient,
} from "@/lib/vertical-benchmark/vertical-benchmark-bulk-rows";
import {
  buildBenchmarkClientPlansForBulk,
  CLIENT_PARALLEL_LIMIT,
  emitProgress,
  fetchGscTop10InMemory,
  fetchMergedInventory,
  initGscSteps,
  initInventorySteps,
  mapPool,
  patchStep,
  PHASE_WEIGHT,
} from "@/lib/vertical-benchmark/vertical-benchmark-bulk-stage-fetchers";

/**
 * Combined bulk CSV: one row per GSC top URL per client (natural count from GSC, not a fixed quota).
 */
export type BenchmarkBulkTemplateDownloadResult = {
  artifact: CsvDownloadArtifact;
  /** Curated rows ready for Studio left-dock hydration or CSV export. */
  rows: CSVRow[];
  /** Published titles/keywords sent to OpenRouter per client name. */
  inventoryTitlesByClient: Record<string, number>;
  /** Hosted blob links for onsite inventory JSON per client. */
  inventoryLinks: BenchmarkInventoryHostedLink[];
};

export async function runBenchmarkBulkTemplateDownload(options: {
  sites: WordPressSite[];
  contentKinds?: VerticalBenchmarkContentKind[];
  gridContext?: BenchmarkGridCsvContext | null;
  openRouterApiKey: string;
  clientTagBySiteId: Record<string, string>;
  clientTagLabelBySiteId: Record<string, string>;
  /** Manager header connected site — inventory crawl always starts here. */
  connectedSite?: WordPressSite | null;
  /** Total blog rows on the sheet (not per site). */
  blogCount?: number;
  /** When true, skip triggering a browser CSV download (used when populating Studio left dock). */
  skipAutoDownload?: boolean;
  onProgress?: BenchmarkPipelineProgressCallback;
}): Promise<BenchmarkBulkTemplateDownloadResult | null> {
  const {
    sites,
    openRouterApiKey,
    clientTagBySiteId,
    clientTagLabelBySiteId,
    connectedSite = null,
    onProgress,
    contentKinds = ["post"],
    gridContext = null,
    blogCount: blogCountRaw,
  } = options;
  const blogCount = clampBenchmarkBlogCount(blogCountRaw ?? BENCHMARK_BULK_QUARTER_POST_ROW_CAP);
  const connectedSiteId = connectedSite?.id ?? null;

  const apiKey = openRouterApiKey?.trim();
  if (!apiKey) {
    notify.error(NOTIFY_OPENROUTER_API_KEY_REQUIRED_FOR_BULK_CSV);
    return null;
  }
  if (!sites.length) {
    notify.error(NOTIFY_NO_CLIENTS_SELECTED_SELECT_AT_LEAST_ONE_);
    return null;
  }

  const hasGrid = hasBenchmarkGridContext(gridContext);
  const useGridEntityEndStep = hasGrid && contentKinds.includes("entity");
  const gscPlanKinds = gscPlanContentKindsForBulkCurate(contentKinds, gridContext);
  const gridRagBlock = hasGrid && gridContext ? buildBenchmarkGridRagBlock(gridContext) : undefined;

  const gscStepsWaiting = initGscSteps(sites, contentKinds);
  const inventoryQueue = buildBenchmarkInventorySiteQueue(sites, connectedSite);
  const curateSiteIds = new Set(sites.map((s) => s.id));
  let invSteps = initInventorySteps(inventoryQueue, connectedSiteId);
  let pipelineSteps: BenchmarkPipelineStep[] = [...gscStepsWaiting, ...invSteps];
  const inventoryHostedLinks: BenchmarkInventoryHostedLink[] = [];

  const gscOut = await fetchGscTop10InMemory({
    sites,
    contentKinds,
    openRouterApiKey: apiKey,
    clientTagBySiteId,
    clientTagLabelBySiteId,
    onProgress,
    progressBase: 0,
    progressSpan: PHASE_WEIGHT.gsc,
    pipelineSteps,
    inventoryLinks: [],
  });
  if (!gscOut) {
    return null;
  }

  const gscRows = gscOut.rows;
  const gscExtendedRows = gscOut.extendedRows;
  const gscSteps = gscOut.steps;
  const dateRange = gscOut.dateRange;

  pipelineSteps = [...gscSteps, ...invSteps];

  const inventoryIntroMessage =
    inventoryQueue.length === 1 ?
      `Site inventory: ${inventoryQueue[0]!.name}…`
    : `Site inventory for ${inventoryQueue.length} clients in parallel…`;

  emitProgress(onProgress, {
    phase: "inventory",
    message: inventoryIntroMessage,
    percent: PHASE_WEIGHT.gsc,
    steps: pipelineSteps,
    inventoryLinks: [],
  });

  let invDoneCount = 0;
  const invTotal = inventoryQueue.length;

  const invResults = await mapPool(
    inventoryQueue,
    Math.min(CLIENT_PARALLEL_LIMIT, invTotal),
    async (site, i) => {
      const stepLabel = benchmarkSiteInventoryStepLabel(site, connectedSiteId);
      invSteps = patchStep(invSteps, `inv-${site.id}`, {
        status: "active",
        label: stepLabel,
        detail: "WordPress crawl…",
      });
      pipelineSteps = [...gscSteps, ...invSteps];
      emitProgress(onProgress, {
        phase: "inventory",
        message: `Site inventory: ${site.name}`,
        percent:
          PHASE_WEIGHT.gsc +
          Math.round((invDoneCount / Math.max(invTotal, 1)) * PHASE_WEIGHT.inventory),
        steps: pipelineSteps,
        inventoryLinks: [...inventoryHostedLinks],
      });

      const [inv, gmbRaw] = await Promise.all([
        fetchMergedInventory(site, contentKinds),
        fetchBenchmarkGmbRaw(site),
      ]);

      if (!inv.error && inv.kbPayload) {
        const hosted = createPressReleaseInventoryHostedLink(
          inv.siteUrl,
          compactInventoryKeywordsForJson(inv.kbPayload.posts ?? []),
        );
        inventoryHostedLinks.push({
          siteId: site.id,
          siteName: site.name,
          href: hosted.href,
          filename: hosted.filename,
          rowCount: hosted.rowCount,
        });
      }

      const context =
        inv.error ?
          null
        : enrichBenchmarkClientContext(site, inv.siteUrl, inv.siteInventoryJson, gmbRaw);

      if (inv.error) {
        invSteps = patchStep(invSteps, `inv-${site.id}`, { status: "error", detail: inv.error });
      } else {
        invSteps = patchStep(invSteps, `inv-${site.id}`, {
          status: "done",
          label: stepLabel,
          detail: benchmarkInventoryStepDetail(inv.inventoryRowCount, inv.inventoryTruncated),
        });
      }

      invDoneCount += 1;
      pipelineSteps = [...gscSteps, ...invSteps];
      emitProgress(onProgress, {
        phase: "inventory",
        message: `Site inventory ${invDoneCount} / ${invTotal} complete`,
        percent:
          PHASE_WEIGHT.gsc +
          Math.round((invDoneCount / Math.max(invTotal, 1)) * PHASE_WEIGHT.inventory),
        steps: pipelineSteps,
        inventoryLinks: [...inventoryHostedLinks],
      });

      return { site, inv, context };
    },
  );

  pipelineSteps = [...gscSteps, ...invSteps];

  const planBuild = buildBenchmarkClientPlansForBulk({
    invResults,
    curateSiteIds,
    connectedSiteId,
    connectedSite,
    sites,
    gscPlanKinds,
    clientTagLabelBySiteId,
    gscRows,
    gscExtendedRows,
    dateRange,
    blogCount,
    gridRagBlock,
    invSteps,
  });
  const plans = planBuild.plans;
  const planSkipReasons = planBuild.planSkipReasons;
  const inventoryTitlesByClient = planBuild.inventoryTitlesByClient;
  invSteps = planBuild.invSteps;

  pipelineSteps = [...gscSteps, ...invSteps];

  const gridEligibleSites = invResults.filter(({ inv }) => !inv.error);

  if (!plans.length && !useGridEntityEndStep) {
    const kindLabel = benchmarkContentKindLabel(contentKinds);
    const detail =
      planSkipReasons.length ?
        planSkipReasons.slice(0, 4).join(". ") + (planSkipReasons.length > 4 ? "…" : "")
      : `No GSC ${kindLabel} data for selected clients.`;
    notify.error(notifyNoBulkRowsToCurateX(detail));
    return null;
  }
  if (useGridEntityEndStep && !gridEligibleSites.length) {
    notify.error(NOTIFY_NO_CLIENTS_WITH_SITE_CONTEXT_FOR_GRID_EN);
    return null;
  }

  const researchModel = getResearchModel(sites[0]?.id);
  const baseStepsWithoutGemini = () =>
    pipelineSteps.filter((s) => !s.id.startsWith("gemini-") && !s.id.startsWith("grid-entity-"));

  let geminiSteps: BenchmarkPipelineStep[] = [];
  let clientsDone = 0;
  let filtered: BulkRowWithClient[] = [];
  const failedClients: { plan: BenchmarkClientPlan; error: string | null }[] = [];

  if (plans.length > 0) {
    const gridNote = hasGrid ? " (GSC + grid RAG)" : "";
    geminiSteps = [...initGeminiSteps(plans), finalReviewStep()];
    pipelineSteps = [...pipelineSteps, ...geminiSteps];

    emitProgress(onProgress, {
      phase: "gemini",
      message: `Curating ${plans.length} GSC plan(s)${gridNote}…`,
      percent: PHASE_WEIGHT.gsc + PHASE_WEIGHT.inventory,
      steps: pipelineSteps,
      inventoryLinks: inventoryHostedLinks,
    });

    geminiSteps = geminiSteps.map((s) =>
      s.id === "gemini-final" ? s : { ...s, status: "active" as const },
    );
    pipelineSteps = [...baseStepsWithoutGemini(), ...geminiSteps];
    emitProgress(onProgress, {
      phase: "gemini",
      message: `GSC curation${gridNote}…`,
      percent: PHASE_WEIGHT.gsc + PHASE_WEIGHT.inventory,
      steps: pipelineSteps,
      inventoryLinks: inventoryHostedLinks,
    });


    const geminiOutcome = await callGeminiBulkRowsForPlans({
      plans,
      apiKey,
      model: researchModel,
      onPlanComplete: (plan) => {
        geminiSteps = patchStep(geminiSteps, geminiPlanStepId(plan), { status: "done" });
        clientsDone += 1;
        pipelineSteps = [...baseStepsWithoutGemini(), ...geminiSteps];
        emitProgress(onProgress, {
          phase: "gemini",
          message: `GSC ${clientsDone} / ${plans.length} complete`,
          percent:
            PHASE_WEIGHT.gsc +
            PHASE_WEIGHT.inventory +
            Math.round((clientsDone / Math.max(plans.length, 1)) * PHASE_WEIGHT.geminiClients),
          steps: pipelineSteps,
          inventoryLinks: inventoryHostedLinks,
        });
      },
    });
    failedClients.push(...geminiOutcome.failedClients);
    filtered = geminiOutcome.rows;

    if (!filtered.length && !useGridEntityEndStep) {
      const failHint =
        failedClients.length ?
          `All ${failedClients.length} client(s) failed curation.`
        : "No bulk rows produced from GSC pages.";
      notify.error(failHint);
      return null;
    }

    if (failedClients.length) {
      const names = failedClients.map((r) => r.plan.site.name).join(", ");
      notify.warning(notifyXClientSSkippedX(failedClients.length, names));
    }
  }

  if (useGridEntityEndStep && gridContext) {
    let gridEntitySteps = [gridEntityPackageStep(), finalReviewStep()];
    pipelineSteps = [...baseStepsWithoutGemini(), ...gridEntitySteps];

    const gridBasePct =
      PHASE_WEIGHT.gsc + PHASE_WEIGHT.inventory + (plans.length > 0 ? PHASE_WEIGHT.geminiClients : 0);

    emitProgress(onProgress, {
      phase: "grid-entity",
      message: "Grid entity rows (one package from uploaded grid)…",
      percent: gridBasePct,
      steps: pipelineSteps,
    });

    gridEntitySteps = gridEntitySteps.map((s) =>
      s.id === "gemini-final" ? s : { ...s, status: "active" as const },
    );
    pipelineSteps = [...baseStepsWithoutGemini(), ...gridEntitySteps];

    const packageSites = gridEligibleSites.map(({ site, inv, context }) => ({
      site,
      siteUrl: inv.siteUrl,
      siteName: site.name,
      clientOfferingsBlock: context?.clientOfferingsBlock ?? "",
      verifiedBrands: context?.offerings.verifiedBrands ?? [],
    }));

    let gridEntityRows: BulkRowWithClient[] = [];
    try {
      const raw = await buildBenchmarkEntityRowsOnceForPackage({
        gridContext,
        packageSites,
        openRouterApiKey: apiKey,
      });
      gridEntityRows = raw
        .filter((r) => r.keyword?.trim() && r.title?.trim())
        .map((r) => ({ ...r, contentKind: "entity" as const }));
      gridEntitySteps = patchStep(gridEntitySteps, "grid-entity-package", { status: "done" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      gridEntitySteps = patchStep(gridEntitySteps, "grid-entity-package", { status: "error", detail: msg });
      notify.warning(notifyGridEntityPackageStepFailedX(msg));
    }
    pipelineSteps = [...baseStepsWithoutGemini(), ...gridEntitySteps];
    emitProgress(onProgress, {
      phase: "grid-entity",
      message: `Grid entity package: ${gridEntityRows.length} row(s)`,
      percent: gridBasePct + PHASE_WEIGHT.gridEntity,
      steps: pipelineSteps,
    });

    if (!gridEntityRows.length && !filtered.length) {
      notify.error(NOTIFY_NO_BULK_ROWS_FROM_POSTS_OR_GRID_ENTITY_S);
      return null;
    }

    filtered = [...filtered, ...gridEntityRows];
  }

  if (!filtered.length) {
    notify.error(NOTIFY_NO_BULK_ROWS_TO_EXPORT);
    return null;
  }

  const hasPostRows = filtered.some((r) => r.contentKind === "post");
  const hasEntityRows = filtered.some((r) => r.contentKind === "entity");
  let rowsForCsv: CSVRow[] = filtered.map((row) => ({
    ...bulkRowToCsvExport(row),
    sitemap_type: row.contentKind === "entity" ? "entity" : "post",
  }));

  pipelineSteps = [...baseStepsWithoutGemini(), finalReviewStep()];
  pipelineSteps = patchStep(pipelineSteps, "gemini-final", {
    status: "active",
    detail: "Writing URL slugs and meta descriptions…",
  });
  emitProgress(onProgress, {
    phase: "gemini",
    message: "Writing URL slugs and meta descriptions…",
    percent: 95,
    steps: pipelineSteps,
    inventoryLinks: inventoryHostedLinks,
  });

  try {
    const enrichSite = connectedSite ?? sites[0] ?? null;
    const [metaRows, slugRows] = await Promise.all([
      fillBlogRowMetaFromOpenRouter(rowsForCsv, {
        apiKey,
        model: researchModel,
        siteId: enrichSite?.id,
        siteName: enrichSite?.name ?? "",
        strict: false,
      }),
      fillBlogRowSlugFromOpenRouter(rowsForCsv, {
        apiKey,
        model: researchModel,
        siteId: enrichSite?.id,
      }),
    ]);
    rowsForCsv = rowsForCsv.map((row, i) => ({
      ...row,
      meta_description: metaRows[i]?.meta_description ?? row.meta_description,
      target_slug: slugRows[i]?.target_slug ?? row.target_slug,
    }));
  } catch (e) {
    logger.warn("[Vertical Benchmark] Slug/meta enrichment warning:", e);
  }

  pipelineSteps = patchStep(pipelineSteps, "gemini-final", {
    status: "done",
    detail: `${rowsForCsv.length} row(s)`,
  });

  const artifact = createBulkTemplateDownloadArtifact(
    rowsForCsv as BacklinkBlogPitchOption[],
    "benchmark-bulk-template",
    {
      blankEntityColumn: !hasEntityRows,
    },
  );
  if (!artifact) {
    notify.error(NOTIFY_NO_ROWS_TO_DOWNLOAD);
    return null;
  }

  emitProgress(onProgress, {
    phase: "done",
    message:
      hasPostRows && !hasEntityRows ?
        `Ideas ready, ${artifact.rowCount} blog(s)`
      : `Ideas ready, ${artifact.rowCount} row(s)`,
    percent: 100,
    busy: false,
    steps: pipelineSteps,
    inventoryLinks: inventoryHostedLinks,
  });

  if (!options.skipAutoDownload) {
    triggerCsvDownloadArtifact(artifact);
  }
  return {
    artifact,
    rows: rowsForCsv,
    inventoryTitlesByClient,
    inventoryLinks: inventoryHostedLinks,
  };
}
