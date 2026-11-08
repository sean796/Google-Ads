import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  BULK_GOOGLE_MAPS_IMAGE_WARMUP_BUFFER_AHEAD,
  createBulkGoogleMapsImageWarmupController,
} from "../bulk-optimization-google-maps-image-warmup";

const fetchMaps = vi.fn();

vi.mock("@/lib/content-generation/google-maps-image-api", () => ({
  fetchGoogleMapsImageForEntity: (...args: unknown[]) => fetchMaps(...args),
  peekGoogleMapsImageCache: vi.fn(() => null),
}));

describe("createBulkGoogleMapsImageWarmupController", () => {
  beforeEach(() => {
    fetchMaps.mockReset();
    fetchMaps.mockResolvedValue({ imageBase64: "abc", mimeType: "image/jpeg" });
  });

  it("prefetches Google Maps images for the next two SAP posts", async () => {
    const urls = ["https://example.com/a/", "https://example.com/b/", "https://example.com/c/"];
    const acf = new Map<number, Record<string, unknown>>([
      [0, { origin: "Winnipeg, MB" }],
      [1, { origin: "St James, Winnipeg" }],
      [2, { origin: "Fort Garry, Winnipeg" }],
    ]);
    const pending = new Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>();
    const skipUrlSet = new Set<string>();

    const controller = createBulkGoogleMapsImageWarmupController({
      urls,
      skipUrlSet,
      prefetchedPostFieldsCache: acf,
      prefetchedPendingCache: pending,
    });

    controller.maintainBuffer(0);
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMaps).toHaveBeenCalledTimes(BULK_GOOGLE_MAPS_IMAGE_WARMUP_BUFFER_AHEAD);
    expect(fetchMaps).toHaveBeenCalledWith("St James, Winnipeg");
    expect(fetchMaps).toHaveBeenCalledWith("Fort Garry, Winnipeg");
  });
});
