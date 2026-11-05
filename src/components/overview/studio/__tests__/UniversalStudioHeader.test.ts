import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UniversalStudioHeader } from "../UniversalStudioHeader";

describe("UniversalStudioHeader", () => {
  it("renders three stacked bands: Band 1 with studio mode & external link, Band 2 with filters & actions, Details content in the sidebar dock", () => {
    const html = renderToStaticMarkup(
      createElement(UniversalStudioHeader, {
        studioEditorMode: "prompt",
        onStudioEditorModeChange: () => {},
        activeUrl: "https://example.com/blog/great-post",
        publicUrl: "https://example.com/blog/great-post",
        urlDisplayLabel: "/blog/great-post",
        filters: createElement("div", { id: "test-filters" }, "Filters Area"),
        actions: createElement("div", { id: "test-actions" }, "Actions Area"),
        drawerContent: createElement("div", { id: "drawer-body" }, "Drawer Details"),
      }),
    );

    // Row 1 elements
    expect(html).toContain('aria-label="Studio header"');
    expect(html).toContain('aria-label="Studio module mode"');
    expect(html).toContain('href="https://example.com/blog/great-post"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('/blog/great-post');
    expect(html).not.toContain("Details Drawer");

    // Row 2 elements
    expect(html).toContain("Filters Area");
    expect(html).toContain("Actions Area");

    // Details content is published to the sidebar dock, never inline
    expect(html).not.toContain("Drawer Details");
  });

  it("renders square styling with rounded-none and no negative margin pills", () => {
    const html = renderToStaticMarkup(
      createElement(UniversalStudioHeader, {
        studioEditorMode: "prompt",
        onStudioEditorModeChange: () => {},
        activeUrl: "https://example.com/blog/square-test",
        drawerContent: createElement("div", null, "Open Drawer"),
      }),
    );

    // Controls use rounded-none
    expect(html).toContain("rounded-none");
    expect(html).not.toContain("Open Drawer");
  });

  it("handles empty / no URL gracefully with disabled placeholder", () => {
    const html = renderToStaticMarkup(
      createElement(UniversalStudioHeader, {
      }),
    );

    expect(html).toContain("No active URL");
    expect(html).toContain("Visual Document Studio");
  });

  it("enforces strict min and max widths on interactive controls to eliminate CLS layout shift", () => {
    const html = renderToStaticMarkup(
      createElement(UniversalStudioHeader, {
        studioEditorMode: "prompt",
        onStudioEditorModeChange: () => {},
        activeUrl: "https://example.com",
      }),
    );

    // Studio select has fixed width min/max
    expect(html).toContain("min-w-[15rem]");
    expect(html).toContain("max-w-[15rem]");

    // Live URL box has fixed width min/max
    expect(html).toContain("min-w-[20rem]");
    expect(html).toContain("max-w-[20rem]");

  });

  it("does not render any extra placeholder label in Band 2", () => {
    const html = renderToStaticMarkup(
      createElement(UniversalStudioHeader, {
        studioEditorMode: "csv",
        onStudioEditorModeChange: () => {},
        activeUrl: "https://example.com",
      }),
    );

    expect(html).toContain('id="universal-studio-band-2-filters"');
    expect(html).not.toContain("Document Optimization Controls");
  });
});
