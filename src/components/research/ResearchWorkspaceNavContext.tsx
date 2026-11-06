import { createContext, useContext, type ReactNode } from "react";
import type { ResearchSectionId } from "@/components/research/research-workspace-sections";

export type ResearchWorkspaceNavContextValue = {
  activeSection: ResearchSectionId;
  onSectionChange: (id: ResearchSectionId) => void;
  sectionSwitchDisabled?: boolean;
};

export const ResearchWorkspaceNavContext = createContext<ResearchWorkspaceNavContextValue | null>(null);



export function useResearchWorkspaceNav(): ResearchWorkspaceNavContextValue | null {
  return useContext(ResearchWorkspaceNavContext);
}
