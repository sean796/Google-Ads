// US States - defined outside component to avoid recreation
export const usStates = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma",
  "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee",
  "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
];

// Canadian Provinces - defined outside component to avoid recreation
export const canadianProvinces = [
  "Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador",
  "Northwest Territories", "Nova Scotia", "Nunavut", "Ontario", "Prince Edward Island",
  "Quebec", "Saskatchewan", "Yukon"
];

/**
 * Compute location string for API calls
 * Format: "City,State/Province,Country" or "State/Province,Country" or "Country"
 */
export function computeLocationString(
  city: string,
  stateProvince: string,
  country: "United States" | "Canada"
): string {
  const parts: string[] = [];
  
  // Add city if provided
  if (city && city.trim()) {
    parts.push(city.trim());
  }
  
  // Add state/province if provided
  if (stateProvince && stateProvince !== "__all__") {
    parts.push(stateProvince);
  }
  
  // Always add country
  parts.push(country);
  
  return parts.join(",");
}

/**
 * Get location options (states or provinces) based on country
 */
export function getLocationOptions(country: "United States" | "Canada"): string[] {
  return country === "United States" ? usStates : canadianProvinces;
}

export const SERVICE_COUNTRIES = ["Canada", "United States"] as const;
export type ServiceCountry = (typeof SERVICE_COUNTRIES)[number];

const US_STATE_ABBR_TO_NAME: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

const CA_PROVINCE_ABBR_TO_NAME: Record<string, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NT: "Northwest Territories",
  NS: "Nova Scotia",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

function matchListedName(raw: string, names: readonly string[]): string {
  const key = raw.trim().toLowerCase();
  return names.find((name) => name.toLowerCase() === key) ?? "";
}

export function isServiceCountry(value: string): value is ServiceCountry {
  return value === "Canada" || value === "United States";
}

export function inferServiceCountry(region?: string, storedCountry?: string): ServiceCountry | "" {
  const stored = typeof storedCountry === "string" ? storedCountry.trim() : "";
  if (isServiceCountry(stored)) return stored;
  const raw = typeof region === "string" ? region.trim() : "";
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (upper.length === 2) {
    if (CA_PROVINCE_ABBR_TO_NAME[upper]) return "Canada";
    if (US_STATE_ABBR_TO_NAME[upper]) return "United States";
    return "";
  }
  if (matchListedName(raw, canadianProvinces)) return "Canada";
  if (matchListedName(raw, usStates)) return "United States";
  return "";
}

export function normalizeServiceRegion(region?: string, country: ServiceCountry | "" = ""): string {
  const raw = typeof region === "string" ? region.trim() : "";
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (country === "Canada" || country === "") {
    if (CA_PROVINCE_ABBR_TO_NAME[upper]) return CA_PROVINCE_ABBR_TO_NAME[upper];
    const named = matchListedName(raw, canadianProvinces);
    if (named) return named;
  }
  if (country === "United States" || country === "") {
    if (US_STATE_ABBR_TO_NAME[upper]) return US_STATE_ABBR_TO_NAME[upper];
    const named = matchListedName(raw, usStates);
    if (named) return named;
  }
  return raw;
}

export function regionBelongsToCountry(region: string, country: ServiceCountry): boolean {
  const normalized = normalizeServiceRegion(region, country);
  return getLocationOptions(country).includes(normalized);
}

