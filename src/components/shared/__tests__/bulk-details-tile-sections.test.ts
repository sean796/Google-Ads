import { describe, expect, it } from "vitest";
import {
  isSerpBriefGeneratedFileName,
  isHarnessSectionDownloadReady,
  resolveDetailsPipelineSections,
  resolvePipelineSectionDownloadable,
  resolveSerpBriefDownloadable,
} from "@/components/shared/bulk-details-tile-sections";
import { RESEARCH_HARNESS_SECTION_TITLES } from "@/lib/overview/overview-research-harness-sections";
import { buildContentOptimizePipelineTitles } from "@/lib/overview/overview-content-optimize-pipeline";

const CONTENT_OPTIMIZE_DOWNLOAD_OPTIONS = {
  noFallback: true as const,
  requireDoneStatus: true as const,
};

function sapOptimizePipelineTitles(): string[] {
  return [...buildContentOptimizePipelineTitles(["Local SEO Fit", "What This Agency Offers"])];
}

function sapOptimizeSections() {
  return sapOptimizePipelineTitles().map((title, sectionIndex) => ({
    sectionIndex,
    title,
    status: "waiting" as const,
  }));
}

function resolveReadyDownloads(
  sections: ReturnType<typeof sapOptimizeSections>,
  files: Array<{ name: string; content: string; mimeType: string }>,
) {
  const claimed = new Set<string>();
  return sections.map((section, index) =>
    resolvePipelineSectionDownloadable(
      section,
      index,
      files,
      claimed,
      null,
      CONTENT_OPTIMIZE_DOWNLOAD_OPTIONS,
    ),
  );
}

describe("isSerpBriefGeneratedFileName", () => {
  it("matches SERP brief artifacts and not keyword-research", () => {
    expect(isSerpBriefGeneratedFileName("serp-research-brief-solar.json")).toBe(true);
    expect(isSerpBriefGeneratedFileName("seo-research-solar-1.json")).toBe(true);
    expect(isSerpBriefGeneratedFileName("acf-seo-research-solar.json")).toBe(true);
    expect(isSerpBriefGeneratedFileName("keyword-research-solar.json")).toBe(false);
    expect(isSerpBriefGeneratedFileName("blueprint-solar.json")).toBe(false);
  });
});

describe("resolvePipelineSectionDownloadable", () => {
  const serpSection = { sectionIndex: 0, title: "SERP research brief", status: "done" as const };
  const blueprintSection = { sectionIndex: 2, title: "Blueprint", status: "done" as const };

  it("attaches the SERP brief in strict mode even when harness step is waiting", () => {
    const claimed = new Set<string>();
    const brief = {
      name: "serp-research-brief-solar.json",
      content: '{"version":1,"focusKeyword":"solar"}',
      mimeType: "application/json",
    };
    const waitingSerp = { sectionIndex: 0, title: "SERP research brief", status: "waiting" as const };
    const out = resolvePipelineSectionDownloadable(
      waitingSerp,
      0,
      [],
      claimed,
      brief,
      { noFallback: true },
    );
    expect(out?.name).toBe("serp-research-brief-solar.json");
  });

  it("builds SERP brief download from overview grid seoResearch before run files exist", () => {
    const brief = resolveSerpBriefDownloadable(
      "Solar Panel Efficiency",
      [],
      '{"version":1,"focusKeyword":"Solar Panel Efficiency"}',
    );
    expect(brief?.name).toContain("serp-research-brief");
    expect(brief?.content).toContain("Solar Panel Efficiency");
  });

  it("links blueprint files in strict mode and skips dummy fallback", () => {
    const claimed = new Set<string>();
    const blueprint = {
      name: "blueprint-solar-1.json",
      content: "{}",
      mimeType: "application/json",
    };
    const linked = resolvePipelineSectionDownloadable(
      blueprintSection,
      1,
      [blueprint],
      claimed,
      null,
      { noFallback: true },
    );
    expect(linked?.name).toBe("blueprint-solar-1.json");
  });

  it("returns no download for empty SERP steps in strict optimize mode", () => {
    const empty = resolvePipelineSectionDownloadable(
      serpSection,
      0,
      [],
      new Set(),
      null,
      { noFallback: true },
    );
    expect(empty).toBeNull();
  });
});

