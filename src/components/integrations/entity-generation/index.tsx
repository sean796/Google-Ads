/**
 * Entity Generation Feature
 * Main orchestrator component that composes all modules
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useEntityGeneration } from "./hooks/useEntityGeneration";
import { useEntityDialog } from "./hooks/useEntityDialog";
import { EntityGenerationDialog } from "./ui/EntityGenerationDialog";
import { CSVTemplateDialog } from "./ui/CSVTemplateDialog";
import type { EntityGenerationFeatureRef, EntityGenerationFeatureProps } from "./types";
import type { EntityWithCriteria } from "./types";
import type { WordPressSite } from "../types";

export const EntityGenerationFeature: React.FC<EntityGenerationFeatureProps> = ({ onRef }) => {
  const [csvTitleFormat, setCsvTitleFormat] = useState<string>('');
  const [firstEntity, setFirstEntity] = useState<string | null>(null);
  // Store site/sitemap info during generation so we can reopen dialog after completion
  const generationContextRef = useRef<{ site: WordPressSite | null; sitemap: string | null }>({ site: null, sitemap: null });
  // Initialize generation hook first to get clear functions
  const {
    isGeneratingEntities,
    entityGenerationProgress,
    generatedEntities,
    entityRecordsByKey,
    wikipediaLinks,
    criteriaInfo,
    generalCriteriaInfo,
    entityCount,
    entityPromptModifier,
    entityKeyword,
    setEntityCount,
    setEntityPromptModifier,
    setEntityKeyword,
    selectedWikipediaSources,
    setSelectedWikipediaSources,
    wikiCategorySuggestions,
    wikiCategorySuggestionsLoading,
    clearWikiCategoryPicker,
    handleGenerateEntities,
    clearGeneratedEntities,
    clearWikipediaLinks,
    clearCriteriaInfo,
    clearGeneralCriteriaInfo,
    entityRadiusPreset,
    setEntityRadiusPreset,
    serviceAreaOriginByKey,
    setDistanceOriginLabel,
  } = useEntityGeneration(
    (storageKey, entities, suggestedTitleFormat) => {
      // Store suggested title format
      setCsvTitleFormat(suggestedTitleFormat);
      // Auto-select first entity
      if (entities.length > 0) {
        setFirstEntity(entities[0].entity);
      }
    }
  );

  // Now initialize dialog hook with clear functions
  const {
    entityGenerationDialogOpen,
    csvTemplateDialogOpen,
    pendingEntitySite,
    pendingEntitySitemap,
    selectedEntity,
    openEntityGenerationDialog: openEntityGenerationDialogBase,
    closeEntityGenerationDialog,
    setSelectedEntity,
    openCsvTemplateDialog,
    closeCsvTemplateDialog,
    setPendingSiteAndSitemap,
    clearCache
  } = useEntityDialog(
    clearGeneratedEntities,
    clearWikipediaLinks,
    clearCriteriaInfo,
    clearGeneralCriteriaInfo
  );

  const openEntityGenerationDialog = useCallback(
    (site: WordPressSite, sitemapUrl: string) => {
      clearWikiCategoryPicker();
      openEntityGenerationDialogBase(site, sitemapUrl);
    },
    [clearWikiCategoryPicker, openEntityGenerationDialogBase]
  );

  // Expose ref to parent
  useEffect(() => {
    if (onRef) {
      onRef({
        openDialog: openEntityGenerationDialog,
        isGeneratingEntities,
      });
    }
  }, [onRef, openEntityGenerationDialog, isGeneratingEntities]);

  // Calculate storageKey using pendingEntitySite/pendingEntitySitemap or fallback to generationContextRef
  const siteForStorage = pendingEntitySite || generationContextRef.current.site;
  const sitemapForStorage = pendingEntitySitemap || generationContextRef.current.sitemap;
  const storageKey = siteForStorage && sitemapForStorage 
    ? `${siteForStorage.id}-${sitemapForStorage}` 
    : null;

  const entities = storageKey ? (generatedEntities[storageKey] || []) : [];
  const entityRecords = storageKey ? (entityRecordsByKey[storageKey] || []) : [];
  const wikiLinks = storageKey ? (wikipediaLinks[storageKey] || {}) : {};
  const criteria = storageKey ? (criteriaInfo[storageKey] || {}) : {};
  const generalCriteria = storageKey ? (generalCriteriaInfo[storageKey]) : undefined;
  const isGenerating = storageKey ? (isGeneratingEntities[storageKey] || false) : false;
  const progress = storageKey ? (entityGenerationProgress[storageKey]) : undefined;

  // Set selected entity when first entity is generated
  useEffect(() => {
    if (firstEntity && !selectedEntity) {
      setSelectedEntity(firstEntity);
      setFirstEntity(null);
    }
  }, [firstEntity, selectedEntity, setSelectedEntity]);

  // Load title format from localStorage if available
  useEffect(() => {
    if (storageKey && !csvTitleFormat) {
      const savedFormat = localStorage.getItem(`entity-title-format-${storageKey}`);
      if (savedFormat) {
        setCsvTitleFormat(savedFormat);
      }
    }
  }, [storageKey, csvTitleFormat]);

  return (
    <>
      <EntityGenerationDialog
        open={entityGenerationDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            // Clear generation context when dialog is manually closed (not during generation)
            const isGenerating = storageKey && (isGeneratingEntities[storageKey] || false);
            if (!isGenerating) {
              generationContextRef.current = { site: null, sitemap: null };
            }
            closeEntityGenerationDialog();
          }
        }}
        pendingEntitySite={pendingEntitySite}
        pendingEntitySitemap={pendingEntitySitemap}
        generatedEntities={entities}
        wikipediaLinks={wikiLinks}
        criteriaInfo={criteria}
        generalCriteriaInfo={generalCriteria}
        selectedEntity={selectedEntity}
        onSelectEntity={setSelectedEntity}
        entityCount={entityCount}
        entityPromptModifier={entityPromptModifier}
        onEntityCountChange={setEntityCount}
        onEntityPromptModifierChange={setEntityPromptModifier}
        entityKeyword={entityKeyword}
        onEntityKeywordChange={setEntityKeyword}
        selectedWikipediaSources={selectedWikipediaSources}
        onSelectedWikipediaSourcesChange={setSelectedWikipediaSources}
        wikiCategorySuggestions={wikiCategorySuggestions}
        wikiCategorySuggestionsLoading={wikiCategorySuggestionsLoading}
        onGenerate={() => {
          if (pendingEntitySite && pendingEntitySitemap) {
            generationContextRef.current = { site: pendingEntitySite, sitemap: pendingEntitySitemap };
            // Keep dialog open so bulk progress panel is visible
            handleGenerateEntities(
              pendingEntitySite,
              pendingEntitySitemap,
              entityCount,
              entityPromptModifier.trim() || undefined,
              entityKeyword.trim() || undefined,
              selectedWikipediaSources.length > 0 ? selectedWikipediaSources : undefined
            );
          }
        }}
        onOpenCsvDialog={() => {
          if (csvTitleFormat === '') {
            // Initialize with default if not set
            const savedFormat = storageKey 
              ? localStorage.getItem(`entity-title-format-${storageKey}`)
              : null;
            if (savedFormat) {
              setCsvTitleFormat(savedFormat);
            }
          }
          openCsvTemplateDialog();
        }}
        isGenerating={isGenerating}
        entityGenerationProgress={progress}
        entityRadiusPreset={entityRadiusPreset}
        onEntityRadiusPresetChange={setEntityRadiusPreset}
        serviceAreaOrigin={storageKey ? serviceAreaOriginByKey[storageKey] : undefined}
        setDistanceOriginLabel={setDistanceOriginLabel}
      />

      <CSVTemplateDialog
        open={csvTemplateDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeCsvTemplateDialog();
          }
        }}
        pendingEntitySite={pendingEntitySite || generationContextRef.current.site}
        pendingEntitySitemap={pendingEntitySitemap || generationContextRef.current.sitemap}
        entities={entities}
        entityRecords={entityRecords}
        initialTitleFormat={csvTitleFormat}
      />
    </>
  );
};

// Export types for external use
export type { EntityGenerationFeatureRef, EntityGenerationFeatureProps } from "./types";
