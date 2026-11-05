import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentRunsSidebarResize } from "@/hooks/use-agent-runs-sidebar-resize";
import { RUNNING_AGENTS_LABEL } from "./AgentRunsBrandTitle";
import { AgentRunsLauncherBrand } from "./AgentRunsLauncherBrand";
import { AgentRunsSidebarResizeHandle } from "./AgentRunsSidebarResizeHandle";
import "./agent-runs-theme.css";
import { Button } from "@/ui";

type AgentRunsSidebarShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

export function AgentRunsSidebarShell({ open, onOpenChange, children }: AgentRunsSidebarShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { width, isResizing, isMobile, handleProps } = useAgentRunsSidebarResize(open);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    document.documentElement.classList.toggle("agent-runs-scroll-lock", open);
    document.body.classList.toggle("agent-runs-scroll-lock", open);
    return () => {
      document.documentElement.classList.remove("agent-runs-scroll-lock");
      document.body.classList.remove("agent-runs-scroll-lock");
    };
  }, [open]);

  return (
    <div
      className={cn(
        "fai-sidebar-root fai-sidebar-root--right agent-runs-root",
        open && "fai-sidebar-root--open",
        isResizing && "agent-runs-root--resizing",
      )}
      style={{ "--fai-sidebar-width": `${width}px` } as CSSProperties}
      aria-hidden={!open}
    >
      <Button
        variant="quiet"
        onClick={() => onOpenChange(true)}
        aria-label={`Open ${RUNNING_AGENTS_LABEL}`}
        aria-expanded={open}
        aria-controls="agent-runs-panel"
      >
        <AgentRunsLauncherBrand />
      </Button>

      <Button
        pressed={Boolean(open)}
        variant="quiet"
        onClick={() => onOpenChange(false)}
        aria-label={`Close ${RUNNING_AGENTS_LABEL}`}
        tabIndex={open ? 0 : -1}
      />

      <div
        id="agent-runs-panel"
        ref={panelRef}
        className={cn("fai-sidebar-panel agent-runs-panel", open && "fai-sidebar-panel--open")}
        role="dialog"
        aria-modal="true"
        aria-label={RUNNING_AGENTS_LABEL}
      >
        {open ? (
          <Button
            size="icon" icon={ChevronRight}
            variant="quiet"
            onClick={() => onOpenChange(false)}
            aria-label="Close sidebar"
          ></Button>
        ) : null}
        {open && !isMobile ? <AgentRunsSidebarResizeHandle {...handleProps} /> : null}
        {children}
      </div>
    </div>
  );
}