describe("isHarnessSectionDownloadReady", () => {
  it("blocks waiting and generating; allows done only", () => {
    expect(isHarnessSectionDownloadReady({ sectionIndex: 0, title: "A", status: "waiting" })).toBe(false);
    expect(isHarnessSectionDownloadReady({ sectionIndex: 0, title: "A", status: "done" })).toBe(true);
    expect(
      isHarnessSectionDownloadReady({
        sectionIndex: 0,
        title: "A",
        status: "generating",
        markdown: "# draft",
      }),
    ).toBe(false);
    expect(
      isHarnessSectionDownloadReady({ sectionIndex: 0, title: "A", status: "generating" }),
    ).toBe(false);
  });
});

describe("resolveDetailsPipelineSections", () => {
  it("reserves every research pipeline title up front to prevent CLS", () => {
    const sections = resolveDetailsPipelineSections(
      [{ sectionIndex: 0, title: "DataForSEO SERP", status: "generating" }],
      undefined,
      RESEARCH_HARNESS_SECTION_TITLES,
    );
    expect(sections).toHaveLength(7);
    expect(sections.map((section) => section.title)).toEqual([...RESEARCH_HARNESS_SECTION_TITLES]);
    expect(sections.filter((section) => section.status === "waiting")).toHaveLength(6);
    expect(sections.find((section) => section.title === "DataForSEO SERP")?.status).toBe("generating");
  });

  it("fills all 7 research titles from empty persisted harness", () => {
    const sections = resolveDetailsPipelineSections(undefined, undefined, RESEARCH_HARNESS_SECTION_TITLES);
    expect(sections).toHaveLength(7);
    expect(sections.every((section) => section.status === "waiting")).toBe(true);
  });

  it("links keyword research JSON to early pipeline rows", () => {
    const claimed = new Set<string>();
    const keywordFile = {
      name: "keyword-research-smart-blinds-1788537869794.json",
      content: "{}",
      mimeType: "application/json",
    };
    const selectedFile = {
      name: "selected-keyword-smart-blinds-1788537869792.json",
      content: "{}",
      mimeType: "application/json",
    };
    const keywordSection = { sectionIndex: 0, title: "Keyword research", status: "waiting" as const };
    const selectedSection = { sectionIndex: 1, title: "Selected keyword", status: "waiting" as const };
    expect(
      resolvePipelineSectionDownloadable(
        keywordSection,
        0,
        [keywordFile, selectedFile],
        claimed,
        null,
        { noFallback: true },
      )?.name,
    ).toBe(keywordFile.name);
    expect(
      resolvePipelineSectionDownloadable(
        selectedSection,
        1,
        [keywordFile, selectedFile],
        claimed,
        null,
        { noFallback: true },
      )?.name,
    ).toBe(selectedFile.name);
  });

  it("marks artifact-backed pipeline steps done from generated files", () => {
    const sections = resolveDetailsPipelineSections(
      undefined,
      undefined,
      [
        "SERP research brief",
        "Checklist",
        "Blueprint",
        "Post content",
        "Content Markdown",
      ],
      [
        { name: "serp-research-brief-hunter-douglas.json", content: "{}", mimeType: "application/json" },
        { name: "blog-checklist-hunter-douglas.json", content: "{}", mimeType: "application/json" },
        { name: "blueprint-hunter-douglas.json", content: "{}", mimeType: "application/json" },
      ],
    );
    expect(sections).toHaveLength(5);
    expect(sections.filter((section) => section.status === "done")).toHaveLength(3);
    expect(sections[3]?.status).toBe("waiting");
    expect(sections[4]?.status).toBe("waiting");
  });

  it("marks matched pipeline steps done when artifact files exist", () => {
    const sections = resolveDetailsPipelineSections(
      undefined,
      undefined,
      ["Keyword research", "Blueprint"],
      [
        { name: "keyword-research-x.json", content: "{}", mimeType: "application/json" },
        { name: "blueprint-x.json", content: "{}", mimeType: "application/json" },
      ],
    );
    expect(sections.every((section) => section.status === "done")).toBe(true);
  });
});

