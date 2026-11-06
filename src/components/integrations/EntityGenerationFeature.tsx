import React from "react";

import { notify } from "@/lib/app-notifications";
import { NOTIFY_FAILED_TO_COPY, NOTIFY_FAILED_TO_COPY_TO_CLIPBOARD, NOTIFY_ORIGINS_COPIED_TO_CLIPBOARD, NOTIFY_ORIGIN_COPIED } from "@/lib/notify-messages";
import { ExternalLink, Copy, Download, Sparkles } from "lucide-react";
import type { WordPressSite } from "./types";
import { Button, Field, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui";
import { useEntityGenerationState } from "@/components/integrations/use-entity-generation-state";
import { useEntityValidators } from "@/components/integrations/use-entity-validators";
import { useEntityGenerationRun } from "@/components/integrations/use-entity-generation-run";
import { useEntityCsvTemplate } from "@/components/integrations/use-entity-csv-template";
import { EntityCsvDialog } from "@/components/integrations/EntityCsvDialog";

export interface EntityGenerationFeatureRef {
  openDialog: (site: WordPressSite, sitemapUrl: string) => void;
  isGeneratingEntities: Record<string, boolean>;
}

interface EntityGenerationFeatureProps {
  onRef?: (ref: EntityGenerationFeatureRef) => void;
}

export const EntityGenerationFeature: React.FC<EntityGenerationFeatureProps> = ({ onRef }) => {
  const s = useEntityGenerationState();
  const v = useEntityValidators();
  const { handleGenerateEntities } = useEntityGenerationRun(s, v);
  const csv = useEntityCsvTemplate(s);
  const {
    isGeneratingEntities,
    generatedEntities,
    wikipediaLinks,
    criteriaInfo,
    generalCriteriaInfo,
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
    setCsvTemplateDialogOpen,
    csvFeaturedImage,
    setCsvFeaturedImage,
    handleOpenEntityGenerationDialog,
  } = s;
  const { generateAITitleSuggestion, replaceTemplateVariables, generateCSVTemplate } = csv;

  React.useEffect(() => {
    if (onRef) {
      onRef({
        openDialog: handleOpenEntityGenerationDialog,
        isGeneratingEntities,
      });
    }
  }, [onRef, handleOpenEntityGenerationDialog, isGeneratingEntities]);

  return (
    <>
      {/* Generate Entities Dialog */}
      <Dialog open={entityGenerationDialogOpen} onOpenChange={setEntityGenerationDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle>Generate Origins</DialogTitle>
            <DialogDescription>
              {pendingEntitySite && pendingEntitySitemap && (
                <>
                  Generate location origins for {pendingEntitySite.name} based on service-area sitemap analysis.
                  <br />
                  <span className="text-xs text-muted-foreground">Sitemap: {pendingEntitySitemap}</span>
                  {pendingEntitySite && pendingEntitySitemap && generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] && generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].length > 0 && (
                    <span className="block mt-2 text-primary">
                      {generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].length} origins generated!
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="overflow-y-auto flex-1">
          {pendingEntitySite && pendingEntitySitemap && !generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] && (
            <div className="space-y-4 py-4">
              <div className="grid gap-2">
                
                <Field
                  placeholder="Number of origins to generate"
                  id="entityCount"
                  type="number"
                  min="1"
                  value={entityCount}
                  onChange={(e) => setEntityCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
                <p className="text-xs text-muted-foreground">
                  Enter how many location origins to generate (minimum 1).
                </p>
              </div>
              <div className="grid gap-2">
                <label htmlFor="entityPromptModifier">Optional Prompt Modifier</label>
                <Field
                  id="entityPromptModifier"
                  type="text"
                  value={entityPromptModifier}
                  onChange={(e) => setEntityPromptModifier(e.target.value)}
                  placeholder="e.g., high income neighborhoods in edmonton, streets in calgary"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Add specific criteria to guide origin generation (e.g., "high income neighborhoods in edmonton", "streets in calgary")
                </p>
              </div>
            </div>
          )}

          {pendingEntitySite && pendingEntitySitemap && generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] && (
            <div className="flex-1 grid grid-cols-2 gap-4 py-4 overflow-hidden">
              {/* Left Column: Entity List */}
              <div className="flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold block">Generated Origins (with Wikipedia pages):</label>
                  <Button
                    onClick={() => {
                      const entitiesText = generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].join('\n');
                      navigator.clipboard.writeText(entitiesText).then(() => {
                        notify.success(NOTIFY_ORIGINS_COPIED_TO_CLIPBOARD);
                      }).catch(() => {
                        notify.error(NOTIFY_FAILED_TO_COPY_TO_CLIPBOARD);
                      });
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy All
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto border border-border rounded-md p-3 bg-background">
                  <ul className="space-y-1">
                    {generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].map((entity, index) => {
                      const storageKey = `${pendingEntitySite.id}-${pendingEntitySitemap}`;
                      const wikiUrl = wikipediaLinks[storageKey]?.[entity];
                      const isSelected = selectedEntity === entity;
                      return (
                        <li 
                          key={index} 
                          className={`text-sm text-foreground py-2 px-2 rounded flex items-center justify-between group cursor-pointer transition-colors ${
                            isSelected ? 'bg-primary/20 border border-primary' : 'hover:bg-accent'
                          }`}
                          onClick={() => setSelectedEntity(entity)}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <span className={isSelected ? 'font-semibold' : ''}>{entity}</span>
                            {wikiUrl && (
                              <a
                                href={wikiUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-primary hover:underline"
                                title="View Wikipedia page"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                          <Button
                            variant="quiet"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(entity).then(() => {
                                notify.success(NOTIFY_ORIGIN_COPIED);
                              }).catch(() => {
                                notify.error(NOTIFY_FAILED_TO_COPY);
                              });
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              {/* Right Column: Criteria Information */}
              <div className="flex flex-col overflow-hidden">
                <label className="text-sm font-semibold block mb-2">Criteria Information:</label>
                <div className="flex-1 overflow-y-auto border border-border rounded-md p-3 bg-background">
                  {selectedEntity ? (
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Selected Origin</div>
                        <div className="font-semibold text-sm">{selectedEntity}</div>
                      </div>
                      {(() => {
                        const storageKey = `${pendingEntitySite.id}-${pendingEntitySitemap}`;
                        const wikiUrl = wikipediaLinks[storageKey]?.[selectedEntity];
                        const criteriaData = criteriaInfo[storageKey]?.[selectedEntity];
                        const generalInfo = generalCriteriaInfo[storageKey];
                        
                        return (
                          <>
                            {wikiUrl && (
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">Wikipedia</div>
                                <a
                                  href={wikiUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline text-sm flex items-center gap-1"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  View Wikipedia page
                                </a>
                              </div>
                            )}
                            {generalInfo && (
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">General Criteria</div>
                                <div className="text-sm">{generalInfo}</div>
                              </div>
                            )}
                            {criteriaData && (
                              <>
                                <div>
                                  <div className="text-xs text-muted-foreground mb-1">Validation Status</div>
                                  <div className="text-sm">
                                    <span className={criteriaData.matches ? 'text-primary font-semibold' : 'text-ui-danger'}>
                                      {criteriaData.matches ? '✓ Matches Criteria' : '✗ Does Not Match'}
                                    </span>
                                  </div>
                                </div>
                                {criteriaData.confidence > 0 && (
                                  <div>
                                    <div className="text-xs text-muted-foreground mb-1">Confidence</div>
                                    <div className="text-sm">{criteriaData.confidence}%</div>
                                  </div>
                                )}
                                {criteriaData.rankingValue !== undefined && (
                                  <div>
                                    <div className="text-xs text-muted-foreground mb-1">Ranking Value</div>
                                    <div className="text-sm">{criteriaData.rankingValue}</div>
                                  </div>
                                )}
                                {criteriaData.extractedData && Object.keys(criteriaData.extractedData).length > 0 && (
                                  <div>
                                    <div className="text-xs text-muted-foreground mb-1">Extracted Data</div>
                                    <div className="text-sm space-y-1">
                                      {Object.entries(criteriaData.extractedData).map(([key, value]) => (
                                        <div key={key} className="flex justify-between">
                                          <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                                          <span className="font-medium">{typeof value === 'number' ? value.toLocaleString() : String(value)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                            {!criteriaData && generalInfo && (
                              <div className="text-xs text-muted-foreground italic">
                                No specific validation data available for this origin.
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground italic">
                      Select an origin from the list to view its criteria information.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setEntityGenerationDialogOpen(false);
                setPendingEntitySite(null);
                setPendingEntitySitemap(null);
                setSelectedEntity(null);
              }}
            >
              {pendingEntitySite && pendingEntitySitemap && generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] ? 'Close' : 'Cancel'}
            </Button>
            {pendingEntitySite && pendingEntitySitemap && generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] && (
              <Button
                variant="run"
                onClick={() => {
                  // Initialize with default values only if not already set
                  if (csvFeaturedImage !== 'y' && csvFeaturedImage !== 'n' && csvFeaturedImage !== 'google-maps') {
                    setCsvFeaturedImage('y');
                  }
                  setCsvTemplateDialogOpen(true);
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Generate CSV Template
              </Button>
            )}
            {pendingEntitySite && pendingEntitySitemap && !generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] && (
              <Button
                variant="run"
                onClick={() => {
                  if (pendingEntitySite && pendingEntitySitemap) {
                    handleGenerateEntities(pendingEntitySite, pendingEntitySitemap, entityCount, entityPromptModifier.trim() || undefined);
                  }
                }}
                disabled={!entityCount || entityCount < 1}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Origins
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Template Configuration Dialog */}
      <EntityCsvDialog s={s} csv={csv} />
    </>
  );
};
