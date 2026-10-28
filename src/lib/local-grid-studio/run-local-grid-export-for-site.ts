import type { WordPressSite } from "@/components/integrations/types";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import {
  readSiteServiceCity,
  readSiteServiceCountry,
  readSiteServiceState,
} from "@/lib/wordpress-api/site-service-area";
import {
  aggregateLocalGridScan,
  buildCanonicalBusinessKey,
} from "@/lib/local-grid-studio/local-grid-aggregator";
import {
  executeLocalGridScanWithProgress,
  geocodeLocalGridAddress,
  resolveLocalGridBusinessViaDfs,
} from "@/lib/local-grid-studio/local-grid-api";
import { serializeLocalGridScanToCsv } from "@/lib/local-grid-studio/local-grid-csv";
import { generateLocalGridCoordinates } from "@/lib/local-grid-studio/local-grid-math";
import type {
  LocalGridBusinessIdentity,
  LocalGridDistanceMeasure,
  LocalGridScanDocument,
  LocalGridScanSize,
  LocalGridShape,
} from "@/lib/local-grid-studio/local-grid-types";

export type LocalGridExportForSiteOptions = {
  keyword: string;
  scanSize?: LocalGridScanSize;
  shape?: LocalGridShape;
  distance?: number;
  distanceMeasure?: LocalGridDistanceMeasure;
  signal?: AbortSignal;
  shouldAbort?: () => boolean | Promise<boolean>;
  onProgress?: (label: string, progress?: number) => void;
};

export type LocalGridExportForSiteResult = {
  csvContent: string;
  fileName: string;
  effectiveKeyword: string;
  businessName: string;
  scan: LocalGridScanDocument;
};

function defaultLocation(site: WordPressSite) {
  const defaultLoc =
    site.locations?.find((l) => l.isDefault) ??
    site.locations?.[0] ??
    site.napInfo?.locations?.find((l) => l.isDefault) ??
    site.napInfo?.locations?.[0] ??
    null;
  return {
    city: readSiteServiceCity(site) || defaultLoc?.city?.trim() || "",
    state: readSiteServiceState(site) || defaultLoc?.state?.trim() || "",
    country: readSiteServiceCountry(site) || defaultLoc?.country?.trim() || "",
    address: site.napInfo?.address?.trim() || defaultLoc?.address?.trim() || "",
    zip: defaultLoc?.zip?.trim() || "",
  };
}

function pickTargetBusiness(
  site: WordPressSite,
  allPoints: import("@/lib/local-grid-studio/local-grid-types").LocalGridPointResult[],
  initial: LocalGridBusinessIdentity | null,
): LocalGridBusinessIdentity {
  let resolvedTarget = initial ?? {
    key: "unknown",
    business: site.napInfo?.name?.trim() || site.name.trim(),
    address: "",
    placeId: "",
    websiteUrl: getPublicSiteUrl(site),
    primaryCategory: "",
    secondaryCategories: "",
    rating: null,
    reviews: null,
    latitude: null,
    longitude: null,
  };

  const initialAgg = aggregateLocalGridScan(allPoints, resolvedTarget);
  if (
    (!resolvedTarget.business || initialAgg.summary.rankedPoints === 0) &&
    initialAgg.competitors.length > 0
  ) {
    const siteNameLower = (site.napInfo?.name || site.name || "").trim().toLowerCase();
    resolvedTarget =
      initialAgg.competitors.find(
        (c) => siteNameLower && c.business.toLowerCase().includes(siteNameLower),
      ) ?? initialAgg.competitors[0]!;
  }

  return {
    ...resolvedTarget,
    key: buildCanonicalBusinessKey(resolvedTarget),
  };
}

export async function runLocalGridExportForSite(
  site: WordPressSite,
  options: LocalGridExportForSiteOptions,
): Promise<LocalGridExportForSiteResult> {
  const kw = options.keyword.trim();
  if (!kw) {
    throw new Error("Keyword is required for Local Grid export.");
  }

  const scanSize = options.scanSize ?? "5x5";
  const shape = options.shape ?? "circle";
  const distance = options.distance ?? 1;
  const distanceMeasure = options.distanceMeasure ?? "mile";
  const businessName = site.napInfo?.name?.trim() || site.name.trim();
  const loc = defaultLocation(site);

  const abortIfNeeded = async () => {
    if (options.signal?.aborted) {
      throw new Error("Grid scan aborted");
    }
    if (options.shouldAbort && (await options.shouldAbort())) {
      throw new Error("Grid scan aborted");
    }
  };

  options.onProgress?.("Resolving business…", 0.1);
  await abortIfNeeded();

  const bizRes = await resolveLocalGridBusinessViaDfs({
    siteId: site.id,
    siteName: site.name,
    napName: site.napInfo?.name,
    siteUrl: getPublicSiteUrl(site) || site.siteUrl,
    gbpLocationId: site.gbpLocationId,
    city: loc.city,
    state: loc.state,
    zip: loc.zip,
    country: loc.country,
    address: loc.address,
    query: kw,
    signal: options.signal,
  });

  let centerLat = bizRes.business?.latitude ?? null;
  let centerLng = bizRes.business?.longitude ?? null;

  if (centerLat == null || centerLng == null) {
    options.onProgress?.("Geocoding service area…", 0.15);
    const geo = await geocodeLocalGridAddress({
      address: loc.address,
      city: loc.city,
      state: loc.state,
      zip: loc.zip,
      country: loc.country,
      signal: options.signal,
    });
    centerLat = geo.latitude;
    centerLng = geo.longitude;
  }

  const nodes = generateLocalGridCoordinates({
    centerLat,
    centerLng,
    scanSize,
    shape,
    distance,
    distanceMeasure,
  });

  options.onProgress?.(`Scanning ${nodes.length} grid pins…`, 0.25);

  const allPoints = await executeLocalGridScanWithProgress({
    keyword: kw,
    missingNodes: nodes,
    reusedPoints: [],
    batchSize: scanSize === "1x1" ? 1 : 6,
    zoom: 14,
    signal: options.signal,
    onBatchProgress: (snap) => {
      const pct = 0.25 + (0.65 * snap.completedCount) / Math.max(1, snap.totalCount);
      options.onProgress?.(`Scanning pin ${snap.completedCount}/${snap.totalCount}…`, pct);
    },
  });

  if (allPoints.length === 0) {
    throw new Error("Local Grid scan returned no results.");
  }

  const resolvedTarget = pickTargetBusiness(site, allPoints, bizRes.business);
  const finalAgg = aggregateLocalGridScan(allPoints, resolvedTarget);
  const scanDateLabel = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const scan: LocalGridScanDocument = {
    scanId: `scan_${Date.now()}`,
    siteId: site.id,
    scanDateIso: new Date().toISOString(),
    scanDateLabel,
    keyword: kw,
    scanSize,
    shape,
    distance,
    distanceMeasure,
    centerLat,
    centerLng,
    targetBusiness: resolvedTarget,
    points: allPoints,
    summary: finalAgg.summary,
  };

  const csvContent = serializeLocalGridScanToCsv(scan);
  if (!csvContent.trim()) {
    throw new Error("Local Grid export produced an empty CSV.");
  }

  const safeBiz = businessName.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 40);
  const safeKw = kw.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 30);
  const fileName = `${safeBiz}-${safeKw}-local-grid.csv`;

  options.onProgress?.("Grid export complete", 1);

  return {
    csvContent,
    fileName,
    effectiveKeyword: kw,
    businessName,
    scan,
  };
}
