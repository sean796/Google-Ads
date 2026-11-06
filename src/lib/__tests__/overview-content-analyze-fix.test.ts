import { describe, expect, it } from "vitest";
import type { ContentAuditIssueRow } from "@/lib/overview/overview-content-analyze-fix";
import {
  auditStorageToFixPassPayload,
  buildAuditReferenceAppendix,
  bulletsMarkdownToLines,
  canUseStitchedSectionFix,
  contentAuditStorageToFixBulletsMarkdown,
  extractOverviewFixHtmlFromModelRaw,
  filterUnsoundAuditIssues,
  inferAuditIssueSectionIndices,
  issuesToFixBulletsMarkdown,
  OVERVIEW_FIX_HTML_BLOCK_END,
  OVERVIEW_FIX_HTML_BLOCK_START,
  parseContentAuditStorage,
  parseOverviewAnalyzeResponseJson,
  parseOverviewFixResponseJson,
  serializeContentAuditV1,
  stripMarkdownCodeFenceFromModelOutput,
} from "@/lib/overview/overview-content-analyze-fix";

const emptySides = (): Omit<ContentAuditIssueRow, "issue" | "proposedFix"> => ({
  title: "",
  rationale: "",
  rationaleAspects: [],
  htmlReference: "",
  beforeMarkup: "",
  afterMarkup: "",
  proTip: "",
});

describe("filterUnsoundAuditIssues", () => {
  const makeRow = (
    partial: Partial<ContentAuditIssueRow> & Pick<ContentAuditIssueRow, "issue">,
  ): ContentAuditIssueRow => ({
    title: "",
    rationale: "",
    rationaleAspects: [],
    proposedFix: "",
    htmlReference: "",
    beforeMarkup: "",
    afterMarkup: "",
    proTip: "",
    ...partial,
  });

  it("drops when beforeMarkup and afterMarkup are identical and nonempty", () => {
    const issues = [
      makeRow({
        issue: "bad comparison",
        htmlReference: "<p>x</p>",
        beforeMarkup: "<h3>A</h3>",
        afterMarkup: "<h3>A</h3>",
      }),
      makeRow({ issue: "ok empty comparison", htmlReference: "<p>z</p>" }),
    ];
    expect(filterUnsoundAuditIssues("<p>x</p><p>z</p>", issues)).toEqual([issues[1]]);
  });

  it("drops when nonempty htmlReference is not verbatim in supplied post HTML", () => {
    const issues = [makeRow({ issue: "no haystack match", htmlReference: "<p>ghost</p>" })];
    expect(filterUnsoundAuditIssues("<p>real</p>", issues)).toEqual([]);
  });

  it("does not substring-check when verbatimSourceHtml is null (storage hydrate)", () => {
    const issues = [
      makeRow({ issue: "no ref lookup", htmlReference: "<p>nope</p>", beforeMarkup: "", afterMarkup: "" }),
    ];
    expect(filterUnsoundAuditIssues(null, issues)).toEqual(issues);
  });
});

describe("stripMarkdownCodeFenceFromModelOutput", () => {
  it("returns trimmed raw when no fence", () => {
    expect(stripMarkdownCodeFenceFromModelOutput('  {"x":1}  ')).toBe('{"x":1}');
  });

  it("strips ```json fence", () => {
    const raw = "```json\n{\"issues\":[]}\n```";
    expect(stripMarkdownCodeFenceFromModelOutput(raw)).toBe('{"issues":[]}');
  });

  it("strips generic ``` fence", () => {
    const raw = "```\n{\"issues\":[{\"issue\":\"a\",\"proposedFix\":\"\"}]}\n```";
    expect(stripMarkdownCodeFenceFromModelOutput(raw)).toBe(
      '{"issues":[{"issue":"a","proposedFix":""}]}',
    );
  });
});

