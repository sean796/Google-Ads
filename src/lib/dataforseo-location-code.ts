/** DataForSEO location_code values for Labs / SERP (city-level when available). */
const DATAFORSEO_CITY_LOCATION_CODES: Record<string, number> = {
  calgary: 1006350,
  edmonton: 1006218,
  toronto: 1000296,
  vancouver: 1000268,
  montreal: 1002444,
  ottawa: 1000100,
  winnipeg: 1000173,
  "sherwood park": 1006218,
  winkler: 1000173,
  "red deer": 1006227,
};

const COUNTRY_LOCATION_CODES: Record<string, number> = {
  "united states": 2840,
  "united kingdom": 2826,
  canada: 2124,
  australia: 2036,
};

function normalizeLocationLabel(location: string): string {
  return location.trim().replace(/\s+/g, " ");
}

/** Resolve DataForSEO location_code from a location_name label (matches PHP router). */
export function resolveDataForSeoLocationCode(locationName: string): number {
  const name = normalizeLocationLabel(locationName);
  if (!name) return COUNTRY_LOCATION_CODES["united states"];

  const exactCountry = COUNTRY_LOCATION_CODES[name.toLowerCase()];
  if (exactCountry != null) return exactCountry;

  const parts = name.split(",").map((p) => p.trim()).filter(Boolean);
  const cityKey = (parts[0] ?? "").toLowerCase();
  if (cityKey && DATAFORSEO_CITY_LOCATION_CODES[cityKey] != null) {
    return DATAFORSEO_CITY_LOCATION_CODES[cityKey];
  }

  const joined = parts.join(" ").toLowerCase();
  if (
    joined.includes("canada") ||
    /\b(ab|bc|mb|on|sk|qc|nl|nb|ns|pe|yt|nt|nu|alberta|manitoba|ontario|saskatchewan)\b/.test(joined)
  ) {
    return COUNTRY_LOCATION_CODES.canada;
  }
  if (joined.includes("united kingdom") || joined.includes(" england")) {
    return COUNTRY_LOCATION_CODES["united kingdom"];
  }
  if (joined.includes("australia")) {
    return COUNTRY_LOCATION_CODES.australia;
  }

  return COUNTRY_LOCATION_CODES["united states"];
}

export function withDataForSeoLocationCode<T extends { location_name?: string }>(
  payload: T,
): T & { location_code: number } {
  const location_name = payload.location_name ?? "United States";
  return {
    ...payload,
    location_name,
    location_code: resolveDataForSeoLocationCode(location_name),
  };
}
