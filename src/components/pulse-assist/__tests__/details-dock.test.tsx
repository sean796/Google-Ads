import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DetailsDockContext,
  useDetailsDock,
  type DetailsDockValue,
} from "@/components/pulse-assist/details-dock-context";
import { DetailsDockPortal, DetailsDockProvider } from "@/components/pulse-assist/details-dock";

vi.mock("@/contexts/use-agent-runs-context", () => ({
  useAgentRunsContext: () => ({ sidebarOpen: true, sidebarPanel: "details" }),
}));

function dockValue(overrides: Partial<DetailsDockValue> = {}): DetailsDockValue {
  return {
    target: null,
    setTarget: () => {},
    count: 0,
    register: () => () => {},
    open: true,
    ...overrides,
  };
}

describe("DetailsDockPortal", () => {
  it("renders nothing and does not throw without a dock provider", () => {
    render(
      <DetailsDockPortal id="lonely-details">
        <p>Batch log</p>
      </DetailsDockPortal>,
    );
    expect(screen.queryByText("Batch log")).toBeNull();
  });

  it("publishes content into the dock target when open", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    try {
      render(
        <DetailsDockContext.Provider value={dockValue({ target })}>
          <DetailsDockPortal id="test-details">
            <p>Batch log</p>
          </DetailsDockPortal>
        </DetailsDockContext.Provider>,
      );

      const published = target.querySelector("#test-details");
      expect(published).not.toBeNull();
      expect(published?.textContent).toContain("Batch log");
    } finally {
      target.remove();
    }
  });

  it("stays silent when the dock is closed or has no target", () => {
    const closed = render(
      <DetailsDockContext.Provider value={dockValue({ open: false })}>
        <DetailsDockPortal id="closed-details">
          <p>Batch log</p>
        </DetailsDockPortal>
      </DetailsDockContext.Provider>,
    );
    expect(screen.queryByText("Batch log")).toBeNull();
    closed.unmount();

    render(
      <DetailsDockContext.Provider value={dockValue({ target: null })}>
        <DetailsDockPortal id="targetless-details">
          <p>Batch log</p>
        </DetailsDockPortal>
      </DetailsDockContext.Provider>,
    );
    expect(screen.queryByText("Batch log")).toBeNull();
  });
});

describe("DetailsDockProvider", () => {
  it("counts mounted portals and reports open state", async () => {
    const seen: Array<{ count: number; open: boolean }> = [];
    function Probe() {
      const dock = useDetailsDock();
      useEffect(() => {
        if (dock) seen.push({ count: dock.count, open: dock.open });
      }, [dock]);
      return null;
    }
    function Harness() {
      const [mounted, setMounted] = useState(true);
      return (
        <DetailsDockProvider>
          <Probe />
          {mounted ? (
            <DetailsDockPortal id="counted-details">
              <p>Log</p>
            </DetailsDockPortal>
          ) : null}
          <button type="button" onClick={() => setMounted(false)}>
            Unmount
          </button>
        </DetailsDockProvider>
      );
    }

    render(<Harness />);
    expect(seen.at(-1)).toEqual({ count: 1, open: true });

    await userEvent.click(screen.getByRole("button", { name: "Unmount" }));
    expect(seen.at(-1)).toEqual({ count: 0, open: true });
  });
});