describe("parseOverviewAnalyzeResponseJson", () => {
  it("parses sparse issue + proposedFix and fills card fields", () => {
    const raw = JSON.stringify({
      issues: [
        { issue: "Broken table", proposedFix: "Close tr tags" },
        { issue: " orphan ", proposedFix: " " },
      ],
    });
    const r = parseOverviewAnalyzeResponseJson(raw);
    expect(r.issues).toEqual([
      { ...emptySides(), issue: "Broken table", proposedFix: "Close tr tags" },
      { ...emptySides(), issue: "orphan", proposedFix: "" },
    ]);
    expect(JSON.parse(r.storedJson).neoPulseContentAuditV1.issues).toEqual(r.issues);
    expect(r.fixBulletsMarkdown).toBe(
      "- Finding 1: Broken table | Apply: Close tr tags\n- Finding 2: orphan",
    );
  });

  it("parses rich card shape for fix bullets including snippet truncation path", () => {
    const longSnippet = `<div>${"x".repeat(3000)}</div>`;
    const raw = JSON.stringify({
      issues: [
        {
          title: "Heading hierarchy",
          issue: "Skip from h2 to h4",
          rationale: "Screen readers expect a predictable outline.",
          rationaleAspects: [
            { aspect: "Accessibility", detail: "Skips confuse landmark navigation." },
            { aspect: "SEO or clarity", detail: "Sections look flat to crawlers." },
          ],
          proposedFix: "Insert an h3 or retag the section as h3.",
          htmlReference: longSnippet,
          proTip: "Do not choose levels for font size alone.",
        },
      ],
    });
    const r = parseOverviewAnalyzeResponseJson(raw);
    expect(r.issues[0]?.title).toBe("Heading hierarchy");
    expect(r.fixBulletsMarkdown).toContain("Finding 1:");
    expect(r.fixBulletsMarkdown).toContain("Heading hierarchy");
    expect(r.fixBulletsMarkdown).toContain("HTML preview:");
    expect(r.fixBulletsMarkdown).toContain("…");
    expect(r.fixBulletsMarkdown).toContain("Apply: Insert an h3");
    expect(r.fixReferenceAppendix).toContain("REFERENCE_HTML_FROM_AUDIT");
    expect(r.fixReferenceAppendix).toContain(longSnippet);
  });

  it("maps legacy summary to issue with empty proposedFix", () => {
    const raw = JSON.stringify({
      issues: [{ summary: "Duplicate id" }],
    });
    const r = parseOverviewAnalyzeResponseJson(raw);
    expect(r.issues).toEqual([{ ...emptySides(), issue: "Duplicate id", proposedFix: "" }]);
    expect(r.fixBulletsMarkdown).toBe("- Finding 1: Duplicate id");
  });

  it("parses empty issues", () => {
    const r = parseOverviewAnalyzeResponseJson('{"issues":[]}');
    expect(r.issues).toEqual([]);
    expect(r.storedJson).toContain('"issues":[]');
    expect(r.fixBulletsMarkdown).toBe("");
  });

  it("accepts optional bullet_text alongside issues", () => {
    const raw =
      '{"issues":[{"issue":"A","proposedFix":"Fix A"}],"bullet_text":"ignored for MVP"}';
    const r = parseOverviewAnalyzeResponseJson(raw);
    expect(r.fixBulletsMarkdown).toBe("- Finding 1: A | Apply: Fix A");
  });

  it("filters rationale aspects with empty detail", () => {
    const raw = JSON.stringify({
      issues: [
        {
          issue: "Test",
          proposedFix: "Fix",
          rationaleAspects: [
            { aspect: "Accessibility", detail: "" },
            { aspect: "SEO", detail: "Valid" },
          ],
        },
      ],
    });
    const r = parseOverviewAnalyzeResponseJson(raw);
    expect(r.issues[0]?.rationaleAspects).toEqual([{ aspect: "SEO", detail: "Valid" }]);
  });

  it("rejects invalid JSON string", () => {
    expect(() => parseOverviewAnalyzeResponseJson("{not json")).toThrow(
      "Model did not return valid JSON",
    );
  });

  it("rejects missing issues field", () => {
    expect(() => parseOverviewAnalyzeResponseJson("{}")).toThrow("Invalid analyze JSON");
  });
});

