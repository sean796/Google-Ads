import { loadApiKey } from "@/lib/api";
import { blogDestinationPolicyForCollections } from "@/lib/sitemap-optimizer/blog-destination-policy";
import {
  isRedirectGridUpload,
} from "@/lib/sitemap-optimizer/apply-redirect-map-to-inventory";
import type { SitemapOptimizerRunResult } from "@/lib/sitemap-optimizer/types";
import { prepareSitemapOptimizerRun } from "./sitemap-optimizer-run-prepare";
import { finishSitemapOptimizerRun } from "./sitemap-optimizer-run-finish";
import type {
  SitemapOptimizerRunArgs,
  SitemapOptimizerRunDeps,
  SitemapOptimizerRunOutcome,
} from "./use-sitemap-optimizer-run-types";

export async function executeSitemapOptimizerRun(
  deps: SitemapOptimizerRunDeps,
  args: SitemapOptimizerRunArgs,
): Promise<SitemapOptimizerRunOutcome> {
  const { setPhase, setProgress, setResult, setError, abortRef } = deps;
  const { site, selectedCollections, dateRange, gscPagesUpload, redirectMapUpload } = args;

  setError(null);
  setResult(null);

  const redirectGridUpload =
    redirectMapUpload?.length && isRedirectGridUpload(redirectMapUpload)
      ? redirectMapUpload
      : gscPagesUpload?.length && isRedirectGridUpload(gscPagesUpload)
        ? gscPagesUpload
        : null;
  const gridHarness =
    Boolean(gscPagesUpload?.length) && !redirectGridUpload && !site;
  const apiKey = loadApiKey()?.trim();
  if (!apiKey) {
    setError("OpenRouter API key required.");
    return { ok: false as const, error: "OpenRouter API key required." };
  }

  abortRef.current?.abort();
  const ac = new AbortController();
  abortRef.current = ac;
  const signal = ac.signal;

  try {
    const preparedResult = await prepareSitemapOptimizerRun(deps, args, {
      redirectGridUpload,
      gridHarness,
      apiKey,
      signal,
    });
    if ("outcome" in preparedResult) return preparedResult.outcome;
    return await finishSitemapOptimizerRun(deps, preparedResult.prepared);
  } catch {
    abortRef.current = null;
    const analyzedAt = new Date().toISOString();
    const runResult: SitemapOptimizerRunResult = {
      rows: [],
      clusters: { clusters: [], singletons: [] },
      merges: [],
      contentSheet: [],
      gscMissCount: 0,
      dateRange,
      analyzedAt,
      runMode: "wordpress",
      blogDestination: blogDestinationPolicyForCollections(selectedCollections, {
        redirectMap: Boolean(redirectGridUpload),
      }),
      entityPrimary:
        selectedCollections.has("entity") &&
        !selectedCollections.has("posts") &&
        !selectedCollections.has("pages"),
    };
    setResult(runResult);
    setPhase("done");
    setProgress({
      phase: "done",
      completed: 0,
      total: 0,
      detail: "Complete",
    });
    return { ok: true as const, result: runResult };
  }
}
