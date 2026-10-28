import { describe, expect, it } from "vitest";
import { buildSapSlugFromKeywordEntity } from "../sap-slug-from-keyword-entity";

describe("buildSapSlugFromKeywordEntity", () => {
  it("joins keyword and entity with dashed city last on the entity block", () => {
    expect(buildSapSlugFromKeywordEntity("residential painting", "Allard, Edmonton, AB")).toBe(
      "residential-painting-allard-edmonton-ab",
    );
  });

  it("keeps neighbourhood undashed and dashes before city", () => {
    expect(buildSapSlugFromKeywordEntity("painters edmonton", "Wîhkwêntôwin, Edmonton")).toBe(
      "painters-wihkwentowin-edmonton",
    );
  });

  it("pulls city out of keyword and dashes before city after neighbourhood", () => {
    expect(buildSapSlugFromKeywordEntity("interior painters edmonton", "Gold Bar, Edmonton")).toBe(
      "interior-painters-goldbar-edmonton",
    );
  });

  it("dashes before city for multi-word neighbourhoods", () => {
    expect(buildSapSlugFromKeywordEntity("exterior painting edmonton", "Castle Downs, Edmonton")).toBe(
      "exterior-painting-castledowns-edmonton",
    );
  });

  it("handles keyword-only when entity empty", () => {
    expect(buildSapSlugFromKeywordEntity("painting companies", "")).toBe("painting-companies");
  });

  it("strips apostrophes without orphan s segment", () => {
    expect(buildSapSlugFromKeywordEntity("Alberta's Productivity Grant", "")).toBe(
      "albertas-productivity-grant",
    );
    expect(buildSapSlugFromKeywordEntity("Canada's 35 billion arctic investment", "")).toBe(
      "canadas-35-billion-arctic",
    );
  });
});