describe("SAP content optimize downloads", () => {
  const sapFiles = [
    { name: "keyword-research-edmonton.json", content: "{}", mimeType: "application/json" },
    { name: "selected-keyword-edmonton.json", content: "{}", mimeType: "application/json" },
    { name: "serp-research-brief-edmonton.json", content: "{}", mimeType: "application/json" },
    { name: "checklist-edmonton.json", content: "1. Sunlight", mimeType: "text/plain" },
    { name: "blueprint-edmonton.json", content: "{}", mimeType: "application/json" },
    { name: "link-targets-edmonton.json", content: "{}", mimeType: "application/json" },
    { name: "content-edmonton.html", content: "<h2>Answer</h2>", mimeType: "text/html" },
    { name: "content-edmonton.md", content: "## Answer", mimeType: "text/markdown" },
  ];

  it("enables File for artifact slots and Download all when files exist", () => {
    const titles = sapOptimizePipelineTitles();
    expect(titles).toContain("Local SEO Fit");
    expect(titles).toContain("What This Agency Offers");
    expect(titles).not.toContain("Sunlight And Privacy Challenges");
    expect(titles[titles.length - 4]).toBe("Post content");
    expect(titles[titles.length - 3]).toBe("Content Markdown");
    expect(titles[titles.length - 2]).toBe("Implementation report");
    expect(titles[titles.length - 1]).toBe("WordPress upload");

    const ready = resolveReadyDownloads(sapOptimizeSections(), [
      ...sapFiles,
      { name: "wordpress.json", content: '{"success":true}', mimeType: "application/json" },
    ]);
    const enabled = ready.filter((file) => file != null);
    expect(enabled.map((file) => file!.name)).toEqual([
      "checklist-edmonton.json",
      "blueprint-edmonton.json",
      "link-targets-edmonton.json",
      "content-edmonton.html",
      "content-edmonton.md",
      "wordpress.json",
    ]);
    expect(enabled.length).toBeGreaterThan(0);
  });

  it("keeps File disabled on every SAP pipeline slot when no files exist", () => {
    const ready = resolveReadyDownloads(sapOptimizeSections(), []);
    expect(ready.every((file) => file == null)).toBe(true);
  });
});

