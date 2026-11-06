import { describe, expect, it, vi, beforeEach } from "vitest";
import { continueOptimizationWithKeyword } from "../continue-optimization";

const resolveSapEntityForOptimize = vi.fn();
const runContinueOptimizationTryBody = vi.fn();

vi.mock("../continue-optimization-entity-helpers", () => ({
  resolveSapEntityForOptimize: (...args: unknown[]) => resolveSapEntityForOptimize(...args),
  updateBulkStateWithEntity: vi.fn(),
}));

vi.mock("../continue-optimization-try-body", () => ({
  runContinueOptimizationTryBody: (...args: unknown[]) => runContinueOptimizationTryBody(...args),
}));

describe("continueOptimizationWithKeyword SAP entity", () => {
  beforeEach(() => {
    resolveSapEntityForOptimize.mockReset();
    runContinueOptimizationTryBody.mockReset();
    runContinueOptimizationTryBody.mockResolvedValue(undefined);
  });

  it("does not call resolveSapEntityForOptimize when hasEntity is not true and source is not sap", async () => {
    await continueOptimizationWithKeyword({
      siteId: "site-1",
      selectedKeyword: { query: "solar panels", clicks: 0, impressions: 0, ctr: 0, position: 0 },
      testMode: false,
      pendingOptimization: {
        "site-1": {
          site: { id: "site-1", name: "T", siteUrl: "https://example.com", username: "u", appPassword: "p", connectedAt: 0 },
          url: "https://example.com/post/",
          updateMode: "update",
          gscResult: {},
          existingPost: { postTypeEndpoint: "posts" },
          resolved: { endpoint: "posts" },
          existingTitle: "Solar Post",
          existingContent: "<p>Body</p>",
          existingExcerpt: "",
          optimizationOptions: { hasEntity: false, optimizeContent: true },
          acfFields: { keyword_focus: "solar panels" },
          acfContext: {},
        },
      },
      optimizationFileManagers: {},
      setPendingOptimization: vi.fn((fn) => fn({})),
      setOptimizationFileManagers: vi.fn((fn) => fn({})),
      setOptimizationProgress: vi.fn((fn) => fn({})),
      setIsOptimizingContent: vi.fn((fn) => fn({})),
      setBulkOptimizationState: vi.fn((fn) => fn({})),
    });

    expect(resolveSapEntityForOptimize).not.toHaveBeenCalled();
    expect(runContinueOptimizationTryBody).toHaveBeenCalledWith(
      expect.objectContaining({
        extractedEntity: "N/A",
        finalTitle: "Solar Post",
      }),
    );
  });

  it("reads SAP entity when hasEntity is true", async () => {
    resolveSapEntityForOptimize.mockReturnValue("Virginia Park, AB");

    await continueOptimizationWithKeyword({
      siteId: "site-1",
      selectedKeyword: { query: "blinds", clicks: 0, impressions: 0, ctr: 0, position: 0 },
      testMode: false,
      pendingOptimization: {
        "site-1": {
          site: { id: "site-1", name: "T", siteUrl: "https://example.com", username: "u", appPassword: "p", connectedAt: 0 },
          url: "https://example.com/blinds-virginia-park/",
          updateMode: "update",
          gscResult: {},
          existingPost: { postTypeEndpoint: "entity" },
          resolved: { endpoint: "entity" },
          existingTitle: "Blinds Virginia Park",
          existingContent: "<h2>Your Guide to Blinds</h2>",
          existingExcerpt: "",
          optimizationOptions: { hasEntity: true, optimizeContent: true },
          acfFields: { keyword_focus: "blinds", origin: "Virginia Park, AB" },
          acfContext: { origin: "Virginia Park, AB" },
        },
      },
      optimizationFileManagers: {},
      setPendingOptimization: vi.fn((fn) => fn({})),
      setOptimizationFileManagers: vi.fn((fn) => fn({})),
      setOptimizationProgress: vi.fn((fn) => fn({})),
      setIsOptimizingContent: vi.fn((fn) => fn({})),
      setBulkOptimizationState: vi.fn((fn) => fn({})),
    });

    expect(resolveSapEntityForOptimize).toHaveBeenCalled();
    expect(runContinueOptimizationTryBody).toHaveBeenCalledWith(
      expect.objectContaining({
        extractedEntity: "Virginia Park, AB",
      }),
    );
  });

  it("continues SAP run when entity resolves from title or keyword", async () => {
    resolveSapEntityForOptimize.mockReturnValue("Sunset Park, FL");

    await continueOptimizationWithKeyword({
      siteId: "site-1",
      selectedKeyword: { query: "blinds sunset park fl", clicks: 0, impressions: 0, ctr: 0, position: 0 },
      testMode: false,
      pendingOptimization: {
        "site-1": {
          site: { id: "site-1", name: "T", siteUrl: "https://example.com", username: "u", appPassword: "p", connectedAt: 0 },
          url: "https://example.com/blinds-sunset-park/",
          updateMode: "update",
          gscResult: {},
          existingPost: { postTypeEndpoint: "entity", id: 42 },
          resolved: { endpoint: "entity" },
          existingTitle: "Blinds Sunset Park Fl: Style, Privacy & Light Control",
          existingContent: "<p>Body</p>",
          existingExcerpt: "",
          optimizationOptions: { hasEntity: true, optimizeContent: true },
          acfFields: { keyword_focus: "blinds sunset park fl" },
          acfContext: {},
        },
      },
      optimizationFileManagers: {},
      setPendingOptimization: vi.fn((fn) => fn({})),
      setOptimizationFileManagers: vi.fn((fn) => fn({})),
      setOptimizationProgress: vi.fn((fn) => fn({})),
      setIsOptimizingContent: vi.fn((fn) => fn({})),
      setBulkOptimizationState: vi.fn((fn) => fn({})),
    });

    expect(runContinueOptimizationTryBody).toHaveBeenCalledWith(
      expect.objectContaining({
        extractedEntity: "Sunset Park, FL",
      }),
    );
  });
});
