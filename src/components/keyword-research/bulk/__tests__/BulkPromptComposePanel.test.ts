import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BulkPromptComposePanel } from "../BulkPromptComposePanel";

describe("BulkPromptComposePanel Universal Layout", () => {
  it("renders Prompt mode with universal 4-tier slot structure", () => {
    const html = renderToStaticMarkup(
      createElement(BulkPromptComposePanel, {
        studioMode: "prompt",
        generalIntent: "Test topic",
        onGeneralIntentChange: () => {},
        numberOfBlogs: 3,
        onNumberOfBlogsChange: () => {},
        optionalPrompt: "Professional",
        onOptionalPromptChange: () => {},
        workspaceBusy: false,
        hasGeneratedChecklist: false,
      }),
    );

    // Slot 1: Header

    // Slot 2: Primary surface with universal min-height
    expect(html).toMatch(/min-h-\[(5|7\.5)rem\]/);
    expect(html).toContain("General intent / topic");

    // Slot 3: Secondary grid
    expect(html).toContain("Articles in batch:");
    expect(html).toContain("Tone, audience, or angle");

    // Single Generate / Approve / Publish action lives in the studio header, not the panel
    expect(html).not.toContain("Approve");
  });

  it("renders CSV mode with matching dropzone and universal 4-tier slot structure", () => {
    const html = renderToStaticMarkup(
      createElement(BulkPromptComposePanel, {
        studioMode: "csv",
        generalIntent: "",
        onGeneralIntentChange: () => {},
        numberOfBlogs: 1,
        onNumberOfBlogsChange: () => {},
        optionalPrompt: "",
        onOptionalPromptChange: () => {},
        workspaceBusy: false,
        hasGeneratedChecklist: false,
      }),
    );

    // Slot 1: Header

    // Slot 2: Primary surface with universal min-height
    expect(html).toMatch(/min-h-\[(5|7\.5)rem\]/);
    expect(html).toContain("Drop CSV, DOCX, MD, or other draft files here or click to browse");

    // Slot 3: Secondary grid with template download and draft fields
    expect(html).toContain("Focus keyword (optional)");
    expect(html).toContain("Title override (optional)");
    expect(html).toContain("Download Template CSV");
  });

  it("renders Press Release mode with matching topic area and universal 4-tier slot structure", () => {
    const html = renderToStaticMarkup(
      createElement(BulkPromptComposePanel, {
        studioMode: "press-release",
        generalIntent: "",
        onGeneralIntentChange: () => {},
        numberOfBlogs: 1,
        onNumberOfBlogsChange: () => {},
        optionalPrompt: "",
        onOptionalPromptChange: () => {},
        workspaceBusy: false,
        hasGeneratedChecklist: false,
        pressRelease: {
          keyword: "Acme product launch",
          onKeywordChange: () => {},
          title: "New 2026 Release",
          onTitleChange: () => {},
          isProcessing: false,
          canRun: true,
          onRun: () => {},
          onClear: () => {},
          resultMarkdown: null,
        },
      }),
    );

    // Slot 1: Header

    // Slot 2: Primary surface with universal min-height
    expect(html).toMatch(/min-h-\[(5|7\.5)rem\]/);
    expect(html).toContain("Press release topic, news angle");

    // Slot 3: Secondary grid
    expect(html).toContain("Headline override (optional)");

    // Generate lives in the studio header, not the panel
    expect(html).not.toContain("Generate PR");
  });

  it("maintains consistent max-w-5xl and unified padding across all modes", () => {
    const modes = ["prompt", "csv", "press-release"] as const;

    for (const mode of modes) {
      const html = renderToStaticMarkup(
        createElement(BulkPromptComposePanel, {
          studioMode: mode,
          generalIntent: "Test",
          onGeneralIntentChange: () => {},
          numberOfBlogs: 1,
          onNumberOfBlogsChange: () => {},
          optionalPrompt: "",
          onOptionalPromptChange: () => {},
          workspaceBusy: false,
          hasGeneratedChecklist: false,
          pressRelease: {
            keyword: "PR topic",
            onKeywordChange: () => {},
            title: "",
            onTitleChange: () => {},
            isProcessing: false,
            canRun: true,
            onRun: () => {},
            onClear: () => {},
            resultMarkdown: null,
          },
        }),
      );

      expect(html).toContain("max-w-5xl");
      expect(html).not.toContain("border-white/10");
      expect(html).toMatch(/min-h-\[(5|7\.5)rem\]/);
    }
  });
});
