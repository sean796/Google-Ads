import type { Location, NAPInfo, WordPressSite } from "@/components/integrations/types";
import { cityStateFromNapAddress } from "@/lib/llm-audit/resolve-site-location-label";
import {
  inferServiceCountry,
  isServiceCountry,
  normalizeServiceRegion,
  type ServiceCountry,
} from "@/lib/keyword-location-utils";

function preferredLocation(site?: WordPressSite | null): Location | undefined {
  const locs = site?.locations ?? site?.napInfo?.locations ?? [];
  return locs.find((loc) => loc.isDefault) ?? locs[0];
}

export function readSiteLocationsList(site?: WordPressSite | null): Location[] {
  const locs = site?.locations ?? site?.napInfo?.locations ?? [];
  return Array.isArray(locs) ? locs : [];
}

export function readSiteAdditionalLocations(site?: WordPressSite | null): Location[] {
  const locs = readSiteLocationsList(site);
  const preferred = preferredLocation(site);
  if (!preferred) return [];
  return locs.filter((loc, idx) => (preferred.id ? loc.id !== preferred.id : idx > 0));
}

export function readSiteServiceCity(site?: WordPressSite | null): string {
  const preferred = preferredLocation(site);
  if (preferred?.city?.trim()) return preferred.city.trim();
  const napAddr = site?.napInfo?.address?.trim();
  if (napAddr) {
    const parsed = cityStateFromNapAddress(napAddr);
    if (parsed) return parsed.split(",")[0]?.trim() ?? "";
  }
  return "";
}

export function readSiteServiceState(site?: WordPressSite | null): string {
  const preferred = preferredLocation(site);
  const country = readSiteServiceCountry(site);
  if (preferred?.state?.trim()) return normalizeServiceRegion(preferred.state, country);
  const napAddr = site?.napInfo?.address?.trim();
  if (napAddr) {
    const parsed = cityStateFromNapAddress(napAddr);
    if (parsed.includes(",")) {
      return normalizeServiceRegion(parsed.split(",").slice(1).join(","), country);
    }
  }
  return "";
}

export function readSiteServiceCountry(site?: WordPressSite | null): ServiceCountry | "" {
  const preferred = preferredLocation(site);
  const stored = preferred?.country?.trim() ?? "";
  if (isServiceCountry(stored)) return stored;
  const state = preferred?.state?.trim() ?? "";
  if (state) return inferServiceCountry(state, stored);
  const napAddr = site?.napInfo?.address?.trim();
  if (napAddr) {
    const parsed = cityStateFromNapAddress(napAddr);
    if (parsed.includes(",")) {
      return inferServiceCountry(parsed.split(",").slice(1).join(","), stored);
    }
  }
  return inferServiceCountry("", stored);
}

function asCleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildSiteLocationsPatch(
  site: WordPressSite,
  city?: string,
  state?: string,
  country: string = "",
): Pick<WordPressSite, "locations" | "napInfo"> {
  const cityTrim = asCleanString(city);
  const stateRaw = asCleanString(state);
  const existing = preferredLocation(site);
  const additional = readSiteAdditionalLocations(site).map((loc, idx) => ({
    ...loc,
    id: loc.id || `loc-${site.id}-extra-${idx + 1}`,
    isDefault: false,
  }));
  const countryTrim = asCleanString(country);
  const resolvedCountry = isServiceCountry(countryTrim)
    ? countryTrim
    : inferServiceCountry(stateRaw, existing?.country);
  const resolvedState = normalizeServiceRegion(stateRaw, resolvedCountry);
  if (!cityTrim && !resolvedState && !resolvedCountry) {
    const nextLocations = additional.map((loc, idx) => ({
      ...loc,
      isDefault: idx === 0,
    }));
    const emptyNap: NAPInfo | undefined = site.napInfo
      ? { ...site.napInfo, locations: nextLocations }
      : nextLocations.length > 0
        ? { name: site.name, locations: nextLocations }
        : undefined;
    return { locations: nextLocations, napInfo: emptyNap };
  }

  const loc: Location = {
    id: existing?.id ?? `loc-${site.id}-default`,
    name: existing?.name?.trim() || site.name || "Primary",
    address: existing?.address ?? "",
    city: cityTrim,
    state: resolvedState,
    country: resolvedCountry || undefined,
    zip: existing?.zip ?? "",
    phone: existing?.phone ?? site.napInfo?.phone ?? "",
    email: existing?.email,
    isDefault: true,
  };
  const locations = [loc, ...additional];
  const napInfo: NAPInfo = site.napInfo
    ? { ...site.napInfo, locations }
    : {
        name: site.name,
        locations,
      };
  return { locations, napInfo };
}

export function buildSiteAdditionalLocationsPatch(
  site: WordPressSite,
  additionalLocations: Array<{
    id?: string;
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    zip?: string;
    phone?: string;
    email?: string;
  }>,
): Pick<WordPressSite, "locations" | "napInfo"> {
  const existingPrimary = preferredLocation(site);
  const normalizedAdditional: Location[] = additionalLocations.map((item, idx) => {
    const cityTrim = asCleanString(item.city);
    const stateRaw = asCleanString(item.state);
    const countryTrim = asCleanString(item.country);
    const resolvedCountry = isServiceCountry(countryTrim)
      ? countryTrim
      : inferServiceCountry(stateRaw, countryTrim);
    const resolvedState = normalizeServiceRegion(stateRaw, resolvedCountry);
    return {
      id: asCleanString(item.id) || `loc-${site.id}-extra-${idx + 1}`,
      name: asCleanString(item.name) || cityTrim || site.name || `Location ${idx + 2}`,
      address: asCleanString(item.address),
      city: cityTrim,
      state: resolvedState,
      country: resolvedCountry || undefined,
      zip: asCleanString(item.zip),
      phone: asCleanString(item.phone) || site.napInfo?.phone || "",
      email: asCleanString(item.email) || undefined,
      isDefault: false,
    };
  });

  const locations: Location[] = existingPrimary
    ? [{ ...existingPrimary, isDefault: true }, ...normalizedAdditional]
    : normalizedAdditional.map((loc, idx) => ({ ...loc, isDefault: idx === 0 }));

  const napInfo: NAPInfo | undefined = site.napInfo
    ? { ...site.napInfo, locations }
    : locations.length > 0
      ? { name: site.name, locations }
      : undefined;

  return { locations, napInfo };
}
