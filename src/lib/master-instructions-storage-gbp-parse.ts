import type {
  GbpMasterRulesGrounding,
  MasterInstructionSource,
} from "@/lib/master-instructions-storage-types";

export const MASTER_RULES_CITY_PREDICATES = new Set(["city", "locality", "address_city", "located_in_city"]);
export const MASTER_RULES_REGION_PREDICATES = new Set([
  "region",
  "province",
  "state",
  "administrative_area",
  "administrative_area_level_1",
]);

export function firstTripleObjectValue(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const semi = t.indexOf(";");
  return (semi >= 0 ? t.slice(0, semi) : t).trim();
}

export const GBP_MASTER_RULES_FILENAME = "GBP-business-gbp.txt";

const MASTER_RULES_NAME_PREDICATES = new Set([
  "name",
  "business_name",
  "business name",
  "businessname",
  "title",
  "legal_name",
  "gbp_name",
]);
const MASTER_RULES_LAT_PREDICATES = new Set([
  "latitude",
  "lat",
  "gps_latitude",
  "geo_lat",
  "geo_latitude",
]);
const MASTER_RULES_LNG_PREDICATES = new Set([
  "longitude",
  "lng",
  "lon",
  "gps_longitude",
  "geo_lng",
  "geo_longitude",
]);
const MASTER_RULES_COORD_PAIR_PREDICATES = new Set([
  "gps_coordinates",
  "coordinates",
  "coordinate",
  "geo",
  "location_coordinate",
  "lat_lng",
  "latlng",
]);
const MASTER_RULES_PLACE_ID_PREDICATES = new Set(["place_id", "place id", "placeid"]);
const MASTER_RULES_CID_PREDICATES = new Set(["cid"]);
const MASTER_RULES_POSTAL_PREDICATES = new Set([
  "postal_code",
  "postal code",
  "postalcode",
  "zip",
  "zip_code",
  "zip code",
  "postcode",
]);
const MASTER_RULES_ADDRESS_PREDICATES = new Set([
  "address",
  "street_address",
  "street address",
  "formatted_address",
  "formatted address",
]);
const MASTER_RULES_COUNTRY_PREDICATES = new Set(["country", "country_code", "country code"]);

function tripleNum(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function isGbpMasterRulesFilename(name: string): boolean {
  return name.trim().toLowerCase() === GBP_MASTER_RULES_FILENAME.toLowerCase();
}

export function findGbpMasterRulesSource(sources: MasterInstructionSource[]): MasterInstructionSource | null {
  return (
    sources.find((s) => isGbpMasterRulesFilename(s.name)) ??
    sources.find((s) => s.name.toLowerCase().includes("gbp-business-gbp")) ??
    null
  );
}

function applyCoordPair(
  raw: string,
  latitude: number | null,
  longitude: number | null,
): { latitude: number | null; longitude: number | null } {
  if (latitude != null && longitude != null) return { latitude, longitude };
  const sep = raw.includes(",") ? "," : raw.includes(";") ? ";" : "";
  const bits = sep ? raw.split(sep).map((p) => p.trim()).filter(Boolean) : [raw.trim()];
  if (bits.length < 2) return { latitude, longitude };
  const la = tripleNum(bits[0]);
  const ln = tripleNum(bits[1]);
  return {
    latitude: latitude ?? la,
    longitude: longitude ?? ln,
  };
}

function applyBracketSubjectName(state: { businessName: string }, line: string): void {
  const match = line.trim().match(/^\[([^\]]+)\]/);
  if (!match) return;
  const subject = match[1].replace(/\s*-\s*entity\/topic\s*$/i, "").trim();
  if (!subject) return;
  if (/^(business|location|address)$/i.test(subject)) return;
  const hasColon = subject.includes(":");
  const cur = state.businessName;
  if (!cur) {
    state.businessName = subject;
    return;
  }
  const curHasColon = cur.includes(":");
  if (curHasColon && !hasColon) {
    state.businessName = subject;
    return;
  }
  if (!curHasColon && hasColon) return;
  if (subject.length < cur.length) state.businessName = subject;
}

function applyPredicateValue(
  pred: string,
  obj: string,
  state: {
    businessName: string;
    latitude: number | null;
    longitude: number | null;
    placeId: string | null;
    cid: string | null;
    city: string;
    region: string;
    postalCode: string;
    address: string;
    country: string;
  },
): void {
  if (!pred || !obj) return;
  if (MASTER_RULES_NAME_PREDICATES.has(pred)) state.businessName = obj;
  if (state.latitude == null && MASTER_RULES_LAT_PREDICATES.has(pred)) state.latitude = tripleNum(obj);
  if (state.longitude == null && MASTER_RULES_LNG_PREDICATES.has(pred)) {
    state.longitude = tripleNum(obj);
  }
  if (MASTER_RULES_COORD_PAIR_PREDICATES.has(pred)) {
    const pair = applyCoordPair(obj, state.latitude, state.longitude);
    state.latitude = pair.latitude;
    state.longitude = pair.longitude;
  }
  if (!state.placeId && MASTER_RULES_PLACE_ID_PREDICATES.has(pred)) state.placeId = obj;
  if (!state.cid && MASTER_RULES_CID_PREDICATES.has(pred)) state.cid = obj;
  if (!state.city && MASTER_RULES_CITY_PREDICATES.has(pred)) state.city = obj;
  if (!state.region && MASTER_RULES_REGION_PREDICATES.has(pred)) state.region = obj;
  if (!state.postalCode && MASTER_RULES_POSTAL_PREDICATES.has(pred)) state.postalCode = obj;
  if (!state.address && MASTER_RULES_ADDRESS_PREDICATES.has(pred)) state.address = obj;
  if (!state.country && MASTER_RULES_COUNTRY_PREDICATES.has(pred)) state.country = obj;
}

