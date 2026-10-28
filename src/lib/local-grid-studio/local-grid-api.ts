import { dataForSeoRequestHeaders, withDataForSeoRequestAuth } from "@/lib/dataforseo-request-auth";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { buildCanonicalBusinessKey } from "./local-grid-aggregator";
import type {
  LocalGridBusinessIdentity,
  LocalGridCoordinateNode,
  LocalGridHistoryEntry,
  LocalGridPointResult,
  LocalGridScanDocument,
} from "./local-grid-types";

export async function geocodeLocalGridAddress(params: {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  signal?: AbortSignal;
}): Promise<{
  latitude: number;
  longitude: number;
  label: string;
}> {
  const res = await fetch(backendApiUrl("/organic-dashboard/local-grid/geocode-address"), {
    method: "POST",
    credentials: "include",
    headers: dataForSeoRequestHeaders(),
    body: JSON.stringify(withDataForSeoRequestAuth(params)),
    signal: params.signal,
  });

  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    latitude?: number;
    longitude?: number;
    label?: string;
  };

  if (
    !res.ok ||
    !data.ok ||
    typeof data.latitude !== "number" ||
    typeof data.longitude !== "number"
  ) {
    throw new Error(data.error || `Could not geocode address (${res.status})`);
  }

  return {
    latitude: data.latitude,
    longitude: data.longitude,
    label: data.label ?? params.address ?? "",
  };
}

export async function resolveLocalGridBusinessViaDfs(params: {
  siteId?: string;
  siteName?: string;
  napName?: string;
  siteUrl?: string;
  gbpLocationId?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  address?: string;
  query?: string;
  locationName?: string;
  locationCoordinate?: string;
  languageCode?: string;
  forceRefresh?: boolean;
  signal?: AbortSignal;
}): Promise<{
  business: LocalGridBusinessIdentity | null;
  candidates: LocalGridBusinessIdentity[];
  suggestedKeyword: string;
}> {
  const res = await fetch(backendApiUrl("/organic-dashboard/local-grid/resolve-business"), {
    method: "POST",
    credentials: "include",
    headers: dataForSeoRequestHeaders(),
    body: JSON.stringify(
      withDataForSeoRequestAuth({
        siteId: params.siteId,
        siteName: params.siteName,
        napName: params.napName,
        siteUrl: params.siteUrl,
        gbpLocationId: params.gbpLocationId,
        city: params.city,
        state: params.state,
        zip: params.zip,
        country: params.country,
        address: params.address,
        query: params.query,
        locationName: params.locationName,
        locationCoordinate: params.locationCoordinate,
        languageCode: params.languageCode ?? "en",
        forceRefresh: params.forceRefresh ?? false,
      }),
    ),
    signal: params.signal,
  });

  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    business?: Omit<LocalGridBusinessIdentity, "key"> | null;
    candidates?: Array<Omit<LocalGridBusinessIdentity, "key">>;
    suggestedKeyword?: string;
  };

  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Business lookup failed (${res.status})`);
  }

  const candidates: LocalGridBusinessIdentity[] = (data.candidates ?? []).map((c) => ({
    ...c,
    key: buildCanonicalBusinessKey(c),
  }));

  const business = data.business
    ? {
        ...data.business,
        key: buildCanonicalBusinessKey(data.business),
      }
    : (candidates[0] ?? null);

  return {
    business,
    candidates,
    suggestedKeyword: data.suggestedKeyword ?? "",
  };
}

export async function runLocalGridScanBatch(params: {
  keyword: string;
  points: LocalGridCoordinateNode[];
  zoom?: number;
  languageCode?: string;
  signal?: AbortSignal;
}): Promise<LocalGridPointResult[]> {
  const res = await fetch(backendApiUrl("/organic-dashboard/local-grid/scan-batch"), {
    method: "POST",
    credentials: "include",
    headers: dataForSeoRequestHeaders(),
    body: JSON.stringify(
      withDataForSeoRequestAuth({
        keyword: params.keyword,
        points: params.points,
        zoom: params.zoom ?? 14,
        languageCode: params.languageCode ?? "en",
      }),
    ),
    signal: params.signal,
  });

  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    results?: LocalGridPointResult[];
  };

  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Grid scan batch failed (${res.status})`);
  }

  return data.results ?? [];
}

/**
 * Run a single center pin (1x1) or multi-pin grid scan in batches of up to 8 points,
 * invoking `onBatchProgress` after each batch so the map updates live.
 */
