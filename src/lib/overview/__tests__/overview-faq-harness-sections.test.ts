import { describe, expect, it } from "vitest";
import {
  buildPlannedFaqPairSections,
  buildWaitingFaqHarnessSections,
  formatFaqPairMarkdown,
  makeFaqPairHarnessDonePayload,
  makeFaqPairHarnessStartPayload,
  buildFaqJsonGeneratedFile,
  buildFaqPostContentHtmlFile,
  buildFaqRowDisplaySections,
  filterFaqRowDisplayFiles,
} from "@/lib/overview/overview-faq-harness-sections";
import { markFaqRowActive } from "@/lib/overview/overview-faq-harness-mutations";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";

describe("buildPlannedFaqPairSections", () => {
  it("plans four pair sections by default seed count", () => {
    const planned = buildPlannedFaqPairSections(4);
    expect(planned).toHaveLength(4);
    expect(planned.map((s) => s.title)).toEqual(["FAQ 1", "FAQ 2", "FAQ 3", "FAQ 4"]);
    expect(planned.map((s) => s.sectionIndex)).toEqual([0, 1, 2, 3]);
  });
});

describe("faq harness payloads", () => {
  it("reduces start then done into a completed section with markdown", () => {
    let sections = buildWaitingFaqHarnessSections(1);
    for (const payload of [
      makeFaqPairHarnessStartPayload(0, 0, 1, 0),
      makeFaqPairHarnessDonePayload(0, 0, 1, 0, {
        question: "What is chiropractic care?",
        answer: "Hands-on treatment for the spine and joints.",
      }),
    ]) {
      sections = reduceHarnessSectionList(sections, payload);
    }
    expect(sections).toHaveLength(1);
    expect(sections[0]?.status).toBe("done");
    expect(sections[0]?.markdown).toBe(
      formatFaqPairMarkdown(
        "What is chiropractic care?",
        "Hands-on treatment for the spine and joints.",
      ),
    );

    const file = buildFaqJsonGeneratedFile([
      { question: "What is chiropractic care?", answer: "Hands-on treatment for the spine and joints." },
    ]);
    expect(file?.name).toBe("faq.json");
    expect(file?.content).toContain("chiropractic care?");
  });
});

describe("buildFaqRowDisplaySections", () => {
  it("always exposes FAQ, post content, and WordPress upload rows", () => {
    expect(
      buildFaqRowDisplaySections(
        [
          { status: "done" },
          { status: "generating" },
        ],
        [],
      ).map((section) => section.title),
    ).toEqual(["FAQ", "Post content", "WordPress upload"]);
  });
});

describe("buildFaqPostContentHtmlFile", () => {
  it("names content file from url slug and stores full html", () => {
    const file = buildFaqPostContentHtmlFile(
      "https://example.com/cra-mail-in-policy/",
      "<h2>Article</h2><div class=\"flo-faq\"><h2 id=\"faq\">FAQ</h2></div>",
    );
    expect(file?.name).toBe("content-cra-mail-in-policy.html");
    expect(file?.content).toContain("Article");
    expect(file?.content).toContain("flo-faq");
  });
});

describe("filterFaqRowDisplayFiles", () => {
  it("keeps faq.json, content html, upload payload, and wordpress.json", () => {
    expect(
      filterFaqRowDisplayFiles([
        { name: "faq.json", content: "[]" },
        { name: "content-cra-mail-in.html", content: "<h2>Article</h2>" },
        { name: "faq-foo-FAQ_1.md", content: "x" },
        { name: "wordpress.json", content: "{}" },
        { name: "upload-payload-x.json", content: "{}" },
      ]).map((file) => file.name),
    ).toEqual([
      "faq.json",
      "content-cra-mail-in.html",
      "upload-payload-x.json",
      "wordpress.json",
    ]);
  });

  it("matches BulkGeneratedFile fileName field", () => {
    expect(
      filterFaqRowDisplayFiles([
        { fileName: "faq.json", content: "[]", status: "completed" },
        { fileName: "content-page.html", content: "<p>body</p>", status: "completed" },
        { fileName: "wordpress.json", content: "{}", status: "completed" },
      ]).map((file) => file.fileName),
    ).toEqual(["faq.json", "content-page.html", "wordpress.json"]);
  });
});

describe("markFaqRowActive", () => {
  it("moves currentIndex to the row that just started", () => {
    let store: Record<string, BulkOptimizationState> = {
      "site-1-batch": {
        urls: ["https://example.com/a", "https://example.com/b"],
        currentIndex: 0,
        currentUrl: "https://example.com/a",
        urlStatuses: { "https://example.com/a": "completed" },
        currentStep: "AI FAQs",
        runKind: "aiFaq",
      },
    };

    markFaqRowActive("https://example.com/b", 2, {
      siteId: "site-1",
      batchKey: "site-1-batch",
      setBulkOptimizationState: (updater) => {
        store = typeof updater === "function" ? updater(store) : updater;
      },
      setOptimizationProgress: () => undefined,
    });

    expect(store["site-1-batch"]?.currentIndex).toBe(1);
    expect(store["site-1-batch"]?.currentUrl).toBe("https://example.com/b");
    expect(store["site-1-batch"]?.urlStatuses?.["https://example.com/b"]).toBe("optimizing");
  });
});