function collectGbpFromJsonNode(
  node: unknown,
  state: {
    businessName: string;
    latitude: number | null;
    longitude: number | null;
    placeId: string | null;
    cid: string | null;
    city: string;
    region: string;
    postalCode: string;
    address: string;
    country: string;
  },
  depth = 0,
): void {
  if (node == null || depth > 12) return;
  if (Array.isArray(node)) {
    for (const item of node) collectGbpFromJsonNode(item, state, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const o = node as Record<string, unknown>;

  if (!state.businessName) {
    if (typeof o.title === "string" && o.title.trim()) state.businessName = o.title.trim();
    else if (typeof o.businessName === "string" && o.businessName.trim()) {
      state.businessName = o.businessName.trim();
    } else if (typeof o.name === "string" && o.name.trim()) state.businessName = o.name.trim();
  }

  if (state.latitude == null) {
    state.latitude =
      tripleNum(String(o.latitude ?? "")) ??
      tripleNum(String(o.lat ?? "")) ??
      null;
  }
  if (state.longitude == null) {
    state.longitude =
      tripleNum(String(o.longitude ?? "")) ??
      tripleNum(String(o.lng ?? "")) ??
      null;
  }

  const gps = o.gps_coordinates;
  if (gps && typeof gps === "object") {
    const g = gps as Record<string, unknown>;
    if (state.latitude == null) state.latitude = tripleNum(String(g.latitude ?? ""));
    if (state.longitude == null) state.longitude = tripleNum(String(g.longitude ?? ""));
  }

  if (!state.placeId && typeof o.place_id === "string" && o.place_id.trim()) {
    state.placeId = o.place_id.trim();
  }
  if (!state.cid && o.cid != null) {
    const c = String(o.cid).trim();
    if (c) state.cid = c;
  }

  if (!state.city && typeof o.city === "string" && o.city.trim()) state.city = o.city.trim();
  if (!state.region && typeof o.region === "string" && o.region.trim()) state.region = o.region.trim();
  if (!state.postalCode && typeof o.postalCode === "string" && o.postalCode.trim()) {
    state.postalCode = o.postalCode.trim();
  }
  if (!state.address && typeof o.formattedAddress === "string" && o.formattedAddress.trim()) {
    state.address = o.formattedAddress.trim();
  }
  if (!state.address && typeof o.address === "string" && o.address.trim()) state.address = o.address.trim();
  if (!state.country && typeof o.country === "string" && o.country.trim()) state.country = o.country.trim();

  for (const v of Object.values(o)) collectGbpFromJsonNode(v, state, depth + 1);
}

function tryParseEmbeddedJson(body: string): unknown | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export function parseGbpTriplesBody(body: string): {
  businessName: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  cid: string | null;
  city: string;
  region: string;
  postalCode: string;
  address: string;
  country: string;
} {
  const state = {
    businessName: "",
    latitude: null as number | null,
    longitude: null as number | null,
    placeId: null as string | null,
    cid: null as string | null,
    city: "",
    region: "",
    postalCode: "",
    address: "",
    country: "",
  };

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("[")) {
      applyBracketSubjectName(state, trimmed);
      continue;
    }

    const coordPrefix = "- Coordinates:";
    if (trimmed.startsWith(coordPrefix)) {
      const pair = applyCoordPair(trimmed.slice(coordPrefix.length), state.latitude, state.longitude);
      state.latitude = pair.latitude;
      state.longitude = pair.longitude;
      continue;
    }

    const tab = line.indexOf("\t");
    if (tab >= 0) {
      const parts = line.split("\t");
      if (parts.length >= 3) {
        applyPredicateValue(parts[1].trim().toLowerCase(), parts.slice(2).join("\t").trim(), state);
      } else {
        applyPredicateValue(line.slice(0, tab).trim().toLowerCase(), line.slice(tab + 1).trim(), state);
      }
      continue;
    }

    const colon = trimmed.indexOf(":");
    if (colon > 0) {
      applyPredicateValue(
        trimmed.slice(0, colon).trim().toLowerCase(),
        trimmed.slice(colon + 1).trim(),
        state,
      );
    }
  }

  const embedded = tryParseEmbeddedJson(body);
  if (embedded) collectGbpFromJsonNode(embedded, state);

  return state;
}

export function groundingFromParsed(state: {
  businessName: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  cid: string | null;
  city?: string;
  region?: string;
  postalCode?: string;
  address?: string;
}): GbpMasterRulesGrounding | null {
  if (state.latitude == null || state.longitude == null) return null;
  if (!state.businessName.trim()) return null;
  return {
    businessName: state.businessName.trim(),
    latitude: state.latitude,
    longitude: state.longitude,
    placeId: state.placeId,
    cid: state.cid,
  };
}

export function groundingFromParsedAllowMissingName(state: {
  businessName: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  cid: string | null;
  city?: string;
  region?: string;
  postalCode?: string;
  address?: string;
}): Pick<GbpMasterRulesGrounding, "latitude" | "longitude" | "placeId" | "cid"> & {
  businessName: string;
} | null {
  if (state.latitude == null || state.longitude == null) return null;
  return {
    businessName: state.businessName.trim(),
    latitude: state.latitude,
    longitude: state.longitude,
    placeId: state.placeId,
    cid: state.cid,
  };
}
