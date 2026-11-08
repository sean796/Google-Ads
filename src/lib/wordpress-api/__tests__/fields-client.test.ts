import { describe, expect, it } from "vitest";
import { restPostFieldsFromFullPost } from "../fields-client";

describe("restPostFieldsFromFullPost", () => {
  it("reads neo_pulse_fields when acf is absent", () => {
    const post = {
      id: 1,
      neo_pulse_fields: {
        keyword_focus: "window blinds",
        seo_research: "brief",
      },
    };
    const fields = restPostFieldsFromFullPost(post);
    expect(fields.keyword_focus).toBe("window blinds");
    expect(fields.seo_research).toBe("brief");
  });

  it("prefers neo_pulse_fields over stale acf when plugin value is set", () => {
    const post = {
      acf: { keyword_focus: "elementor experts" },
      neo_pulse_fields: { keyword_focus: "what is national seo" },
    };
    expect(restPostFieldsFromFullPost(post).keyword_focus).toBe("what is national seo");
  });

  it("ignores legacy acf when neo_pulse_fields keyword is empty", () => {
    const post = {
      acf: { keyword_focus: "from acf" },
      neo_pulse_fields: { keyword_focus: "" },
    };
    expect(restPostFieldsFromFullPost(post).keyword_focus).toBe("");
  });

  it("returns empty object when neither key is set", () => {
    expect(restPostFieldsFromFullPost({ id: 2 })).toEqual({});
    expect(restPostFieldsFromFullPost(null)).toEqual({});
  });
});

describe("neo_pulse_fields-only REST inventory shape", () => {
  it("inventory row acf can be sourced from neo_pulse_fields via restPostFieldsFromFullPost", () => {
    const wpRestPost = {
      id: 42,
      link: "https://example.com/services/",
      title: { rendered: "Services" },
      neo_pulse_fields: {
        keyword_focus: "local seo",
        meta_description: "Meta from fields",
      },
    };
    const acf = restPostFieldsFromFullPost(wpRestPost);
    expect(acf.keyword_focus).toBe("local seo");
    expect(acf.meta_description).toBe("Meta from fields");
    expect(wpRestPost).not.toHaveProperty("acf");
  });
});
