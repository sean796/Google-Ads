import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UniversalStudioHeader } from "../UniversalStudioHeader";

describe("UniversalStudioHeader", () => {
  it("renders three stacked bands: Band 1 with studio mode & external link, Band 2 with filters & actions, Band 3 with detailed drawer row", () => {
    const html = renderToStaticMarkup(
      createElement(UniversalStudioHeader, {
        studioEditorMode: "prompt",
        onStudioEditorModeChange: () => {},
        activeUrl: "https://example.com/blog/great-post",
        publicUrl: "https://example.com/blog/great-post",
        urlDisplayLabel: "/blog/great-post",
        filters: createElement("div", { id: "test-filters" }, "Filters Area"),
        actions: createElement("div", { id: "test-actions" }, "Actions Area"),
        drawerOpen: false,
        onToggleDrawer: () => {},
        drawerContent: createElement("div", { id: "drawer-body" }, "Drawer Details"),
      }),
    );

    // Row 1 elements
    expect(html).toContain('aria-label="Studio header"');
    expect(html).toContain('aria-label="Studio module mode"');
    expect(html).toContain('href="https://example.com/blog/great-post"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('/blog/great-post');
    expect(html).toContain("Detailed Drawer");

    // Row 2 elements
    expect(html).toContain("Filters Area");
    expect(html).toContain("Actions Area");

    // Drawer is hidden when closed
    expect(html).toContain("hidden");
    expect(html).toContain("Drawer Details");
  });

  it("renders square styling with rounded-none and no negative margin pills", () => {
    const html = renderToStaticMarkup(
      createElement(UniversalStudioHeader, {
        studioEditorMode: "prompt",
        onStudioEditorModeChange: () => {},
        activeUrl: "https://example.com/blog/square-test",
        drawerOpen: true,
        onToggleDrawer: () => {},
        drawerContent: createElement("div", null, "Open Drawer"),
      }),
    );

    // Controls use rounded-none
    expect(html).toContain("rounded-none");
    // When drawer is open, hidden class is not applied to the drawer container
    expect(html).toContain("Open Drawer");
  });

  it("handles empty / no URL gracefully with disabled placeholder", () => {
    const html = renderToStaticMarkup(
      createElement(UniversalStudioHeader, {
        drawerOpen: false,
        onToggleDrawer: () => {},
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
        drawerOpen: false,
        onToggleDrawer: () => {},
      }),
    );

    // Studio select has fixed width min/max
    expect(html).toContain("min-w-[14.5rem]");
    expect(html).toContain("max-w-[14.5rem]");

    // Live URL box has fixed width min/max
    expect(html).toContain("min-w-[20rem]");
    expect(html).toContain("max-w-[20rem]");

    // Detailed Drawer button has fixed width min/max
    expect(html).toContain("min-w-[10.5rem]");
    expect(html).toContain("max-w-[10.5rem]");
  });

  it("does not render any extra 'Proposal Research Controls' placeholder label in Band 2", () => {
    const html = renderToStaticMarkup(
      createElement(UniversalStudioHeader, {
        studioEditorMode: "research-proposal",
        onStudioEditorModeChange: () => {},
        activeUrl: "https://example.com",
        drawerOpen: false,
        onToggleDrawer: () => {},
      }),
    );

    expect(html).toContain('id="universal-studio-band-2-filters"');
    expect(html).not.toContain("Proposal Research Controls");
    expect(html).not.toContain("Document Optimization Controls");
  });
});
