import { describe, expect, it } from "vitest";
import {
  buildElementorSectionContext,
  validateBodyHtmlAgainstBlueprint,
} from "@/lib/elementor-page-content/elementor-section-context";

const centeredHeroJson = JSON.stringify([
  {
    id: "hero-band",
    elType: "container",
    settings: {
      background_image: { url: "https://example.com/hero.jpg" },
      flex_align_items: "center",
    },
    elements: [
      {
        id: "logo-heading",
        elType: "widget",
        widgetType: "heading",
        settings: { title: "Blind Magic", header_size: "h1", align: "center" },
      },
      {
        id: "hero-body",
        elType: "widget",
        widgetType: "text-editor",
        settings: {
          align: "center",
          editor:
            "<p>Blind Magic is Edmonton’s premier provider of commercial blinds and window treatments.</p>",
        },
      },
    ],
  },
]);

describe("buildElementorSectionContext", () => {
  it("builds centered hero blueprint that forbids lists", () => {
    const context = buildElementorSectionContext(centeredHeroJson, "hero-band", {
      id: "hero-band",
      title: "Blind Magic",
      hasHeadingWidget: true,
      headingInBodyHtml: false,
      headingHtml: "",
      depth: 0,
      bodyText: "Blind Magic is Edmonton’s premier provider of commercial blinds.",
      bodyHtml:
        "<p>Blind Magic is Edmonton’s premier provider of commercial blinds and window treatments.</p>",
    });

    expect(context.role).toBe("hero");
    expect(context.bodyTextAlign).toBe("center");
    expect(context.copyBlueprint.allowLists).toBe(false);
    expect(context.copyBlueprint.forbiddenTags).toContain("<ul>");
    expect(context.promptBlock).toMatch(/COPY BLUEPRINT/i);
    expect(context.promptBlock).toMatch(/FORBIDDEN.*ul/i);
    expect(context.promptBlock).toMatch(/convert each list item into its own <p>/i);
    expect(context.promptBlock).not.toMatch(/MAY use one <ul>/i);
  });

  it("allows lists for left-aligned body bands", () => {
    const leftJson = JSON.stringify([
      {
        id: "body-band",
        elType: "container",
        elements: [
          {
            id: "h2",
            elType: "widget",
            widgetType: "heading",
            settings: { title: "Services", header_size: "h2", align: "left" },
          },
          {
            id: "body",
            elType: "widget",
            widgetType: "text-editor",
            settings: { align: "left", editor: "<p>We serve many industries.</p>" },
          },
        ],
      },
    ]);

    const context = buildElementorSectionContext(leftJson, "body-band", {
      id: "body-band",
      title: "Services",
      hasHeadingWidget: true,
      headingInBodyHtml: false,
      headingHtml: "",
      depth: 0,
      bodyText: "We serve many industries.",
      bodyHtml: "<p>We serve many industries.</p>",
    });

    expect(context.copyBlueprint.allowLists).toBe(true);
    expect(context.promptBlock).toMatch(/You may use <ul>/i);
  });

  it("uses a requirements checklist without paragraph or word-count caps", () => {
    const longBody = Array.from({ length: 5 }, (_, i) => `<p>Paragraph ${i + 1} with copy.</p>`).join(
      "",
    );
    const introJson = JSON.stringify([
      {
        id: "intro-band",
        elType: "container",
        elements: [
          {
            id: "intro-heading",
            elType: "widget",
            widgetType: "heading",
            settings: { title: "Promotions", header_size: "h2", align: "center" },
          },
          {
            id: "intro-body",
            elType: "widget",
            widgetType: "text-editor",
            settings: { align: "center", editor: longBody },
          },
        ],
      },
    ]);

    const context = buildElementorSectionContext(introJson, "intro-band", {
      id: "intro-band",
      title: "Promotions",
      hasHeadingWidget: true,
      headingInBodyHtml: false,
      headingHtml: "",
      depth: 0,
      bodyText: longBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      bodyHtml: longBody,
    });

    expect(context.promptBlock).toMatch(/COPY BLUEPRINT/i);
    expect(context.promptBlock).toMatch(/Read the full CURRENT SECTION/i);
    expect(context.promptBlock).toMatch(/Never summarize, never shorten/i);
    expect(context.promptBlock).not.toMatch(/short <p> tags max/i);
    expect(context.promptBlock).not.toMatch(/±25%/i);
    expect(context.promptBlock).not.toMatch(/words today/i);
    expect(context.copyBlueprint).not.toHaveProperty("maxParagraphs");
  });
});

describe("validateBodyHtmlAgainstBlueprint", () => {
  it("rejects ul in centered blueprint", () => {
    const blueprint = buildElementorSectionContext(centeredHeroJson, "hero-band", {
      id: "hero-band",
      title: "Blind Magic",
      hasHeadingWidget: true,
      headingInBodyHtml: false,
      headingHtml: "",
      depth: 0,
      bodyText: "Test",
      bodyHtml: "<p>Test</p>",
    }).copyBlueprint;

    expect(() =>
      validateBodyHtmlAgainstBlueprint(
        "<p>Intro</p><ul><li>One</li><li>Two</li></ul>",
        blueprint,
      ),
    ).toThrow(/forbidden.*ul/i);
  });
});
