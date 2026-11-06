import React from "react";


import { AutomationRecipeLibrary } from "@/components/manager/tasks/recipes/AutomationRecipeLibrary";
import { FORGE_RECIPE_CARD_TILE_CLASS } from "@/components/manager/pulse-forge/forge-recipe-styles";
import { defaultNodeLabel } from "@/lib/workflow/workflow-graph-utils";
import { WORKFLOW_ACTION_AGENT_PRESETS } from "@/lib/workflow/workflow-action-agent-presets";
import type { AutomationRecipeCatalogItem } from "@/lib/automation-recipes-types";
import type { WorkflowNodeKind } from "@/lib/workflow/workflow-types";
import { WORKFLOW_THEN_KINDS } from "@/lib/workflow/workflow-types";
import { cn } from "@/lib/utils";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui";

const TRIGGER_AGENT_KINDS: WorkflowNodeKind[] = [
  "trigger_manual",
  "trigger_calendar",
  "trigger_gsc",
  "trigger_document",
  "trigger_agentmail",
  "trigger_agent_done",
  "action_agent",
  "csv_rows",
  "path_rules",
  "rag_archive",
];

export type WorkflowInsertMenuProps = {
  teamId: number;
  open: boolean;
  insertAnchorNodeId: string | null;
  onOpenChange: (open: boolean) => void;
  onAddStep: (kind: WorkflowNodeKind, afterNodeId: string | null) => void;
  onAddActionAgentPreset: (presetId: string, afterNodeId: string | null) => void;
  onAddRecipe: (recipe: AutomationRecipeCatalogItem, afterNodeId: string | null) => void;
};

function PresetStepCard({
  label,
  description,
  onPick,
}: {
  label: string;
  description: string;
  onPick: () => void;
}): React.ReactElement {
  return (
    <Button
      onClick={onPick}
    >
      <p className="text-base font-semibold text-white">{label}</p>
      <p className="mt-1 text-base text-muted-foreground">{description}</p>
    </Button>
  );
}

function StepCard({
  kind,
  onPick,
}: {
  kind: WorkflowNodeKind;
  onPick: () => void;
}): React.ReactElement {
  return (
    <Button
      onClick={onPick}
    >
      <p className="text-base font-semibold text-white">{defaultNodeLabel(kind)}</p>
      <p className="mt-1 text-base text-muted-foreground">{kind.replace(/_/g, " ")}</p>
    </Button>
  );
}

export function WorkflowInsertMenu({
  teamId,
  open,
  insertAnchorNodeId,
  onOpenChange,
  onAddStep,
  onAddActionAgentPreset,
  onAddRecipe,
}: WorkflowInsertMenuProps): React.ReactElement {
  const close = () => onOpenChange(false);

  const pickRecipe = (recipe: AutomationRecipeCatalogItem) => {
    onAddRecipe(recipe, insertAnchorNodeId);
    close();
  };

  const pickStep = (kind: WorkflowNodeKind) => {
    onAddStep(kind, insertAnchorNodeId);
    close();
  };

  const pickActionAgentPreset = (presetId: string) => {
    onAddActionAgentPreset(presetId, insertAnchorNodeId);
    close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[min(920px,92vh)] w-[min(1440px,96vw)] max-w-none flex-col gap-0",
          "border-0 bg-black p-0 shadow-tile-pop",
        )}
      >
        <DialogHeader className="shrink-0 border-b border-white/10 px-6 py-4">
          <DialogTitle className="text-base font-semibold text-white">Add to workflow</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="recipes" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid h-auto w-full shrink-0 grid-cols-2 rounded-none bg-black p-0">
            <TabsTrigger
              value="recipes"
              className="rounded-none py-3 text-base data-[state=active]:bg-black data-[state=active]:text-primary"
            >
              Agents
            </TabsTrigger>
            <TabsTrigger
              value="steps"
              className="rounded-none py-3 text-base data-[state=active]:bg-black data-[state=active]:text-primary"
            >
              Steps
            </TabsTrigger>
          </TabsList>
          <TabsContent value="recipes" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
            <AutomationRecipeLibrary
              teamId={teamId}
              sites={[]}
              onRecipeClick={pickRecipe}
              onRecipeInstall={pickRecipe}
            />
          </TabsContent>
          <TabsContent value="steps" className="mt-0 min-h-0 flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden">
            <div className="flex flex-col gap-8">
              <section>
                <h3 className="mb-3 text-base font-semibold text-white">Triggers and agents</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {TRIGGER_AGENT_KINDS.map((kind) => (
                    <StepCard key={kind} kind={kind} onPick={() => pickStep(kind)} />
                  ))}
                  {WORKFLOW_ACTION_AGENT_PRESETS.map((preset) => (
                    <PresetStepCard
                      key={preset.id}
                      label={preset.label}
                      description={preset.description}
                      onPick={() => pickActionAgentPreset(preset.id)}
                    />
                  ))}
                </div>
              </section>
              <section>
                <h3 className="mb-3 text-base font-semibold text-white">Then</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {WORKFLOW_THEN_KINDS.map((kind) => (
                    <StepCard key={kind} kind={kind} onPick={() => pickStep(kind)} />
                  ))}
                </div>
              </section>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
