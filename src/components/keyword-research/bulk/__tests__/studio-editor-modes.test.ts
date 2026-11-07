import { describe, expect, it } from "vitest";
import {
  blogGeneratorSectionForStudioMode,
  isStudioEditorModeId,
  readStoredStudioEditorMode,
  STUDIO_EDITOR_MODE_OPTIONS,
} from "../studio-editor-modes";

describe("studio-editor-modes", () => {
  it("lists all 4 separate studio modes and excludes citation and backlinking", () => {
    const ids = STUDIO_EDITOR_MODE_OPTIONS.map((o) => o.id);
    expect(ids).toEqual(["prompt", "vertical-benchmarks", "csv", "press-release"]);
    expect(STUDIO_EDITOR_MODE_OPTIONS.find((o) => o.id === "csv")?.label).toBe("Import Studio");
    for (const id of ids) {
      expect(isStudioEditorModeId(id)).toBe(true);
    }
    expect(isStudioEditorModeId("research-citation")).toBe(false);
    expect(isStudioEditorModeId("research-backlinking")).toBe(false);
  });

  it("maps studio modes to BlogGeneratorSectionId", () => {
    expect(blogGeneratorSectionForStudioMode("prompt")).toBe("bulk-prompt");
    expect(blogGeneratorSectionForStudioMode("vertical-benchmarks")).toBe("bulk-prompt");
    expect(blogGeneratorSectionForStudioMode("csv")).toBe("bulk-prompt");
    expect(blogGeneratorSectionForStudioMode("press-release")).toBe("bulk-press-release");

  });

  it("resolves initial studio editor mode from activeSection", () => {
    expect(readStoredStudioEditorMode("bulk-press-release")).toBe("press-release");
    expect(readStoredStudioEditorMode("bulk-csv")).toBe("csv");
    expect(readStoredStudioEditorMode("bulk-blog-import")).toBe("csv");
    expect(readStoredStudioEditorMode("bulk-prompt")).toBe("prompt");
  });
});
