/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { parseNeoPulseFieldsExportJson } from "../neo-pulse-fields-discovery.cjs";

const NEO_PULSE_STARTER_GROUPS = [
  {
    key: "group_neo_pulse_seo_fields",
    title: "NEO Pulse SEO & Content Fields",
    fields: [
      { name: "keyword_focus", label: "Keyword Focus", type: "text" },
      { name: "seo_title", label: "SEO Title", type: "text" },
      { name: "meta_description", label: "Meta Description", type: "textarea" },
      { name: "seo_extra_text", label: "Extra Text", type: "wysiwyg" },
      { name: "seo_faq", label: "SEO FAQ", type: "textarea" },
      { name: "seo_research", label: "SEO Research Brief", type: "textarea" },
      { name: "date_modifier", label: "Date Modifier", type: "date_picker" },
    ],
    location: [],
  },
];

describe("parseNeoPulseFieldsExportJson", () => {
  it("parses NEO Pulse fields export JSON into field definitions", () => {
    const json = JSON.stringify(NEO_PULSE_STARTER_GROUPS);
    const parsed = parseNeoPulseFieldsExportJson(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.fields.length).toBeGreaterThan(0);
    const names = parsed!.fields.map((f) => f.name);
    expect(names).toContain("seo_extra_text");
    expect(names).toContain("seo_faq");
    const extra = parsed!.fields.find((f) => f.name === "seo_extra_text");
    expect(extra?.type).toBe("wysiwyg");
    expect(extra?.label).toBe("Extra Text");
  });

  it("returns null for invalid JSON", () => {
    expect(parseNeoPulseFieldsExportJson("not json")).toBeNull();
    expect(parseNeoPulseFieldsExportJson("[]")).toEqual({ fieldGroups: [], fields: [] });
  });
});
