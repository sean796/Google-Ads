import { describe, expect, it } from "vitest";
import { applyBodyHtmlToBand } from "@/lib/elementor-page-content/elementor-band-edit";

describe("applyBodyHtmlToBand", () => {
  it("writes generated copy to the first text-editor only and clears the rest", () => {
    const band = {
      elType: "container",
      elements: [
        {
          elType: "widget",
          widgetType: "text-editor",
          settings: { editor: "<p>First widget</p>" },
        },
        {
          elType: "widget",
          widgetType: "text-editor",
          settings: { editor: "<p>Second widget</p>" },
        },
      ],
    };

    expect(applyBodyHtmlToBand(band, "<p>Rewritten body</p>")).toBe(true);
    expect(band.elements?.[0]?.settings?.editor).toBe("<p>Rewritten body</p>");
    expect(band.elements?.[1]?.settings?.editor).toBe("");
  });

  it("writes generated copy to html widgets", () => {
    const band = {
      elType: "container",
      elements: [
        {
          elType: "widget",
          widgetType: "html",
          settings: { html: "<p>Legacy html widget</p>" },
        },
      ],
    };

    expect(applyBodyHtmlToBand(band, "<p>Rewritten html body</p>")).toBe(true);
    expect(band.elements?.[0]?.settings?.html).toBe("<p>Rewritten html body</p>");
  });

  it("appends a text-editor widget when the band has no body widget", () => {
    const band: Parameters<typeof applyBodyHtmlToBand>[0] = {
      elType: "container",
      elements: [
        {
          elType: "widget",
          widgetType: "heading",
          settings: { title: "Title only" },
        },
      ],
    };

    expect(applyBodyHtmlToBand(band, "<p>New body copy</p>")).toBe(true);
    expect(band.elements?.[1]?.widgetType).toBe("text-editor");
    expect(band.elements?.[1]?.settings?.editor).toBe("<p>New body copy</p>");
  });
});
