import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORDPRESS_SITES_STORAGE_KEY, type WordPressSite } from "../types";

const site = (id: string, name: string): WordPressSite => ({
  id,
  name,
  siteUrl: `https://${id}.example`,
  username: "user",
  appPassword: "pass",
  connectedAt: 1,
});

describe("restoreSitesFromServerMirrorIfEmpty", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    } satisfies Storage);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          sites: [site("heritage", "Heritage Dental Center"), site("sunnydale", "Sunnydale Solar")],
        }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not restore deleted properties when local still has usable sites", async () => {
    store[WORDPRESS_SITES_STORAGE_KEY] = JSON.stringify([site("other", "Other Client")]);

    const { restoreSitesFromServerMirrorIfEmpty, getStoredSites } = await import("../storage");
    const restored = await restoreSitesFromServerMirrorIfEmpty();

    expect(restored).toHaveLength(1);
    expect(restored[0]?.name).toBe("Other Client");
    expect(getStoredSites()).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("hydrates from server mirror when local storage is empty", async () => {
    const { restoreSitesFromServerMirrorIfEmpty, getStoredSites } = await import("../storage");
    const restored = await restoreSitesFromServerMirrorIfEmpty();

    expect(restored).toHaveLength(2);
    expect(getStoredSites()).toHaveLength(2);
    expect(fetch).toHaveBeenCalled();
  });
});
