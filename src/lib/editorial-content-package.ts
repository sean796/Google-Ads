/** Monthly editorial quotas (blogs + SAP entity posts), separate from optimization URL caps. */
export type EditorialContentPackageTier = "standard" | "lite";

export type EditorialContentQuotas = {
  blogsPerMonth: number;
  sapsPerMonth: number;
};

export const EDITORIAL_CONTENT_PACKAGE_QUOTAS: Record<
  EditorialContentPackageTier,
  EditorialContentQuotas
> = {
  standard: { blogsPerMonth: 2, sapsPerMonth: 4 },
  lite: { blogsPerMonth: 1, sapsPerMonth: 2 },
};

export const EDITORIAL_CONTENT_PACKAGE_LABELS: Record<EditorialContentPackageTier, string> = {
  standard: "Standard (2 blogs, 4 SAP)",
  lite: "Lite (1 blog, 2 SAP)",
};

export function isEditorialContentPackageTier(value: string): value is EditorialContentPackageTier {
  return value === "standard" || value === "lite";
}

export function editorialQuotasForPackage(
  tier: EditorialContentPackageTier | undefined | null,
): EditorialContentQuotas | null {
  if (!tier) return null;
  return EDITORIAL_CONTENT_PACKAGE_QUOTAS[tier] ?? null;
}

export type EditorialPackageSiteLike = {
  editorialContentPackage?: EditorialContentPackageTier;
};

/** Canonical display names for Standard tier (2 blogs, 4 SAP per month). */
export const EDITORIAL_STANDARD_PROPERTY_NAMES = [
  "Blind Magic",
  "Lindsey Blinds",
  "Superior Blinds",
  "In the Shade",
  "Interiors by Laura",
  "DM Interiors",
  "Blinds West",
  "KWB",
  "Tailored Interiors",
  "Neo Digital",
] as const;

/** Canonical display names for Lite tier. */
export const EDITORIAL_LITE_PROPERTY_NAMES = [
  "Advance Blinds",
  "Superior Tent Rentals",
  "You Junk It... I Dump It",
  "Phoenix Painting",
  "Posh Outdoors",
] as const;

export function normalizeEditorialPropertyName(raw: string | undefined | null): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EDITORIAL_STANDARD_NORM = new Set(
  EDITORIAL_STANDARD_PROPERTY_NAMES.map(normalizeEditorialPropertyName),
);
const EDITORIAL_LITE_NORM = new Set(EDITORIAL_LITE_PROPERTY_NAMES.map(normalizeEditorialPropertyName));

/** Map Integrations property name to package tier when field is unset. */
export function editorialContentPackageTierForPropertyName(
  name: string | undefined | null,
): EditorialContentPackageTier | undefined {
  const norm = normalizeEditorialPropertyName(name);
  if (!norm) return undefined;
  if (EDITORIAL_STANDARD_NORM.has(norm)) return "standard";
  if (EDITORIAL_LITE_NORM.has(norm)) return "lite";
  if (norm.startsWith("dm interiors")) return "standard";
  if (norm.startsWith("superior blinds")) return "standard";
  return undefined;
}

export type EditorialPackageSiteLikeWithName = EditorialPackageSiteLike & {
  name?: string;
};

/** Stored tier, else canonical name map (dashboard filter + quotas). */
export function resolveEditorialContentPackageForSite(
  site: EditorialPackageSiteLikeWithName,
): EditorialContentPackageTier | undefined {
  const raw = site.editorialContentPackage?.trim();
  if (raw && isEditorialContentPackageTier(raw)) return raw;
  return editorialContentPackageTierForPropertyName(site.name);
}

const EDITORIAL_PUBLISH_TIME_BY_NORM = new Map<string, string>(
  [
    ["Superior Tent Rentals", "03:00"],
    ["You Junk It... I Dump It", "03:00"],
    ["KWB", "03:00"],
  ].map(([name, time]) => [normalizeEditorialPropertyName(name), time]),
);

export function editorialPublishTimeLocalForPropertyName(
  name: string | undefined | null,
): string | undefined {
  const norm = normalizeEditorialPropertyName(name);
  return norm ? EDITORIAL_PUBLISH_TIME_BY_NORM.get(norm) : undefined;
}

export function editorialQuotasForSite(
  site: EditorialPackageSiteLikeWithName,
): EditorialContentQuotas | null {
  const tier = resolveEditorialContentPackageForSite(site);
  return editorialQuotasForPackage(tier);
}

/** Display label for property overview (short). */
export function editorialContentPackageShortLabel(
  tier: EditorialContentPackageTier | undefined | null,
): string | null {
  if (tier === "standard") return "Standard";
  if (tier === "lite") return "Lite";
  return null;
}

export function editorialContentPackageShortLabelForSite(
  site: EditorialPackageSiteLikeWithName,
): string | null {
  return editorialContentPackageShortLabel(resolveEditorialContentPackageForSite(site));
}

export type EditorialSapMonthCountLike = {
  loading?: boolean;
  entityCountsAvailable?: boolean;
  entityScheduled?: number | null;
};

/** SAP entity rows still to schedule this period (matches Properties scheduled/quota pill). */
export function editorialSapScheduledRemainingForSite(
  site: EditorialPackageSiteLikeWithName,
  stats: EditorialSapMonthCountLike | undefined,
): number | null {
  const quotas = editorialQuotasForSite(site);
  if (!quotas) return null;
  if (!stats || stats.loading) return null;
  if (stats.entityCountsAvailable === false) return null;
  const scheduled = stats.entityScheduled;
  if (typeof scheduled !== "number" || !Number.isFinite(scheduled)) return null;
  return Math.max(0, quotas.sapsPerMonth - scheduled);
}
