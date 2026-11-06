import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import {
  clearOverviewRowsSessionCache,
  getOverviewRowsSessionCache,
  setOverviewRowsSessionCache,
} from "@/lib/overview/overview-rows-session-cache";

vi.mock("@/lib/overview/overview-studio-snapshot-api", () => ({
  saveOverviewStudioSnapshotToServer: vi.fn(),
  fetchOverviewStudioSnapshotFromServer: vi.fn(),
}));

const SITE_ID = "blind-magic-stg";

function makeStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };
}

function makeRow(index: number, withHeavyBody = true): OverviewRow {
  return {
    url: `https://blindmagic.com/page-${index}/`,
    title: `Page ${index}`,
    pageHeading: `Heading ${index}`,
    metaDescription: `Meta ${index}`,
    aiTitle: "",
    aiMeta: "",
    status: "idle",
    postContent: withHeavyBody ? `<p>${"x".repeat(2000)}</p>` : undefined,
    elementorDataJson: withHeavyBody ? JSON.stringify({ widget: index }) : undefined,
  };
}

describe("overview-rows-session-cache memory cache (no localStorage row persistence)", () => {
  let localMock: Storage;
  let sessionMock: Storage;

  beforeEach(() => {
    localMock = makeStorageMock();
    sessionMock = makeStorageMock();
    vi.stubGlobal("localStorage", localMock);
    vi.stubGlobal("sessionStorage", sessionMock);
    clearOverviewRowsSessionCache(SITE_ID);
  });

  it("keeps 100 rows in memory without writing slim rows to localStorage", () => {
    localMock.setItem(
      `neo-pulse-overview-studio-active-url-v1:${SITE_ID}`,
      "https://blindmagic.com/page-0/",
    );
    const rows = Array.from({ length: 100 }, (_, i) => makeRow(i, true));
    setOverviewRowsSessionCache(SITE_ID, "pages", rows);

    expect(localMock.getItem(`neo-pulse-overview-rows-local:v4:${SITE_ID}:pages`)).toBeNull();
    expect(
      localMock.getItem(`neo-pulse-overview-active-row-body:v1:${SITE_ID}:pages`),
    ).toBeNull();

    const cached = getOverviewRowsSessionCache(SITE_ID, "pages");
    expect(cached).toHaveLength(100);
    expect(cached![0].postContent).toContain("xxxx");
    expect(cached![0].elementorDataJson).toBeTruthy();
  });

  it("does not restore rows from localStorage when memory is empty", () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeRow(i, true));
    setOverviewRowsSessionCache(SITE_ID, "pages", rows);
    clearOverviewRowsSessionCache(SITE_ID);
    localMock.setItem(
      `neo-pulse-overview-rows-local:v4:${SITE_ID}:pages`,
      JSON.stringify(rows),
    );

    expect(getOverviewRowsSessionCache(SITE_ID, "pages")).toBeNull();
  });
});
