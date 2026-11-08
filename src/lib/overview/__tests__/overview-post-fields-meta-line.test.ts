import { describe, expect, it } from "vitest";
import { postFieldsMetaDescriptionLine } from "../overview-post-fields-meta-line";

describe("postFieldsMetaDescriptionLine", () => {
  it("reads meta_description fields only, not prompt_modifier", () => {
    expect(
      postFieldsMetaDescriptionLine({
        prompt_modifier: "from prompt",
        meta_description: "from meta",
      }),
    ).toBe("from meta");
    expect(postFieldsMetaDescriptionLine({ prompt_modifier: "from prompt" })).toBe("");
    expect(postFieldsMetaDescriptionLine({ seo_meta_description: "seo meta" })).toBe("seo meta");
  });
});
