/**
 * Progress, generation form, and results list for entity generation (SAP generate tab + full dialog).
 */

import React from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_FAILED_TO_COPY, NOTIFY_FAILED_TO_COPY_TO_CLIPBOARD, NOTIFY_ORIGINS_COPIED_TO_CLIPBOARD, NOTIFY_ORIGIN_COPIED } from "@/lib/notify-messages";
import { Copy, ExternalLink, X } from "lucide-react";

import type { WikipediaSource } from "@/lib/entity/decide-wikipedia-source-ai";
import type { WordPressSite } from "../../types";
import type { CriteriaData, RadiusDistancePreset } from "../types";
import type { EntityGenerationProgress } from "../hooks/useEntityGeneration";
import { RADIUS_PRESET_MILES } from "@/lib/entity/radius-filter";
import { Button, Field, RowButton, TextButton, SelectField, Badge } from "@/ui";

function wikipediaSourceKey(s: WikipediaSource): string {
  return `${s.type}:${s.title}`;
}

export interface EntityGenerationMainSectionProps {
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
  isGenerating: boolean;
  entityGenerationProgress: EntityGenerationProgress | undefined;
  entityRadiusPreset: RadiusDistancePreset;
  onEntityRadiusPresetChange: (v: RadiusDistancePreset) => void;
}

