import { getStoredSites } from "@/components/integrations/storage";
import {
  payloadForEntitySapPackageMode,
  resolveEntitySapPackageMode,
} from "@/lib/editorial/entity-sap-package-mode";
import { resolveEditorialContentPackageForSite } from "@/lib/editorial-content-package";
import { ensureEntityPageCreatorPayload } from "@/lib/entity-page-creator/entity-page-creator-defaults";
import { readSitePrimaryLocalKeyword } from "@/lib/local-grid-studio/resolve-property-primary-local-keyword";
import type { EntityPageCreatorExecutionPayload } from "@/lib/tasks-types";

export function editorialSapPayloadForClientSite(
  clientSiteId: string,
  payload: EntityPageCreatorExecutionPayload,
): EntityPageCreatorExecutionPayload | null {
  if (payload.entityUseEditorialPackage === false) return null;
  const id = clientSiteId.trim();
  if (!id) return null;
  const site = getStoredSites().find((item) => item.id === id);
  if (!site) return null;
  const tier = payload.entityEditorialPackageTier ?? resolveEditorialContentPackageForSite(site);
  if (!tier) return null;
  const mode = resolveEntitySapPackageMode(
    { ...payload, entityEditorialPackageTier: tier },
    site,
  );
  if (mode === "custom") return null;
  return ensureEntityPageCreatorPayload(
    payloadForEntitySapPackageMode(mode, payload),
  );
}

/** SAP quota + profile primary keyword when focus keyword is still empty (user override kept). */
export function entityInspectorPayloadForClientSite(
  clientSiteId: string,
  payload: EntityPageCreatorExecutionPayload,
): EntityPageCreatorExecutionPayload | null {
  let next = payload;
  const withSap = editorialSapPayloadForClientSite(clientSiteId, next);
  if (withSap) next = withSap;

  const id = clientSiteId.trim();
  if (id && !next.focusKeyword?.trim()) {
    const site = getStoredSites().find((item) => item.id === id);
    const profileKw = readSitePrimaryLocalKeyword(site);
    if (profileKw) {
      next = { ...next, focusKeyword: profileKw };
    }
  }

  const ensured = ensureEntityPageCreatorPayload(next);
  if (
    ensured.entityPageCount === payload.entityPageCount
    && ensured.entityUseEditorialPackage === payload.entityUseEditorialPackage
    && ensured.entityEditorialPackageTier === payload.entityEditorialPackageTier
    && (ensured.focusKeyword ?? "") === (payload.focusKeyword ?? "")
  ) {
    return null;
  }
  return ensured;
}
