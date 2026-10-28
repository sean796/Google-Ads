import { describe, expect, it } from "vitest";
import {
  BLOG_GENERATOR_SECTION_DEFS,
  coerceBlogGeneratorSectionId,
} from "@/components/blog-generator/blog-generator-sections";

describe("blog-generator-sections", () => {
  it("merges CSV, Prompt, and Import into Studio (bulk-prompt) and omits Entities and Competitor pills", () => {
    const ids = BLOG_GENERATOR_SECTION_DEFS.map((def) => def.id);
    expect(ids).not.toContain("pages");
    expect(ids).not.toContain("entity");
    expect(ids).not.toContain("competitor");
    expect(ids).not.toContain("bulk-csv");
    expect(ids).not.toContain("bulk-blog-import");
    expect(ids).toContain("bulk-prompt");
    expect(coerceBlogGeneratorSectionId("entity")).toBe("bulk-prompt");
    expect(coerceBlogGeneratorSectionId("bulk-csv")).toBe("bulk-prompt");
    expect(coerceBlogGeneratorSectionId("bulk-blog-import")).toBe("bulk-prompt");
  });
});
