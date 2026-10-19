import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
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

  const setOpen = (next: boolean) => {
    setSidebarOpen(next);
    writeSidebarOpen(next);
  };

  const setPanel = (next: typeof sidebarPanel) => {
    setSidebarPanel(next);
    writeSidebarPanel(next);
  };

  return (
    <PulseAssistSidebarShell
      layout={layout}
      open={sidebarOpen}
      onOpenChange={setOpen}
      panel={sidebarPanel}
      onPanelChange={setPanel}
    >
      {sidebarPanel === "agents" ? (
        <AgentRunsPanel />
      ) : sidebarPanel === "seo" ? (
        <MastraInspectorPanel />
      ) : (
        <PulseAssistChatPanel sidebarOpen={sidebarOpen} />
      )}
    </PulseAssistSidebarShell>
  );
}
