import { describe, expect, it } from "vitest";
import {
  bulkGeneratorPushBindingsFromFiles,
  overviewBindingFromBulkWordpressProofFiles,
} from "@/lib/bulk/bulk-generator-overview-row-bridge";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";

describe("bulk-generator push bindings", () => {
  it("reads postId from wordpress.json proof", () => {
    const files: BulkGeneratedFile[] = [
      {
        id: "1",
        rowIndex: 0,
        fileName: "wordpress.json",
        content: JSON.stringify({ success: true, postId: 5454, pageUrl: "https://example.com/service-area/foo/" }),
        mimeType: "application/json",
        status: "completed",
        timestamp: 1,
      },
    ];
    const binding = overviewBindingFromBulkWordpressProofFiles(files, "sap");
    expect(binding?.postId).toBe(5454);
    expect(binding?.subtype).toBe("entity");
  });

  it("maps proof files to studio and page URLs", () => {
    const map = bulkGeneratorPushBindingsFromFiles({
      displayRows: [
        {
          keyword: "kw",
          title: "T",
          destination_url: "https://blindmagic.com/service-area/custom-blinds-beltline-calgary/",
        },
      ],
      filesByRow: new Map([
        [
          0,
          [
            {
              id: "1",
              rowIndex: 0,
              fileName: "wordpress.json",
              content: JSON.stringify({
                success: true,
                postId: 99,
                pageUrl: "https://blindmagic.com/service-area/custom-blinds-beltline-calgary/",
              }),
              mimeType: "application/json",
              status: "completed",
              timestamp: 1,
            },
          ],
        ],
      ]),
      siteBaseUrl: "https://blindmagic.com",
      sitemapSource: "sap",
      site: {
        siteUrl: "https://blindmagic.com",
        entitySitemapUrl: "https://blindmagic.com/service-area-sitemap.xml",
      },
      sapInventoryRows: [],
    });
    expect(Object.keys(map).length).toBeGreaterThan(0);
    expect(Object.values(map)[0]?.postId).toBe(99);
  });
});
