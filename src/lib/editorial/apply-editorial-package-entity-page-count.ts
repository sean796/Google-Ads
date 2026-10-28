import type { WordPressSite } from "@/components/integrations/types";
import {
  editorialQuotasForSite,
  resolveEditorialContentPackageForSite,
} from "@/lib/editorial-content-package";
import { entitySapPagesForPackageTier } from "@/lib/editorial/entity-sap-package-mode";
import type { EntityPageCreatorExecutionPayload, TaskExecutionPayload } from "@/lib/tasks-types";
import { ensureEntityPageCreatorPayload } from "@/lib/entity-page-creator/entity-page-creator-defaults";

export function entitySapPagesForSiteEditorialPackage(site: WordPressSite): number {
  const quotas = editorialQuotasForSite(site);
  if (!quotas) {
    const name = site.name?.trim() || "This site";
    if (!resolveEditorialContentPackageForSite(site)) {
      throw new Error(`${name} has no Standard or Lite package on Integrations.`);
    }
    throw new Error(`${name} has no SAP quota for this package.`);
  }
  return quotas.sapsPerMonth;
}

/** Standard/Lite SAP quota for workflow entity and SAP steps (skipped when Custom). */
export function applyEditorialPackageEntityPageCount(
  payload: TaskExecutionPayload,
  site: WordPressSite | null | undefined,
): TaskExecutionPayload {
  if (payload.entityUseEditorialPackage === false) {
    return ensureEntityPageCreatorPayload(payload as EntityPageCreatorExecutionPayload);
  }
  if (!site) {
    throw new Error("Add a client on this workflow before running entity or SAP steps.");
  }
  const tier =
    payload.entityEditorialPackageTier ?? resolveEditorialContentPackageForSite(site);
  if (!tier) {
    const name = site.name?.trim() || "This site";
    throw new Error(`${name} has no Standard or Lite package on Integrations.`);
  }
  const pages = entitySapPagesForPackageTier(tier);
  return ensureEntityPageCreatorPayload({
    ...payload,
    entityPageCount: pages,
    entityUseEditorialPackage: true,
    entityEditorialPackageTier: tier,
  });
}

export function resolveEntityGeneratorExecutionPayload(
  payload: EntityPageCreatorExecutionPayload | TaskExecutionPayload | null | undefined,
  site: WordPressSite | null | undefined,
): EntityPageCreatorExecutionPayload {
  const next = applyEditorialPackageEntityPageCount(
    (payload ?? {}) as TaskExecutionPayload,
    site,
  );
  return ensureEntityPageCreatorPayload(next as EntityPageCreatorExecutionPayload);
}
