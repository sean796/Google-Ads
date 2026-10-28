import type { WordPressSite } from "@/components/integrations/types";
import {
  EDITORIAL_CONTENT_PACKAGE_QUOTAS,
  type EditorialContentPackageTier,
  resolveEditorialContentPackageForSite,
} from "@/lib/editorial-content-package";
import type { EntityPageCreatorExecutionPayload } from "@/lib/tasks-types";

export type EntitySapPackageMode = EditorialContentPackageTier | "custom";

export const ENTITY_SAP_PACKAGE_SELECT_OPTIONS: { value: EntitySapPackageMode; label: string }[] = [
  {
    value: "standard",
    label: `Standard - ${EDITORIAL_CONTENT_PACKAGE_QUOTAS.standard.sapsPerMonth} SAP`,
  },
  {
    value: "lite",
    label: `Lite - ${EDITORIAL_CONTENT_PACKAGE_QUOTAS.lite.sapsPerMonth} SAP`,
  },
  { value: "custom", label: "Custom" },
];

export function entitySapPagesForPackageTier(tier: EditorialContentPackageTier): number {
  return EDITORIAL_CONTENT_PACKAGE_QUOTAS[tier].sapsPerMonth;
}

export function resolveEntitySapPackageMode(
  payload: EntityPageCreatorExecutionPayload,
  site?: WordPressSite | null,
): EntitySapPackageMode {
  if (payload.entityUseEditorialPackage === false) return "custom";
  if (payload.entityEditorialPackageTier) return payload.entityEditorialPackageTier;
  const fromSite = resolveEditorialContentPackageForSite(site ?? {});
  return fromSite ?? "standard";
}

export function payloadForEntitySapPackageMode(
  mode: EntitySapPackageMode,
  payload: EntityPageCreatorExecutionPayload,
  customPageCount?: number,
): EntityPageCreatorExecutionPayload {
  if (mode === "custom") {
    const count =
      typeof customPageCount === "number" && customPageCount > 0
        ? Math.floor(customPageCount)
        : Math.max(1, Math.floor(Number(payload.entityPageCount) || 1));
    return {
      ...payload,
      entityUseEditorialPackage: false,
      entityEditorialPackageTier: undefined,
      entityPageCount: count,
    };
  }
  const pages = entitySapPagesForPackageTier(mode);
  return {
    ...payload,
    entityUseEditorialPackage: true,
    entityEditorialPackageTier: mode,
    entityPageCount: pages,
  };
}
