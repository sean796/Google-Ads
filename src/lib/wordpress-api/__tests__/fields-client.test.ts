import { describe, expect, it } from "vitest";
import { restAcfFromFullPost } from "../fields-client";

describe("restAcfFromFullPost", () => {
  it("reads neo_pulse_fields when acf is absent", () => {
    const post = {
      id: 1,
      neo_pulse_fields: {
        keyword_focus: "window blinds",
        seo_research: "brief",
      },
    };
    const fields = restAcfFromFullPost(post);
    expect(fields.keyword_focus).toBe("window blinds");
    expect(fields.seo_research).toBe("brief");
  });

  it("prefers neo_pulse_fields over stale acf when plugin value is set", () => {
    const post = {
      acf: { keyword_focus: "elementor experts" },
      neo_pulse_fields: { keyword_focus: "what is national seo" },
    };
    expect(restAcfFromFullPost(post).keyword_focus).toBe("what is national seo");
  });

  it("keeps acf when neo_pulse_fields keyword is empty", () => {
    const post = {
      acf: { keyword_focus: "from acf" },
      neo_pulse_fields: { keyword_focus: "" },
    };
    expect(restAcfFromFullPost(post).keyword_focus).toBe("from acf");
  });

  it("returns empty object when neither key is set", () => {
    expect(restAcfFromFullPost({ id: 2 })).toEqual({});
    expect(restAcfFromFullPost(null)).toEqual({});
  });
});

describe("neo_pulse_fields-only REST inventory shape", () => {
  it("inventory row acf can be sourced from neo_pulse_fields via restAcfFromFullPost", () => {
    const wpRestPost = {
      id: 42,
      link: "https://example.com/services/",
      title: { rendered: "Services" },
      neo_pulse_fields: {
        keyword_focus: "local seo",
        meta_description: "Meta from fields",
      },
    };
    const acf = restAcfFromFullPost(wpRestPost);
    expect(acf.keyword_focus).toBe("local seo");
    expect(acf.meta_description).toBe("Meta from fields");
    expect(wpRestPost).not.toHaveProperty("acf");
  });
});
