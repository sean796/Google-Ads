import type { EntityWithCriteria } from "@/components/integrations/entity-run-ctx";
import { useState, useCallback } from "react";

import type { WordPressSite } from "./types";

export function useEntityGenerationState() {
const [isGeneratingEntities, setIsGeneratingEntities] = useState<Record<string, boolean>>({});
const [generatedEntities, setGeneratedEntities] = useState<Record<string, string[]>>({});
const [wikipediaLinks, setWikipediaLinks] = useState<Record<string, Record<string, string>>>({});
const [criteriaInfo, setCriteriaInfo] = useState<Record<string, Record<string, EntityWithCriteria['criteriaData']>>>({});
const [generalCriteriaInfo, setGeneralCriteriaInfo] = useState<Record<string, string>>({});
const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
const [entityGenerationDialogOpen, setEntityGenerationDialogOpen] = useState(false);
const [pendingEntitySite, setPendingEntitySite] = useState<WordPressSite | null>(null);
const [pendingEntitySitemap, setPendingEntitySitemap] = useState<string | null>(null);
const [entityCount, setEntityCount] = useState<number>(5);
const [entityPromptModifier, setEntityPromptModifier] = useState<string>('');
const [csvTemplateDialogOpen, setCsvTemplateDialogOpen] = useState(false);
const [csvTitleFormat, setCsvTitleFormat] = useState<string>('');
const [csvKeyword, setCsvKeyword] = useState<string>('');
const [csvFeaturedImage, setCsvFeaturedImage] = useState<string>('y');
const [csvOptionalModifier, setCsvOptionalModifier] = useState<string>('');
const [isGeneratingTitleSuggestion, setIsGeneratingTitleSuggestion] = useState<boolean>(false);

const handleOpenEntityGenerationDialog = useCallback((site: WordPressSite, sitemapUrl: string) => {
  const storageKey = `${site.id}-${sitemapUrl}`;
  // ALWAYS clear cached entities when opening dialog - force fresh generation
  setGeneratedEntities(prev => {
    const updated = { ...prev };
    delete updated[storageKey];
    return updated;
  });
  setWikipediaLinks(prev => {
    const updated = { ...prev };
    delete updated[storageKey];
    return updated;
  });
  setCriteriaInfo(prev => {
    const updated = { ...prev };
    delete updated[storageKey];
    return updated;
  });
  setGeneralCriteriaInfo(prev => {
    const updated = { ...prev };
    delete updated[storageKey];
    return updated;
  });
  setSelectedEntity(null);
  setPendingEntitySite(site);
  setPendingEntitySitemap(sitemapUrl);
  setEntityCount(5);
  setEntityGenerationDialogOpen(true);
}, []);

// Expose ref to parent - update whenever isGeneratingEntities changes

  return {
    isGeneratingEntities,
    setIsGeneratingEntities,
    generatedEntities,
    setGeneratedEntities,
    wikipediaLinks,
    setWikipediaLinks,
    criteriaInfo,
    setCriteriaInfo,
    generalCriteriaInfo,
    setGeneralCriteriaInfo,
    selectedEntity,
    setSelectedEntity,
    entityGenerationDialogOpen,
    setEntityGenerationDialogOpen,
    pendingEntitySite,
    setPendingEntitySite,
    pendingEntitySitemap,
    setPendingEntitySitemap,
    entityCount,
    setEntityCount,
    entityPromptModifier,
    setEntityPromptModifier,
    csvTemplateDialogOpen,
    setCsvTemplateDialogOpen,
    csvTitleFormat,
    setCsvTitleFormat,
    csvKeyword,
    setCsvKeyword,
    csvFeaturedImage,
    setCsvFeaturedImage,
    csvOptionalModifier,
    setCsvOptionalModifier,
    isGeneratingTitleSuggestion,
    setIsGeneratingTitleSuggestion,
    handleOpenEntityGenerationDialog,
  };
}

export type EntityGenerationState = ReturnType<typeof useEntityGenerationState>;
