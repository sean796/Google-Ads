import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteWarmUrlMirrorsForSite,
  readWarmUrlMirrorSync,
} from "@/lib/local-analysis/site-prefetch-persist";

const SITE_ID = "test-site-mirror";

function installLocalStorageMock(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
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
  });
}

describe("readWarmUrlMirrorSync", () => {
  beforeEach(() => {
    installLocalStorageMock();
    deleteWarmUrlMirrorsForSite(SITE_ID);
  });

  it("returns URLs written to the compact mirror key", () => {
    const key = `neo-pulse-warm-url-mirror:v1:${SITE_ID}:pages`;
    localStorage.setItem(key, JSON.stringify(["https://example.com/a/", "https://example.com/b/"]));
    expect(readWarmUrlMirrorSync(SITE_ID, "pages")).toEqual([
      "https://example.com/a/",
      "https://example.com/b/",
    ]);
  });

  it("returns empty when mirror missing", () => {
    expect(readWarmUrlMirrorSync(SITE_ID, "posts")).toEqual([]);
  });
});
