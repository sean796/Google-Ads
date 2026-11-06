import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

vi.mock("@/lib/optimization-settings-storage", () => ({
  getResearchModel: () => "test-model",
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import {
  BLOG_IMPORT_POST_DESTINATION_CHOICES,
  BULK_POST_DESTINATION_CHOICES,
  WORDPRESS_POST_DESTINATION_SHORT,
} from "@/lib/bulk-auto-generate";
import {
  batchIsDirectOnly,
  batchNeedsWordPressUpload,
  normalizeBulkPostDestination,
  resolveRowPostDestination,
} from "@/lib/bulk-post-destination-normalize";
import {
  buildDirectAcfFields,
  buildImportCsvRowFromFile,
  formatDirectImportHtml,
} from "@/lib/bulk/blog-import-direct";
import {
  importSeriesPartFromFileName,
  parseDirectImportMeta,
} from "@/lib/bulk/blog-import-openrouter-run";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";

const mockCall = vi.mocked(callOpenRouterChatCompletion);

const FORM = {
  focusKeyword: "",
  titleOverride: "",
  featuredImageMode: "y" as const,
  entity: "",
};

function metaJson(partial: {
  title: string;
  keyword: string;
  slug: string;
  meta_description?: string;
}): string {
  return JSON.stringify({
    title: partial.title,
    keyword: partial.keyword,
    meta_description:
      partial.meta_description ??
      "Succession planning steps for leaders who need a clear handover path.",
    slug: partial.slug,
  });
}

describe("Import Direct destination", () => {
  it("lists Direct only on Import choices", () => {
    expect(BLOG_IMPORT_POST_DESTINATION_CHOICES).toEqual(["direct", "local"]);
    expect(BULK_POST_DESTINATION_CHOICES).toEqual(["wordpress", "local"]);
    expect(WORDPRESS_POST_DESTINATION_SHORT.direct).toBe("Direct");
  });

  it("resolves per-row destination from header when unset", () => {
    expect(resolveRowPostDestination({}, "direct")).toBe("direct");
    expect(resolveRowPostDestination({ post_destination: "local" }, "direct")).toBe("local");
    expect(normalizeBulkPostDestination("direct")).toBe("direct");
  });

  it("treats a mixed batch as needing WordPress when any row is Direct", () => {
    const rows = [{ post_destination: "direct" as const }, { post_destination: "local" as const }];
    expect(batchNeedsWordPressUpload(rows, "local")).toBe(true);
    expect(batchIsDirectOnly(rows, "direct")).toBe(false);
    expect(batchIsDirectOnly([{ post_destination: "direct" as const }], "direct")).toBe(true);
  });
});

describe("Direct format and ACF from title", () => {
  it("converts markdown headings without adding extra sections", () => {
    const html = formatDirectImportHtml({
      imported_markdown: "# Title\n\nIntro.\n\n## Section A\n\nBody A.\n\n## Section B\n\nBody B.",
    });
    expect(html).toContain("Section A");
    expect(html).toContain("Body A");
    expect(html.toLowerCase()).not.toContain("flo-faq");
    expect(html).not.toMatch(/<h2[^>]*>FAQ/i);
  });

  it("keeps a markdown table as HTML table", () => {
    const html = formatDirectImportHtml({
      imported_markdown: `**What Can Owners Do to Build Value?**

| Value Driver | Why Buyers Care | What Owners Can Focus On |
| :---- | :---- | :---- |
| **Profitability and Sustainable Earnings** | Buyers are not simply purchasing last year's profit. | Review pricing and margins regularly |
`,
    });
    expect(html).toMatch(/<table/i);
    expect(html).toContain("Value Driver");
    expect(html).toContain("Why Buyers Care");
    expect(html).toContain("What Owners Can Focus On");
    expect(html).toContain("Profitability and Sustainable Earnings");
  });

  it("builds ACF keyword, title, and description from OpenRouter meta", () => {
    const title = "Gil Succession Planning, Pt 1";
    const row: CSVRow = {
      keyword: "succession planning",
      keyword_focus: "succession planning",
      title,
      meta_description: "How Gil can plan leadership succession across two focused parts.",
    };
    const acf = buildDirectAcfFields(row, row.meta_description!);
    expect(acf.seo_title).toBe(title);
    expect(acf.keyword_focus).toBe("succession planning");
    expect(acf.meta_description).toContain("succession");
    expect(acf).not.toHaveProperty("faq");
  });
});

describe("Direct OpenRouter meta", () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it("reads series part numbers from filenames", () => {
    expect(importSeriesPartFromFileName("HR - Gil - Succession Planning 1 of 2 - FINAL.docx")).toBe(1);
    expect(importSeriesPartFromFileName("HR - Gil - Succession Planning 2 of 2 - FINAL.docx")).toBe(2);
    expect(importSeriesPartFromFileName("part-1.md")).toBeUndefined();
  });

  it("rejects a series title that omits the colon", () => {
    expect(() =>
      parseDirectImportMeta(
        metaJson({
          title: "Gil Succession Planning, Pt 1",
          keyword: "succession planning",
          slug: "gil-succession-planning-pt1",
        }),
        "HR - Gil - Succession Planning 1 of 2 - FINAL.docx",
      ),
    ).toThrow(/Series Topic/);
  });

  it("throws a labeled error on malformed meta JSON", () => {
    expect(() => parseDirectImportMeta("not json", "post.md")).toThrow(
      "Invalid blog import meta JSON: model did not return valid JSON.",
    );
    expect(() =>
      parseDirectImportMeta(
        JSON.stringify({ title: 123, keyword: "k", meta_description: "m", slug: "s" }),
        "post.md",
      ),
    ).toThrow(/Invalid blog import meta JSON:/);
  });

  it("uses series root plus part as the slug, not the full title", () => {
    const meta = parseDirectImportMeta(
      metaJson({
        title: "Succession Planning: Employee Retention And Continuity Of Operations, Pt 2",
        keyword: "succession planning",
        slug: "succession-planning-employee-retention-continuity-operations-pt2",
      }),
      "HR - Gil - Succession Planning 2 of 2 - FINAL.docx",
    );
    expect(meta.slug).toBe("succession-planning-pt2");
    expect(meta.slug).not.toContain("employee");
  });

  it("asks OpenRouter for series topic, colon, part angle, and unique slugs", async () => {
    mockCall.mockImplementation(async ({ user }) => {
      if (String(user).includes("1 of 2")) {
        return {
          raw: null, content: metaJson({
            title: "Succession Planning: Ownership Versus Management, Pt 1",
            keyword: "succession planning",
            slug: "succession-planning-ownership-versus-management-pt1",
          }),
        };
      }
      return {
        raw: null, content: metaJson({
          title: "Succession Planning: Employee Retention And Continuity, Pt 2",
          keyword: "succession planning",
          slug: "succession-planning-employee-retention-continuity-pt2",
        }),
      };
    });

    const rows = await Promise.all([
      buildImportCsvRowFromFile(
        new File(["# Succession Planning\n\nPart one body for excerpt.\n"], "HR - Gil - Succession Planning 1 of 2 - FINAL.md"),
        FORM,
        "direct",
        "test-key",
      ),
      buildImportCsvRowFromFile(
        new File(["# Succession Planning\n\nPart two body for excerpt.\n"], "HR - Gil - Succession Planning 2 of 2 - FINAL.md"),
        FORM,
        "direct",
        "test-key",
      ),
    ]);

    expect(mockCall).toHaveBeenCalled();
    expect(mockCall.mock.calls[0]?.[0].system).toContain("series-topic-pt1");
    expect(mockCall.mock.calls[0]?.[0].user).toContain("series-topic-ptN only");
    expect(rows[0]?.title).toBe("Succession Planning: Ownership Versus Management, Pt 1");
    expect(rows[1]?.title).toBe("Succession Planning: Employee Retention And Continuity, Pt 2");
    expect(rows[0]?.keyword).toBe("succession planning");
    expect(rows[1]?.keyword).toBe("succession planning");
    expect(rows[0]?.target_slug).toBe("succession-planning-pt1");
    expect(rows[1]?.target_slug).toBe("succession-planning-pt2");
    expect(rows[0]?.target_slug).not.toBe(rows[1]?.target_slug);
    expect(rows[0]?.imported_markdown).toContain("Part one body");
  });

  it("parses each file's links into that row's Links field", async () => {
    mockCall.mockResolvedValue({
      raw: null, content: metaJson({
        title: "Succession Planning: Ownership Versus Management, Pt 1",
        keyword: "succession planning",
        slug: "succession-planning-pt1",
      }),
    });
    const successionMd = `KWB recommend reaching out to [HR Resource](https://hr-resource.ca/) for guidance.

Click [here](https://kwbllp.com/consultation/) to book an introductory discussion.
`;
    const valuationMd = `**What Can Owners Do to Build Value?**

| Value Driver | Why Buyers Care |
| :---- | :---- |
| Profitability | Buyers care about earnings |
`;
    const [part1, newsletter] = await Promise.all([
      buildImportCsvRowFromFile(
        new File([successionMd], "HR - Gil - Succession Planning 1 of 2 - FINAL.md"),
        FORM,
        "direct",
        "test-key",
      ),
      buildImportCsvRowFromFile(
        new File([valuationMd], "2026.08.24 Part2 Newsletter for KWB.md"),
        FORM,
        "direct",
        "test-key",
      ),
    ]);
    expect(JSON.parse(part1.modifier_links_json ?? "[]")).toEqual([
      "https://hr-resource.ca/",
      "https://kwbllp.com/consultation/",
    ]);
    expect(JSON.parse(part1.imported_links_json ?? "[]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: "https://hr-resource.ca/", anchorText: "HR Resource" }),
        expect.objectContaining({ url: "https://kwbllp.com/consultation/", anchorText: "here" }),
      ]),
    );
    expect(newsletter.modifier_links_json).toBeUndefined();
    expect(newsletter.imported_links_json).toBeUndefined();
  });

  it("builds two Direct rows from two markdown files", async () => {
    mockCall.mockImplementation(async ({ user }) => {
      if (String(user).includes("part-1.md")) {
        return {
          raw: null, content: metaJson({
            title: "First Post",
            keyword: "first post",
            slug: "first-post",
            meta_description: "Hello world paragraph turned into a meta description for search.",
          }),
        };
      }
      return {
        raw: null, content: metaJson({
          title: "Second Post",
          keyword: "second post",
          slug: "second-post",
          meta_description: "Another paragraph turned into a meta description for search.",
        }),
      };
    });

    const rows = await Promise.all([
      buildImportCsvRowFromFile(
        new File(["# First Post\n\nHello world paragraph for excerpt.\n"], "part-1.md"),
        FORM,
        "direct",
        "test-key",
      ),
      buildImportCsvRowFromFile(
        new File(["# Second Post\n\nAnother paragraph here for excerpt.\n"], "part-2.md"),
        FORM,
        "direct",
        "test-key",
      ),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.title).toBe("First Post");
    expect(rows[1]?.title).toBe("Second Post");
    expect(rows[0]?.post_destination).toBe("direct");
    expect(rows[0]?.imported_markdown).toContain("Hello world");
    expect(rows[1]?.imported_markdown).toContain("Another paragraph");
    expect(rows[0]?.featuredImage).toBe("y");
    expect(rows[0]?.target_slug).not.toBe(rows[1]?.target_slug);
  });

  it("keeps featured image off when Import mode is n", async () => {
    mockCall.mockResolvedValue({
      raw: null, content: metaJson({
        title: "First Post",
        keyword: "first post",
        slug: "first-post",
      }),
    });
    const row = await buildImportCsvRowFromFile(
      new File(["# First Post\n\nHello world paragraph for excerpt.\n"], "part-1.md"),
      { ...FORM, featuredImageMode: "n" },
      "direct",
      "test-key",
    );
    expect(row.featuredImage).toBe("n");
  });
});
