/**
 * Entity Generation Dialog Component
 * Main dialog for entity generation
 */

import React from "react";
import { ActionButton, Button, DialogShell } from "@/ui";
import { Download, Sparkles } from "lucide-react";
import type { WordPressSite } from "../../types";
import type { CriteriaData, RadiusDistancePreset } from "../types";
import type { EntityGenerationProgress } from "../hooks/useEntityGeneration";
import type { WikipediaSource } from "@/lib/entity/decide-wikipedia-source-ai";
import type { ServiceAreaOrigin } from "@/lib/entity/radius-filter";
import { EntityGenerationPanel } from "./EntityGenerationPanel";

const GENERATE_STATES = ["Generate Origins", "Generating"] as const;

interface EntityGenerationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingEntitySite: WordPressSite | null;
  pendingEntitySitemap: string | null;
  generatedEntities: string[];
  wikipediaLinks: Record<string, string>;
  criteriaInfo: Record<string, CriteriaData>;
  generalCriteriaInfo: string | undefined;
  selectedEntity: string | null;
  onSelectEntity: (entity: string | null) => void;
  entityCount: number;
  entityPromptModifier: string;
  entityKeyword: string;
  onEntityCountChange: (count: number) => void;
  onEntityPromptModifierChange: (modifier: string) => void;
  onEntityKeywordChange: (keyword: string) => void;
  selectedWikipediaSources: WikipediaSource[];
  onSelectedWikipediaSourcesChange: (sources: WikipediaSource[]) => void;
  wikiCategorySuggestions: WikipediaSource[];
  wikiCategorySuggestionsLoading: boolean;
  onGenerate: () => void;
  onOpenCsvDialog: () => void;
  isGenerating: boolean;
  entityGenerationProgress: EntityGenerationProgress | undefined;
  entityRadiusPreset: RadiusDistancePreset;
  onEntityRadiusPresetChange: (v: RadiusDistancePreset) => void;
  serviceAreaOrigin?: ServiceAreaOrigin;
  setDistanceOriginLabel?: (label: string | null) => void;
}

export const EntityGenerationDialog: React.FC<EntityGenerationDialogProps> = ({
  open,
  onOpenChange,
  pendingEntitySite,
  pendingEntitySitemap,
  generatedEntities,
  wikipediaLinks,
  criteriaInfo,
  generalCriteriaInfo,
  selectedEntity,
  onSelectEntity,
  entityCount,
  entityPromptModifier,
  entityKeyword,
  onEntityCountChange,
  onEntityPromptModifierChange,
  onEntityKeywordChange,
  selectedWikipediaSources,
  onSelectedWikipediaSourcesChange,
  wikiCategorySuggestions,
  wikiCategorySuggestionsLoading,
  onGenerate,
  onOpenCsvDialog,
  isGenerating,
  entityGenerationProgress,
  entityRadiusPreset,
  onEntityRadiusPresetChange,
  serviceAreaOrigin,
  setDistanceOriginLabel,
}) => {
  const storageKey =
    pendingEntitySite && pendingEntitySitemap ? `${pendingEntitySite.id}-${pendingEntitySitemap}` : null;

  const hasGeneratedEntities = Boolean(storageKey && generatedEntities.length > 0);

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Generate Origins"
      description={
        pendingEntitySite && pendingEntitySitemap ? (
          <>
            Generate location origins for {pendingEntitySite.name} based on service-area sitemap analysis.
            <br />
            <span className="text-muted-foreground">Service-area sitemap is set.</span>
            {hasGeneratedEntities && !isGenerating && (
              <span className="mt-2 block text-primary">{generatedEntities.length} origins generated!</span>
            )}
          </>
        ) : undefined
      }
      actions={
        <>
          <Button variant="tool" onClick={() => onOpenChange(false)}>
            {hasGeneratedEntities ? "Close" : "Cancel"}
          </Button>
          {hasGeneratedEntities && (
            <Button variant="run" icon={Download} onClick={onOpenCsvDialog}>
              Generate CSV Template
            </Button>
          )}
          {!hasGeneratedEntities && (
            <ActionButton
              states={GENERATE_STATES}
              state={isGenerating ? "Generating" : "Generate Origins"}
              icon={Sparkles}
              disabled={!entityCount || entityCount < 1 || isGenerating}
              onClick={onGenerate}
            />
          )}
        </>
      }
    >
      <EntityGenerationPanel
        pendingEntitySite={pendingEntitySite}
        pendingEntitySitemap={pendingEntitySitemap}
        generatedEntities={generatedEntities}
        wikipediaLinks={wikipediaLinks}
        criteriaInfo={criteriaInfo}
        generalCriteriaInfo={generalCriteriaInfo}
        selectedEntity={selectedEntity}
        onSelectEntity={onSelectEntity}
        entityCount={entityCount}
        entityPromptModifier={entityPromptModifier}
        entityKeyword={entityKeyword}
        onEntityCountChange={onEntityCountChange}
        onEntityPromptModifierChange={onEntityPromptModifierChange}
        onEntityKeywordChange={onEntityKeywordChange}
        selectedWikipediaSources={selectedWikipediaSources}
        onSelectedWikipediaSourcesChange={onSelectedWikipediaSourcesChange}
        wikiCategorySuggestions={wikiCategorySuggestions}
        wikiCategorySuggestionsLoading={wikiCategorySuggestionsLoading}
        isGenerating={isGenerating}
        entityGenerationProgress={entityGenerationProgress}
        entityRadiusPreset={entityRadiusPreset}
        onEntityRadiusPresetChange={onEntityRadiusPresetChange}
        serviceAreaOrigin={serviceAreaOrigin}
        setDistanceOriginLabel={setDistanceOriginLabel}
      />
    </DialogShell>
  );
};