describe("parseContentAuditStorage and contentAuditStorageToFixBulletsMarkdown", () => {
  it("parses stored v1 JSON including new fields", () => {
    const stored = JSON.stringify({
      neoPulseContentAuditV1: {
        issues: [
          {
            title: "",
            issue: "X",
            rationale: "",
            rationaleAspects: [],
            proposedFix: "Y",
            htmlSnippet: "<p>x</p>",
            proTip: "",
          },
        ],
      },
    });
    const p = parseContentAuditStorage(stored);
    expect(p).toEqual({
      kind: "v1",
      issues: [
        {
          title: "",
          issue: "X",
          rationale: "",
          rationaleAspects: [],
          proposedFix: "Y",
          htmlReference: "<p>x</p>",
          beforeMarkup: "",
          afterMarkup: "",
          proTip: "",
        },
      ],
    });
    expect(contentAuditStorageToFixBulletsMarkdown(stored)).toBe(
      "- Finding 1: X | HTML preview: <p>x</p> | Apply: Y",
    );
    expect(auditStorageToFixPassPayload(stored).referenceAppendix).toContain("<p>x</p>");
  });

  it("drops stored findings whose Before and After markup are identical (nonsense comparison)", () => {
    const stored = JSON.stringify({
      neoPulseContentAuditV1: {
        issues: [
          {
            issue: "Fake diff",
            proposedFix: "fix",
            htmlReference: "<p>a</p>",
            beforeMarkup: "<p>same</p>",
            afterMarkup: "<p>same</p>",
          },
          {
            issue: "Keep me",
            proposedFix: "",
            htmlReference: "<p>b</p>",
            beforeMarkup: "<p>old</p>",
            afterMarkup: "<p>new</p>",
          },
        ],
      },
    });
    const p = parseContentAuditStorage(stored);
    expect(p.kind).toBe("v1");
    if (p.kind === "v1") {
      expect(p.issues).toHaveLength(1);
      expect(p.issues[0]?.issue).toBe("Keep me");
    }
  });

  it("migrates minimal legacy stored rows", () => {
    const stored = '{"neoPulseContentAuditV1":{"issues":[{"issue":"X","proposedFix":"Y"}]}}';
    const p = parseContentAuditStorage(stored);
    expect(p.kind).toBe("v1");
    if (p.kind === "v1") {
      expect(p.issues[0]).toMatchObject({
        issue: "X",
        proposedFix: "Y",
        title: "",
        rationale: "",
        htmlReference: "",
      });
    }
  });

  it("falls back to legacy lines when braces do not decode to v1 storage", () => {
    const raw = "{broken json";
    const p = parseContentAuditStorage(raw);
    expect(p.kind).toBe("legacy");
    if (p.kind === "legacy") {
      expect(p.lines.join(",")).toContain("broken json");
    }
  });

  it("maps legacy bullets to lines for fix derivation", () => {
    expect(contentAuditStorageToFixBulletsMarkdown("- One\nTwo")).toBe("- One\n- Two");
  });
});

describe("parseOverviewFixResponseJson", () => {
  it("parses fenced html payload", () => {
    const inner = '{"html":"<p>x</p>"}';
    const html = parseOverviewFixResponseJson("```json\n" + inner + "\n```");
    expect(html).toBe("<p>x</p>");
  });

  it("rejects when html missing", () => {
    expect(() => parseOverviewFixResponseJson('{"wrong":true}')).toThrow("Invalid fix JSON");
  });
});

describe("extractOverviewFixHtmlFromModelRaw", () => {
  it("prefers delimiter block with literal newlines inside HTML", () => {
    const raw =
      "\nSome prose\n" +
      OVERVIEW_FIX_HTML_BLOCK_START +
      "\n<div>\n<p>Hello\nworld</p>\n</div>\n" +
      OVERVIEW_FIX_HTML_BLOCK_END +
      "\n";
    const html = extractOverviewFixHtmlFromModelRaw(raw);
    expect(html).toBe("<div>\n<p>Hello\nworld</p>\n</div>");
  });

  it("falls back to JSON html when delimiter missing", () => {
    const html = extractOverviewFixHtmlFromModelRaw('{"html":"<p>ok</p>"}');
    expect(html).toBe("<p>ok</p>");
  });
});

describe("bulletsMarkdownToLines", () => {
  it("strip markers and blanks", () => {
    expect(
      bulletsMarkdownToLines("- One\n• Two\n\n  * Three  \nplain"),
    ).toEqual(["One", "Two", "Three", "plain"]);
  });
});

