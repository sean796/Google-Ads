import { describe, expect, it } from "vitest";
import {
  appendOverviewStudioRevision,
  clearOverviewStudioRevisions,
  computeRevisionChanged,
  getRevisionsForUrl,
  normalizeRevisionPlain,
  resetOverviewStudioRevisionsStoreForTests,
} from "@/lib/overview/studio-doc-revisions-store";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

describe("overview studio revisions store", () => {
  it("detects changed vs unchanged plain text", () => {
    expect(computeRevisionChanged("Hello world", "Hello world")).toBe(false);
    expect(computeRevisionChanged("Hello   world", "Hello world")).toBe(false);
    expect(computeRevisionChanged("Hello", "Hello there")).toBe(true);
  });

  it("stores revisions newest-first per URL", () => {
    resetOverviewStudioRevisionsStoreForTests();
    const url = "https://example.com/a";
    const urlKey = normalizePageUrlKey(url);
    appendOverviewStudioRevision({
      urlKey,
      stepLabel: "Section 1",
      beforeHtml: "<p>Before</p>",
      afterHtml: "<p>After</p>",
      beforePlain: "Before",
      afterPlain: "After",
      changed: false,
    });
    appendOverviewStudioRevision({
      urlKey,
      stepLabel: "Section 2",
      beforeHtml: "<p>X</p>",
      afterHtml: "<p>X</p>",
      beforePlain: "X",
      afterPlain: "X",
      changed: false,
    });
    const list = getRevisionsForUrl(url);
    expect(list).toHaveLength(2);
    expect(list[0]?.stepLabel).toBe("Section 2");
    expect(list[0]?.changed).toBe(false);
    expect(list[1]?.changed).toBe(true);
  });

  it("clears revisions for one URL", () => {
    resetOverviewStudioRevisionsStoreForTests();
    const url = "https://example.com/a";
    appendOverviewStudioRevision({
      urlKey: normalizePageUrlKey(url),
      stepLabel: "A",
      beforeHtml: "",
      afterHtml: "",
      beforePlain: "a",
      afterPlain: "b",
      changed: false,
    });
    clearOverviewStudioRevisions(url);
    expect(getRevisionsForUrl(url)).toHaveLength(0);
  });

  it("normalizeRevisionPlain collapses whitespace", () => {
    expect(normalizeRevisionPlain("  foo \n bar  ")).toBe("foo bar");
  });

  it("returns stable empty array reference for useSyncExternalStore", () => {
    resetOverviewStudioRevisionsStoreForTests();
    const a = getRevisionsForUrl("https://example.com/empty");
    const b = getRevisionsForUrl("https://example.com/empty");
    expect(a).toBe(b);
    expect(a).toHaveLength(0);
  });
});
