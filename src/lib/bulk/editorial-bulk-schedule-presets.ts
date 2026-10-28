import type { WordPressSite } from "@/components/integrations/types";
import type { BulkSitemapScopeTag } from "@/lib/bulk/bulk-sitemap-mode";
import {
  bulkPresetValuesToScheduleFields,
  type BulkNamedSchedulePreset,
  type BulkSchedulePresetFields,
} from "@/lib/bulk/bulk-schedule-presets";
import type { BulkSitemapScopeTag } from "@/lib/bulk/bulk-sitemap-mode";
import {
  resolveEditorialContentPackageForSite,
} from "@/lib/editorial-content-package";
import {
  EDITORIAL_CONTENT_PACKAGE_QUOTAS,
  editorialPublishTimeLocalForPropertyName,
  type EditorialContentPackageTier,
} from "@/lib/editorial-content-package";

function editorialStartTimeForSite(site: WordPressSite | null | undefined): string {
  const fromSite = site?.editorialPublishTimeLocal?.trim();
  if (fromSite) return fromSite;
  return editorialPublishTimeLocalForPropertyName(site?.name) ?? "09:00";
}

function timesPerMonthForTier(
  tier: EditorialContentPackageTier,
  activeScope: BulkSitemapScopeTag,
): number {
  const quotas = EDITORIAL_CONTENT_PACKAGE_QUOTAS[tier];
  return activeScope === "entities" ? quotas.sapsPerMonth : quotas.blogsPerMonth;
}

export function editorialPackagePresetId(
  tier: EditorialContentPackageTier,
  activeScope: BulkSitemapScopeTag,
): string {
  return `builtin-editorial-${tier}-${activeScope}`;
}

/** Standard / Lite quick presets for bulk post schedule (counts follow sitemap bucket). */
export function buildEditorialPackageQuickPresets(
  site: WordPressSite | null | undefined,
  activeScope: Extract<BulkSitemapScopeTag, "pages" | "posts" | "entities">,
): BulkNamedSchedulePreset[] {
  const startTime = editorialStartTimeForSite(site);
  const tiers: EditorialContentPackageTier[] = ["standard", "lite"];
  return tiers.map((tier) => {
    const count = timesPerMonthForTier(tier, activeScope);
    const label = `${tier === "standard" ? "Standard" : "Lite"} · ${count}× / month · next month`;
    return {
      id: editorialPackagePresetId(tier, activeScope),
      label,
      builtin: true,
      values: {
        scheduleFrequency: "custom",
        customInterval: count,
        dayOfWeek: 1,
        startPreset: "firstOfNextMonth",
        startTime,
      },
    };
  });
}

/** Site tier + sitemap bucket → schedule fields (Standard/Lite editorial program). */
export function editorialPackageScheduleFieldsForSite(
  site: WordPressSite | null | undefined,
  activeScope: Extract<BulkSitemapScopeTag, "pages" | "posts" | "entities">,
  fallbackStartDate: Date,
): BulkSchedulePresetFields | null {
  const tier = site ? resolveEditorialContentPackageForSite(site) : undefined;
  if (!tier) return null;
  const preset = buildEditorialPackageQuickPresets(site, activeScope).find(
    (p) => p.id === editorialPackagePresetId(tier, activeScope),
  );
  if (!preset) return null;
  return bulkPresetValuesToScheduleFields(preset.values, fallbackStartDate);
}
