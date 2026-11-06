import { resolveMcpApiBase } from "@/lib/mcp-tools";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { normalizeCompetitorHostname } from "@/lib/competitor-research/filter-connected-site-competitors";

/**
 * Extract business website hostname from DataForSEO my_business_info JSON response.
 */
export function hostnameFromMyBusinessInfoResponse(json: unknown): string | null {
  const root = json as {
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      result?: Array<{
        items?: Array<{
          type?: string;
          domain?: string;
          url?: string;
        }>;
      }>;
    }>;
  };
  const t0 = root.tasks?.[0];
  if (t0?.status_code != null && t0.status_code !== 20000) {
    throw new Error(t0.status_message || `DataForSEO task status ${t0.status_code}`);
  }
  const items = t0?.result?.[0]?.items;
  if (!items?.length) return null;
  const item = items.find((x) => x.type === "google_business_info") ?? items[0];
  const dom = typeof item.domain === "string" ? item.domain.trim() : "";
  if (dom) {
    return normalizeCompetitorHostname(dom.split("/")[0]);
  }
  const url = typeof item.url === "string" ? item.url.trim() : "";
  if (url) {
    try {
      return normalizeCompetitorHostname(new URL(url).hostname);
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchGridCompetitorGmbJsonFromDataForSEO(options: {
  dfsKeyword: string;
  latitude: number | null;
  longitude: number | null;
}): Promise<unknown> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const url = `${base}/DataForSEO_business_data_google_my_business_info_live`;

  const body: Record<string, string> = {
    keyword: options.dfsKeyword,
    language_code: "en",
  };

  const { latitude: lat, longitude: lng } = options;
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    body.location_coordinate = `${lat},${lng},10000`;
  } else {
    body.location_name = "United States";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const j = (await res.json()) as { error?: string; tasks?: unknown[] };
  if (!res.ok) {
    throw new Error(j.error || `DataForSEO request failed (${res.status})`);
  }

  return j;
}

/**
 * Resolve a Google Maps business (cid or place_id keyword) to a website hostname via DataForSEO.
 */
export async function fetchGridCompetitorHostnameFromDataForSEO(options: {
  dfsKeyword: string;
  latitude: number | null;
  longitude: number | null;
}): Promise<string | null> {
  const j = await fetchGridCompetitorGmbJsonFromDataForSEO(options);
  return hostnameFromMyBusinessInfoResponse(j);
}

export async function fetchGridCompetitorGmbFromDataForSEO(options: {
  dfsKeyword: string;
  latitude: number | null;
  longitude: number | null;
}): Promise<{ host: string | null; gmbJson: unknown }> {
  const gmbJson = await fetchGridCompetitorGmbJsonFromDataForSEO(options);
  return {
    host: hostnameFromMyBusinessInfoResponse(gmbJson),
    gmbJson,
  };
}

/** One grid row - DataForSEO keyword + optional map coords (+ UI labels from the CSV parser). */
export type GridPlaceForDfs = {
  dfsKeyword: string;
  latitude: number | null;
  longitude: number | null;
  businessName?: string;
  idLabel?: string;
};

export type GridDfsHostnameResult = {
  place: GridPlaceForDfs;
  host: string | null;
  error: string | null;
};

export type GridDfsGmbResult = {
  place: GridPlaceForDfs;
  host: string | null;
  gmbJson: unknown | null;
  error: string | null;
};

/**
 * Resolve each grid place **in parallel** (concurrent DataForSEO requests).
 */
export async function fetchGridCompetitorHostnamesParallel(
  places: GridPlaceForDfs[],
): Promise<GridDfsHostnameResult[]> {
  return Promise.all(
    places.map(async (place) => {
      try {
        const host = await fetchGridCompetitorHostnameFromDataForSEO(place);
        return { place, host, error: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { place, host: null, error: msg };
      }
    }),
  );
}

export async function fetchGridCompetitorGmbParallel(
  places: GridPlaceForDfs[],
): Promise<GridDfsGmbResult[]> {
  return Promise.all(
    places.map(async (place) => {
      try {
        const { host, gmbJson } = await fetchGridCompetitorGmbFromDataForSEO(place);
        return { place, host, gmbJson, error: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { place, host: null, gmbJson: null, error: msg };
      }
    }),
  );
}

export async function fetchGridCompetitorHostnamesSequential(
  places: GridPlaceForDfs[],
): Promise<GridDfsHostnameResult[]> {
  const out: GridDfsHostnameResult[] = [];
  for (const place of places) {
    try {
      const host = await fetchGridCompetitorHostnameFromDataForSEO(place);
      out.push({ place, host, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.push({ place, host: null, error: msg });
    }
  }
  return out;
}