export const EntityGenerationMainSection: React.FC<EntityGenerationMainSectionProps> = ({
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
  isGenerating,
  entityGenerationProgress,
  entityRadiusPreset,
  onEntityRadiusPresetChange,
}) => {
  const storageKey =
    pendingEntitySite && pendingEntitySitemap ? `${pendingEntitySite.id}-${pendingEntitySitemap}` : null;

  const hasGeneratedEntities = Boolean(storageKey && generatedEntities.length > 0);

  return (
    <>
      {isGenerating && (
        <div className="mb-4 rounded-md border border-border bg-muted/15 p-4">
          <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            
            Agentic entity generation
          </div>
          {entityGenerationProgress?.currentMessage && (
            <p className="text-sm text-foreground mb-2">{entityGenerationProgress.currentMessage}</p>
          )}
          {entityGenerationProgress?.stepLog && entityGenerationProgress.stepLog.length > 0 && (
            <div className="max-h-32 space-y-0.5 overflow-y-auto rounded bg-black/40 p-2 font-mono text-xs text-muted-foreground">
              {entityGenerationProgress.stepLog.map((step, i) => (
                <div key={i}>{step}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {pendingEntitySite && pendingEntitySitemap && !hasGeneratedEntities && !isGenerating && (
        <div className="grid w-full grid-cols-2 gap-2 gap-x-3 py-2">
          <div className="min-w-0">
            <Field
              id="entityCount"
              type="number"
              min="1"
              value={entityCount}
              onChange={(e) => onEntityCountChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
              placeholder="# Origins"
              aria-label="Number of origins to generate"
            />
          </div>
          <div className="min-w-0">
            <SelectField
              placeholder="Radius filter"
              value={entityRadiusPreset}
              onValueChange={(v) => onEntityRadiusPresetChange(v as RadiusDistancePreset)}
              options={[
                { value: "off", label: "Off (no distance filter)" },
                { value: "close", label: `Close (${RADIUS_PRESET_MILES.close} mi)` },
                { value: "medium", label: `Medium (${RADIUS_PRESET_MILES.medium} mi)` },
                { value: "far", label: `Far (${RADIUS_PRESET_MILES.far} mi)` },
              ]}
              width="full"
            />
          </div>
          <div className="min-w-0">
            <Field
              id="entityPromptModifier"
              type="text"
              value={entityPromptModifier}
              onChange={(e) => onEntityPromptModifierChange(e.target.value)}
              placeholder="Prompt modifier (neighborhoods, codes, etc.)"
              aria-label="Optional prompt modifier"
            />
          </div>
          <div className="min-w-0">
            <Field
              id="entityKeyword"
              type="text"
              value={entityKeyword}
              onChange={(e) => onEntityKeywordChange(e.target.value)}
              placeholder="Keyword (service / niche)"
              aria-label="Optional keyword"
            />
          </div>
          {entityPromptModifier.trim().length >= 2 && (
            <div className="col-span-2 min-w-0">
              {wikiCategorySuggestionsLoading && (
                <div className="flex items-center justify-end gap-1.5 py-0.5">
                  
                </div>
              )}
              {!wikiCategorySuggestionsLoading && wikiCategorySuggestions.length > 0 && (
                <div className="max-h-28 space-y-0.5 overflow-y-auto rounded border border-border/50 bg-black/20 p-1.5">
                  {wikiCategorySuggestions.map((s) => {
                    const label = s.type === "category" ? `Category:${s.title.replace(/_/g, " ")}` : s.title;
                    const isSelected = selectedWikipediaSources.some(
                      (x) => wikipediaSourceKey(x) === wikipediaSourceKey(s)
                    );
                    return (
                      <RowButton
                        selected={Boolean(isSelected)}
                        key={`${s.type}:${s.title}`}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            onSelectedWikipediaSourcesChange(
                              selectedWikipediaSources.filter((x) => wikipediaSourceKey(x) !== wikipediaSourceKey(s))
                            );
                          } else {
                            onSelectedWikipediaSourcesChange([...selectedWikipediaSources, s]);
                          }
                        }}
                      >
                        {label}
                      </RowButton>
                    );
                  })}
                </div>
              )}
              {selectedWikipediaSources.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {selectedWikipediaSources.map((src) => (
                    <Badge
                      key={wikipediaSourceKey(src)}
                      variant="secondary"
                      className="max-w-full gap-0.5 pr-0.5 text-xs font-normal"
                    >
                      <span className="break-words">
                        {src.type === "category" ? `Category:${src.title.replace(/_/g, " ")}` : src.title}
                      </span>
                      <Button
                        size="icon" icon={X}
                        variant="quiet"
                        aria-label="Remove category"
                        onClick={() =>
                          onSelectedWikipediaSourcesChange(
                            selectedWikipediaSources.filter((x) => wikipediaSourceKey(x) !== wikipediaSourceKey(src))
                          )
                        }
                      ></Button>
                    </Badge>
                  ))}
                  <TextButton
                    type="button"
                    onClick={() => onSelectedWikipediaSourcesChange([])}
                  >
                    Clear
                  </TextButton>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {hasGeneratedEntities && !isGenerating && (
        <div className="flex-1 grid grid-cols-2 gap-4 py-4 overflow-hidden min-h-[200px]">
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold block">Generated Origins (with Wikipedia pages):</label>
              <Button
                onClick={() => {
                  const entitiesText = generatedEntities.join("\n");
                  navigator.clipboard
                    .writeText(entitiesText)
                    .then(() => {
                      notify.success(NOTIFY_ORIGINS_COPIED_TO_CLIPBOARD);
                    })
                    .catch(() => {
                      notify.error(NOTIFY_FAILED_TO_COPY_TO_CLIPBOARD);
                    });
                }}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy All
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto rounded-md border-l-[3px] border-l-border/60 bg-black/25 p-3">
              <ul className="space-y-1">
                {generatedEntities.map((entity, index) => {
                  const wikiUrl = wikipediaLinks[entity];
                  const isSelected = selectedEntity === entity;
                  return (
                    <li
                      key={index}
                      className={`flex cursor-pointer items-center justify-between rounded px-2 py-2 text-sm text-foreground transition-colors group ${
                        isSelected ? "border border-border bg-muted/40" : "hover:bg-accent"
                      }`}
                      onClick={() => onSelectEntity(entity)}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <span className={isSelected ? "font-semibold" : ""}>{entity}</span>
                        {wikiUrl && (
                          <a
                            href={wikiUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[hsl(var(--semantic-data-foreground))] hover:underline"
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

          <div className="flex flex-col overflow-hidden">
            <label className="text-sm font-semibold block mb-2">Criteria Information:</label>
            <div className="flex-1 overflow-y-auto rounded-md border-l-[3px] border-l-border/60 bg-black/25 p-3">
              {selectedEntity ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Selected Origin</div>
                    <div className="font-semibold text-sm">{selectedEntity}</div>
                  </div>
                  {(() => {
                    const wikiUrl = wikipediaLinks[selectedEntity];
                    const criteriaData = criteriaInfo[selectedEntity];

                    return (
                      <>
                        {wikiUrl && (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Wikipedia</div>
                            <a
                              href={wikiUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-sm text-[hsl(var(--semantic-data-foreground))] hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View Wikipedia page
                            </a>
                          </div>
                        )}
                        {generalCriteriaInfo && (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">General Criteria</div>
                            <div className="text-sm">{generalCriteriaInfo}</div>
                          </div>
                        )}
                        {criteriaData && (
                          <>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Validation Status</div>
                              <div className="text-sm">
                                <span
                                  className={
                                    criteriaData.matches ? "text-primary font-semibold" : "text-ui-danger"
                                  }
                                >
                                  {criteriaData.matches ? "✓ Matches Criteria" : "✗ Does Not Match"}
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
                                      <span className="text-muted-foreground capitalize">
                                        {key.replace(/([A-Z])/g, " $1").trim()}:
                                      </span>
                                      <span className="font-medium">
                                        {typeof value === "number" ? value.toLocaleString() : String(value)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        {!criteriaData && generalCriteriaInfo && (
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
    </>
  );
};
