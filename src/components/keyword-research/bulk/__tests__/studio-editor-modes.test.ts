import { describe, expect, it } from "vitest";
import {
  blogGeneratorSectionForStudioMode,
  isResearchStudioMode,
  isStudioEditorModeId,
  readStoredStudioEditorMode,
  STUDIO_EDITOR_MODE_OPTIONS,
} from "../studio-editor-modes";

describe("studio-editor-modes", () => {
  it("lists all 5 separate studio modes and excludes citation and backlinking", () => {
    const ids = STUDIO_EDITOR_MODE_OPTIONS.map((o) => o.id);
    expect(ids).toEqual([
      "prompt",
      "blog-import",
      "csv",
      "press-release",
      "research-proposal",
    ]);
    for (const id of ids) {
      expect(isStudioEditorModeId(id)).toBe(true);
    }
    expect(isStudioEditorModeId("research-citation")).toBe(false);
    expect(isStudioEditorModeId("research-backlinking")).toBe(false);
  });

  it("maps studio modes to BlogGeneratorSectionId and identifies research modes", () => {
    expect(blogGeneratorSectionForStudioMode("prompt")).toBe("bulk-prompt");
    expect(blogGeneratorSectionForStudioMode("blog-import")).toBe("bulk-prompt");
    expect(blogGeneratorSectionForStudioMode("csv")).toBe("bulk-prompt");
    expect(blogGeneratorSectionForStudioMode("press-release")).toBe("bulk-press-release");
    expect(blogGeneratorSectionForStudioMode("research-proposal")).toBe("research");

    expect(isResearchStudioMode("research-proposal")).toBe(true);
    expect(isResearchStudioMode("prompt")).toBe(false);
    expect(isResearchStudioMode("press-release")).toBe(false);
  });

  it("resolves initial studio editor mode from activeSection", () => {
    expect(readStoredStudioEditorMode("bulk-press-release")).toBe("press-release");
    expect(readStoredStudioEditorMode("research")).toBe("research-proposal");
    expect(readStoredStudioEditorMode("bulk-csv")).toBe("csv");
    expect(readStoredStudioEditorMode("bulk-blog-import")).toBe("blog-import");
    expect(readStoredStudioEditorMode("bulk-prompt")).toBe("prompt");
  });
});
