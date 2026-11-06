/**
 * CSV Template Dialog Component
 * Dialog for configuring and generating CSV templates (Content Optimizer module style)
 */

import React, { useState } from "react";
import { Bot, Download } from "lucide-react";
import { ActionButton, Button, DialogShell, Field, Pill, SelectField } from "@/ui";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_FAILED_TO_COPY_TO_CLIPBOARD, NOTIFY_NO_ENTITIES_TO_GENERATE_CSV_FROM, notifyCopiedXToClipboard } from "@/lib/notify-messages";
import { generateAITitleSuggestion } from "../csv/titleSuggestion";
import { generateCSVTemplate, replaceTemplateVariables } from "../csv/csvGenerator";
import type { WordPressSite } from "../../types";
import type { EntityWithCriteria } from "../types";

interface CSVTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingEntitySite: WordPressSite | null;
  pendingEntitySitemap: string | null;
  entities: string[];
  entityRecords?: EntityWithCriteria[];
  initialTitleFormat?: string;
}

const FEATURED_IMAGE_OPTIONS = [
  { value: "y", label: "Featured image: Yes (Y)" },
  { value: "n", label: "Featured image: No (N)" },
  { value: "google-maps", label: "Featured image: Google Image" },
];

const FEATURED_IMAGE_SHORT: Record<string, string> = { y: "Yes", "google-maps": "Google", n: "No" };
const TITLE_VARIABLES = ["{entity}", "{keyword}"];
const SUGGEST_STATES = ["AI Suggest", "Generating"] as const;
const PREVIEW_ROW = "grid grid-cols-[1fr_2fr_6rem] gap-2 px-2 py-1.5 text-base";

export const CSVTemplateDialog: React.FC<CSVTemplateDialogProps> = ({
  open,
  onOpenChange,
  pendingEntitySite,
  pendingEntitySitemap,
  entities,
  entityRecords = [],
  initialTitleFormat = "",
}) => {
  const [csvTitleFormat, setCsvTitleFormat] = useState<string>(initialTitleFormat);

  React.useEffect(() => {
    if (initialTitleFormat) {
      setCsvTitleFormat(initialTitleFormat);
    }
  }, [initialTitleFormat]);
  const [csvKeyword, setCsvKeyword] = useState<string>("");
  const [csvFeaturedImage, setCsvFeaturedImage] = useState<string>("y");
  const [csvOptionalModifier, setCsvOptionalModifier] = useState<string>("");
  const [isGeneratingTitleSuggestion, setIsGeneratingTitleSuggestion] = useState<boolean>(false);

  const totalEntities = entities?.length ?? 0;
  const previewCount = Math.min(10, totalEntities);
  const summaryLine =
    totalEntities > 0
      ? `Total: ${totalEntities} entities · Keyword: ${csvKeyword.trim() ? "Set" : "Not set"} · Modifier: ${csvOptionalModifier.trim() ? "Set" : "Not set"}`
      : "Configure the CSV template with title format and optional fields for bulk generation.";

  const handleGenerateAITitleSuggestion = async () => {
    if (!pendingEntitySite || !entities || entities.length === 0) return;

    setIsGeneratingTitleSuggestion(true);
    try {
      const suggestion = await generateAITitleSuggestion(entities, pendingEntitySite);
      if (suggestion) {
        setCsvTitleFormat(suggestion);
      }
    } finally {
      setIsGeneratingTitleSuggestion(false);
    }
  };

  const handleGenerateCSV = () => {
    if (!pendingEntitySite || !entities || entities.length === 0) {
      notify.error(NOTIFY_NO_ENTITIES_TO_GENERATE_CSV_FROM);
      return;
    }

    const gscKeywordsByEntity: Record<string, string[]> = {};
    for (const rec of entityRecords) {
      if (rec.gscKeywords?.length) {
        gscKeywordsByEntity[rec.entity] = rec.gscKeywords;
      }
    }

    generateCSVTemplate(entities, pendingEntitySite, {
      titleFormat: csvTitleFormat,
      keyword: csvKeyword,
      optionalModifier: csvOptionalModifier,
      featuredImage: csvFeaturedImage,
      gscKeywordsByEntity,
    });

    onOpenChange(false);
  };

  const copyVariable = (value: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() => notify.success(notifyCopiedXToClipboard(value)))
      .catch(() => notify.error(NOTIFY_FAILED_TO_COPY_TO_CLIPBOARD));
  };

  const ready = Boolean(pendingEntitySite && pendingEntitySitemap && entities && entities.length > 0);

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Generate CSV Template"
      description={summaryLine}
      actions={
        <>
          <Button variant="tool" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="run" icon={Download} onClick={handleGenerateCSV}>
            Download CSV
          </Button>
        </>
      }
    >
      {ready ? (
        <>
          <div className="flex items-center gap-1.5">
            <Field
              placeholder="Title format, e.g. {keyword} Near {entity}"
              value={csvTitleFormat}
              onChange={(e) => setCsvTitleFormat(e.target.value)}
            />
            <ActionButton
              states={SUGGEST_STATES}
              state={isGeneratingTitleSuggestion ? "Generating" : "AI Suggest"}
              icon={Bot}
              disabled={isGeneratingTitleSuggestion}
              onClick={handleGenerateAITitleSuggestion}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-base text-muted-foreground">Use variables</span>
            {TITLE_VARIABLES.map((value) => (
              <Pill key={value} label={value} active={false} onClick={() => copyVariable(value)} />
            ))}
          </div>
          {csvTitleFormat ? (
            <p className="bg-ui-field px-2 py-1.5 text-base text-primary">
              {replaceTemplateVariables(csvTitleFormat, entities[0], csvKeyword || "keyword")}
            </p>
          ) : null}
          <Field
            placeholder="Keyword (optional, leave empty to fill manually later)"
            aria-label="Keyword"
            value={csvKeyword}
            onChange={(e) => setCsvKeyword(e.target.value)}
          />
          <SelectField
            placeholder="Featured image"
            width="full"
            value={csvFeaturedImage}
            options={FEATURED_IMAGE_OPTIONS}
            onValueChange={setCsvFeaturedImage}
          />
          <Field
            placeholder="Optional modifier, e.g. Focus on high-income neighborhoods"
            aria-label="Optional modifier"
            value={csvOptionalModifier}
            onChange={(e) => setCsvOptionalModifier(e.target.value)}
          />
          <p className="pt-1.5 text-base font-semibold">
            Preview: first {previewCount} of {totalEntities} entities
          </p>
          <div className="flex max-h-64 flex-col gap-px overflow-y-auto bg-ui-field-hover">
            <div className={`${PREVIEW_ROW} bg-ui-field font-semibold`}>
              <span>Entity</span>
              <span>Title</span>
              <span>Featured</span>
            </div>
            {entities.slice(0, 10).map((entity, index) => (
              <div key={index} className={`${PREVIEW_ROW} bg-ui-field`}>
                <span className="break-words text-primary">{entity}</span>
                <span className="break-words">
                  {csvTitleFormat ? replaceTemplateVariables(csvTitleFormat, entity, csvKeyword || "") : entity}
                </span>
                <span className="text-muted-foreground">{FEATURED_IMAGE_SHORT[csvFeaturedImage] ?? csvFeaturedImage}</span>
              </div>
            ))}
            {entities.length > 10 ? (
              <p className="bg-ui-field px-2 py-1.5 text-base text-muted-foreground">
                and {entities.length - 10} more entities
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </DialogShell>
  );
};
