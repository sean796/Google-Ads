import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { DetailsDrawer } from "@/ui/primitives/DetailsDrawer";
import {
  DetailsDockContext,
  useDetailsDock,
} from "@/components/pulse-assist/details-dock-context";

/** Hosts the Details tab of the right sidebar. Wrap inside `AgentRunsContextProvider`. */
export function DetailsDockProvider({ children }: { children: ReactNode }) {
  const { sidebarOpen, sidebarPanel } = useAgentRunsContext();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [count, setCount] = useState(0);

  const register = useCallback(() => {
    setCount((c) => c + 1);
    return () => setCount((c) => c - 1);
  }, []);

  const open = sidebarOpen && sidebarPanel === "details";
  const value = useMemo(
    () => ({ target, setTarget, count, register, open }),
    [target, count, register, open],
  );

  return <DetailsDockContext.Provider value={value}>{children}</DetailsDockContext.Provider>;
}

/**
 * Publishes a workspace's Details content into the right sidebar Details tab.
 * Content stays owned by the page (state, handlers) and renders in the sidebar through a portal.
 */
export function DetailsDockPortal({ id, children }: { id: string; children: ReactNode }) {
  const dock = useDetailsDock();
  const register = dock?.register;

  useEffect(() => register?.(), [register]);

  if (!dock?.open || !dock.target) return null;
  return createPortal(
    <DetailsDrawer id={id}>{children}</DetailsDrawer>,
    dock.target,
  );
}
