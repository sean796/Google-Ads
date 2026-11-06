import { notify } from "@/lib/app-notifications";
import type { WordPressSite } from "@/components/integrations/types";
import { getSiteInventoryBulk } from "@/lib/wordpress-api";
import type { SitePostInventoryKbPayload } from "@/lib/wordpress-api/types";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { revokePressReleaseInventoryHostedLink } from "@/lib/press-release/press-release-site-inventory";
import { exportVerticalBenchmarkGscCsv } from "@/lib/vertical-benchmark/vertical-benchmark-api";
import { isBannedBulkBenchmarkTopic } from "@/lib/vertical-benchmark/vertical-benchmark-bulk-dedupe";
import {
  benchmarkInventoryStepDetail,
  benchmarkCurateInventoryCollections,
} from "@/lib/vertical-benchmark/vertical-benchmark-inventory-fetch";
import {
  buildGscOutputPages,
  detectBrandProductLineClusters,
} from "@/lib/vertical-benchmark/vertical-benchmark-gsc-clusters";
import {
  buildGscExtendedRagPagesForSite,
  buildGscTop10RagPayloadForSite,
} from "@/lib/vertical-benchmark/vertical-benchmark-gsc-rag";
import {
  gscOutputPagesExcludingPublishedInventory,
  normalizeInventoryUrl,
} from "@/lib/vertical-benchmark/vertical-benchmark-inventory-gsc";
import { pickBestPeerGscPages } from "@/lib/vertical-benchmark/vertical-benchmark-peer-gsc";
import { benchmarkSiteInventoryStepLabel } from "@/lib/vertical-benchmark/vertical-benchmark-roster-order";
import {
  type BenchmarkClientContextEnrichment,
} from "@/lib/vertical-benchmark/vertical-benchmark-site-context";
import {
  benchmarkContentKindLabel,
  type GscTop10CsvRow,
  type VerticalBenchmarkContentKind,
} from "@/lib/vertical-benchmark/vertical-benchmark-types";
import type {
  BenchmarkInventoryHostedLink,
  BenchmarkPipelineProgress,
  BenchmarkPipelineProgressCallback,
  BenchmarkPipelineStep,
} from "@/lib/vertical-benchmark/vertical-benchmark-pipeline-types";
import type { BenchmarkClientPlan } from "@/lib/vertical-benchmark/vertical-benchmark-bulk-prompt";

export const PHASE_WEIGHT = {
  inventory: 25,
  gsc: 35,
  geminiClients: 30,
  gridEntity: 15,
  geminiFinal: 5,
} as const;

/** Parallel OpenRouter calls per client during bulk row generation. */
export const CLIENT_PARALLEL_LIMIT = 8;

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

function gscStepLabelPrefix(kinds: VerticalBenchmarkContentKind[]): string {
  if (kinds.length === 1 && kinds[0] === "entity") return "GSC entity top 10";
  if (kinds.length === 1 && kinds[0] === "post") return "GSC post top 10";
  return "GSC top 10";
}

export function emitProgress(
  onProgress: BenchmarkPipelineProgressCallback | undefined,
  partial: Omit<BenchmarkPipelineProgress, "busy"> & { busy?: boolean },
) {
  onProgress?.({
    busy: partial.busy ?? true,
    phase: partial.phase,
    message: partial.message,
    percent: partial.percent,
    indeterminate: partial.indeterminate,
    steps: partial.steps,
    inventoryLinks: partial.inventoryLinks,
  });
}

export function revokeBenchmarkInventoryHostedLinks(
  links: BenchmarkInventoryHostedLink[] | null | undefined,
): void {
  for (const link of links ?? []) {
    revokePressReleaseInventoryHostedLink(link.href);
  }
}

export function initInventorySteps(
  sites: WordPressSite[],
  connectedSiteId?: string | null,
): BenchmarkPipelineStep[] {
  return sites.map((s) => ({
    id: `inv-${s.id}`,
    label: benchmarkSiteInventoryStepLabel(s, connectedSiteId),
    status: "waiting" as const,
  }));
}

export function initGscSteps(
  sites: WordPressSite[],
  contentKinds: VerticalBenchmarkContentKind[],
): BenchmarkPipelineStep[] {
  const prefix = gscStepLabelPrefix(contentKinds);
  return sites.map((s) => ({
    id: `gsc-${s.id}`,
    label: `${prefix}: ${s.name}`,
    status: "waiting" as const,
  }));
}