export async function executeLocalGridScanWithProgress(options: {
  keyword: string;
  missingNodes: LocalGridCoordinateNode[];
  reusedPoints?: LocalGridPointResult[];
  batchSize?: number;
  zoom?: number;
  signal?: AbortSignal;
  onBatchProgress?: (snapshot: {
    completedCount: number;
    totalCount: number;
    latestPoints: LocalGridPointResult[];
    allPoints: LocalGridPointResult[];
  }) => void;
}): Promise<LocalGridPointResult[]> {
  const batchSize = Math.max(1, Math.min(8, options.batchSize ?? 6));
  const accumulated: LocalGridPointResult[] = [...(options.reusedPoints ?? [])];
  const totalCount = accumulated.length + options.missingNodes.length;

  if (options.missingNodes.length === 0) {
    options.onBatchProgress?.({
      completedCount: totalCount,
      totalCount,
      latestPoints: [],
      allPoints: accumulated,
    });
    return accumulated;
  }

  for (let i = 0; i < options.missingNodes.length; i += batchSize) {
    if (options.signal?.aborted) {
      throw new Error("Grid scan aborted");
    }
    const chunk = options.missingNodes.slice(i, i + batchSize);
    const batchResults = await runLocalGridScanBatch({
      keyword: options.keyword,
      points: chunk,
      zoom: options.zoom ?? 14,
      signal: options.signal,
    });
    accumulated.push(...batchResults);
    options.onBatchProgress?.({
      completedCount: accumulated.length,
      totalCount,
      latestPoints: batchResults,
      allPoints: [...accumulated],
    });
  }

  return accumulated;
}

export async function fetchLocalGridHistory(siteId: string): Promise<LocalGridHistoryEntry[]> {
  const qs = new URLSearchParams({ siteId }).toString();
  const res = await fetch(backendApiUrl(`/organic-dashboard/local-grid/history?${qs}`), {
    method: "GET",
    credentials: "include",
  });
  const data = (await res.json()) as {
    ok?: boolean;
    scans?: LocalGridHistoryEntry[];
  };
  if (!res.ok || !data.ok) return [];
  return data.scans ?? [];
}

export async function fetchLocalGridScanById(
  siteId: string,
  scanId: string,
): Promise<LocalGridScanDocument | null> {
  const qs = new URLSearchParams({ siteId, scanId }).toString();
  const res = await fetch(backendApiUrl(`/organic-dashboard/local-grid/scan?${qs}`), {
    method: "GET",
    credentials: "include",
  });
  const data = (await res.json()) as {
    ok?: boolean;
    scan?: LocalGridScanDocument;
  };
  if (!res.ok || !data.ok || !data.scan) return null;
  return data.scan;
}

export async function saveLocalGridScanOnServer(
  siteId: string,
  scan: LocalGridScanDocument,
): Promise<LocalGridHistoryEntry | null> {
  const res = await fetch(backendApiUrl("/organic-dashboard/local-grid/save"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId, scan }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    scanSummary?: LocalGridHistoryEntry;
  };
  if (!res.ok || !data.ok) return null;
  return data.scanSummary ?? null;
}

export async function fetchLocalGridWorkspace(siteId?: string): Promise<unknown | null> {
  const query = siteId ? `?siteId=${encodeURIComponent(siteId)}` : "";
  const res = await fetch(backendApiUrl(`/organic-dashboard/local-grid/workspace${query}`), {
    method: "GET",
    credentials: "include",
  });
  const data = (await res.json()) as { ok?: boolean; workspace?: unknown };
  if (!res.ok || !data.ok) return null;
  return data.workspace ?? null;
}

export async function saveLocalGridWorkspace(
  workspace: import("./local-grid-types").LocalGridWorkspaceDocument,
  siteId?: string,
): Promise<boolean> {
  const res = await fetch(backendApiUrl("/organic-dashboard/local-grid/workspace"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace, siteId }),
  });
  const data = (await res.json()) as { ok?: boolean };
  return res.ok && data.ok === true;
}

export async function deleteLocalGridScanOnServer(
  siteId: string,
  scanId: string,
): Promise<LocalGridHistoryEntry[]> {
  const res = await fetch(backendApiUrl("/organic-dashboard/local-grid/delete"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId, scanId }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    scans?: LocalGridHistoryEntry[];
  };
  if (!res.ok || !data.ok) return [];
  return data.scans ?? [];
}
