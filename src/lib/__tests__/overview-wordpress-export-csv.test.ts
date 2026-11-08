import { describe, expect, it } from "vitest";
import {
  buildOverviewWordPressExportCsv,
  buildOverviewWordPressUploadFailuresCsv,
  filterOverviewRowsWithPostBinding,
} from "@/lib/overview/overview-wordpress-export-csv";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";

describe("buildOverviewWordPressExportCsv", () => {
  it("includes BOM, headers, and escapes quotes/newlines", () => {
    const rows: OverviewRow[] = [
      {
        url: "https://example.com/hello-world",
        title: "T",
        metaDescription: "M",
        aiTitle: "AI Title",
        aiMeta: 'Say "hi"',
        status: "idle",
        focusKeyword: "kw",
        faq: "Q: A?\nA: B",
        dateModifier: "2026",
        seoResearch: "brief",
      },
    ];
    const bindings: Record<string, OverviewBinding> = {
      "https://example.com/hello-world": { postId: 42, subtype: "post" },
    };
    const csv = buildOverviewWordPressExportCsv(rows, bindings);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("post_id");
    expect(csv).toContain("42");
    expect(csv).toContain("https://example.com/hello-world");
    expect(csv).toContain("posts");
    expect(csv).toContain('""'); // escaped quote inside field
  });

  it("skips rows without binding", () => {
    const rows: OverviewRow[] = [
      {
        url: "https://example.com/a",
        title: "T",
        metaDescription: "",
        aiTitle: "",
        aiMeta: "",
        status: "idle",
      },
    ];
    const csv = buildOverviewWordPressExportCsv(rows, {});
    const lines = csv.split(/\r?\n/).filter(Boolean);
    expect(lines.length).toBe(1);
  });

  it("includes every bound row with distinct post_id", () => {
    const rows: OverviewRow[] = [
      {
        url: "https://example.com/a",
        title: "A",
        metaDescription: "",
        aiTitle: "",
        aiMeta: "",
        status: "idle",
      },
      {
        url: "https://example.com/b",
        title: "B",
        metaDescription: "",
        aiTitle: "",
        aiMeta: "",
        status: "idle",
      },
    ];
    const bindings: Record<string, OverviewBinding> = {
      "https://example.com/a": { postId: 10, subtype: "post" },
      "https://example.com/b": { postId: 20, subtype: "page" },
    };
    const csv = buildOverviewWordPressExportCsv(rows, bindings);
    const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length > 0);
    expect(lines.length).toBe(3);
    expect(csv).toContain("https://example.com/a");
    expect(csv).toContain("https://example.com/b");
    expect(csv).toContain("10");
    expect(csv).toContain("20");
    expect(csv).toContain("posts");
    expect(csv).toContain("pages");
  });

  it("omits unbound URLs when the sheet mixes bound and unbound rows (bulk export shape)", () => {
    const rows: OverviewRow[] = [
      {
        url: "https://example.com/not-in-wp",
        title: "X",
        metaDescription: "",
        aiTitle: "",
        aiMeta: "",
        status: "idle",
      },
      {
        url: "https://example.com/z",
        title: "Z",
        metaDescription: "d",
        aiTitle: "",
        aiMeta: "",
        status: "idle",
        focusKeyword: "f",
      },
    ];
    const bindings: Record<string, OverviewBinding> = {
      "https://example.com/z": { postId: 99, subtype: "post" },
    };
    const csv = buildOverviewWordPressExportCsv(rows, bindings);
    const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length > 0);
    expect(lines.length).toBe(2);
    expect(csv).toContain("99");
    expect(csv).toContain("https://example.com/z");
    expect(csv).not.toContain("not-in-wp");
  });
});

describe("buildOverviewWordPressUploadFailuresCsv", () => {
  it("lists failed upload URL and error per row", () => {
    const csv = buildOverviewWordPressUploadFailuresCsv([
      {
        postId: 12,
        url: "https://example.com/bad/",
        error: "NEO Pulse redirect meta rejected",
        mergeError: "acf.faq invalid JSON",
      },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("post_id,url,error,merge_error");
    expect(csv).toContain("12");
    expect(csv).toContain("https://example.com/bad/");
    expect(csv).toContain("NEO Pulse redirect meta rejected");
    expect(csv).toContain("acf.faq invalid JSON");
  });
});

describe("filterOverviewRowsWithPostBinding", () => {
  it("returns only rows with a postId on the binding", () => {
    const rows: OverviewRow[] = [
      {
        url: "https://example.com/a",
        title: "A",
        metaDescription: "",
        aiTitle: "",
        aiMeta: "",
        status: "idle",
      },
      {
        url: "https://example.com/b",
        title: "B",
        metaDescription: "",
        aiTitle: "T",
        aiMeta: "M",
        status: "idle",
        focusKeyword: "kw",
      },
    ];
    const bindings: Record<string, OverviewBinding> = {
      "https://example.com/b": { postId: 7, subtype: "post" },
    };
    expect(filterOverviewRowsWithPostBinding(rows, bindings)).toEqual([rows[1]]);
  });
});
