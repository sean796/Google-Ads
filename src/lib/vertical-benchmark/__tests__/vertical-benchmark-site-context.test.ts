import { describe, expect, it } from "vitest";
import {
  buildClientOfferingsPromptBlock,
  deriveOfferingsFromInventory,
  detectVerifiedBrands,
} from "../vertical-benchmark-site-context";

function inventoryWithPosts(posts: Array<{ url: string; title?: string; keyword?: string; slug?: string }>) {
  return JSON.stringify({
    site: { url: "https://example.com" },
    generatedAt: new Date().toISOString(),
    posts: posts.map((p, i) => ({
      id: i + 1,
      url: p.url,
      slug: p.slug,
      fields: {
        title: p.title ?? "",
        meta: "",
        keyword: p.keyword ?? "",
      },
    })),
  });
}

describe("deriveOfferingsFromInventory", () => {
  it("detects Hunter Douglas when evidenced in inventory URLs/titles", () => {
    const json = inventoryWithPosts([
      { url: "https://example.com/blog/hunter-douglas-blinds-guide", title: "Hunter Douglas Blinds Guide" },
      { url: "https://example.com/blog/powerview-vs-somfy", title: "PowerView vs Somfy" },
      { url: "https://example.com/blog/hunter-douglas-shades", title: "Hunter Douglas Shades Options" },
    ]);
    const offerings = deriveOfferingsFromInventory("https://example.com", json);
    expect(offerings.verifiedBrands).toContain("Hunter Douglas");
    expect(offerings.verifiedBrands).toContain("PowerView");
  });

  it("omits Hunter Douglas when not in inventory", () => {
    const json = inventoryWithPosts([
      { url: "https://example.com/blog/custom-blinds", title: "Custom Blinds Guide" },
      { url: "https://example.com/blog/motorized-shades", title: "Motorized Shades" },
    ]);
    const offerings = deriveOfferingsFromInventory("https://example.com", json);
    expect(offerings.verifiedBrands).not.toContain("Hunter Douglas");
  });
});

describe("buildClientOfferingsPromptBlock", () => {
  it("includes CLIENT_OFFERINGS_CONTEXT and forbids copying city into titles", () => {
    const offerings = deriveOfferingsFromInventory(
      "https://example.com",
      inventoryWithPosts([{ url: "https://example.com/blog/blinds", title: "Blinds" }]),
    );
    const block = buildClientOfferingsPromptBlock(offerings, {
      title: "Blind Magic",
      formattedAddress: "123 Main St",
      city: "Edmonton",
      region: "AB",
      phone: "",
      latitude: 53.5465,
      longitude: -113.4938,
    });
    expect(block).toMatch(/CLIENT_OFFERINGS_CONTEXT/);
    expect(block).toMatch(/verified_brands/);
    expect(block).toMatch(/never use place names in keyword or title/i);
    expect(block).not.toMatch(/keyword or title.*Edmonton/i);
  });
});

describe("detectVerifiedBrands", () => {
  it("requires slug hit or two text mentions", () => {
    const once = detectVerifiedBrands([
      {
        url: "https://example.com/x",
        fields: { title: "Hunter Douglas once", meta: "", keyword: "" },
      },
    ]);
    expect(once).not.toContain("Hunter Douglas");

    const twice = detectVerifiedBrands([
      {
        url: "https://example.com/a",
        fields: { title: "Hunter Douglas blinds", meta: "", keyword: "" },
      },
      {
        url: "https://example.com/b",
        fields: { title: "Why Hunter Douglas", meta: "", keyword: "" },
      },
    ]);
    expect(twice).toContain("Hunter Douglas");
  });
});
