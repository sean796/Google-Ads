import { FORGE_NAV_TEXT_CLASS } from "@/components/manager/pulse-forge/forge-dashboard-styles";
import { cn } from "@/lib/utils";
import { RowButton } from "@/ui";

export type PulseForgeNavMode = "forge" | "recipes" | "workflows";

export type PulseForgeNavSidebarProps = {
  navMode: PulseForgeNavMode;
  workflowEditorOpen: boolean;
  onSelectMyForge: () => void;
  onSelectRecipes: () => void;
  onSelectWorkflows: () => void;
};

export function PulseForgeNavSidebar({
  navMode,
  workflowEditorOpen,
  onSelectMyForge,
  onSelectRecipes,
  onSelectWorkflows,
}: PulseForgeNavSidebarProps): React.ReactElement {
  const forgeHomeActive = navMode === "forge" && !workflowEditorOpen;
  const recipesActive = navMode === "recipes" && !workflowEditorOpen;
  const workflowsActive = navMode === "workflows" && !workflowEditorOpen;

  return (
    <aside className="flex h-full min-h-0 w-56 shrink-0 flex-col bg-black">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <RowButton
          selected={Boolean(forgeHomeActive)}
          type="button"
          onClick={onSelectMyForge}
        >
          My Forge
        </RowButton>
        <RowButton
          selected={Boolean(recipesActive)}
          type="button"
          onClick={onSelectRecipes}
        >
          Agents
        </RowButton>
        <RowButton
          selected={Boolean(workflowsActive)}
          type="button"
          onClick={onSelectWorkflows}
        >
          Workflows
        </RowButton>
      </div>
    </aside>
  );
}
