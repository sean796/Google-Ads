import { describe, expect, it, vi } from "vitest";
import { bulkOptimizationRunPostLoop } from "../bulk-optimization-post-loop";
import type { WordPressSite } from "@/components/integrations/types";

vi.mock("../bulk-optimization-do-prefetch", () => ({
  bulkOptimizationDoPrefetch: vi.fn().mockResolvedValue(undefined),
}));

import { bulkOptimizationDoPrefetch } from "../bulk-optimization-do-prefetch";
import type { BulkOptimizationState } from "../use-optimization-state";
import type { SetStateAction } from "react";

const site: WordPressSite = {
  id: "site-1",
  name: "Test",
  siteUrl: "https://example.com",
  username: "u",
  appPassword: "p",
  connectedAt: 1,
};

function makePending(url: string) {
  return {
    pending: {
      site,
      url,
      existingTitle: "Title",
      existingContent: "<p>Body</p>",
      optimizationOptions: { optimizeContent: true, hasEntity: false },
    },
    primaryKeyword: "test keyword",
  };
}

describe("bulkOptimizationRunPostLoop halt on failure", () => {
  it("skips a prefetch miss and still runs the next cached URL", async () => {
    vi.mocked(bulkOptimizationDoPrefetch).mockResolvedValue(undefined);
    const urls = ["https://example.com/a/", "https://example.com/b/"];
    const prefetchedPendingCache = new Map<number, ReturnType<typeof makePending>>([
      [1, makePending(urls[1]!)],
    ]);
    const continueFn = vi.fn().mockResolvedValue(undefined);

    await bulkOptimizationRunPostLoop({
      urls,
      skipUrlSet: new Set(),
      batchKey: "site-1-batch",
      site,
      muteToasts: true,
      isAcfKeywordMode: true,
      prefetchedPendingCache,
      prefetchedAcfFieldsCache: new Map(),
      pendingOptimizationData: {},
      optimizationFileManagers: {},
      bulkContinueOptimizationRef: { current: continueFn },
      bulkContextRef: { current: null },
      setBulkOptimizationState: vi.fn((fn) => fn({ "site-1-batch": { urls } })),
      setOptimizationProgress: vi.fn((fn) => fn({})),
      recordGeneratedFilesForUrl: vi.fn(),
      serpWarmup: {
        maintainBuffer: vi.fn(),
        ensureReady: vi.fn(),
        seedReadyFromAcf: vi.fn(),
        clearWarmingIndices: vi.fn(),
        isIndexReady: vi.fn(() => true),
      },
      prefetchArgs: {
        site,
        urls,
        batchKey: "site-1-batch",
        isAcfKeywordMode: true,
        updateMode: "draft",
        optimizationOptions: { optimizeContent: true, hasEntity: false },
        inContentImageRequest: null,
        wordPressPostsForRun: [],
        siteServiceContext: null,
        prefetchedAcfFieldsCache: new Map(),
        prefetchedPostPayloadByUrlIndex: new Map(),
        prefetchedPendingCache,
        setBulkOptimizationState: vi.fn(),
        bulkInventorySnapshot: null,
      },
    });

    expect(continueFn).toHaveBeenCalledTimes(1);
    expect(bulkOptimizationDoPrefetch).toHaveBeenCalledWith(0, expect.any(Object));
  });

  it("halts after a pipeline error without running the next URL", async () => {
    const urls = ["https://example.com/a/", "https://example.com/b/"];
    const prefetchedPendingCache = new Map<number, ReturnType<typeof makePending>>([
      [0, makePending(urls[0]!)],
      [1, makePending(urls[1]!)],
    ]);
    const continueFn = vi.fn().mockRejectedValueOnce(new Error("Blueprint failed"));

    await bulkOptimizationRunPostLoop({
      urls,
      skipUrlSet: new Set(),
      batchKey: "site-1-batch",
      site,
      muteToasts: true,
      isAcfKeywordMode: true,
      prefetchedPendingCache,
      prefetchedAcfFieldsCache: new Map(),
      pendingOptimizationData: {},
      optimizationFileManagers: {},
      bulkContinueOptimizationRef: { current: continueFn },
      bulkContextRef: { current: null },
      setBulkOptimizationState: vi.fn((fn) => fn({ "site-1-batch": { urls } })),
      setOptimizationProgress: vi.fn((fn) => fn({})),
      recordGeneratedFilesForUrl: vi.fn(),
      serpWarmup: {
        maintainBuffer: vi.fn(),
        ensureReady: vi.fn(),
        seedReadyFromAcf: vi.fn(),
        clearWarmingIndices: vi.fn(),
        isIndexReady: vi.fn(() => true),
      },
      prefetchArgs: {
        site,
        urls,
        batchKey: "site-1-batch",
        isAcfKeywordMode: true,
        updateMode: "draft",
        optimizationOptions: { optimizeContent: true, hasEntity: false },
        inContentImageRequest: null,
        wordPressPostsForRun: [],
        siteServiceContext: null,
        prefetchedAcfFieldsCache: new Map(),
        prefetchedPostPayloadByUrlIndex: new Map(),
        prefetchedPendingCache,
        setBulkOptimizationState: vi.fn(),
        bulkInventorySnapshot: null,
      },
    });

    expect(continueFn).toHaveBeenCalled();
  });

  it("stores generated files on the URL after a successful continue", async () => {
    const url = "https://example.com/113-114-street-edmonton/";
    const urls = [url];
    const prefetchedPendingCache = new Map<number, ReturnType<typeof makePending>>([
      [0, makePending(url)],
    ]);
    const optimizationFileManagers: Record<string, { addFile: (n: string, c: string, m: string) => void; getFiles: () => unknown[] }> = {};
    const continueFn = vi.fn().mockImplementation(async () => {
      const fm = optimizationFileManagers[site.id];
      fm?.addFile("content-edmonton.html", "<h2>Answer</h2>", "text/html");
      fm?.addFile("content-edmonton.md", "## Answer", "text/markdown");
      fm?.addFile("checklist-edmonton.json", "1. Sunlight", "text/plain");
    });
    let store: Record<string, BulkOptimizationState> = {
      "site-1-batch": { urls, currentIndex: 0, urlStatuses: {}, currentStep: "", urlGeneratedFiles: {} },
    };
    const setBulkOptimizationState = vi.fn(
      (action: SetStateAction<Record<string, BulkOptimizationState>>) => {
        if (typeof action === "function") {
          store = (
            action as (
              prev: Record<string, BulkOptimizationState>,
            ) => Record<string, BulkOptimizationState>
          )(store);
        }
        return store;
      },
    );

    await bulkOptimizationRunPostLoop({
      urls,
      skipUrlSet: new Set(),
      batchKey: "site-1-batch",
      site,
      muteToasts: true,
      isAcfKeywordMode: true,
      prefetchedPendingCache,
      prefetchedAcfFieldsCache: new Map(),
      pendingOptimizationData: {},
      optimizationFileManagers: optimizationFileManagers as never,
      bulkContinueOptimizationRef: { current: continueFn },
      bulkContextRef: { current: null },
      setBulkOptimizationState,
      setOptimizationProgress: vi.fn((fn) => fn({})),
      recordGeneratedFilesForUrl: vi.fn(),
      serpWarmup: {
        maintainBuffer: vi.fn(),
        ensureReady: vi.fn(),
        seedReadyFromAcf: vi.fn(),
        clearWarmingIndices: vi.fn(),
        isIndexReady: vi.fn(() => true),
      },
      prefetchArgs: {
        site,
        urls,
        batchKey: "site-1-batch",
        isAcfKeywordMode: true,
        updateMode: "draft",
        optimizationOptions: { optimizeContent: true, hasEntity: true },
        inContentImageRequest: null,
        wordPressPostsForRun: [],
        siteServiceContext: null,
        prefetchedAcfFieldsCache: new Map(),
        prefetchedPostPayloadByUrlIndex: new Map(),
        prefetchedPendingCache,
        setBulkOptimizationState: vi.fn(),
        bulkInventorySnapshot: null,
      },
    });

    expect(continueFn).toHaveBeenCalledTimes(1);
    expect(store["site-1-batch"]?.urlStatuses?.[url]).toBe("completed");
    const stored = store["site-1-batch"]?.urlGeneratedFiles?.[url] ?? [];
    expect(stored.map((file) => file.name)).toEqual([
      "content-edmonton.html",
      "content-edmonton.md",
      "checklist-edmonton.json",
    ]);
  });

  it("does not mark the URL completed when continue throws", async () => {
    const url = "https://example.com/113-114-street-edmonton/";
    const urls = [url];
    const prefetchedPendingCache = new Map<number, ReturnType<typeof makePending>>([
      [0, makePending(url)],
    ]);
    const continueFn = vi.fn().mockRejectedValue(new Error("WordPress upload failed"));
    let store: Record<string, BulkOptimizationState> = {
      "site-1-batch": { urls, currentIndex: 0, urlStatuses: {}, currentStep: "" },
    };
    const setBulkOptimizationState = vi.fn(
      (action: SetStateAction<Record<string, BulkOptimizationState>>) => {
        if (typeof action === "function") {
          store = (
            action as (
              prev: Record<string, BulkOptimizationState>,
            ) => Record<string, BulkOptimizationState>
          )(store);
        }
        return store;
      },
    );

    await bulkOptimizationRunPostLoop({
      urls,
      skipUrlSet: new Set(),
      batchKey: "site-1-batch",
      site,
      muteToasts: true,
      isAcfKeywordMode: true,
      prefetchedPendingCache,
      prefetchedAcfFieldsCache: new Map(),
      pendingOptimizationData: {},
      optimizationFileManagers: {},
      bulkContinueOptimizationRef: { current: continueFn },
      bulkContextRef: { current: null },
      setBulkOptimizationState,
      setOptimizationProgress: vi.fn((fn) => fn({})),
      recordGeneratedFilesForUrl: vi.fn(),
      serpWarmup: {
        maintainBuffer: vi.fn(),
        ensureReady: vi.fn(),
        seedReadyFromAcf: vi.fn(),
        clearWarmingIndices: vi.fn(),
        isIndexReady: vi.fn(() => true),
      },
      prefetchArgs: {
        site,
        urls,
        batchKey: "site-1-batch",
        isAcfKeywordMode: true,
        updateMode: "draft",
        optimizationOptions: { optimizeContent: true, hasEntity: true },
        inContentImageRequest: null,
        wordPressPostsForRun: [],
        siteServiceContext: null,
        prefetchedAcfFieldsCache: new Map(),
        prefetchedPostPayloadByUrlIndex: new Map(),
        prefetchedPendingCache,
        setBulkOptimizationState: vi.fn(),
        bulkInventorySnapshot: null,
      },
    });

    expect(continueFn).toHaveBeenCalledTimes(1);
    expect(store["site-1-batch"]?.urlStatuses?.[url]).toBe("error");
    expect(store["site-1-batch"]?.urlStatuses?.[url]).not.toBe("completed");
  });
});
