import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import type { PulseForgeRoute } from "@/lib/pulse-forge/pulse-forge-route";

export type WorkflowEditorViewProps = {
  teamId: number;
  workflowId: number | null;
  sites: WordPressSiteOption[];
  defaultSiteId?: string | null;
  route: PulseForgeRoute;
  onCreated: (workflowId: number) => void;
  onCancel: () => void;
  onNameChange?: (name: string) => void;
  onSaveErrorChange?: (error: string | null) => void;
};
