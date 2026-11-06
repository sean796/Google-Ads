import { createContext, useContext, type ReactNode } from "react";
import type { ResearchSectionId } from "@/components/research/research-workspace-sections";

import {
  ResearchWorkspaceNavContext,
  type ResearchWorkspaceNavContextValue,
} from "./ResearchWorkspaceNavContext";

export function ResearchWorkspaceNavProvider({
  value,
  children,
}: {
  value: ResearchWorkspaceNavContextValue;
  children: ReactNode;
}) {
  return <ResearchWorkspaceNavContext.Provider value={value}>{children}</ResearchWorkspaceNavContext.Provider>;
}
