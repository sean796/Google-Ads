import type { WordPressSite } from "@/components/integrations/types";
import {
  editorialQuotasForSite,
  resolveEditorialContentPackageForSite,
} from "@/lib/editorial-content-package";
import { ensureContentGapCheckPayload } from "@/lib/content-gap/resolve-content-gap-count";
import type { ContentGapSitemapSource, TaskExecutionPayload } from "@/lib/tasks-types";

export function contentGapTargetForSiteEditorialPackage(
  site: WordPressSite,
  source: ContentGapSitemapSource,
): number {
  const quotas = editorialQuotasForSite(site);
  if (!quotas) {
    const name = site.name?.trim() || "This site";
    if (!resolveEditorialContentPackageForSite(site)) {
      throw new Error(`${name} has no Standard or Lite package on Integrations.`);
    }
    throw new Error(`${name} has no quota for this package.`);
  }
  return source === "sap" ? quotas.sapsPerMonth : quotas.blogsPerMonth;
}

/** Standard/Lite post or SAP target for content gap steps. */
export function applyEditorialPackageContentGapTarget(
  payload: TaskExecutionPayload,
  site: WordPressSite | null | undefined,
): TaskExecutionPayload {
  if (!site) {
    throw new Error("Add a client on this workflow before running content gap.");
  }
  const source = payload.contentGapSitemapSource ?? "posts";
  const target = contentGapTargetForSiteEditorialPackage(site, source);
  return { ...payload, contentGapUseEditorialPackage: true, contentGapTargetCount: target };
}

export function resolveContentGapCheckExecutionPayload(
  payload: TaskExecutionPayload | null | undefined,
  site: WordPressSite | null | undefined,
): TaskExecutionPayload {
  let next = ensureContentGapCheckPayload(payload);
  next = applyEditorialPackageContentGapTarget(next, site);
  if (
    typeof next.contentGapTargetCount !== "number"
    || !Number.isFinite(next.contentGapTargetCount)
    || next.contentGapTargetCount <= 0
  ) {
    throw new Error("Content gap check requires a target count greater than 0.");
  }
  return next;
}
