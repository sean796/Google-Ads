import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import {
  buildMetaAdCopySidecar,
  buildMetaAdsCreativeZipBlob,
  loadImageBytes,
  metaAdsCreativeZipFilename,
  metaAdsRowsWithCreativeImages,
} from "@/lib/ppc/export-meta-ads-creative-zip";
import type { MetaAdRow } from "@/lib/ppc/meta-ads-types";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function readyRow(overrides: Partial<MetaAdRow> = {}): MetaAdRow {
  return {
    id: "ppc-meta-ad-test",
    adName: "Test Ad",
    focusKeyword: "AI SEO Edmonton",
    landingPageUrl: "https://example.com/ai-seo",
    status: "ready",
    createdAt: "2026-08-11T00:00:00.000Z",
    copy: {
      primaryText: "Primary text for the ad.",
      headline: "AI SEO Edmonton",
      description: "Grow local search",
      cta: "Learn More",
      finalUrl: "https://example.com/ai-seo",
    },
    creative: {
      aspectRatio: "feed_1x1",
      imagePreviewUrl: TINY_PNG,
    },
    ...overrides,
  };
}

describe("export-meta-ads-creative-zip", () => {
  it("builds a zip with creative png and copy sidecar", async () => {
    const blob = await buildMetaAdsCreativeZipBlob([readyRow()]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const files = unzipSync(bytes);
    const names = Object.keys(files);
    expect(names.some((name) => name.startsWith("creatives/") && name.endsWith(".png"))).toBe(true);
    expect(names.some((name) => name.endsWith("-copy.txt"))).toBe(true);
    expect(names).toContain("meta-ads.csv");
  });

  it("throws when no rows have export content", async () => {
    await expect(
      buildMetaAdsCreativeZipBlob([
        readyRow({
          creative: { aspectRatio: "feed_1x1" },
          researchSections: [],
          copy: undefined,
        }),
      ]),
    ).rejects.toThrow("No ad creatives to export.");
  });

  it("exports research and copy without image", async () => {
    const blob = await buildMetaAdsCreativeZipBlob([
      readyRow({
        creative: { aspectRatio: "feed_1x1" },
        researchSections: [
          {
            id: "creative-brief",
            title: "Creative brief",
            status: "done",
            markdown: "# Brief",
          },
        ],
      }),
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const files = unzipSync(bytes);
    expect(Object.keys(files).some((name) => name.includes("-ad-copy.txt"))).toBe(true);
    expect(Object.keys(files).some((name) => name.includes("-strategy-brief.md"))).toBe(true);
  });

  it("loads base64 image bytes", async () => {
    const bytes = await loadImageBytes(TINY_PNG);
    expect(bytes?.length).toBeGreaterThan(0);
  });

  it("filters rows with creative images", () => {
    const rows = metaAdsRowsWithCreativeImages([
      readyRow(),
      readyRow({ id: "no-image", creative: { aspectRatio: "feed_1x1" }, copy: undefined, researchSections: [] }),
      readyRow({ id: "idle", status: "idle", creative: { aspectRatio: "feed_1x1", imagePreviewUrl: TINY_PNG } }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it("builds copy sidecar with ad fields", () => {
    const sidecar = buildMetaAdCopySidecar(readyRow());
    expect(sidecar).toContain("Primary text for the ad.");
    expect(sidecar).toContain("Headline: AI SEO Edmonton");
  });

  it("sanitizes site label in zip filename", () => {
    expect(metaAdsCreativeZipFilename("NEO Pulse Demo Site")).toMatch(
      /^meta-ads-creatives-neo_pulse_demo_site-\d{4}-\d{2}-\d{2}\.zip$/,
    );
  });
});