describe("section metadata serialization and appendix", () => {
  const sectionAwareRow = (): ContentAuditIssueRow => ({
    title: "Note",
    issue: "Gap",
    rationale: "",
    rationaleAspects: [],
    proposedFix: "Fix gap",
    htmlReference: "<p>hole</p>",
    beforeMarkup: "",
    afterMarkup: "",
    proTip: "",
    sectionIndex: 1,
    sectionLabel: "Main topic",
  });

  it("roundtrips section fields via JSON storage", () => {
    const r = sectionAwareRow();
    const raw = serializeContentAuditV1([r]);
    const parsed = parseContentAuditStorage(raw);
    expect(parsed.kind).toBe("v1");
    if (parsed.kind === "v1") {
      expect(parsed.issues[0]).toMatchObject({
        issue: "Gap",
        sectionIndex: 1,
        sectionLabel: "Main topic",
        htmlReference: "<p>hole</p>",
      });
    }
  });

  it("mentions section hints in fix bullets markdown", () => {
    const bullets = issuesToFixBulletsMarkdown([sectionAwareRow()]);
    expect(bullets).toContain("Section:");
    expect(bullets).toContain("#2");
    expect(bullets).toContain("Main topic");
    expect(bullets).toContain("Apply: Fix gap");
  });

  it("prepends appendix fields for sectional merges", () => {
    const ap = buildAuditReferenceAppendix([sectionAwareRow()]);
    expect(ap).toContain("SECTION_INDEX: 1");
    expect(ap).toContain("SECTION: Main topic");
    expect(ap).toContain("PROPOSED_FIX: Fix gap");
    expect(ap).toContain("<p>hole</p>");
  });

  it("includes BEFORE_MARKUP and AFTER_MARKUP when both differ", () => {
    const row: ContentAuditIssueRow = {
      ...sectionAwareRow(),
      beforeMarkup: "<h3>X</h3>",
      afterMarkup: "<h2>X</h2>",
    };
    const ap = buildAuditReferenceAppendix([row]);
    expect(ap).toContain("PROPOSED_FIX:");
    expect(ap).toContain("BEFORE_MARKUP_START");
    expect(ap).toContain("<h3>X</h3>");
    expect(ap).toContain("AFTER_MARKUP_START");
    expect(ap).toContain("<h2>X</h2>");
  });
});

describe("inferAuditIssueSectionIndices and canUseStitchedSectionFix", () => {
  const baseRow = (over: Partial<ContentAuditIssueRow>): ContentAuditIssueRow => ({
    title: "",
    issue: "x",
    rationale: "",
    rationaleAspects: [],
    proposedFix: "",
    htmlReference: "",
    beforeMarkup: "",
    afterMarkup: "",
    proTip: "",
    ...over,
  });

  const twoH2Html =
    '<h2>Alpha</h2><p>one</p><h2>Beta</h2><p id="tag">needle</p>';

  it("infers section when htmlReference appears in exactly one slice", () => {
    const issues = [baseRow({ issue: "i1", htmlReference: '<p id="tag">needle</p>' })];
    const next = inferAuditIssueSectionIndices(twoH2Html, issues);
    expect(typeof next[0]!.sectionIndex).toBe("number");
    expect(next[0]!.sectionLabel).toBeDefined();
    expect(canUseStitchedSectionFix(twoH2Html, next)).toBe(true);
  });

  it("leaves sectionIndex unset when reference matches no slice", () => {
    const issues = [baseRow({ issue: "ghost", htmlReference: "<span>nope</span>" })];
    const next = inferAuditIssueSectionIndices(twoH2Html, issues);
    expect(next[0]!.sectionIndex).toBeUndefined();
  });

  it("leaves sectionIndex unset when reference is ambiguous across slices", () => {
    const dupHtml = "<h2>A</h2><p>same</p><h2>B</h2><p>same</p>";
    const issues = [baseRow({ issue: "dup", htmlReference: "<p>same</p>" })];
    const next = inferAuditIssueSectionIndices(dupHtml, issues);
    expect(next[0]!.sectionIndex).toBeUndefined();
  });

  it("does not override an existing sectionIndex", () => {
    const issues = [
      baseRow({
        issue: "i",
        htmlReference: '<p id="tag">needle</p>',
        sectionIndex: 0,
        sectionLabel: "Forced",
      }),
    ];
    const next = inferAuditIssueSectionIndices(twoH2Html, issues);
    expect(next[0]!.sectionIndex).toBe(0);
    expect(next[0]!.sectionLabel).toBe("Forced");
  });
});
