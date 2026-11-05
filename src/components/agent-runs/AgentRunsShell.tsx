import { useEffect, useState, type ReactNode } from "react";
import { readSidebarPanel, writeSidebarOpen, type SidebarPanel } from "@/lib/pulse-assist/storage";
import { AgentRunsContextProvider } from "@/contexts/agent-runs-context";
import { DetailsDockProvider } from "@/components/pulse-assist/details-dock";
import { useDefaultAgentRunHarnesses } from "@/lib/agent-runs/use-default-agent-run-harnesses";

const MOBILE_QUERY = "(max-width: 767px)";

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches;
}

type AgentRunsShellProps = {
  children: ReactNode;
};

function AgentRunsHarnessBootstrap(): null {
  useDefaultAgentRunHarnesses();
  return null;
}

export function AgentRunsShell({ children }: AgentRunsShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>(() => readSidebarPanel());

  useEffect(() => {
    if (!isMobileViewport()) return;
    setSidebarOpen(false);
    writeSidebarOpen(false);
  }, []);

  return (
    <AgentRunsContextProvider
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      sidebarPanel={sidebarPanel}
      setSidebarPanel={setSidebarPanel}
    >
      <AgentRunsHarnessBootstrap />
      <DetailsDockProvider>{children}</DetailsDockProvider>
    </AgentRunsContextProvider>
  );
}
