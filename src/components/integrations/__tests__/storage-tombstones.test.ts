import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDeletedSitesTombstones,
  getStoredSites,
  isSiteTombstoned,
  PROTECTED_ACTIVE_CLIENT_NAMES,
  recordDeletedSite,
} from "../storage";
import { WORDPRESS_SITES_STORAGE_KEY } from "../types";

describe("storage tombstone and recovery hardening", () => {
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
  });

  it("never tombstones protected active clients even if partial match occurs", () => {
    expect(isSiteTombstoned({ name: "In the Shade", siteUrl: "https://intheshadeflorida.com" })).toBe(false);
    expect(isSiteTombstoned({ name: "Advance Blinds", siteUrl: "https://advanceblindsanddrapery.com" })).toBe(false);
    expect(isSiteTombstoned({ name: "Blind Magic", siteUrl: "https://blindmagic.com" })).toBe(false);
    expect(isSiteTombstoned({ name: "DM Interiors", siteUrl: "https://dminteriors.ca" })).toBe(false);
    expect(isSiteTombstoned({ name: "KWB", siteUrl: "https://kwbllp.com" })).toBe(false);
  });

  it("correctly tombstones dr. rebecca and ridgeline solar", () => {
    expect(isSiteTombstoned({ name: "Dr. Rebecca", siteUrl: "https://drrebeccajane.ca" })).toBe(true);
    expect(isSiteTombstoned({ name: "dr. rebecca", siteUrl: "https://drrebeccajane.ca" })).toBe(true);
    expect(isSiteTombstoned({ name: "Ridgeline Solar", siteUrl: "https://ridgelinesolar.ca" })).toBe(true);
  });

  it("ignores corrupted empty tombstone records and cleanses them", () => {
    store["neo-pulse-deleted-wp-sites-v1"] = JSON.stringify([
      { name: "", host: "" },
      { name: "   " },
      { name: "in the shade" }, // should be filtered out because it is protected
    ]);

    const cleaned = getDeletedSitesTombstones();
    expect(cleaned.some((t) => t.name === "in the shade")).toBe(false);
    expect(cleaned.some((t) => !t.name && !t.host && !t.id)).toBe(false);
  });

  it("refuses to record deletion of a protected client", () => {
    recordDeletedSite({ name: "In the Shade", siteUrl: "https://intheshadeflorida.com" });
    const tombstones = getDeletedSitesTombstones();
    expect(tombstones.some((t) => t.name === "in the shade")).toBe(false);
  });

  it("self-heals and returns all 17 default clients when storage is empty", () => {
    const sites = getStoredSites();
    expect(sites.length).toBe(17);
    expect(sites.some((s) => s.name === "In the Shade")).toBe(true);
    expect(sites.some((s) => s.name === "Advance Blinds")).toBe(true);
    expect(sites.some((s) => s.name === "Blind Magic")).toBe(true);
  });
});