describe("content optimize download gating", () => {
  it("blocks file link until harness status is done when no artifact exists", () => {
    const waiting = { sectionIndex: 0, title: "Keyword research", status: "waiting" as const };
    expect(
      resolvePipelineSectionDownloadable(waiting, 0, [], new Set(), null, {
        noFallback: true,
        requireDoneStatus: true,
      }),
    ).toBeNull();
    const file = {
      name: "keyword-research-smart-blinds.json",
      content: "{}",
      mimeType: "application/json",
    };
    const done = { ...waiting, status: "done" as const };
    expect(
      resolvePipelineSectionDownloadable(done, 0, [file], new Set(), null, {
        noFallback: true,
        requireDoneStatus: true,
      })?.name,
    ).toBe(file.name);
  });

  it("enables Google Image download as soon as the maps file exists", () => {
    const file = {
      name: "east-marietta-ga-google-maps.jpg",
      content: "data:image/jpeg;base64,abc",
      mimeType: "image/jpeg",
    };
    const waiting = { sectionIndex: 0, title: "Google Image", status: "waiting" as const };
    expect(
      resolvePipelineSectionDownloadable(waiting, 0, [file], new Set(), null, {
        noFallback: true,
        requireDoneStatus: true,
      })?.name,
    ).toBe(file.name);
  });

  it("marks Google Image done when the maps file exists", () => {
    const sections = resolveDetailsPipelineSections(
      undefined,
      undefined,
      ["Google Image", "Keyword research"],
      [
        {
          name: "east-marietta-ga-google-maps.jpg",
          content: "data:image/jpeg;base64,abc",
          mimeType: "image/jpeg",
        },
      ],
    );
    expect(sections[0]?.status).toBe("done");
    expect(sections[1]?.status).toBe("waiting");
  });

  it("allows download when artifact exists even if harness is still waiting", () => {
    const file = {
      name: "keyword-research-smart-blinds.json",
      content: "{}",
      mimeType: "application/json",
    };
    const waiting = { sectionIndex: 0, title: "Keyword research", status: "waiting" as const };
    expect(
      resolvePipelineSectionDownloadable(waiting, 0, [file], new Set(), null, {
        noFallback: true,
        requireDoneStatus: true,
      })?.name,
    ).toBe(file.name);
  });

  it("marks pipeline steps done when artifact files exist", () => {
    const files = [
      {
        name: "keyword-research-dfs-smart-blinds-123.json",
        content: "{}",
        mimeType: "application/json",
      },
      {
        name: "blog-checklist-smart-blinds-456.json",
        content: "{}",
        mimeType: "application/json",
      },
    ];
    const sections = resolveDetailsPipelineSections(
      undefined,
      undefined,
      ["Google Image", "Keyword research", "Checklist"],
      files,
    );
    expect(sections[1]?.status).toBe("done");
    expect(sections[2]?.status).toBe("done");
  });

  it("blocks harness markdown download for artifact-only steps when noFallback", () => {
    const section = {
      sectionIndex: 1,
      title: "Selected keyword",
      status: "done" as const,
      markdown: "## Selected keyword\n\n```json\n{}\n```",
    };
    expect(
      resolvePipelineSectionDownloadable(section, 1, [], new Set(), null, {
        noFallback: true,
        requireDoneStatus: true,
      }),
    ).toBeNull();
  });

  it("allows Selected keyword download when artifact exists even if harness is waiting", () => {
    const file = {
      name: "selected-keyword-smart-blinds-1788537869792.json",
      content: "{}",
      mimeType: "application/json",
    };
    const waiting = { sectionIndex: 1, title: "Selected keyword", status: "waiting" as const };
    expect(
      resolvePipelineSectionDownloadable(waiting, 1, [file], new Set(), null, {
        noFallback: true,
        requireDoneStatus: true,
      })?.name,
    ).toBe(file.name);
  });
});

describe("research pipeline step labels", () => {
  it("reserves pending label slots for waiting research steps after pipeline starts", () => {
    const sections = resolveDetailsPipelineSections(
      [
        { sectionIndex: 0, title: "DataForSEO SERP", status: "done" },
        { sectionIndex: 2, title: "LLM audit", status: "generating" },
      ],
      undefined,
      RESEARCH_HARNESS_SECTION_TITLES,
    );
    expect(sections.find((section) => section.title === "SERP dump load")?.status).toBe("waiting");
    expect(sections.find((section) => section.title === "Brief merge")?.status).toBe("waiting");
  });
});

