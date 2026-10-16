import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { createEmptyOverviewRow } from "@/lib/overview/overview-row-helpers";
import {
  attachAiseoUploadGeneratedFiles,
  rowUrlMatchesWordPressSite,
  uploadAiseoRowAfterWrite,
  uploadOverviewAiseoRowToWordPress,
  uploadOverviewAiseoWrittenRows,
} from "@/lib/overview/overview-aiseo-after-upload";

vi.mock("@/lib/wordpress-api/crud", () => ({
  updateWordPressPost: vi.fn(),
}));

vi.mock("@/lib/wordpress-api/meta", () => ({
  updateOverviewSeoItem: vi.fn(),
  getWordPressPostMeta: vi.fn(),
  bulkUpdateOverviewSeo: vi.fn(),
}));

import { updateWordPressPost } from "@/lib/wordpress-api/crud";
import { bulkUpdateOverviewSeo, updateOverviewSeoItem } from "@/lib/wordpress-api/meta";

const site = {
  id: "wp-1",
  name: "KWB",
  siteUrl: "https://kwbllp.com",
  username: "u",
  appPassword: "p",
} as WordPressSite;

beforeEach(() => {
  vi.mocked(updateWordPressPost).mockReset();
  vi.mocked(updateWordPressPost).mockResolvedValue({ success: true, postId: 44 });
  vi.mocked(updateOverviewSeoItem).mockReset();
  vi.mocked(updateOverviewSeoItem).mockResolvedValue({ postId: 44, ok: true });
  vi.mocked(bulkUpdateOverviewSeo).mockReset();
  vi.mocked(bulkUpdateOverviewSeo).mockImplementation(async (_url, _u, _p, items) => ({
    success: true,
    results: items.map((item, index) => ({ postId: item.postId, index, ok: true })),
    okCount: items.length,
    total: items.length,
  }));
});

