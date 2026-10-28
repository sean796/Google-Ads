import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readOrganicClientReportDeckSession,
  writeOrganicClientReportDeckSession,
  type OrganicClientReportDeckPayload,
} from "@/lib/organic-dashboard/organic-client-report-deck-session";

const storage = new Map<string, string>();
const sessionMap = new Map<string, string>();

function makeMockStorage(backing: Map<string, string>): Storage {
  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
    clear: () => backing.clear(),
    key: (index: number) => Array.from(backing.keys())[index] ?? null,
    get length() {
      return backing.size;
    },
  };
}

const payload: OrganicClientReportDeckPayload = {
  siteId: "wp-1",
  siteName: "Example",
  siteUrl: "https://example.com",
  showCompare: true,
  preparedOn: "2026-10-11",
  highlights: {
    executiveSummary: "Plain headline.",
    keyTakeaways: ["First insight.", "Second insight."],
    performanceNarrative: ["GA4 traffic rose in the later period.", "GSC clicks improved with stronger CTR."],
    keywordNarrative: ["Top queries skewed toward brand terms in the primary period."],
    googleAdsNarrative: [],
    localGridNarrative: [],
    topOpportunities: [],
  },
  localGridScan: null,
  viewModel: {
    ga4Table: [],
    ga4MonthlyChart: [],
    gscQueries: [],
    gscTrendDaily: [],
    gscTrendMonthly: [],
    gscSummary: null,
    semrushSummary: null,
    semrushTrend: [],
    semrushKeywords: [],
    semrushOverviewUrl: "",
    semrushDomain: "",
    semrushDatabase: "us",
    periodLabels: { primary: "Sep", compare: "Aug" },
    reportStructure: "compare",
    periodProgressTables: null,
    semrushLoadError: null,
    hasGa4: false,
    hasGsc: false,
    hasSemrush: false,
    googleAdsSummary: null,
    googleAdsTable: [],
    googleAdsDailyChart: [],
    googleAdsLoadError: "Set a Google Ads customer ID on this property in Integrations.",
    googleAdsBudgetPacing: null,
    hasGoogleAds: false,
  },
};

describe("organic client report deck session", () => {
  beforeEach(() => {
    storage.clear();
    sessionMap.clear();
    vi.stubGlobal("localStorage", makeMockStorage(storage));
    vi.stubGlobal("sessionStorage", makeMockStorage(sessionMap));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes and reads payload for matching site", () => {
    writeOrganicClientReportDeckSession("deck-a", payload);
    expect(readOrganicClientReportDeckSession("deck-a", "wp-1")).toEqual(payload);
  });

  it("returns null when site id does not match", () => {
    writeOrganicClientReportDeckSession("deck-a", payload);
    expect(readOrganicClientReportDeckSession("deck-a", "other")).toBeNull();
  });

  it("backfills Semrush fields on older stored view models", () => {
    const stale = {
      ...payload,
      viewModel: {
        ga4Table: [],
        ga4MonthlyChart: [],
        gscQueries: [],
        gscTrendDaily: [],
        gscTrendMonthly: [],
        gscSummary: null,
        periodLabels: { primary: "Sep", compare: "Aug" },
        hasGa4: false,
        hasGsc: false,
      },
    };
    writeOrganicClientReportDeckSession("deck-stale", stale);
    const read = readOrganicClientReportDeckSession("deck-stale", "wp-1");
    expect(read?.viewModel.semrushKeywords).toEqual([]);
    expect(read?.viewModel.hasSemrush).toBe(false);
  });

  it("evicts ephemeral cache keys and never throws when localStorage hits QuotaExceededError", () => {
    storage.set("neo-pulse-site-prefetch:v1:wp-1:abc", "x".repeat(1000));
    let attempts = 0;
    const quotaLocalStorage: Storage = {
      ...makeMockStorage(storage),
      setItem: (key: string, value: string) => {
        attempts += 1;
        if (attempts === 1) {
          throw new DOMException("QuotaExceededError", "QuotaExceededError");
        }
        storage.set(key, value);
      },
    };
    vi.stubGlobal("localStorage", quotaLocalStorage);

    expect(() => writeOrganicClientReportDeckSession("deck-quota", payload)).not.toThrow();
    expect(storage.has("neo-pulse-site-prefetch:v1:wp-1:abc")).toBe(false);
    expect(readOrganicClientReportDeckSession("deck-quota", "wp-1")).toEqual(payload);
  });
});
