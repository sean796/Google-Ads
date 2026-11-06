import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sparkles } from "lucide-react";
import { UnifiedWorkspaceChrome } from "@/components/shared/UnifiedWorkspaceChrome";

describe("UnifiedWorkspaceChrome", () => {
  it("renders the title heading, tools navigation, and toolbar content", async () => {
    const onRun = vi.fn();
    render(
      <UnifiedWorkspaceChrome
        icon={Sparkles}
        title="Blogs"
        workspaceBusy={false}
        progressBand="empty"
        toolbar={
          <button type="button" onClick={onRun}>
            Run
          </button>
        }
      />,
    );

    expect(screen.getByRole("heading", { name: "Blogs" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Blogs tools" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("keeps the progress band mounted but hidden in empty mode", () => {
    const { container } = render(
      <UnifiedWorkspaceChrome
        icon={Sparkles}
        title="Blogs"
        workspaceBusy={false}
        progressBand="empty"
        toolbar={<span>Tools</span>}
      />,
    );

    const bands = container.querySelectorAll("[class*='h-11']");
    expect(bands.length).toBeGreaterThan(0);
    const progressBand = container.querySelector("[aria-hidden='true']");
    expect(progressBand).not.toBeNull();
    expect(progressBand?.textContent ?? "").not.toContain("Tools");
  });

  it("omits the toolbar band when hideToolbar is set", () => {
    render(
      <UnifiedWorkspaceChrome
        icon={Sparkles}
        title="Blogs"
        workspaceBusy={false}
        hideToolbar
        progressBand="empty"
        toolbar={<span>Tools</span>}
      />,
    );

    expect(screen.queryByRole("navigation", { name: "Blogs tools" })).toBeNull();
    expect(screen.queryByText("Tools")).toBeNull();
  });

  it("renders title row menu and end slots in the title band", () => {
    render(
      <UnifiedWorkspaceChrome
        icon={Sparkles}
        title="Content"
        workspaceBusy={false}
        progressBand="empty"
        titleRowMenu={<span>Multi-site</span>}
        titleRowEnd={<span>Categories</span>}
        toolbar={<span>Tools</span>}
      />,
    );

    expect(screen.getByText("Multi-site")).toBeInTheDocument();
    expect(screen.getByText("Categories")).toBeInTheDocument();
  });

  it("renders progress leading content in full mode and keeps details out of the band", () => {
    render(
      <UnifiedWorkspaceChrome
        icon={Sparkles}
        title="Blogs"
        workspaceBusy={false}
        progressSnapshot={null}
        canOpenDetails
        isProcessing={false}
        detailsPanelId="blogs-details"
        detailsPanel={<p>Batch log details</p>}
        progressLeading={<span>Page 1 of 3</span>}
        toolbar={<span>Tools</span>}
      />,
    );

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    // Details content is published to the right sidebar dock, never inline
    // in the band; without a dock provider nothing renders here.
    expect(screen.queryByText("Batch log details")).toBeNull();
  });
});