describe("uploadOverviewAiseoRowToWordPress", () => {
  it("uploads prepended Answer plus original body from postContentOptimized", async () => {
    const row = createEmptyOverviewRow("https://kwbllp.com/tariffs/");
    row.postContentOptimized =
      "<h2>Answer</h2><p>Direct answer.</p><h2>Cost Factors</h2><p>Body</p>";
    const result = await uploadOverviewAiseoRowToWordPress({
      site,
      row,
      bindings: { "https://kwbllp.com/tariffs/": { postId: 44, subtype: "post" } },
      getInventoryMatchForUrl: () => undefined,
    });
    expect(result.ok).toBe(true);
    expect(updateWordPressPost).toHaveBeenCalledTimes(1);
    expect(updateWordPressPost.mock.calls[0]?.[5]).toContain("Cost Factors");
    expect(updateWordPressPost.mock.calls[0]?.[5]).toContain("Direct answer");
    expect(result.generatedFiles.some((f) => f.name === "wordpress.json")).toBe(true);
    const payloadFile = result.generatedFiles.find((f) => f.name.startsWith("upload-payload-"));
    expect(payloadFile?.content).toContain("postContent");
  });

  it("uploads Answer before Overview when both sections are present", async () => {
    const row = createEmptyOverviewRow("https://kwbllp.com/blog/canadian-tax-pmts/");
    row.postContentOptimized = [
      `<h2 id="answer">Answer</h2><p>Direct answer first.</p>`,
      `<div class="flo-overview"><h2 id="overview">Overview</h2><p>Lead</p></div>`,
      `<h2>Cost Factors</h2><p>Body</p>`,
    ].join("");
    const result = await uploadOverviewAiseoRowToWordPress({
      site,
      row,
      bindings: {
        "https://kwbllp.com/blog/canadian-tax-pmts/": { postId: 44, subtype: "post" },
      },
      getInventoryMatchForUrl: () => undefined,
    });
    expect(result.ok).toBe(true);
    const uploaded = String(updateWordPressPost.mock.calls[0]?.[5] ?? "");
    const answerPos = uploaded.indexOf('id="answer"');
    const overviewPos = uploaded.indexOf('id="overview"');
    expect(answerPos).toBeGreaterThanOrEqual(0);
    expect(overviewPos).toBeGreaterThan(answerPos);
    expect(uploaded).toContain("Direct answer first");
    expect(uploaded).toContain("Cost Factors");
  });

  it("uploads prepended body from warm inventory cache", async () => {
    const row = createEmptyOverviewRow("https://kwbllp.com/tariffs/");
    const result = await uploadOverviewAiseoRowToWordPress({
      site,
      row,
      bindings: { "https://kwbllp.com/tariffs/": { postId: 44, subtype: "post" } },
      getInventoryMatchForUrl: () => ({
        row: {
          id: 44,
          date_gmt: null,
          fields: {
            content: "<h2>Answer</h2><p>Direct answer.</p><h2>Cost Factors</h2><p>Body</p>",
          },
        },
        subtype: "post",
      }),
    });
    expect(result.ok).toBe(true);
    expect(updateWordPressPost).toHaveBeenCalledTimes(1);
    expect(updateWordPressPost.mock.calls[0]?.[5]).toContain("Cost Factors");
  });

  it("uploads WordPress pages via the pages REST endpoint", async () => {
    const row = createEmptyOverviewRow("https://kwbllp.com/about/");
    row.postContentOptimized = "<h2>About</h2><p>Page body.</p>";
    row.aiMeta = "About us meta";
    const result = await uploadOverviewAiseoRowToWordPress({
      site,
      row,
      bindings: { "https://kwbllp.com/about/": { postId: 99, subtype: "page" } },
      getInventoryMatchForUrl: () => ({
        row: { id: 99, date_gmt: null, fields: {} },
        subtype: "page",
      }),
    });
    expect(result.ok).toBe(true);
    expect(updateWordPressPost).toHaveBeenCalledTimes(1);
    const endpointArg = updateWordPressPost.mock.calls[0]?.[13];
    expect(endpointArg).toBe("pages");
    const postTypeArg = updateWordPressPost.mock.calls[0]?.[8];
    expect(postTypeArg).toBe("page");
  });

  it("skips when no post id", async () => {
    const row = createEmptyOverviewRow("https://kwbllp.com/tariffs/");
    const result = await uploadOverviewAiseoRowToWordPress({
      site,
      row,
      bindings: {},
      getInventoryMatchForUrl: () => undefined,
    });
    expect(result.skipped).toBe(true);
    expect(updateWordPressPost).not.toHaveBeenCalled();
  });

  it("skips upload when body is Answer-only (would wipe the live post)", async () => {
    const row = createEmptyOverviewRow("https://kwbllp.com/tariffs/");
    row.postContentOptimized = `<h2 id="answer">Answer</h2><p>Only answer block.</p>`;
    const result = await uploadOverviewAiseoRowToWordPress({
      site,
      row,
      bindings: { "https://kwbllp.com/tariffs/": { postId: 44, subtype: "post" } },
      getInventoryMatchForUrl: () => undefined,
    });
    expect(result.skipped).toBe(true);
    expect(updateWordPressPost).not.toHaveBeenCalled();
    expect(result.generatedFiles.some((f) => f.name === "wordpress.json")).toBe(true);
    const wpJson = JSON.parse(
      result.generatedFiles.find((f) => f.name === "wordpress.json")!.content,
    );
    expect(wpJson.success).toBe(false);
    expect(wpJson.skipped).toBe(true);
  });

  it("blocks upload when row URL is not on the connected site and still writes wordpress.json", async () => {
    const row = createEmptyOverviewRow("https://youjunkit.ca/some-post/");
    row.postContentOptimized = "<h2>Body</h2><p>Content</p>";
    const result = await uploadOverviewAiseoRowToWordPress({
      site,
      row,
      bindings: { "https://youjunkit.ca/some-post/": { postId: 99, subtype: "post" } },
      getInventoryMatchForUrl: () => undefined,
    });
    expect(result.skipped).toBe(true);
    expect(updateWordPressPost).not.toHaveBeenCalled();
    expect(result.generatedFiles.some((f) => f.name === "wordpress.json")).toBe(true);
    const wpJson = JSON.parse(
      result.generatedFiles.find((f) => f.name === "wordpress.json")!.content,
    );
    expect(wpJson.wordpressSite).toBe("https://kwbllp.com");
    expect(String(wpJson.error || wpJson.skipReason)).toMatch(/not on connected site/i);
  });

  it("writes wordpress.json when post binding is missing", async () => {
    const row = createEmptyOverviewRow("https://kwbllp.com/no-binding/");
    row.postContentOptimized = "<h2>Body</h2><p>Content</p>";
    const result = await uploadOverviewAiseoRowToWordPress({
      site,
      row,
      bindings: {},
      getInventoryMatchForUrl: () => undefined,
    });
    expect(result.skipped).toBe(true);
    expect(result.generatedFiles.some((f) => f.name === "wordpress.json")).toBe(true);
  });
});

