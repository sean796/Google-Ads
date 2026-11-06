import React from "react";

import { notify } from "@/lib/app-notifications";
import { NOTIFY_FAILED_TO_COPY_TO_CLIPBOARD, notifyCopiedXToClipboard } from "@/lib/notify-messages";
import { Download, Bot } from "lucide-react";
import { Button, Field, SelectField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui";
import type { EntityGenerationState } from "@/components/integrations/use-entity-generation-state";
import type { useEntityCsvTemplate } from "@/components/integrations/use-entity-csv-template";

export function EntityCsvDialog({
  s,
  csv,
}: {
  s: EntityGenerationState;
  csv: ReturnType<typeof useEntityCsvTemplate>;
}) {
  const {
    generatedEntities,
    pendingEntitySite,
    pendingEntitySitemap,
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
  } = s;
  const { generateAITitleSuggestion, replaceTemplateVariables, generateCSVTemplate } = csv;
  return (
    <Dialog open={csvTemplateDialogOpen} onOpenChange={setCsvTemplateDialogOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate CSV Template</DialogTitle>
          <DialogDescription>
            Configure the CSV template with title format and optional fields for bulk generation.
          </DialogDescription>
        </DialogHeader>
        
        {pendingEntitySite && pendingEntitySitemap && generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`] && (
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="csvTitleFormat">Title Format</label>
                <Button
                  variant="quiet"
                  type="button"
                  onClick={generateAITitleSuggestion}
                  disabled={isGeneratingTitleSuggestion}
                  title="AI Suggest Title Template"
                >
                  {isGeneratingTitleSuggestion ? (
                    <>
                      
                      Generating...
                    </>
                  ) : (
                    <>
                      <Bot className="h-3 w-3 mr-1" />
                      AI Suggest
                    </>
                  )}
                </Button>
              </div>
              <div className="flex gap-2">
                <Field
                  id="csvTitleFormat"
                  value={csvTitleFormat}
                  onChange={(e) => setCsvTitleFormat(e.target.value)}
                  placeholder="e.g., {keyword} Near {entity}"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Use variables:</span>
                {[
                  { entity: '{entity}' },
                  { keyword: '{keyword}' }
                ].map((vars, idx) => {
                  const [key, value] = Object.entries(vars)[0];
                  return (
                    <React.Fragment key={key}>
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(value).then(() => {
                            notify.success(notifyCopiedXToClipboard(value));
                          }).catch(() => {
                            notify.error(NOTIFY_FAILED_TO_COPY_TO_CLIPBOARD);
                          });
                        }}
                        title={`Click to copy ${value}`}
                      >
                        {value}
                      </Button>
                      {idx < 1 && <span className="text-xs text-muted-foreground">,</span>}
                    </React.Fragment>
                  );
                })}
              </div>
              {csvTitleFormat && (
                <div className="mt-2 p-2 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">Preview (first entity):</p>
                  <p className="text-sm font-medium">
                    {replaceTemplateVariables(
                      csvTitleFormat,
                      generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`][0],
                      csvKeyword || 'keyword'
                    )}
                  </p>
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <label htmlFor="csvKeyword">Keyword (Optional)</label>
              <Field
                id="csvKeyword"
                value={csvKeyword}
                onChange={(e) => setCsvKeyword(e.target.value)}
                placeholder="Leave empty to fill manually later"
              />
              <p className="text-xs text-muted-foreground">
                Optional: Leave empty to fill manually later. If provided, will be used for all entities.
              </p>
            </div>

            <div className="grid gap-2">
              
              <SelectField placeholder="Featured Image" value={csvFeaturedImage} onValueChange={setCsvFeaturedImage} options={[{ value: "y", label: "Yes (Y)" }, { value: "n", label: "No (N)" }, { value: "google-maps", label: "Google Image" }]} />
              <p className="text-xs text-muted-foreground">
                Whether to generate a featured image for each post. Google Image requires an entity.
              </p>
            </div>

            <div className="grid gap-2">
              <label htmlFor="csvOptionalModifier">Optional Modifier (Optional)</label>
              <Field
                id="csvOptionalModifier"
                value={csvOptionalModifier}
                onChange={(e) => setCsvOptionalModifier(e.target.value)}
                placeholder="e.g., Focus on high-income neighborhoods"
              />
              <p className="text-xs text-muted-foreground">
                Optional prompt modifier to guide content generation
              </p>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-semibold">Preview ({generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].length} entities):</label>
              <div className="max-h-64 overflow-y-auto border border-border rounded-md p-3 bg-background">
                <div className="text-xs text-muted-foreground mb-2 font-semibold">First 10 rows:</div>
                <ul className="space-y-1">
                  {generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].slice(0, 10).map((entity, index) => {
                    const previewTitle = csvTitleFormat 
                      ? replaceTemplateVariables(csvTitleFormat, entity, csvKeyword || '')
                      : entity;
                    return (
                      <li key={index} className="text-sm text-foreground py-1 px-2 hover:bg-accent rounded">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">Entity: {entity}</span>
                          <span className="text-muted-foreground">Title: {previewTitle}</span>
                          {csvKeyword && <span className="text-muted-foreground">Keyword: {csvKeyword}</span>}
                          <span className="text-muted-foreground">Featured Image: {csvFeaturedImage === 'y' ? 'Yes' : csvFeaturedImage === 'google-maps' ? 'Google Image' : 'No'}</span>
                          {csvOptionalModifier && <span className="text-muted-foreground">Modifier: {csvOptionalModifier}</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].length > 10 && (
                  <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                    ... and {generatedEntities[`${pendingEntitySite.id}-${pendingEntitySitemap}`].length - 10} more entities
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={() => {
              setCsvTemplateDialogOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="run"
            onClick={generateCSVTemplate}
          >
            <Download className="h-4 w-4 mr-2" />
            Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
