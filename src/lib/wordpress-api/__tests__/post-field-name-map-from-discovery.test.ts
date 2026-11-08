import { describe, expect, it } from "vitest";
import { fieldNameMapFromDiscovery } from "@/lib/wordpress-api/post-fields-discovery";
import { fallbackFieldMapping } from "@/lib/content-generation/post-field-mapper";

describe("fieldNameMapFromDiscovery", () => {
  it("maps Lindsey-style group field names for a new post with empty REST acf", () => {
    const names = fieldNameMapFromDiscovery({
      success: true,
      method: "acf_rest_api",
      fieldGroups: [],
      fields: [
        { name: "date_modifier", label: "Date Modifier", type: "text" },
        { name: "faq", label: "FAQ", type: "text" },
        { name: "keyword_focus", label: "Keyword Focus", type: "text" },
        { name: "seo_research", label: "seo_research", type: "textarea" },
      ],
    });
    expect(Object.keys(names).sort()).toEqual([
      "date_modifier",
      "faq",
      "keyword_focus",
      "seo_research",
    ]);
    const mapping = fallbackFieldMapping(names);
    expect(mapping.dateModifier).toBe("date_modifier");
    expect(mapping.faq).toBe("faq");
    expect(mapping.keywordFocus).toBe("keyword_focus");
    expect(mapping.seoResearch).toBe("seo_research");
  });
});
