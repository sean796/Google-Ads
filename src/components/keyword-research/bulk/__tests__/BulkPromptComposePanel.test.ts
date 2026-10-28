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
        isGeneratingChecklist: false,
        hasGeneratedChecklist: false,
        onGenerateChecklist: () => {},
        onApprove: () => {},
      }),
    );

    // Slot 1: Header
    expect(html).toContain("Generate Blog Ideas");
    expect(html).toContain("Batch Content Ideation");

    // Slot 2: Primary surface with universal min-height
    expect(html).toContain("min-h-[7.5rem]");
    expect(html).toContain("General intent / topic");

    // Slot 3: Secondary grid
    expect(html).toContain("Articles in batch:");
    expect(html).toContain("Tone, audience, or angle");

    // Slot 4: Action button
    expect(html).toContain("Ideas");
  });

  it("renders Blog-Import mode with matching dropzone and universal 4-tier slot structure", () => {
    const html = renderToStaticMarkup(
      createElement(BulkPromptComposePanel, {
        studioMode: "blog-import",
        generalIntent: "",
        onGeneralIntentChange: () => {},
        numberOfBlogs: 1,
        onNumberOfBlogsChange: () => {},
        optionalPrompt: "",
        onOptionalPromptChange: () => {},
        workspaceBusy: false,
        isGeneratingChecklist: false,
        hasGeneratedChecklist: false,
        onGenerateChecklist: () => {},
        onApprove: () => {},
        focusKeyword: "window shades",
        titleOverride: "Best Shades 2026",
      }),
    );

    // Slot 1: Header
    expect(html).toContain("Import Draft Articles");

    // Slot 2: Primary surface with universal min-height and drag & drop support
    expect(html).toContain("min-h-[7.5rem]");
    expect(html).toContain("Drop draft files here or click to browse");

    // Slot 3: Secondary grid
    expect(html).toContain("Focus keyword (optional)");
    expect(html).toContain("Title override (optional)");

    // Slot 4: Action button
    expect(html).toContain("Import Files");
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
        isGeneratingChecklist: false,
        hasGeneratedChecklist: false,
        onGenerateChecklist: () => {},
        onApprove: () => {},
      }),
    );

    // Slot 1: Header
    expect(html).toContain("Bulk CSV Schedule");

    // Slot 2: Primary surface with universal min-height
    expect(html).toContain("min-h-[7.5rem]");
    expect(html).toContain("Drop CSV here or click to browse");

    // Slot 3: Secondary grid with template download
    expect(html).toContain("Download Template CSV");
    expect(html).toContain("Auto-maps titles, slugs &amp; publication schedule");
  });

  it("shows Generate on CSV mode when a file is loaded", () => {
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
        isGeneratingChecklist: false,
        hasGeneratedChecklist: false,
        onGenerateChecklist: () => {},
        onApprove: () => {},
        csvFileName: "schedule.csv",
        canStartCsvProcessing: true,
        onStartCsvProcessing: () => {},
      }),
    );
    expect(html).toContain("Generate");
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
        isGeneratingChecklist: false,
        hasGeneratedChecklist: false,
        onGenerateChecklist: () => {},
        onApprove: () => {},
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
    expect(html).toContain("Press Release Studio");

    // Slot 2: Primary surface with universal min-height
    expect(html).toContain("min-h-[7.5rem]");
    expect(html).toContain("Press release topic, news angle");

    // Slot 3: Secondary grid
    expect(html).toContain("Headline override (optional)");
    expect(html).toContain("Newswire Distribution Format");

    // Slot 4: Action button
    expect(html).toContain("Generate PR");
  });

  it("maintains consistent max-w-4xl and unified padding across all modes", () => {
    const modes = ["prompt", "blog-import", "csv", "press-release"] as const;

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
          isGeneratingChecklist: false,
          hasGeneratedChecklist: false,
          onGenerateChecklist: () => {},
          onApprove: () => {},
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

      expect(html).toContain("max-w-4xl");
      expect(html).toContain("px-6 py-7 sm:px-10 sm:py-8");
      expect(html).toContain("border-white/10");
      expect(html).toContain("min-h-[7.5rem]");
    }
  });
});
