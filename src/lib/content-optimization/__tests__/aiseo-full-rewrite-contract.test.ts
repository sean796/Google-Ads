import { describe, expect, it } from "vitest";
import {
  assertAiseoBodyRewriteChanged,
  assertAiseoHeadingRewriteChanged,
  computeFourGramOverlapRatio,
} from "@/lib/content-optimization/aiseo-full-rewrite-contract";
import { countAutoSeoBlogBodySteps } from "@/lib/overview/overview-auto-seo-blog-rewrite";
import { buildH2OpenTagForTitle } from "@/lib/overview/overview-blog-passage-sections";

describe("aiseo full rewrite contract", () => {
  it("rejects identical body html", () => {
    expect(() => assertAiseoBodyRewriteChanged("<p>Same text</p>", "<p>Same text</p>")).toThrow(
      /identical plain text/i,
    );
  });

  it("rejects minimal synonym-swap polish on a blog passage", () => {
    const beforeHtml = `<p>Unlike purely modern interpretations of Florida interior design, the Old Florida style leans into tradition while still acknowledging the warm climate. Homeowners looking to achieve this look can focus on materials and accents that reflect a relaxed, colonial-era sensibility paired with local natural beauty. Element Characteristics Materials Natural woods like cypress or pine, rattan, wicker, and wrought iron. Look for durable fabrics such as linen or cotton. Color Palette Soft, muted tones including creams, pale greens, light blues, and sandy browns, complemented by occasional pops of deeper natural colors.</p>`;
    const synonymSwappedHtml = `<p>Unlike purely modern approaches to Florida interior design, the Old Florida style favors tradition while still fitting the warm climate. Homeowners seeking this appearance can select materials and accents that present a relaxed, colonial-era feeling along with local natural beauty. Element Characteristics Materials Natural woods such as cypress or pine, rattan, wicker, and wrought iron. Look for sturdy fabrics like linen or cotton. Color Palette Soft, quiet tones including creams, pale greens, light blues, and sandy browns, with occasional touches of deeper natural colors.</p>`;

    expect(computeFourGramOverlapRatio(beforeHtml, synonymSwappedHtml)).toBeGreaterThan(0.35);
    expect(() => assertAiseoBodyRewriteChanged(beforeHtml, synonymSwappedHtml)).toThrow(
      /near-verbatim copy|synonym swapping/i,
    );
  });

  it("accepts a genuine from-scratch section rewrite with new structure", () => {
    const beforeHtml = `<p>Unlike purely modern interpretations of Florida interior design, the Old Florida style leans into tradition while still acknowledging the warm climate. Homeowners looking to achieve this look can focus on materials and accents that reflect a relaxed, colonial-era sensibility paired with local natural beauty. Element Characteristics Materials Natural woods like cypress or pine, rattan, wicker, and wrought iron. Look for durable fabrics such as linen or cotton. Color Palette Soft, muted tones including creams, pale greens, light blues, and sandy browns, complemented by occasional pops of deeper natural colors.</p>`;
    const fromScratchHtml = `<p>Authentic Old Florida interiors pair historic architectural details with breathable materials built for coastal heat and humidity.</p><ul><li><strong>Structural Woods &amp; Metalwork</strong>: Heart pine flooring, pecky cypress millwork, woven rattan seating, and forged iron hardware ground the room in regional craftsmanship.</li><li><strong>Breathable Textiles &amp; Coastal Tones</strong>: Washed linen and crisp cotton upholstery in shell white, seafoam, and driftwood balance deeper botanical accents.</li></ul>`;

    expect(computeFourGramOverlapRatio(beforeHtml, fromScratchHtml)).toBeLessThan(0.1);
    expect(() => assertAiseoBodyRewriteChanged(beforeHtml, fromScratchHtml)).not.toThrow();
  });

  it("rejects identical headings", () => {
    expect(() => assertAiseoHeadingRewriteChanged("Office Blinds", "Office Blinds")).toThrow(
      /same title/i,
    );
  });

  it("computes deterministic H2 open tags and full blog body step counts", () => {
    expect(buildH2OpenTagForTitle("Historic Materials And Coastal Palettes")).toBe(
      '<h2 id="historic-materials-and-coastal-palettes">',
    );
    const sampleBlog = [
      '<h2 id="answer">Answer</h2><p>Direct answer.</p>',
      '<div class="flo-overview"><h2 id="overview">Overview</h2><ul><li><strong>One</strong>: item</li></ul></div>',
      '<h2 id="sec-1">First Section</h2><p>Body one.</p>',
      '<h2 id="sec-2">Second Section</h2><p>Body two.</p>',
    ].join("\n\n");
    expect(countAutoSeoBlogBodySteps(sampleBlog)).toBe(4);
  });
});