export function patchStep(
  steps: BenchmarkPipelineStep[],
  id: string,
  patch: Partial<BenchmarkPipelineStep>,
): BenchmarkPipelineStep[] {
  return steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

export async function fetchMergedInventory(
  site: WordPressSite,
  contentKinds: VerticalBenchmarkContentKind[],
): Promise<{
  siteInventoryJson: string;
  kbPayload: SitePostInventoryKbPayload | null;
  siteUrl: string;
  inventoryRowCount: number;
  inventoryTruncated: boolean;
  error?: string;
}> {
  const u = site.siteUrl?.trim();
  const user = site.username?.trim();
  const pass = site.appPassword?.trim();
  const siteUrl = getPublicSiteUrl(site);
  if (!u || !user || !pass) {
    return {
      siteInventoryJson: "",
      kbPayload: null,
      siteUrl,
      inventoryRowCount: 0,
      inventoryTruncated: false,
      error: `WordPress credentials missing for ${site.name}`,
    };
  }

  const collections = benchmarkCurateInventoryCollections(site, contentKinds);
  const bulk = await getSiteInventoryBulk(site.siteUrl, user, pass, {
    includeContent: false,
    includeRawAcf: false,
    includeScheduled: true,
    inventorySizing: "auto",
    collections,
  });

  const mergedRows = (bulk.rows ?? []).map((row) => {
    const { collection: _collection, ...rest } = row;
    return rest;
  });

  const kbPayload: SitePostInventoryKbPayload = {
    site: bulk.site?.url ? bulk.site : { url: siteUrl },
    generatedAt: new Date().toISOString(),
    posts: mergedRows,
  };

  const siteInventoryJson = JSON.stringify(kbPayload, null, 2);
  const inventoryTruncated = Boolean(bulk.truncated || bulk.inventorySizing === "large");

  return {
    siteInventoryJson,
    kbPayload,
    siteUrl,
    inventoryRowCount: mergedRows.length,
    inventoryTruncated,
  };
}

export async function fetchGscTop10InMemory(options: {
  sites: WordPressSite[];
  contentKinds: VerticalBenchmarkContentKind[];
  openRouterApiKey: string;
  clientTagBySiteId: Record<string, string>;
  clientTagLabelBySiteId: Record<string, string>;
  onProgress?: BenchmarkPipelineProgressCallback;
  progressBase?: number;
  progressSpan?: number;
  pipelineSteps?: BenchmarkPipelineStep[];
  inventoryLinks?: BenchmarkInventoryHostedLink[];
}): Promise<{
  rows: GscTop10CsvRow[];
  extendedRows: GscTop10CsvRow[];
  steps: BenchmarkPipelineStep[];
  dateRange?: { startDate: string; endDate: string };
} | null> {
  const { contentKinds } = options;
  const kindLabel = benchmarkContentKindLabel(contentKinds);
  const progressBase = options.progressBase ?? 0;
  const progressSpan = options.progressSpan ?? PHASE_WEIGHT.gsc;
  let gscSteps = initGscSteps(options.sites, contentKinds);
  const stepsWithInventory =
    options.pipelineSteps ?? [...gscSteps];
  emitProgress(options.onProgress, {
    phase: "gsc",
    message: `Fetching GSC top ${kindLabel} per client (in memory for RAG)…`,
    percent: progressBase,
    steps: stepsWithInventory.map((s) =>
      s.id.startsWith("gsc-") ? { ...s, status: "waiting" as const } : s,
    ),
    inventoryLinks: options.inventoryLinks,
  });

  const { rows, extendedRows = [], results, dateRange } = await exportVerticalBenchmarkGscCsv({
    sites: options.sites,
    siteIds: options.sites.map((s) => s.id),
    contentKinds,
    clientTagBySiteId: options.clientTagBySiteId,
    clientTagLabelBySiteId: options.clientTagLabelBySiteId,
    openRouterApiKey: options.openRouterApiKey,
    onProgress: (done, total, siteId) => {
      for (let i = 0; i < done; i++) {
        const s = options.sites[i];
        if (!s) continue;
        gscSteps = patchStep(gscSteps, `gsc-${s.id}`, { status: "done" });
      }
      if (siteId) {
        const idx = options.sites.findIndex((s) => s.id === siteId);
        if (idx >= done) {
          gscSteps = patchStep(gscSteps, `gsc-${siteId}`, {
            status: "active",
            detail: "Search Console + URL labeling",
          });
        }
      }
      const nextSite = options.sites[done];
      const activeLabel = nextSite ? ` (${nextSite.name})` : "";
      const mergedSteps = (options.pipelineSteps ?? []).map((s) => {
        if (!s.id.startsWith("gsc-")) return s;
        const patch = gscSteps.find((g) => g.id === s.id);
        return patch ?? s;
      });
      emitProgress(options.onProgress, {
        phase: "gsc",
        message: `GSC export ${done} / ${total} clients${activeLabel} (${kindLabel})`,
        percent:
          progressBase +
          Math.min(progressSpan, Math.round((done / Math.max(total, 1)) * progressSpan)),
        steps: mergedSteps.length ? mergedSteps : gscSteps,
        inventoryLinks: options.inventoryLinks,
      });
    },
  });

  const prefix = gscStepLabelPrefix(contentKinds);
  const rowNoun = contentKinds.length === 1 && contentKinds[0] === "entity" ? "entity URLs" : "URLs";
  for (const s of options.sites) {
    const result = results.find((r) => r.siteId === s.id);
    const hadRows = (result?.rowCount ?? 0) > 0;
    const rowCount = result?.rowCount ?? 0;
    gscSteps = patchStep(gscSteps, `gsc-${s.id}`, {
      status: result?.skipped && !hadRows ? "error" : "done",
      label:
        result?.skipped && !hadRows ?
          `${prefix}: ${s.name}`
        : `${prefix}: ${s.name} (${rowCount} ${rowNoun})`,
      detail: result?.skipped && !hadRows ? (result?.reason ?? `no ${kindLabel}`) : undefined,
    });
  }

  const finalGscSteps = (options.pipelineSteps ?? []).map((s) => {
    if (!s.id.startsWith("gsc-")) return s;
    const patch = gscSteps.find((g) => g.id === s.id);
    return patch ?? s;
  });

  const ragRows = rows.filter((r) => contentKinds.includes(r.content_kind));
  if (!ragRows.length) {
    const hint = results.find((r) => r.reason)?.reason;
    const failMsg = hint ? `No GSC ${kindLabel} for RAG (${hint})` : `No GSC ${kindLabel} for any client`;
    emitProgress(options.onProgress, {
      phase: "gsc",
      message: failMsg,
      percent: progressBase + progressSpan,
      busy: false,
      steps: finalGscSteps.length ? finalGscSteps : gscSteps,
      inventoryLinks: options.inventoryLinks,
    });
    notify.error(failMsg);
    return null;
  }

  emitProgress(options.onProgress, {
    phase: "gsc",
    message: `GSC RAG ready, ${ragRows.length} ${kindLabel} across clients`,
    percent: progressBase + progressSpan,
    steps: finalGscSteps.length ? finalGscSteps : gscSteps,
    inventoryLinks: options.inventoryLinks,
  });

  return { rows: ragRows, extendedRows, steps: gscSteps, dateRange };
}

export function buildBenchmarkClientPlansForBulk(args: {
  invResults: Array<{
    site: WordPressSite;
    inv: Awaited<ReturnType<typeof fetchMergedInventory>>;
    context: BenchmarkClientContextEnrichment | null;
  }>;
  curateSiteIds: Set<string>;
  connectedSiteId: string | null;
  connectedSite: WordPressSite | null;
  sites: WordPressSite[];
  gscPlanKinds: VerticalBenchmarkContentKind[];
  clientTagLabelBySiteId: Record<string, string>;
  gscRows: GscTop10CsvRow[];
  gscExtendedRows: GscTop10CsvRow[];
  dateRange?: { startDate: string; endDate: string };
  blogCount: number;
  gridRagBlock?: string;
  invSteps: BenchmarkPipelineStep[];
}): {
  plans: BenchmarkClientPlan[];
  planSkipReasons: string[];
  inventoryTitlesByClient: Record<string, number>;
  invSteps: BenchmarkPipelineStep[];
} {
  const {
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
  } = args;
  let invSteps = args.invSteps;
  const plans: BenchmarkClientPlan[] = [];
  const planSkipReasons: string[] = [];
  const inventoryTitlesByClient: Record<string, number> = {};
  for (const { site, inv } of invResults) {
    if (!curateSiteIds.has(site.id) && site.id !== connectedSiteId) continue;
    if (inv.error) {
      invSteps = patchStep(invSteps, `inv-${site.id}`, { status: "error", detail: inv.error });
      planSkipReasons.push(`${site.name}: ${inv.error}`);
      continue;
    }
    inventoryTitlesByClient[site.name] = inv.inventoryRowCount;
    invSteps = patchStep(invSteps, `inv-${site.id}`, {
      status: "done",
      label: benchmarkSiteInventoryStepLabel(site, connectedSiteId),
      detail: benchmarkInventoryStepDetail(inv.inventoryRowCount, inv.inventoryTruncated),
    });
  }

  const wantPosts = gscPlanKinds.includes("post");
  const wantEntityOnly = gscPlanKinds.includes("entity") && !wantPosts;
  const targetSite = connectedSite ?? sites[0] ?? null;
  const targetResult =
    targetSite ?
      invResults.find(({ site }) => site.id === targetSite.id) ?? null
    : null;

  if (wantPosts && targetSite && targetResult && !targetResult.inv.error) {
    const tagLabel = clientTagLabelBySiteId[targetSite.id] ?? "";
    const outputPages = pickBestPeerGscPages({
      targetSiteId: targetSite.id,
      rows: [...gscRows, ...gscExtendedRows],
      count: blogCount,
      contentKind: "post",
    });
    if (!outputPages.length) {
      planSkipReasons.push(`${targetSite.name}: no peer GSC blog URLs from other sites`);
    } else {
      const gscPayload = {
        siteId: targetSite.id,
        siteName: targetSite.name,
        siteUrl: targetResult.inv.siteUrl,
        clientTag: tagLabel,
        dateRange,
        topPages: outputPages,
      };
      const verifiedBrands = targetResult.context?.offerings.verifiedBrands ?? [];
      plans.push({
        site: targetSite,
        siteUrl: targetResult.inv.siteUrl,
        categoryLabel: tagLabel,
        contentKind: "post",
        siteInventoryJson: targetResult.inv.siteInventoryJson,
        clientOfferingsBlock: targetResult.context?.clientOfferingsBlock ?? "",
        verifiedBrands,
        gscPayload,
        gscClusters: [],
        outputPages,
        expectedRows: outputPages.length,
        gridRagBlock,
      });
    }
  }

  if (wantEntityOnly) {
    for (const { site, inv, context } of invResults) {
      if (!curateSiteIds.has(site.id)) continue;
      if (inv.error) continue;
      const tagLabel = clientTagLabelBySiteId[site.id] ?? "";
      const gscPayloadRaw = buildGscTop10RagPayloadForSite(
        site.id,
        site.name,
        inv.siteUrl,
        tagLabel,
        gscRows,
        "entity",
        dateRange,
      );
      const topPages = gscPayloadRaw.topPages.filter((p) => !isBannedBulkBenchmarkTopic(p.url));
      const gscPayload = { ...gscPayloadRaw, topPages };
      if (!gscPayload.topPages.length) {
        planSkipReasons.push(`${site.name}: no GSC entity URLs in Search Console`);
        continue;
      }
      const verifiedBrands = context?.offerings.verifiedBrands ?? [];
      const gscClusters = detectBrandProductLineClusters(gscPayload.topPages, verifiedBrands);
      const rawOutputPages = buildGscOutputPages(gscPayload.topPages, gscClusters);
      const extendedPages = buildGscExtendedRagPagesForSite(site.id, gscExtendedRows, "entity").filter(
        (p) => !isBannedBulkBenchmarkTopic(p.url),
      );
      const gscPool = [...gscPayload.topPages, ...extendedPages].filter(
        (p, i, arr) => arr.findIndex((x) => normalizeInventoryUrl(x.url) === normalizeInventoryUrl(p.url)) === i,
      );
      const { pages: outputPages } = gscOutputPagesExcludingPublishedInventory(
        rawOutputPages,
        gscPool,
        inv.siteInventoryJson,
      );
      if (!outputPages.length) continue;
      plans.push({
        site,
        siteUrl: inv.siteUrl,
        categoryLabel: tagLabel,
        contentKind: "entity",
        siteInventoryJson: inv.siteInventoryJson,
        clientOfferingsBlock: context?.clientOfferingsBlock ?? "",
        verifiedBrands,
        gscPayload,
        gscClusters,
        outputPages,
        expectedRows: outputPages.length,
        gridRagBlock,
      });
    }
  }
  return { plans, planSkipReasons, inventoryTitlesByClient, invSteps };
}
