import { useEffect } from "react";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { usePulseAssistContext } from "@/contexts/pulse-assist-context";
import { AgentRunsPanel } from "@/components/agent-runs/AgentRunsPanel";
import { PulseAssistChatPanel } from "./PulseAssistChatPanel";
import { MastraInspectorPanel } from "./MastraInspectorPanel";
import { PulseAssistSidebarShell } from "./PulseAssistSidebarShell";
import { writeSidebarOpen, writeSidebarPanel } from "@/lib/pulse-assist/storage";
import "@/components/agent-runs/agent-runs-theme.css";

export type PulseAssistLayout = "overlay" | "docked";

export type PulseAssistRootProps = {
  layout?: PulseAssistLayout;
};

export function PulseAssistRoot({ layout = "overlay" }: PulseAssistRootProps) {
  const { sidebarOpen, setSidebarOpen, sidebarPanel, setSidebarPanel } = useAgentRunsContext();
  const { managerTab } = usePulseAssistContext();
  const showSeo = managerTab !== "local-dominator";

  const setOpen = (next: boolean) => {
    setSidebarOpen(next);
    writeSidebarOpen(next);
  };

  const setPanel = (next: typeof sidebarPanel) => {
    setSidebarPanel(next);
    writeSidebarPanel(next);
  };

  useEffect(() => {
    if (!showSeo && sidebarPanel === "seo") {
      setSidebarPanel("assist");
      writeSidebarPanel("assist");
    }
  }, [showSeo, sidebarPanel, setSidebarPanel]);

  return (
    <PulseAssistSidebarShell
      layout={layout}
      open={sidebarOpen}
      onOpenChange={setOpen}
      panel={sidebarPanel}
      onPanelChange={setPanel}
      showSeo={showSeo}
    >
      {sidebarPanel === "agents" ? (
        <AgentRunsPanel />
      ) : sidebarPanel === "seo" && showSeo ? (
        <MastraInspectorPanel />
      ) : (
        <PulseAssistChatPanel sidebarOpen={sidebarOpen} />
      )}
    </PulseAssistSidebarShell>
  );
}
