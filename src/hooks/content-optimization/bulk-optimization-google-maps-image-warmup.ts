import type { OptimizationOptions } from "@/hooks/use-optimization-options";
import {
  fetchGoogleMapsImageForEntity,
  peekGoogleMapsImageCache,
} from "@/lib/content-generation/google-maps-image-api";

/** Keep Google Maps screenshots this many posts ahead of the active index (SAP bulk only). */
export const BULK_GOOGLE_MAPS_IMAGE_WARMUP_BUFFER_AHEAD = 2;

export type BulkGoogleMapsImageWarmupController = ReturnType<
  typeof createBulkGoogleMapsImageWarmupController
>;

export function bulkSapGoogleMapsImageWarmupEnabled(
  optimizationOptions?: Partial<
    Pick<
      OptimizationOptions,
      "inventorySitemapSource" | "hasEntity" | "optimizeFeaturedImage" | "featuredImageType"
    >
  >,
): boolean {
  return (
    optimizationOptions?.inventorySitemapSource === "sap" &&
    optimizationOptions?.hasEntity === true &&
    optimizationOptions?.optimizeFeaturedImage === true &&
    (optimizationOptions?.featuredImageType ?? "google-maps") === "google-maps"
  );
}

export type CreateBulkGoogleMapsImageWarmupParams = {
  urls: string[];
  skipUrlSet: Set<string>;
  prefetchedPostFieldsCache: Map<number, Record<string, unknown>>;
  prefetchedPendingCache: Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>;
};

function entityLabelForIndex(
  index: number,
  urls: string[],
  prefetchedPostFieldsCache: Map<number, Record<string, unknown>>,
  prefetchedPendingCache: Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>,
): string | null {
  const acf = prefetchedPostFieldsCache.get(index) ?? {};
  for (const key of ["origin", "service_area", "service_area_name", "location", "entity"]) {
    const v = String(acf[key] ?? "").trim();
    if (v && v !== "N/A") return v;
  }

  const pending = prefetchedPendingCache.get(index)?.pending;
  const acfContext = pending?.acfContext as { origin?: string } | undefined;
  const fromContext = String(acfContext?.origin ?? "").trim();
  if (fromContext && fromContext !== "N/A") return fromContext;

  const acfFields = pending?.acfFields as Record<string, unknown> | undefined;
  if (acfFields) {
    for (const key of ["origin", "service_area", "service_area_name", "location", "entity"]) {
      const v = String(acfFields[key] ?? "").trim();
      if (v && v !== "N/A") return v;
    }
  }

  const url = urls[index]?.trim();
  if (!url) return null;
  return null;
}

export function createBulkGoogleMapsImageWarmupController(params: CreateBulkGoogleMapsImageWarmupParams) {
  const { urls, skipUrlSet, prefetchedPostFieldsCache, prefetchedPendingCache } = params;

  const readyEntities = new Set<string>();
  const inFlight = new Map<number, Promise<boolean>>();

  const isIndexReady = (index: number): boolean => {
    if (index < 0 || index >= urls.length) return false;
    if (skipUrlSet.has(urls[index]!)) return true;
    const entity = entityLabelForIndex(index, urls, prefetchedPostFieldsCache, prefetchedPendingCache);
    if (!entity) return false;
    if (readyEntities.has(entity.trim().toLowerCase())) return true;
    return Boolean(peekGoogleMapsImageCache(entity));
  };

  const warmIndex = (index: number): Promise<boolean> => {
    if (index < 0 || index >= urls.length) return Promise.resolve(false);
    if (skipUrlSet.has(urls[index]!)) return Promise.resolve(false);
    if (isIndexReady(index)) return Promise.resolve(true);

    const existing = inFlight.get(index);
    if (existing) return existing;

    const entity = entityLabelForIndex(index, urls, prefetchedPostFieldsCache, prefetchedPendingCache);
    if (!entity) return Promise.resolve(false);

    const promise = fetchGoogleMapsImageForEntity(entity)
      .then(() => {
        readyEntities.add(entity.trim().toLowerCase());
        return true;
      })
      .finally(() => {
        inFlight.delete(index);
      });

    inFlight.set(index, promise);
    return promise;
  };

  /** Prefetch Google Maps screenshots for the next two SAP posts (fire-and-forget). */
  const maintainBuffer = (optimizingIndex: number): void => {
    for (let offset = 1; offset <= BULK_GOOGLE_MAPS_IMAGE_WARMUP_BUFFER_AHEAD; offset++) {
      const nextIndex = optimizingIndex + offset;
      if (nextIndex >= urls.length) continue;
      if (skipUrlSet.has(urls[nextIndex]!)) continue;
      if (!isIndexReady(nextIndex) && !inFlight.has(nextIndex)) {
        void warmIndex(nextIndex);
      }
    }
  };

  return {
    warmIndex,
    maintainBuffer,
    isIndexReady,
  };
}
