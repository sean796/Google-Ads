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
      clear: () => {
        store = {};
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
      get length() {
        return Object.keys(store).length;
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

  it("returns an empty visible list when storage is empty (Wave 0: no bundled seed)", () => {
    const sites = getStoredSites();
    expect(sites).toEqual([]);
  });
});