describe("uploadAiseoRowAfterWrite", () => {
  it("uploads the URL row when a refresh inserted a different post at index 0", async () => {
    const cra = createEmptyOverviewRow("https://kwbllp.com/cra-mail-in-policy/");
    const tariffs = createEmptyOverviewRow("https://kwbllp.com/tariffs/");
    tariffs.postContentOptimized = "<h2>Body</h2><p>Tariffs body plus FAQ</p>";
    const rowsRef = { current: [cra, tariffs] };
    const result = await uploadAiseoRowAfterWrite(
      {
        site,
        rowsRef,
        bindings: {
          "https://kwbllp.com/cra-mail-in-policy/": { postId: 99, subtype: "post" },
          "https://kwbllp.com/tariffs/": { postId: 44, subtype: "post" },
        },
        resolveBindings: async () => ({}),
        getInventoryMatchForUrl: () => undefined,
        batchKey: "wp-1-batch",
        setBulkOptimizationState: () => undefined,
      },
      {
        index: 0,
        url: "https://kwbllp.com/tariffs/",
        html: "<h2>Body</h2><p>Tariffs body plus FAQ</p>",
      },
    );
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    expect(updateWordPressPost).toHaveBeenCalledTimes(1);
    expect(updateWordPressPost.mock.calls[0]?.[3]).toBe(44);
  });
});

describe("rowUrlMatchesWordPressSite", () => {
  it("matches same hostname", () => {
    expect(rowUrlMatchesWordPressSite("https://kwbllp.com/path/", site)).toBe(true);
  });
  it("rejects different hostname", () => {
    expect(rowUrlMatchesWordPressSite("https://youjunkit.ca/path/", site)).toBe(false);
  });
});

describe("uploadOverviewAiseoWrittenRows", () => {
  it("batches multi-row uploads via bulkUpdateOverviewSeo and records per-row failures", async () => {
    vi.mocked(bulkUpdateOverviewSeo).mockResolvedValueOnce({
      success: true,
      results: [
        { postId: 44, index: 0, ok: false, error: "timeout" },
        { postId: 45, index: 1, ok: true },
      ],
      okCount: 1,
      total: 2,
    });

    const rows = [
      createEmptyOverviewRow("https://kwbllp.com/a/"),
      createEmptyOverviewRow("https://kwbllp.com/b/"),
    ];
    for (const row of rows) {
      row.postContentOptimized =
        "<h2>Answer</h2><p>A.</p><h2>Section</h2><p>Body text.</p>";
    }
    const stats = await uploadOverviewAiseoWrittenRows({
      site,
      rows,
      indices: [0, 1],
      bindings: {
        "https://kwbllp.com/a/": { postId: 44, subtype: "post" },
        "https://kwbllp.com/b/": { postId: 45, subtype: "post" },
      },
      getInventoryMatchForUrl: () => undefined,
      resolveBindings: async () => ({}),
    });
    expect(stats).toEqual({ uploaded: 1, failed: 1, skipped: 0 });
    expect(bulkUpdateOverviewSeo).toHaveBeenCalledTimes(1);
    expect(bulkUpdateOverviewSeo.mock.calls[0]?.[3]).toHaveLength(2);
  });

  it("creates upload proof shell when batch state is missing", () => {
    let bulkState: Record<string, { urlGeneratedFiles?: Record<string, Array<{ name: string }>> }> =
      {};
    attachAiseoUploadGeneratedFiles(
      "wp-1-batch",
      (updater) => {
        bulkState = typeof updater === "function" ? updater(bulkState as never) : updater;
      },
      "https://kwbllp.com/a/",
      [{ name: "wordpress.json", content: "{}", mimeType: "application/json" }],
      true,
    );
    const files = bulkState["wp-1-batch"]?.urlGeneratedFiles?.["https://kwbllp.com/a/"] ?? [];
    expect(files.some((f) => f.name === "wordpress.json")).toBe(true);
  });

  it("attaches wordpress.json to bulk state after upload", async () => {
    const rows = [
      createEmptyOverviewRow("https://kwbllp.com/a/"),
    ];
    rows[0]!.postContentOptimized =
      "<h2>Answer</h2><p>A.</p><h2>Body</h2><p>Keep me.</p>";
    let bulkState: Record<string, { urlGeneratedFiles?: Record<string, Array<{ name: string }>> }> =
      { "wp-1-batch": { urlGeneratedFiles: {} } };
    await uploadOverviewAiseoWrittenRows({
      site,
      rows,
      indices: [0],
      bindings: { "https://kwbllp.com/a/": { postId: 44, subtype: "post" } },
      getInventoryMatchForUrl: () => undefined,
      resolveBindings: async () => ({}),
      batchKey: "wp-1-batch",
      setBulkOptimizationState: (updater) => {
        bulkState = typeof updater === "function" ? updater(bulkState as never) : updater;
      },
    });
    const files = bulkState["wp-1-batch"]?.urlGeneratedFiles?.["https://kwbllp.com/a/"] ?? [];
    expect(files.some((f) => f.name === "wordpress.json")).toBe(true);
  });
});