describe("research pipeline downloads", () => {
  it("links LLM audit to research-*-llm-audit.json, not the harness status markdown", () => {
    const claimed = new Set<string>();
    const auditJson = '{"platforms":[{"status":"ok","responseText":"Solar facts"}]}';
    const files = [
      {
        name: "research-solar_panel_efficiency-llm-audit.json",
        content: auditJson,
        mimeType: "application/json",
      },
    ];
    const linked = resolvePipelineSectionDownloadable(
      {
        sectionIndex: 2,
        title: "LLM audit",
        status: "done",
        markdown: "LLM audit: 1/1 ok",
      },
      2,
      files,
      claimed,
      null,
      { researchArtifactsOnly: true },
    );
    expect(linked?.name).toBe("research-solar_panel_efficiency-llm-audit.json");
    expect(linked?.content).toBe(auditJson);
    expect(linked?.content).not.toContain("LLM audit:");
  });

  it("provides a placeholder download for research steps with no artifact yet", () => {
    const linked = resolvePipelineSectionDownloadable(
      {
        sectionIndex: 1,
        title: "GSC CSV",
        status: "done",
        markdown: "No GSC data",
      },
      1,
      [],
      new Set(),
      null,
      { researchArtifactsOnly: true },
    );
    expect(linked.name).toContain("GSC_CSV");
    expect(linked.content.trim()).toBeTruthy();
  });

  it("links brief upload to stored JSON content, not the harness status line", () => {
    const claimed = new Set<string>();
    const briefJson = '{"version":1,"focusKeyword":"solar"}';
    const files = [
      {
        name: "seo_brief__2026-08-27T18-04-1400-00__42076bdc.json",
        content: briefJson,
        mimeType: "application/json",
      },
    ];
    const linked = resolvePipelineSectionDownloadable(
      { sectionIndex: 6, title: "Brief upload", status: "done", markdown: "Brief saved: seo_brief__2026-08-27T18-04-1400-00__42076bdc.json" },
      6,
      files,
      claimed,
      null,
      { researchArtifactsOnly: true },
    );
    expect(linked?.content).toBe(briefJson);
    expect(linked?.content).not.toContain("Brief saved:");
  });

  it("links research SERP and LLM artifacts without strict noFallback", () => {
    const claimed = new Set<string>();
    const files = [
      {
        name: "research-solar-dataforseo-serp.json",
        content: '{"tasks":[]}',
        mimeType: "application/json",
      },
      {
        name: "research-solar-llm-audit.json",
        content: '{"platforms":[]}',
        mimeType: "application/json",
      },
    ];
    const serp = resolvePipelineSectionDownloadable(
      { sectionIndex: 0, title: "DataForSEO SERP", status: "done" },
      0,
      files,
      claimed,
      null,
    );
    expect(serp?.name).toBe("research-solar-dataforseo-serp.json");
    const llm = resolvePipelineSectionDownloadable(
      { sectionIndex: 2, title: "LLM audit", status: "done" },
      2,
      files,
      claimed,
      null,
    );
    expect(llm?.name).toBe("research-solar-llm-audit.json");
  });

  it("maps featured image steps to requirements, Google Image, OpenRouter Image, and wordpress.json", () => {
    const files = [
      {
        name: "image-requirements.json",
        content: JSON.stringify({ agent: "IMAGE REQUIREMENTS", checklist: [] }),
        mimeType: "application/json",
      },
      { name: "google-image.png", content: "data:image/png;base64,aa", mimeType: "image/png" },
      { name: "openrouter-image.png", content: "data:image/png;base64,bb", mimeType: "image/png" },
      {
        name: "wordpress.json",
        content: JSON.stringify({ url: "https://cdn.example.com/maps.png", mediaId: 9 }),
        mimeType: "application/json",
      },
    ];
    const claimed = new Set<string>();
    expect(
      resolvePipelineSectionDownloadable(
        { sectionIndex: 0, title: "Image requirements", status: "done" },
        0,
        files,
        claimed,
        null,
        { noFallback: true },
      )?.name,
    ).toBe("image-requirements.json");
    expect(
      resolvePipelineSectionDownloadable(
        { sectionIndex: 1, title: "Google Image", status: "done" },
        1,
        files,
        claimed,
        null,
        { noFallback: true },
      )?.name,
    ).toBe("google-image.png");
    expect(
      resolvePipelineSectionDownloadable(
        { sectionIndex: 2, title: "OpenRouter Image", status: "done" },
        2,
        files,
        claimed,
        null,
        { noFallback: true },
      )?.name,
    ).toBe("openrouter-image.png");
    expect(
      resolvePipelineSectionDownloadable(
        { sectionIndex: 3, title: "WordPress upload", status: "done" },
        3,
        files,
        claimed,
        null,
        { noFallback: true },
      )?.name,
    ).toBe("wordpress.json");
  });
});
