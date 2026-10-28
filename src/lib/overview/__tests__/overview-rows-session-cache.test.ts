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

describe("overview-rows-session-cache slim localStorage + active row body", () => {
  let localMock: Storage;
  let sessionMock: Storage;

  beforeEach(() => {
    localMock = makeStorageMock();
    sessionMock = makeStorageMock();
    vi.stubGlobal("localStorage", localMock);
    vi.stubGlobal("sessionStorage", sessionMock);
    clearOverviewRowsSessionCache(SITE_ID);
  });

  it("persists 100 slim rows to localStorage while keeping active row full body on cold read", () => {
    localMock.setItem(
      `neo-pulse-overview-studio-active-url-v1:${SITE_ID}`,
      "https://blindmagic.com/page-0/",
    );
    const rows = Array.from({ length: 100 }, (_, i) => makeRow(i, true));
    setOverviewRowsSessionCache(SITE_ID, "pages", rows);

    // Simulate page reload: clear sessionStorage and module memory by reading after session clear
    sessionMock.clear();
    const rawList = localMock.getItem(`neo-pulse-overview-rows-local:v4:${SITE_ID}:pages`);
    expect(rawList).toBeTruthy();
    const parsedList = JSON.parse(rawList!) as OverviewRow[];
    expect(parsedList).toHaveLength(100);
    // Non-active rows in raw localStorage list have heavy body stripped
    expect(parsedList[1].postContent).toBeUndefined();
    expect(parsedList[1].elementorDataJson).toBeUndefined();

    // Active row body key preserves full postContent + elementorDataJson
    const rawActive = localMock.getItem(
      `neo-pulse-overview-active-row-body:v1:${SITE_ID}:pages`,
    );
    expect(rawActive).toBeTruthy();
    const parsedActive = JSON.parse(rawActive!) as OverviewRow;
    expect(parsedActive.url).toBe("https://blindmagic.com/page-0/");
    expect(parsedActive.postContent).toContain("xxxx");
    expect(parsedActive.elementorDataJson).toBeTruthy();
  });

  it("restores all 100 rows plus active row body from localStorage when sessionStorage is empty", () => {
    localMock.setItem(
      `neo-pulse-overview-studio-active-url-v1:${SITE_ID}`,
      "https://blindmagic.com/page-2/",
    );
    const rows = Array.from({ length: 10 }, (_, i) => makeRow(i, true));
    setOverviewRowsSessionCache(SITE_ID, "pages", rows);

    // Force read from localStorage by clearing memory via clear + re-seeding localStorage keys
    const savedList = localMock.getItem(`neo-pulse-overview-rows-local:v4:${SITE_ID}:pages`)!;
    const savedActive = localMock.getItem(
      `neo-pulse-overview-active-row-body:v1:${SITE_ID}:pages`,
    )!;
    clearOverviewRowsSessionCache(SITE_ID);
    localMock.setItem(`neo-pulse-overview-rows-local:v4:${SITE_ID}:pages`, savedList);
    localMock.setItem(`neo-pulse-overview-active-row-body:v1:${SITE_ID}:pages`, savedActive);

    const restored = getOverviewRowsSessionCache(SITE_ID, "pages");
    expect(restored).toHaveLength(10);
    expect(restored![2].postContent).toContain("xxxx");
    expect(restored![2].elementorDataJson).toBeTruthy();
    expect(restored![1].title).toBe("Page 1");
  });
});
